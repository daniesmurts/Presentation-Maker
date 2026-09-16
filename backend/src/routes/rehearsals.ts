import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler'
import { AppError, NotFoundError, ValidationError } from '../errors/AppError'
import { assertReviewQuota } from '../lib/planTier'
import { checkSpendCap } from '../services/spendCap'
import { findTalkById, replaceSlides } from '../db/queries/talks'
import { recordTalkEvent } from '../db/queries/talkEvents'
import { createRehearsal, findRehearsalById, listRehearsals, saveRehearsalReview, countReviewsThisMonth, deleteRehearsal } from '../db/queries/rehearsals'
import { normaliseSegments, normaliseVisits, computeMetrics, reviewRehearsal, MAX_DURATION_MS } from '../services/rehearsal'
import { userFacingFailure } from '../lib/userFacingFailure'
import { logger } from '../lib/logger'

// Rehearsals live under a talk: /api/talks/:id/rehearsals. Mounted from
// routes/talks.ts with mergeParams so `:id` is the talk. Every read is
// workspace-scoped through the talk lookup first.

export const rehearsalsRouter = Router({ mergeParams: true })

async function talkOr404(id: string, workspaceId: string) {
  const talk = await findTalkById(id, workspaceId)
  if (!talk?.slides?.length) throw new NotFoundError('Выступление не найдено')
  return talk
}

rehearsalsRouter.get('/', asyncHandler(async (req, res) => {
  const talk = await talkOr404(req.params.id, req.user.workspace_id)
  res.json({ rehearsals: await listRehearsals(talk.id, req.user.workspace_id) })
}))

// POST { started_at, duration_ms, speech_available, segments, visits } —
// the page's record of one run-through. Metrics are computed here, once;
// the review is a separate call because it costs a model pass.
rehearsalsRouter.post('/', asyncHandler(async (req, res) => {
  const talk = await talkOr404(req.params.id, req.user.workspace_id)
  const b = (req.body ?? {}) as Record<string, unknown>
  const durationMs = typeof b.duration_ms === 'number' && Number.isFinite(b.duration_ms) ? Math.floor(b.duration_ms) : NaN
  if (!(durationMs >= 1_000) || durationMs > MAX_DURATION_MS) throw new ValidationError('Репетиция слишком короткая, чтобы её разбирать')
  const startedAt = typeof b.started_at === 'string' && !Number.isNaN(Date.parse(b.started_at)) ? new Date(b.started_at) : new Date(Date.now() - durationMs)
  const n = talk.slides!.length
  const segments = normaliseSegments(b.segments, n)
  const visits = normaliseVisits(b.visits, n)
  const speechAvailable = b.speech_available !== false
  const metrics = computeMetrics(talk, segments, visits, durationMs)
  const rehearsal = await createRehearsal({
    talkId: talk.id, workspaceId: req.user.workspace_id, userId: req.user.id, startedAt, durationMs, speechAvailable, segments, visits, metrics,
  })
  recordTalkEvent({ talkId: talk.id, workspaceId: req.user.workspace_id, userId: req.user.id, event: 'rehearsed', metadata: { duration_ms: durationMs, words: metrics.words, speech: speechAvailable, slides: n } })
  res.status(201).json({ rehearsal })
}))

rehearsalsRouter.get('/:rid', asyncHandler(async (req, res) => {
  const talk = await talkOr404(req.params.id, req.user.workspace_id)
  const rehearsal = await findRehearsalById(req.params.rid, req.user.workspace_id)
  if (!rehearsal || rehearsal.talk_id !== talk.id) throw new NotFoundError('Репетиция не найдена')
  res.json({ rehearsal })
}))

