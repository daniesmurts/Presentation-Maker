import { Router } from 'express'
import multer from 'multer'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticate } from '../middleware/authenticate'
import { NotFoundError, ValidationError } from '../errors/AppError'
import { getBrandKit, upsertBrandKit, setBrandLogo, setCustomTheme, type BrandKitRow } from '../db/queries/brandKits'
import { identifyOoxml } from '../lib/fileType'
import { coerceTheme, readStoredTheme, generateThemeFromDescription, deriveThemeFromAccent, themeFromPptx, CUSTOM_THEME_ID } from '../services/themeGenerator'
import { validateTheme, type ValidatedTheme } from '../services/themes'
import type { TalkLanguage } from '../../../shared/types'
import { uploadObject, downloadObject, deleteObject } from '../services/objectStorage'
import { sniffMime } from '../services/slideImageSource'
import { imageSize } from '../lib/imageSize'
import { normaliseHex, contrastRatio, isTextSafe } from '../lib/brandColor'
import { THEMES, listThemes } from '../services/themes'
import { getWorkspaceStyleLearning, setWorkspaceStyleLearning } from '../db/queries/talks'

export const brandRouter = Router()
brandRouter.use(authenticate)

const MAX_LOGO_BYTES = 2 * 1024 * 1024
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LOGO_BYTES, files: 1 } }).single('file')

// What the settings page shows: the kit plus the measured contrast of the
// accent on every theme ground, so the page can say «на светлой теме 5.1:1
// ✓, на тёмной 2.3:1 — подписи будут серыми» instead of guessing.
function toResponse(kit: BrandKitRow | null) {
  const accent = kit?.accent ?? null
  return {
    accent,
    name: kit?.name ?? null,
    logo: kit?.logo_path ? { url: '/api/brand/logo', width: kit.logo_width, height: kit.logo_height } : null,
    contrast: accent
      ? Object.values(THEMES).map((t) => ({ theme: t.id, ratio: Number(contrastRatio(accent, t.palette.bg).toFixed(2)), textSafe: isTextSafe(accent, t.palette.bg) }))
      : [],
  }
}

brandRouter.get('/', asyncHandler(async (req, res) => {
  const kit = await getBrandKit(req.user.workspace_id)
  const custom = readStoredTheme(kit?.custom_theme)
  res.json({ brand: toResponse(kit), themes: listThemes(custom), custom_theme: custom, style_learning: await getWorkspaceStyleLearning(req.user.workspace_id) })
}))

// ─── The workspace's own theme (Design v3, L3) ─────────────────────────────
//
// Three ways to PROPOSE one — a description, the brand accent, an uploaded
// .pptx — each returning a candidate with the corrections the validator
// made, never saving. PUT saves a candidate (validated again: the client
// may have edited it). One custom theme per workspace, id `custom`.

function candidate(v: ValidatedTheme) {
  return { theme: v.theme, issues: v.issues.map((i) => ({ pair: i.pair, ratio: i.ratio, floor: i.floor })) }
}

const lang = (v: unknown): TalkLanguage => (v === 'en' ? 'en' : 'ru')

// POST /api/brand/theme/generate { description, language? }
brandRouter.post('/theme/generate', asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as { description?: unknown; language?: unknown }
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  if (description.length < 3) throw new ValidationError('Опишите тему хотя бы парой слов')
  res.json(candidate(await generateThemeFromDescription(description, lang(b.language), { userId: req.user.id, workspaceId: req.user.workspace_id })))
}))

// POST /api/brand/theme/derive { mode: 'light' | 'dark' } — from the kit's accent.
brandRouter.post('/theme/derive', asyncHandler(async (req, res) => {
  const kit = await getBrandKit(req.user.workspace_id)
  if (!kit?.accent) throw new ValidationError('Сначала задайте цвет бренда')
  const mode = (req.body as { mode?: unknown })?.mode === 'dark' ? 'dark' : 'light'
  res.json(candidate(deriveThemeFromAccent(kit.accent, mode, kit.name ? kit.name.slice(0, 40) : 'Бренд')))
}))

