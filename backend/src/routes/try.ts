import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler'
import { AppError, ValidationError } from '../errors/AppError'
import { userFacingFailure } from '../lib/userFacingFailure'
import { checkGlobalSpendCap } from '../services/globalSpendCap'
import { countFeatureCallsTodayGlobal } from '../db/queries/usageLog'
import { recordTalkEvent } from '../db/queries/talkEvents'
import { issueToken, consumeToken, readTryInput, planFromTranscript, DAILY_CEILING, MIN_WORDS, MAX_CHARS } from '../services/tryDemo'

// The landing demo's API (services/tryDemo.ts). Unauthenticated by design;
// bounded four ways — token age and single use, per-IP limiter, the
// platform-wide daily ceiling, the global spend cap — and it stores
// nothing but the usage_log row and a funnel event with no user on it.

export const tryRouter = Router()

// Per IP, not per user (there is none). An office shares an IP, so not
// lower; the daily ceiling is the real limit.
const planLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: true, legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'На сегодня хватит — зарегистрируйтесь, и построим столько планов, сколько нужно.', upgrade: false } },
})
const tokenLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })

// GET /api/try/token — issued on page load; good once, after 20 s.
tryRouter.get('/token', tokenLimiter, (_req, res) => {
  res.json({ token: issueToken() })
})

// POST /api/try/event { event, metadata? } — the funnel: started · stopped ·
// plan · cta. No user, no talk; metadata is bounded to a few numbers.
const EVENTS = new Set(['try_started', 'try_stopped', 'try_cta', 'try_typed', 'try_registered'] as const)
type TryEvent = typeof EVENTS extends Set<infer T> ? T : never
tryRouter.post('/event', tokenLimiter, (req, res) => {
  const b = (req.body ?? {}) as { event?: unknown; metadata?: unknown }
  if (typeof b.event !== 'string' || !(EVENTS as Set<string>).has(b.event)) { res.status(204).end(); return }
  const event = b.event as TryEvent
  const m = (b.metadata && typeof b.metadata === 'object' ? b.metadata : {}) as Record<string, unknown>
  const metadata: Record<string, number | string> = {}
  for (const k of ['seconds', 'words', 'fillers', 'wpm']) if (typeof m[k] === 'number' && Number.isFinite(m[k])) metadata[k] = Math.round(m[k] as number)
  if (m.language === 'ru' || m.language === 'en') metadata.language = m.language
  recordTalkEvent({ talkId: null, workspaceId: null, userId: null, event, metadata })
  res.status(204).end()
})

// POST /api/try/outline { token, transcript, language, website? }
tryRouter.post('/outline', planLimiter, asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>
  // Honeypot: a field no person sees. Filled → say nothing useful, cost nothing.
  if (typeof b.website === 'string' && b.website.trim()) { res.status(204).end(); return }

  const verdict = consumeToken(b.token)
  if (verdict !== 'ok') throw new ValidationError(verdict === 'too_young'
    ? 'Скажите хотя бы двадцать секунд — иначе плана не из чего строить.'
    : 'Сессия демо истекла. Обновите страницу и попробуйте ещё раз.')

  const { verdict: inputVerdict, input } = readTryInput(b)
  if (inputVerdict === 'too_short') throw new ValidationError(`Слишком коротко — скажите ещё немного (хотя бы ${MIN_WORDS} слов).`)
  if (inputVerdict === 'too_long')  throw new ValidationError(`Это больше минуты — план строится по первым ${MAX_CHARS.toLocaleString('ru-RU')} знакам. Сократите текст.`)

  if (await countFeatureCallsTodayGlobal('try_outline') >= DAILY_CEILING) {
    throw new AppError('Сегодня планов в демо больше не строим. Зарегистрируйтесь — и построим ваш, без ограничения.', 429, 'TRY_CEILING')
  }
  await checkGlobalSpendCap()

  try {
    const plan = await planFromTranscript(input)
    recordTalkEvent({ talkId: null, workspaceId: null, userId: null, event: 'try_plan', metadata: { language: input.language, slides: plan.outline.length } })
    res.json(plan)
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(userFacingFailure(err, 'Не получилось построить план. Попробуйте ещё раз через минуту.'), 502, 'MODEL_FAILED', err)
  }
}))
