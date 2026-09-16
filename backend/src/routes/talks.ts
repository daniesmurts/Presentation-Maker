import { Router } from 'express'
import { rehearsalsRouter } from './rehearsals'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticate } from '../middleware/authenticate'
import { NotFoundError, ValidationError } from '../errors/AppError'
import { getJobQueue } from '../services/jobQueue'
import { TALK_JOB_QUEUE, type TalkJobPayload } from '../services/talkJobWorker'
import { normaliseEditedOutline, normaliseEditedSlide, regenerateSlide, applySlideMove, type GenerateParams } from '../services/talks'
import { createTalkJob, getTalkJobById, confirmTalkJobOutline, createRewriteJob, clearRewriteProposal, type TalkJobRow } from '../db/queries/talkJobs'
import { findTalkById, listTalks, deleteTalk, replaceSlides, countTalksThisMonth, createTalk, setShareToken, setTalkApproved } from '../db/queries/talks'
import { recordTalkEvent, countDownloadsThisMonth } from '../db/queries/talkEvents'
import { generateTalkPptx } from '../services/talkExport'
import { generateTalkPdf } from '../services/talkPdf'
import { randomBytes } from 'node:crypto'
import { parseSlideSelection, selectSlides, selectionSuffix, SelectionError } from '../lib/slideSelection'
import { assertDownloadQuota, assertTalkQuota } from '../lib/planTier'
import { resolveBrandKit } from '../services/brandKit'
import { getBrandKit } from '../db/queries/brandKits'
import { THEMES, getTheme } from '../services/themes'
import { generateImage, imagePromptForSlide, aspectForSlide, isImageGenConfigured, PROMPT_MAX_CHARS } from '../services/imageGen'
import { hasSlideImage, getSlideImageQuery } from '../services/talks'
import { setTalkTheme } from '../db/queries/talks'
import { checkSpendCap } from '../services/spendCap'
import { storeSlideImage, collectTalkMediaPaths, deleteMediaObjects, MAX_IMAGE_BYTES } from '../services/talkMedia'
import { withSlideImage } from '../services/talks'
import { getTalkMediaById } from '../db/queries/talkMedia'
import { downloadObject } from '../services/objectStorage'
import { importPptx } from '../services/pptxImport'
import { attachImportedImages } from '../services/talkMedia'
import { identifyOoxml } from '../lib/fileType'
import {
  INTENTS, AUDIENCES, MAX_SLIDE_COUNT, MIN_SLIDE_COUNT, notesDefaultFor,
  type Intent, type Audience, type TalkLanguage, type Talk, type Slide,
} from '../../../shared/types'

export const talksRouter = Router()
talksRouter.use(authenticate)
// Rehearsals («Репетиция») live under a talk — routes/rehearsals.ts.
talksRouter.use('/:id/rehearsals', rehearsalsRouter)

// Bounds how many model-backed requests one USER can make — the spend cap
// (services/spendCap.ts) is the money guard; this is the runaway-client
// guard. Keyed by user, not IP: an office shares one IP. In-memory store —
// fine for one process; a second replica makes it ~2×, which is acceptable
// for a guard whose real ceiling is the shared-DB spend cap.
const generationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  message: { error: { code: 'RATE_LIMITED', message: 'Слишком много запросов. Подождите несколько минут.', upgrade: false } },
})

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
    kind:          job.kind,
    talk_id:       job.talk_id,
    outline:       job.outline,
    proposal:      job.proposal,
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
  // Checked at enqueue, counted at completion (a plan abandoned at the gate
  // produced no talk and must not count). The gap is bounded by the limiter.
  assertTalkQuota(req.user.plan_tier, await countTalksThisMonth(req.user.workspace_id))
  // The registry hook enforces the cap on every call regardless; checking
  // here too means the form says no now, not after the worker's retry cycle.
  await checkSpendCap(req.user.workspace_id)
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