// POST /:rid/review — the model pass. Synchronous: a 20-slide rehearsal is
// four batched calls plus a summary, well inside the client's timeout, and
// the result is stored so a reload finds it. Quota per tier, spend cap
// always. A second call on a reviewed rehearsal returns the stored review.
rehearsalsRouter.post('/:rid/review', asyncHandler(async (req, res) => {
  const talk = await talkOr404(req.params.id, req.user.workspace_id)
  const rehearsal = await findRehearsalById(req.params.rid, req.user.workspace_id)
  if (!rehearsal || rehearsal.talk_id !== talk.id) throw new NotFoundError('Репетиция не найдена')
  if (rehearsal.review_status === 'ready' && rehearsal.review) { res.json({ rehearsal }); return }
  if (!rehearsal.segments.length) throw new ValidationError('В этой репетиции нет распознанной речи — разбирать нечего. Проверьте микрофон и попробуйте ещё раз.')
  assertReviewQuota(req.user.plan_tier, await countReviewsThisMonth(req.user.workspace_id))
  await checkSpendCap(req.user.workspace_id)
  try {
    const review = await reviewRehearsal(talk, rehearsal.segments, rehearsal.metrics, { userId: req.user.id, workspaceId: req.user.workspace_id })
    const saved = await saveRehearsalReview(rehearsal.id, req.user.workspace_id, review, 'ready')
    recordTalkEvent({ talkId: talk.id, workspaceId: req.user.workspace_id, userId: req.user.id, event: 'rehearsal_reviewed', metadata: { slides: talk.slides!.length, spoken: rehearsal.segments.length } })
    res.json({ rehearsal: saved })
  } catch (err) {
    // Not stored as 'failed' with the raw text (CLAUDE.md §3.2): the status
    // lets the page offer a retry, the message is the user-facing mapping.
    await saveRehearsalReview(rehearsal.id, req.user.workspace_id, null, 'failed')
    logger.error({ message: 'Rehearsal review failed', rehearsalId: rehearsal.id, err: err instanceof Error ? err.message : String(err) })
    throw new AppError(userFacingFailure(err, 'Разбор не получился. Попробуйте ещё раз.'), 502, 'MODEL_FAILED', err)
  }
}))

// POST /:rid/apply-notes { slides: number[] } — replace the speaker's text
// on the chosen slides with «how you said it». The previous slides come
// back for a one-step undo, like the deck rewrite.
rehearsalsRouter.post('/:rid/apply-notes', asyncHandler(async (req, res) => {
  const talk = await talkOr404(req.params.id, req.user.workspace_id)
  const rehearsal = await findRehearsalById(req.params.rid, req.user.workspace_id)
  if (!rehearsal?.review || rehearsal.talk_id !== talk.id) throw new NotFoundError('Разбор не найден')
  const raw = (req.body as { slides?: unknown })?.slides
  const wanted = new Set(Array.isArray(raw) ? raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0) : [])
  const spoken = new Map(rehearsal.review.slides.filter((r) => r.spoken_notes.trim()).map((r) => [r.slide, r.spoken_notes]))
  const before = talk.slides!
  // Only positions that still exist and have something to apply.
  const next = before.map((s, i) => (wanted.has(i) && spoken.has(i) ? { ...s, notes: spoken.get(i)! } : s))
  const changed = next.filter((s, i) => s !== before[i]).length
  if (!changed) throw new ValidationError('Нечего применить: на выбранных слайдах нет пересказанного текста')
  await replaceSlides(talk.id, req.user.workspace_id, next)
  recordTalkEvent({ talkId: talk.id, workspaceId: req.user.workspace_id, userId: req.user.id, event: 'rehearsal_notes_applied', metadata: { slides: changed, of: before.length } })
  res.json({ talk: { ...talk, slides: next }, before })
}))

rehearsalsRouter.delete('/:rid', asyncHandler(async (req, res) => {
  await talkOr404(req.params.id, req.user.workspace_id)
  if (!(await deleteRehearsal(req.params.rid, req.user.workspace_id))) throw new NotFoundError('Репетиция не найдена')
  res.status(204).end()
}))
