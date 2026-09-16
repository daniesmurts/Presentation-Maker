import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticate } from '../middleware/authenticate'
import { AppError, NotFoundError, ValidationError } from '../errors/AppError'
import { userFacingFailure } from '../lib/userFacingFailure'
import { assertDraftMessageQuota, assertTalkQuota } from '../lib/planTier'
import { checkSpendCap } from '../services/spendCap'
import { countFeatureCallsToday } from '../db/queries/usageLog'
import { createDraft, findDraftById, listDrafts, saveDraft, deleteDraft, setDraftJob } from '../db/queries/drafts'
import { draftTurn, appendTurn, normaliseDraftCard, cardToTalkBody, MESSAGE_MAX_CHARS } from '../services/drafts'
import { readGenerateParams } from './talks'
import { createTalkJob } from '../db/queries/talkJobs'
import { countTalksThisMonth } from '../db/queries/talks'
import { getJobQueue } from '../services/jobQueue'
import { TALK_JOB_QUEUE, type TalkJobPayload } from '../services/talkJobWorker'
import { EMPTY_DRAFT_CARD, draftMissing } from '../../../shared/types'

// Drafts («Наброски»): a conversation with the editor and the card it
// fills in, before a talk exists. Every write returns the whole draft —
// the client keeps one source of truth, like the talk page.

export const draftsRouter = Router()
draftsRouter.use(authenticate)

// Runaway-client guard, per user, same reasoning as routes/talks.ts. The
// money guard is the spend cap; the pricing guard is the per-day quota.
const turnLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  message: { error: { code: 'RATE_LIMITED', message: 'Слишком много сообщений. Подождите несколько минут.', upgrade: false } },
})

draftsRouter.get('/', asyncHandler(async (req, res) => {
  res.json({ drafts: await listDrafts(req.user.workspace_id) })
}))

// POST /api/drafts { card? } — a new draft, optionally seeded (the new-talk
// page hands over what was typed so far; a starter chip sends nothing).
draftsRouter.post('/', asyncHandler(async (req, res) => {
  const card = normaliseDraftCard((req.body as { card?: unknown })?.card, EMPTY_DRAFT_CARD)
  res.status(201).json({ draft: await createDraft(req.user.workspace_id, req.user.id, card) })
}))

draftsRouter.get('/:id', asyncHandler(async (req, res) => {
  const draft = await findDraftById(req.params.id, req.user.workspace_id)
  if (!draft) throw new NotFoundError('Набросок не найден')
  res.json({ draft })
}))

// PATCH /api/drafts/:id { card } — the user edits the card directly; the
// next turn sees the edit because the card is what the prompt carries.
draftsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const draft = await findDraftById(req.params.id, req.user.workspace_id)
  if (!draft) throw new NotFoundError('Набросок не найден')
  const card = normaliseDraftCard((req.body as { card?: unknown })?.card, draft.card)
  res.json({ draft: await saveDraft(draft.id, req.user.workspace_id, draft.messages, card) })
}))

draftsRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!(await deleteDraft(req.params.id, req.user.workspace_id))) throw new NotFoundError('Набросок не найден')
  res.status(204).end()
}))

// POST /api/drafts/:id/messages { text } — one turn. Synchronous: a turn
// is a few seconds, and the reply is what the user is waiting for.
draftsRouter.post('/:id/messages', turnLimiter, asyncHandler(async (req, res) => {
  const draft = await findDraftById(req.params.id, req.user.workspace_id)
  if (!draft) throw new NotFoundError('Набросок не найден')
  const raw = (req.body as { text?: unknown })?.text
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) throw new ValidationError('Напишите что-нибудь')
  if (text.length > MESSAGE_MAX_CHARS) throw new ValidationError(`Сообщение — не длиннее ${MESSAGE_MAX_CHARS.toLocaleString('ru-RU')} символов. Длинный материал лучше вставить частями.`)

  assertDraftMessageQuota(req.user.plan_tier, await countFeatureCallsToday(req.user.workspace_id, 'draft_chat'))
  await checkSpendCap(req.user.workspace_id)

  let turn
  try {
    turn = await draftTurn(draft, text, { userId: req.user.id, workspaceId: req.user.workspace_id })
  } catch (err) {
    // The registry's failures are mapped here because there is no job row
    // to store them on — the reply is the response (§3.2).
    if (err instanceof AppError) throw err
    throw new AppError(userFacingFailure(err, 'Редактор не ответил. Попробуйте ещё раз.'), 502, 'MODEL_FAILED', err)
  }
  const saved = await saveDraft(draft.id, req.user.workspace_id, appendTurn(draft.messages, text, turn.reply), turn.card)
  res.json({ draft: saved })
}))

// POST /api/drafts/:id/talk — «Собрать выступление»: the card becomes a
// talk request and the user lands at the outline gate. Goes through the
// same reader, quota and cap as the form, so nothing is possible here that
// the form forbids.
draftsRouter.post('/:id/talk', turnLimiter, asyncHandler(async (req, res) => {
  const draft = await findDraftById(req.params.id, req.user.workspace_id)
  if (!draft) throw new NotFoundError('Набросок не найден')
  const missing = draftMissing(draft.card)
  if (missing.length) throw new ValidationError('Карточка ещё не заполнена: ' + missing.map((m) => MISSING_LABEL[m]).join(', '))

  const params = readGenerateParams(cardToTalkBody(draft.card), req.user.id, req.user.workspace_id)
  assertTalkQuota(req.user.plan_tier, await countTalksThisMonth(req.user.workspace_id))
  await checkSpendCap(req.user.workspace_id)
  const job = await createTalkJob(params)
  await getJobQueue().send(TALK_JOB_QUEUE, { jobId: job.id, stage: 'outline' } satisfies TalkJobPayload)
  await setDraftJob(draft.id, req.user.workspace_id, job.id)
  res.status(202).json({ job: { id: job.id, status: job.status } })
}))

const MISSING_LABEL = { title: 'тема', intent: 'цель', audience: 'аудитория', theses: 'тезисы' } as const