// GET /api/talks/:id/export.pptx[?slides=2,3,5] — the native deck. This is
// the product (CLAUDE.md §2); the pricing gate sits on it (lib/planTier.ts).
talksRouter.get('/:id/export.pptx', asyncHandler(async (req, res) => {
  assertDownloadQuota(req.user.plan_tier, 'pptx', await countDownloadsThisMonth(req.user.workspace_id, 'pptx'))
  const talk = await findTalkById(req.params.id, req.user.workspace_id)
  if (!talk) throw new NotFoundError('Выступление не найдено')
  if (!talk.slides || talk.slides.length === 0) throw new ValidationError('У этого выступления ещё нет слайдов')

  let selection: number[] | null
  try {
    selection = parseSlideSelection(req.query.slides, talk.slides.length)
  } catch (err) {
    if (err instanceof SelectionError) throw new ValidationError('Неверный список слайдов')
    throw err
  }
  const subset = selectSlides(talk, selection)
  const pptx = await generateTalkPptx(subset, { brand: await resolveBrandKit(req.user.workspace_id) })

  // The title is Cyrillic more often than not — `filename=` gets an ASCII
  // fallback and the RFC 5987 `filename*` carries the real name.
  const fname = `${talk.title.trim() || 'talk'}${selectionSuffix(selection, talk.slides.length, talk.language)}.pptx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
  res.setHeader('Content-Disposition', `attachment; filename="talk.pptx"; filename*=UTF-8''${encodeURIComponent(fname)}`)
  res.setHeader('Content-Length', pptx.length)
  res.end(pptx)

  // The deck left the platform — the strongest evidence a talk was used.
  // { slides, of } always (CLAUDE.md §3.9), even for the whole deck.
  recordTalkEvent({
    talkId: talk.id, workspaceId: req.user.workspace_id, userId: req.user.id, event: 'exported', format: 'pptx',
    metadata: { slides: (selection ?? talk.slides).length, of: talk.slides.length, theme: talk.theme_id },
  })
}))

// ─── Slide-level editing ────────────────────────────────────────────────────
//
// One bad slide must not mean regenerating forty (CLAUDE.md §2). Every
// write replaces the JSONB array and returns the whole talk, so the client
// holds one source of truth. Slides have no ids: every route addresses an
// index, and the client remaps any selection through the same arithmetic.

async function loadTalkSlide(id: string, workspaceId: string, rawIdx: string): Promise<{ talk: Talk; slides: Slide[]; idx: number }> {
  const idx = Number(rawIdx)
  const talk = await findTalkById(id, workspaceId)
  if (!talk?.slides) throw new NotFoundError('Выступление не найдено')
  if (!Number.isInteger(idx) || idx < 0 || idx >= talk.slides.length) throw new NotFoundError('Слайд не найден')
  return { talk, slides: talk.slides, idx }
}

async function persist(talk: Talk, slides: Slide[], workspaceId: string): Promise<Talk> {
  await replaceSlides(talk.id, workspaceId, slides)
  return { ...talk, slides }
}

// PATCH /api/talks/:id/slides/:idx  { slide } — a hand-edited slide, through
// the same coercion boundary the model's output crosses.
talksRouter.patch('/:id/slides/:idx', asyncHandler(async (req, res) => {
  const { talk, slides, idx } = await loadTalkSlide(req.params.id, req.user.workspace_id, req.params.idx)
  const edited = normaliseEditedSlide((req.body as { slide?: unknown })?.slide, talk.sources ?? [], talk.language)
  if (!edited) throw new ValidationError('Некорректные данные слайда')
  if (!talk.notes_enabled) edited.notes = ''
  res.json({ talk: await persist(talk, slides.map((s, i) => (i === idx ? edited : s)), req.user.workspace_id) })
}))

// PUT /api/talks/:id/slides { slides } — replace the whole array, each slide
// through the same coercion boundary as a single edit. Exists for the undo
// of a deck-level rewrite; a client should not use it for ordinary edits
// (the per-slide routes are what keep concurrent edits from clobbering).
talksRouter.put('/:id/slides', asyncHandler(async (req, res) => {
  const talk = await findTalkById(req.params.id, req.user.workspace_id)
  if (!talk?.slides) throw new NotFoundError('Выступление не найдено')
  const raw = (req.body as { slides?: unknown })?.slides
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SLIDE_COUNT) throw new ValidationError('Некорректные данные слайдов')
  const slides: Slide[] = []
  for (const r of raw) {
    const s = normaliseEditedSlide(r, talk.sources ?? [], talk.language)
    if (!s) throw new ValidationError('Некорректные данные слайда')
    if (!talk.notes_enabled) s.notes = ''
    slides.push(s)
  }
  res.json({ talk: await persist(talk, slides, req.user.workspace_id) })
}))

// POST /api/talks/:id/slides/:idx/regenerate  { instruction? } — one call,
// inline. Bounded by the generation limiter, not a quota: polishing a talk
// the user already has is not starting a new one.
talksRouter.post('/:id/slides/:idx/regenerate', generationLimiter, asyncHandler(async (req, res) => {
  const { talk, slides, idx } = await loadTalkSlide(req.params.id, req.user.workspace_id, req.params.idx)
  const raw = (req.body as { instruction?: unknown })?.instruction
  const instruction = typeof raw === 'string' ? raw.trim().slice(0, 500) : ''
  const rewritten = await regenerateSlide({ talk, slideIdx: idx, instruction: instruction || undefined })
  if (!rewritten) throw new ValidationError('Не удалось переписать слайд — попробуйте ещё раз')
  res.json({ talk: await persist(talk, slides.map((s, i) => (i === idx ? rewritten : s)), req.user.workspace_id) })
}))

// DELETE /api/talks/:id/slides/:idx
talksRouter.delete('/:id/slides/:idx', asyncHandler(async (req, res) => {
  const { talk, slides, idx } = await loadTalkSlide(req.params.id, req.user.workspace_id, req.params.idx)
  if (slides.length <= 1) throw new ValidationError('В выступлении должен остаться хотя бы один слайд')
  res.json({ talk: await persist(talk, slides.filter((_, i) => i !== idx), req.user.workspace_id) })
}))

// POST /api/talks/:id/slides  { after_index, type?, title? } — inserts an
// empty slide after `after_index` (-1 for the very start). Empty on purpose:
// the user types into it or hits «Переписать», which fills it from its type
// and title the way every other slide was written.
talksRouter.post('/:id/slides', asyncHandler(async (req, res) => {
  const talk = await findTalkById(req.params.id, req.user.workspace_id)
  if (!talk?.slides) throw new NotFoundError('Выступление не найдено')
  if (talk.slides.length >= MAX_SLIDE_COUNT) throw new ValidationError(`В выступлении не может быть больше ${MAX_SLIDE_COUNT} слайдов`)
  const b = (req.body ?? {}) as { after_index?: unknown; type?: unknown; title?: unknown }
  const after = Number(b.after_index)
  if (!Number.isInteger(after) || after < -1 || after >= talk.slides.length) throw new ValidationError('Некорректная позиция слайда')
  const blank = normaliseEditedSlide({ type: b.type, title: typeof b.title === 'string' && b.title.trim() ? b.title : 'Новый слайд', notes: '', body: {} }, talk.sources ?? [], talk.language)
  if (!blank) throw new ValidationError('Не удалось создать слайд')
  const at = after + 1
  res.status(201).json({ talk: await persist(talk, [...talk.slides.slice(0, at), blank, ...talk.slides.slice(at)], req.user.workspace_id) })
}))

// POST /api/talks/:id/slides/move  { from, to } — a move, not a whole
// reordered array: the client sends the one thing that changed.
talksRouter.post('/:id/slides/move', asyncHandler(async (req, res) => {
  const talk = await findTalkById(req.params.id, req.user.workspace_id)
  if (!talk?.slides) throw new NotFoundError('Выступление не найдено')
  const b = (req.body ?? {}) as { from?: unknown; to?: unknown }
  const next = Number.isInteger(b.from) && Number.isInteger(b.to) ? applySlideMove(talk.slides, b.from as number, b.to as number) : null
  if (!next) throw new ValidationError('Некорректная позиция слайда')
  res.json({ talk: await persist(talk, next, req.user.workspace_id) })
}))

// ─── Import ─────────────────────────────────────────────────────────────────

const MAX_DECK_BYTES = 20 * 1024 * 1024
const deckUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DECK_BYTES, files: 1 } }).single('file')

// POST /api/talks/import  (multipart, field "file") — «Загрузить свою
// презентацию». No model call, no quota: it is a zip and some XML, and
// putting the cheapest possible first step behind a gate would be
// indefensible. The file's real format is read from the part layout, not
// the extension or the declared type (CLAUDE.md §3.7).
talksRouter.post('/import', (req, res, next) => {
  deckUpload(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(new ValidationError('Файл больше 20 МБ'))
    if (err) return next(new ValidationError('Не удалось прочитать файл'))
    next()
  })
}, asyncHandler(async (req, res) => {
  if (!req.file) throw new ValidationError('Загрузите файл презентации (.pptx)')
  const kind = identifyOoxml(req.file.buffer)
  if (kind !== 'pptx') {
    throw new ValidationError(kind === 'docx'
      ? 'Это документ Word, а не презентация — нужен файл .pptx'
      : 'Поддерживается формат .pptx (PowerPoint 2007 и новее) — старый .ppt нужно сначала пересохранить')
  }

  const { slides, language, sourceSlideCount, imported } = await importPptx(req.file.buffer)
  if (slides.length === 0) throw new ValidationError('В этой презентации не нашлось ни одного слайда с текстом или картинкой')

  // The deck's own first slide names it better than the file does
  // («Доклад_финал_v3.pptx»), but a cover sometimes carries only a company
  // name — so the file name is the fallback, not the other way round.
  const fromSlide = slides[0]?.title?.trim()
  const fromFile  = req.file.originalname.replace(/\.pptx$/i, '').replace(/[_-]+/g, ' ').trim()
  const untitled  = language === 'ru' ? 'Без заголовка' : 'Untitled'
  const title = ((fromSlide && fromSlide !== untitled ? fromSlide : fromFile) || (language === 'ru' ? 'Импортированная презентация' : 'Imported deck')).slice(0, 200)

  const params: GenerateParams = {
    userId: req.user.id, workspaceId: req.user.workspace_id, title, brief: '',
    intent: 'inform', audience: 'team', language, durationMinutes: Math.max(1, Math.round(slides.length * 1.5)),
    // Notes on iff the deck brought any: an imported deck usually has none,
    // and an empty notes column on every slide is noise.
    notesEnabled: imported.some((s) => s.notes.trim().length > 0), strictToBrief: false,
  }
  const talk = await createTalk(params, slides, [], slides.length)

  // Pictures are stored after the talk exists (their keys are scoped by its
  // id) and a failure here must not cost the user the import.
  const media = await attachImportedImages(talk, slides, imported)
  const final = media.stored > 0 ? await persist(talk, media.slides, req.user.workspace_id) : talk

  res.status(201).json({ talk: final, source_slide_count: sourceSlideCount, images_imported: media.stored, images_dropped: media.dropped })
}))

// ─── Images (upload) ────────────────────────────────────────────────────────

// In memory, capped; the bytes are then sniffed — the multipart Content-Type
// is a claim. Anything but PNG/JPEG is refused in storeSlideImage (§3.5).
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }).single('file')

// GET /api/talks/media/:id/image — the auth proxy for stored images. Scoped
// to the workspace: an uploaded picture is the workspace's own file, so
// "any signed-in user with the uuid" is the wrong posture.
talksRouter.get('/media/:id/image', asyncHandler(async (req, res) => {
  const media = await getTalkMediaById(req.params.id)
  if (!media || media.workspace_id !== req.user.workspace_id) throw new NotFoundError('Изображение не найдено')
  const buffer = await downloadObject(media.storage_path)
  res.setHeader('Content-Type', media.mime)
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.send(buffer)
}))

// POST /api/talks/:id/slides/:idx/image  (multipart, field "file")
talksRouter.post('/:id/slides/:idx/image', (req, res, next) => {
  imageUpload(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(new ValidationError('Изображение больше 8 МБ — уменьшите его'))
    if (err) return next(new ValidationError('Не удалось прочитать файл'))
    next()
  })
}, asyncHandler(async (req, res) => {
  const { talk, slides, idx } = await loadTalkSlide(req.params.id, req.user.workspace_id, req.params.idx)
  if (!req.file) throw new ValidationError('Выберите файл PNG или JPEG')
  const image = await storeSlideImage(talk, idx, req.file.buffer)
  res.status(201).json({ talk: await persist(talk, slides.map((s, i) => (i === idx ? withSlideImage(s, image) : s)), req.user.workspace_id) })
}))

// ─── Generated pictures (Design v3, L3) ────────────────────────────────────
//
// The prompt is proposed from the slide and the theme (imageGen.ts) and
// shown before generation; the user may rewrite it. The picture lands in
// storage exactly like an upload. Sequential and capped at deck level:
// each picture is a paid call.

// GET /api/talks/:id/slides/:idx/image/prompt — the proposed prompt.
talksRouter.get('/:id/slides/:idx/image/prompt', asyncHandler(async (req, res) => {
  const { talk, slides, idx } = await loadTalkSlide(req.params.id, req.user.workspace_id, req.params.idx)
  const theme = getTheme(talk.theme_id, await resolveBrandKit(req.user.workspace_id))
  res.json({ prompt: imagePromptForSlide(slides[idx], theme, talk.language), available: isImageGenConfigured(), max: PROMPT_MAX_CHARS })
}))

// POST /api/talks/:id/slides/:idx/image/generate { prompt? }
talksRouter.post('/:id/slides/:idx/image/generate', asyncHandler(async (req, res) => {
  const { talk, slides, idx } = await loadTalkSlide(req.params.id, req.user.workspace_id, req.params.idx)
  const theme = getTheme(talk.theme_id, await resolveBrandKit(req.user.workspace_id))
  const raw = (req.body as { prompt?: unknown })?.prompt
  const prompt = (typeof raw === 'string' && raw.trim() ? raw.trim() : imagePromptForSlide(slides[idx], theme, talk.language)).slice(0, PROMPT_MAX_CHARS)
  const picture = await generateImage(prompt, aspectForSlide(slides[idx]), { userId: req.user.id, workspaceId: req.user.workspace_id, language: talk.language })
  const image = { ...(await storeSlideImage(talk, idx, picture.buffer)), query: prompt, source_host: talk.language === 'ru' ? 'Сгенерировано' : 'Generated' }
  recordTalkEvent({ talkId: talk.id, workspaceId: req.user.workspace_id, userId: req.user.id, event: 'image_generated', metadata: { slide: idx, type: slides[idx].type } })
  res.status(201).json({ talk: await persist(talk, slides.map((s, i) => (i === idx ? withSlideImage(s, image) : s)), req.user.workspace_id), prompt })
}))

// POST /api/talks/:id/images/generate — every slide that wants a picture
// and has none: image-full and diagram always, anything else with a query.
// Capped; a failure on one slide does not stop the others.
const DECK_IMAGE_CAP = 8
talksRouter.post('/:id/images/generate', asyncHandler(async (req, res) => {
  const talk = await findTalkById(req.params.id, req.user.workspace_id)
  if (!talk?.slides) throw new NotFoundError('Выступление не найдено')
  const theme = getTheme(talk.theme_id, await resolveBrandKit(req.user.workspace_id))
  const wants = (s: Slide) => !hasSlideImage(s) && (s.type === 'image-full' || s.type === 'diagram' || getSlideImageQuery(s).length > 0)
  const targets = talk.slides.map((s, i) => ({ s, i })).filter(({ s }) => wants(s)).slice(0, DECK_IMAGE_CAP)
  let slides = talk.slides
  let done = 0, failed = 0
  for (const { s, i } of targets) {
    try {
      const prompt = imagePromptForSlide(s, theme, talk.language)
      const picture = await generateImage(prompt, aspectForSlide(s), { userId: req.user.id, workspaceId: req.user.workspace_id, language: talk.language })
      const image = { ...(await storeSlideImage(talk, i, picture.buffer)), query: prompt, source_host: talk.language === 'ru' ? 'Сгенерировано' : 'Generated' }
      slides = slides.map((x, j) => (j === i ? withSlideImage(x, image) : x))
      done++
    } catch { failed++ }
  }
  recordTalkEvent({ talkId: talk.id, workspaceId: req.user.workspace_id, userId: req.user.id, event: 'image_generated', metadata: { done, failed, of: talk.slides.length } })
  res.json({ talk: done > 0 ? await persist(talk, slides, req.user.workspace_id) : talk, done, failed, skipped: targets.length === 0 })
}))

// DELETE /api/talks/:id/slides/:idx/image — detaches; the object stays until
// the talk is deleted (a re-attach or undo may want it, and it is counted).
talksRouter.delete('/:id/slides/:idx/image', asyncHandler(async (req, res) => {
  const { talk, slides, idx } = await loadTalkSlide(req.params.id, req.user.workspace_id, req.params.idx)
  const next = slides.map((s, i) => {
    if (i !== idx) return s
    return s.type === 'diagram' ? { ...s, body: { ...s.body, image: null } } : { ...s, image: null }
  })
  res.json({ talk: await persist(talk, next, req.user.workspace_id) })
}))

// GET /api/talks/:id/export.pdf[?slides=…][&notes=1] — the slides as a PDF:
// one 16:9 page per slide in the talk's theme and brand, optionally a notes
// page after each. Quota-gated like the .pptx since 2026-09-15 (free: two a
// month) — a PDF is the artefact that gets sent to someone, which is use.
talksRouter.get('/:id/export.pdf', asyncHandler(async (req, res) => {
  assertDownloadQuota(req.user.plan_tier, 'pdf', await countDownloadsThisMonth(req.user.workspace_id, 'pdf'))
  const talk = await findTalkById(req.params.id, req.user.workspace_id)
  if (!talk) throw new NotFoundError('Выступление не найдено')
  if (!talk.slides || talk.slides.length === 0) throw new ValidationError('У этого выступления ещё нет слайдов')
  let selection: number[] | null
  try { selection = parseSlideSelection(req.query.slides, talk.slides.length) }
  catch (err) { if (err instanceof SelectionError) throw new ValidationError('Неверный список слайдов'); throw err }
  const subset = selectSlides(talk, selection)
  const notes = req.query.notes === '1' && talk.notes_enabled
  const pdf = await generateTalkPdf(subset, { brand: await resolveBrandKit(req.user.workspace_id), notes })
  const fname = `${talk.title.trim() || 'talk'}${selectionSuffix(selection, talk.slides.length, talk.language)}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="talk.pdf"; filename*=UTF-8''${encodeURIComponent(fname)}`)
  res.setHeader('Content-Length', pdf.length)
  res.end(pdf)
  recordTalkEvent({
    talkId: talk.id, workspaceId: req.user.workspace_id, userId: req.user.id, event: 'exported', format: 'pdf',
    metadata: { slides: (selection ?? talk.slides).length, of: talk.slides.length, theme: talk.theme_id, notes },
  })
}))

// ─── Deck-level rewrite ─────────────────────────────────────────────────────

// POST /api/talks/:id/rewrite { instruction } → a job. Same limiter and cap
// as generation: it is one call per five slides.
talksRouter.post('/:id/rewrite', generationLimiter, asyncHandler(async (req, res) => {
  const talk = await findTalkById(req.params.id, req.user.workspace_id)
  if (!talk?.slides?.length) throw new NotFoundError('Выступление не найдено')
  const raw = (req.body as { instruction?: unknown })?.instruction
  const instruction = typeof raw === 'string' ? raw.trim().slice(0, 500) : ''
  if (!instruction) throw new ValidationError('Напишите, что изменить во всём выступлении')
  await checkSpendCap(req.user.workspace_id)
  const job = await createRewriteJob({ talkId: talk.id, instruction, userId: req.user.id, workspaceId: req.user.workspace_id })
  await getJobQueue().send(TALK_JOB_QUEUE, { jobId: job.id, stage: 'rewrite' } satisfies TalkJobPayload)
  res.status(202).json(toJobResponse(job))
}))

// POST /api/talks/:id/rewrite/:jobId/apply { accept: number[] } — write the
// accepted slides from the proposal, keep the rest. The proposal is then
// gone; the previous slides come back in the response for a one-step undo.
talksRouter.post('/:id/rewrite/:jobId/apply', asyncHandler(async (req, res) => {
  const talk = await findTalkById(req.params.id, req.user.workspace_id)
  if (!talk?.slides) throw new NotFoundError('Выступление не найдено')
  const job = await getTalkJobById(req.params.jobId, req.user.workspace_id)
  if (!job || job.kind !== 'rewrite' || job.talk_id !== talk.id || !job.proposal) throw new NotFoundError('Предложение не найдено')
  const acceptRaw = (req.body as { accept?: unknown })?.accept
  const accept = new Set(Array.isArray(acceptRaw) ? acceptRaw.map(Number).filter((n) => Number.isInteger(n) && n >= 0) : [])
  // The talk may have been edited since the proposal was made; only
  // positions that still exist on both sides are replaced.
  const next = talk.slides.map((s, i) => (accept.has(i) && job.proposal![i] ? job.proposal![i] : s))
  const before = talk.slides
  const updated = await persist(talk, next, req.user.workspace_id)
  await clearRewriteProposal(job.id, req.user.workspace_id)
  res.json({ talk: updated, before })
}))

talksRouter.delete('/:id/rewrite/:jobId', asyncHandler(async (req, res) => {
  await clearRewriteProposal(req.params.jobId, req.user.workspace_id)
  res.status(204).end()
}))

// ─── Sharing ────────────────────────────────────────────────────────────────

// POST /api/talks/:id/share → { share_url }; DELETE revokes. The token is
// 32 random bytes — unguessable, and the only credential the public route
// accepts. Re-posting returns the existing link rather than rotating it:
// rotation is what DELETE + POST is for.
talksRouter.post('/:id/share', asyncHandler(async (req, res) => {
  const existing = await findTalkById(req.params.id, req.user.workspace_id)
  if (!existing) throw new NotFoundError('Выступление не найдено')
  const talk = existing.share_token ? existing : await setShareToken(existing.id, req.user.workspace_id, randomBytes(32).toString('base64url'))
  res.json({ talk, share_url: `/s/${talk!.share_token}` })
}))

talksRouter.delete('/:id/share', asyncHandler(async (req, res) => {
  const talk = await setShareToken(req.params.id, req.user.workspace_id, null)
  if (!talk) throw new NotFoundError('Выступление не найдено')
  res.json({ talk })
}))

// POST /api/talks/:id/approve { approved } — «Готово»: the user stands
// behind this talk. Only approved talks are ever used as style references.
talksRouter.post('/:id/approve', asyncHandler(async (req, res) => {
  const approved = (req.body as { approved?: unknown })?.approved !== false
  const talk = await setTalkApproved(req.params.id, req.user.workspace_id, approved)
  if (!talk) throw new NotFoundError('Выступление не найдено')
  res.json({ talk })
}))

// PATCH /api/talks/:id { theme_id } — the deck-level look. Unknown ids are
// refused here; the exporter would silently fall back to default.
talksRouter.patch('/:id', asyncHandler(async (req, res) => {
  const themeId = (req.body as { theme_id?: unknown })?.theme_id
  const hasCustom = themeId === 'custom' && Boolean((await getBrandKit(req.user.workspace_id))?.custom_theme)
  if (typeof themeId !== 'string' || (!THEMES[themeId] && !hasCustom)) throw new ValidationError('Неизвестная тема')
  const talk = await setTalkTheme(req.params.id, req.user.workspace_id, themeId)
  if (!talk) throw new NotFoundError('Выступление не найдено')
  res.json({ talk })
}))

talksRouter.delete('/:id', asyncHandler(async (req, res) => {
  // Paths first: the media rows cascade with the talk row and would be
  // gone by the time cleanup ran. The scoped delete is the ownership check.
  const paths = await collectTalkMediaPaths(req.params.id, req.user.workspace_id)
  if (!(await deleteTalk(req.params.id, req.user.workspace_id))) throw new NotFoundError('Выступление не найдено')
  await deleteMediaObjects(paths)
  res.status(204).end()
}))

export type { Intent, Audience }
