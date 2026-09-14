import { Router } from 'express'
import multer from 'multer'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticate } from '../middleware/authenticate'
import { NotFoundError, ValidationError } from '../errors/AppError'
import { getBrandKit, upsertBrandKit, setBrandLogo, type BrandKitRow } from '../db/queries/brandKits'
import { uploadObject, downloadObject, deleteObject } from '../services/objectStorage'
import { sniffMime } from '../services/slideImageSource'
import { imageSize } from '../lib/imageSize'
import { normaliseHex, contrastRatio, isTextSafe } from '../lib/brandColor'
import { THEMES, listThemes } from '../services/themes'

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
  res.json({ brand: toResponse(await getBrandKit(req.user.workspace_id)), themes: listThemes() })
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