// POST /api/brand/theme/from-pptx (multipart "file") — the deck's colour scheme.
const MAX_DECK_BYTES = 20 * 1024 * 1024
const deckUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DECK_BYTES, files: 1 } }).single('file')
brandRouter.post('/theme/from-pptx', (req, res, next) => {
  deckUpload(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(new ValidationError('Файл больше 20 МБ'))
    if (err) return next(new ValidationError('Не удалось прочитать файл'))
    next()
  })
}, asyncHandler(async (req, res) => {
  if (!req.file) throw new ValidationError('Выберите файл .pptx')
  if (identifyOoxml(req.file.buffer) !== 'pptx') throw new ValidationError('Это не презентация PowerPoint (.pptx)')
  const name = (req.file.originalname ?? '').replace(/\.pptx$/i, '').trim().slice(0, 40) || 'Из презентации'
  const v = await themeFromPptx(req.file.buffer, name)
  if (!v) throw new ValidationError('В этой презентации нет цветовой схемы, которую можно прочитать')
  res.json(candidate(v))
}))

// PUT /api/brand/theme { theme } — save; DELETE — remove.
brandRouter.put('/theme', asyncHandler(async (req, res) => {
  const raw = (req.body as { theme?: unknown })?.theme
  if (!raw || typeof raw !== 'object') throw new ValidationError('Нет темы для сохранения')
  const v = validateTheme(coerceTheme(raw))
  const kit = await setCustomTheme(req.user.workspace_id, { ...v.theme, id: CUSTOM_THEME_ID })
  res.json({ ...candidate(v), themes: listThemes(readStoredTheme(kit.custom_theme)) })
}))
brandRouter.delete('/theme', asyncHandler(async (req, res) => {
  await setCustomTheme(req.user.workspace_id, null)
  res.json({ themes: listThemes() })
}))

// PUT /api/brand/style-learning { enabled } — consent for using this
// workspace's APPROVED talks as style references in later generations.
brandRouter.put('/style-learning', asyncHandler(async (req, res) => {
  const enabled = (req.body as { enabled?: unknown })?.enabled === true
  await setWorkspaceStyleLearning(req.user.workspace_id, enabled)
  res.json({ style_learning: enabled })
}))

// PUT /api/brand { accent?: '#RRGGBB' | null, name?: string | null }
brandRouter.put('/', asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as { accent?: unknown; name?: unknown }
  const patch: { accent?: string | null; name?: string | null } = {}
  if ('accent' in b) {
    if (b.accent === null || b.accent === '') { patch.accent = null }
    else {
      const hex = normaliseHex(b.accent)
      if (!hex) throw new ValidationError('Цвет — в формате #RRGGBB')
      patch.accent = hex
    }
  }
  if ('name' in b) {
    if (b.name !== null && typeof b.name !== 'string') throw new ValidationError('Некорректное название')
    patch.name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) || null : null
  }
  res.json({ brand: toResponse(await upsertBrandKit(req.user.workspace_id, patch)) })
}))

// POST /api/brand/logo (multipart "file") — PNG/JPEG ≤ 2 MB, identified from bytes.
brandRouter.post('/logo', (req, res, next) => {
  logoUpload(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(new ValidationError('Логотип больше 2 МБ — уменьшите его'))
    if (err) return next(new ValidationError('Не удалось прочитать файл'))
    next()
  })
}, asyncHandler(async (req, res) => {
  if (!req.file) throw new ValidationError('Выберите файл PNG или JPEG')
  const mime = sniffMime(req.file.buffer)
  if (!mime) throw new ValidationError('Поддерживаются только PNG и JPEG')
  const size = imageSize(req.file.buffer)
  if (!size) throw new ValidationError('Не удалось прочитать размеры изображения')
  const previous = await getBrandKit(req.user.workspace_id)
  const path = `brand/${req.user.workspace_id}/logo-${Date.now()}.${mime === 'image/png' ? 'png' : 'jpg'}`
  await uploadObject(req.file.buffer, path, mime)
  const kit = await setBrandLogo(req.user.workspace_id, { path, mime, width: size.width, height: size.height })
  if (previous?.logo_path) await deleteObject(previous.logo_path)
  res.status(201).json({ brand: toResponse(kit) })
}))

brandRouter.delete('/logo', asyncHandler(async (req, res) => {
  const previous = await getBrandKit(req.user.workspace_id)
  const kit = await setBrandLogo(req.user.workspace_id, null)
  if (previous?.logo_path) await deleteObject(previous.logo_path)
  res.json({ brand: toResponse(kit) })
}))

// GET /api/brand/logo — the workspace's own logo, through the auth proxy.
brandRouter.get('/logo', asyncHandler(async (req, res) => {
  const kit = await getBrandKit(req.user.workspace_id)
  if (!kit?.logo_path) throw new NotFoundError('Логотип не загружен')
  res.setHeader('Content-Type', kit.logo_mime ?? 'image/png')
  res.setHeader('Cache-Control', 'private, no-cache')
  res.send(await downloadObject(kit.logo_path))
}))
