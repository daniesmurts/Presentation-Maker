import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticate } from '../middleware/authenticate'
import { NotFoundError, ValidationError } from '../errors/AppError'
import { getJobQueue } from '../services/jobQueue'
import { TALK_JOB_QUEUE, type TalkJobPayload } from '../services/talkJobWorker'
import { normaliseEditedOutline, type GenerateParams } from '../services/talks'
import { createTalkJob, getTalkJobById, confirmTalkJobOutline, type TalkJobRow } from '../db/queries/talkJobs'
import { findTalkById, listTalks, deleteTalk } from '../db/queries/talks'
import {
  INTENTS, AUDIENCES, MAX_SLIDE_COUNT, MIN_SLIDE_COUNT, notesDefaultFor,
  type Intent, type Audience, type TalkLanguage,
} from '../../../shared/types'

export const talksRouter = Router()
talksRouter.use(authenticate)

// Bounds how many outlines a user can start without confirming one. The
// spend cap (TODO A.5) is the money guard; this is the "runaway client" guard.
const generationLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false })

// The brief field's ceiling. Past this the prompt is being fed more than the
// outline call can use — and it is where CLAUDE.md §3.3's wall is hit first.
export const BRIEF_MAX_CHARS = 20_000
const TITLE_MAX_CHARS = 200

// ─── Request → GenerateParams ───────────────────────────────────────────────

export function readGenerateParams(body: unknown, userId: string, workspaceId: string): GenerateParams {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>

  const title = typeof b.title === 'string' ? b.title.trim() : ''
  if (!title) throw new ValidationError('Укажите тему выступления')
  if (title.length > TITLE_MAX_CHARS) throw new ValidationError(`Тема — не длиннее ${TITLE_MAX_CHARS} символов`)

  const brief = typeof b.brief === 'string' ? b.brief.trim() : ''
  if (brief.length > BRIEF_MAX_CHARS) throw new ValidationError(`Тезисы — не длиннее ${BRIEF_MAX_CHARS} символов`)

  const intent = b.intent
  if (!isOneOf(intent, INTENTS)) throw new ValidationError('Выберите цель выступления')
  const audience = b.audience
  if (!isOneOf(audience, AUDIENCES)) throw new ValidationError('Выберите аудиторию')

  const language: TalkLanguage = b.language === 'en' ? 'en' : 'ru'

  const durationMinutes = Number(b.duration_minutes)
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) {
    throw new ValidationError('Продолжительность — от 1 до 240 минут')
  }

  let slideCountTarget: number | undefined
  if (b.slide_count != null && b.slide_count !== '') {
    slideCountTarget = Number(b.slide_count)
    if (!Number.isInteger(slideCountTarget) || slideCountTarget < MIN_SLIDE_COUNT || slideCountTarget > MAX_SLIDE_COUNT) {
      throw new ValidationError(`Число слайдов — от ${MIN_SLIDE_COUNT} до ${MAX_SLIDE_COUNT}`)
    }
  }

  return {
    userId, workspaceId, title, brief, intent, audience, language, durationMinutes, slideCountTarget,
    notesEnabled:  typeof b.notes_enabled === 'boolean' ? b.notes_enabled : notesDefaultFor(intent),
    strictToBrief: b.strict_to_brief === true,
  }
}

function isOneOf<T extends string>(v: unknown, list: readonly T[]): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v)
}

// `request` is deliberately not exposed — it is a verbatim copy of what the
// client already sent, and it holds the brief.
function toJobResponse(job: TalkJobRow) {
  return {
    id:            job.id,
    status:        job.status,
    talk_id:       job.talk_id,
    outline:       job.outline,
    error_message: job.error_message,
    created_at:    job.created_at,
    updated_at:    job.updated_at,
  }
}

// ─── Jobs ───────────────────────────────────────────────────────────────────

// POST /api/talks/jobs — start a generation. With the outline gate on (the
// default) the worker stops after the plan and the client resumes via
// POST /jobs/:id/outline. Opt-out, not opt-in: reviewing the plan is where
// a wrong structure is cheap to fix, but a user who trusts the generator
// shouldn't be made to click through.
talksRouter.post('/jobs', generationLimiter, asyncHandler(async (req, res) => {
  const params = readGenerateParams(req.body, req.user.id, req.user.workspace_id)
  const stage: TalkJobPayload['stage'] = (req.body as { review_outline?: unknown })?.review_outline === false ? 'full' : 'outline'
  const job = await createTalkJob(params)
  await getJobQueue().send(TALK_JOB_QUEUE, { jobId: job.id, stage } satisfies TalkJobPayload)
  res.status(202).json(toJobResponse(job))
}))

// GET /api/talks/jobs/:id — poll.
talksRouter.get('/jobs/:id', asyncHandler(async (req, res) => {
  const job = await getTalkJobById(req.params.id, req.user.workspace_id)
  if (!job) throw new NotFoundError('Генерация не найдена')
  res.json(toJobResponse(job))
}))

// POST /api/talks/jobs/:id/outline — confirm (or replace) the plan; enqueues
// the expensive half.
talksRouter.post('/jobs/:id/outline', generationLimiter, asyncHandler(async (req, res) => {
  const job = await getTalkJobById(req.params.id, req.user.workspace_id)
  if (!job) throw new NotFoundError('Генерация не найдена')
  if (job.status !== 'outline_ready') {
    throw new ValidationError(job.status === 'failed'
      ? (job.error_message ?? 'Эта генерация уже завершилась ошибкой')
      : 'Этот план уже подтверждён')
  }

  const outline = normaliseEditedOutline((req.body as { outline?: unknown })?.outline)
  if (!outline) throw new ValidationError('План пуст — оставьте хотя бы один слайд с заголовком')

  const claimed = await confirmTalkJobOutline(job.id, req.user.workspace_id, outline)
  if (!claimed) throw new ValidationError('Этот план уже подтверждён')

  await getJobQueue().send(TALK_JOB_QUEUE, { jobId: job.id, stage: 'expand' } satisfies TalkJobPayload)
  res.status(202).json(toJobResponse({ ...job, status: 'processing', outline }))
}))

// ─── Talks ──────────────────────────────────────────────────────────────────

talksRouter.get('/', asyncHandler(async (req, res) => {
  res.json({ talks: await listTalks(req.user.workspace_id) })
}))

talksRouter.get('/:id', asyncHandler(async (req, res) => {
  const talk = await findTalkById(req.params.id, req.user.workspace_id)
  if (!talk) throw new NotFoundError('Выступление не найдено')
  res.json({ talk })
}))

talksRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!(await deleteTalk(req.params.id, req.user.workspace_id))) throw new NotFoundError('Выступление не найдено')
  res.status(204).end()
}))

export type { Intent, Audience }
