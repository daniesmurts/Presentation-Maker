import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler'
import { NotFoundError } from '../errors/AppError'
import { findTalkByShareToken } from '../db/queries/talks'
import { getTalkMediaById } from '../db/queries/talkMedia'
import { downloadObject } from '../services/objectStorage'
import { listThemes } from '../services/themes'
import { readStoredTheme } from '../services/themeGenerator'
import { getBrandKit } from '../db/queries/brandKits'
import type { SharedTalk } from '../../../shared/types'

// Read-only share link (CLAUDE.md §5.6): no account, no auth — the token is
// the credential. Exposes the slides and what is needed to render them;
// never the speaker notes, the brief, or who made it (SharedTalk strips
// them). The talk's own images are served through a token-scoped proxy so a
// media id alone still opens nothing.

export const sharedRouter = Router()

// Unauthenticated and DB-backed — bound it per IP.
sharedRouter.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }))

const TOKEN = /^[A-Za-z0-9_-]{40,50}$/

async function lookup(token: string) {
  if (!TOKEN.test(token)) throw new NotFoundError('Ссылка не найдена')
  const talk = await findTalkByShareToken(token)
  if (!talk?.slides) throw new NotFoundError('Ссылка не найдена')
  return talk
}

sharedRouter.get('/:token', asyncHandler(async (req, res) => {
  const talk = await lookup(req.params.token)
  const shared: SharedTalk = {
    title: talk.title, language: talk.language, theme_id: talk.theme_id,
    // Notes stripped per slide; image URLs rewritten to the token-scoped proxy.
    slides: talk.slides!.map((s) => {
      const rewrite = (url: string) => url.replace(/^\/api\/talks\/media\/([^/]+)\/image$/, `/api/shared/${talk.share_token}/media/$1/image`)
      const img = (i: typeof s.image) => (i ? { ...i, url: rewrite(i.url), thumbnail: rewrite(i.thumbnail), source_url: i.source_url.startsWith('/api/') ? rewrite(i.source_url) : i.source_url } : i)
      const base = { ...s, notes: '' }
      return s.type === 'diagram' ? { ...base, body: { ...s.body, image: img(s.body.image) } } : { ...base, image: img(s.image) }
    }) as SharedTalk['slides'],
  }
  res.setHeader('Cache-Control', 'private, no-store')
  // The custom theme travels with a shared talk that uses it — the viewer
  // has no account, so the swatch list is the one place it can come from.
  const custom = talk.theme_id === 'custom' ? readStoredTheme((await getBrandKit(talk.workspace_id))?.custom_theme) : null
  res.json({ talk: shared, themes: listThemes(custom) })
}))

sharedRouter.get('/:token/media/:mediaId/image', asyncHandler(async (req, res) => {
  const talk = await lookup(req.params.token)
  const media = await getTalkMediaById(req.params.mediaId)
  if (!media || media.talk_id !== talk.id) throw new NotFoundError('Изображение не найдено')
  res.setHeader('Content-Type', media.mime)
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.send(await downloadObject(media.storage_path))
}))
