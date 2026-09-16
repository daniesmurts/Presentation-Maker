import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler'
import { findTalkByShareToken } from '../db/queries/talks'
import { config } from '../lib/config'
import type { Slide, DiagramSlide } from '../../../shared/types'

// A real HTML response for the crawlers that fetch a shared talk's link —
// Telegram, WhatsApp, iMessage, Slack, etc. don't execute JS, so the SPA's
// client-rendered <title>/meta are invisible to them; every shared link
// previewed as a bare URL with no card at all. deploy/Caddyfile routes
// known bot user-agents on /s/:token here (verbatim path) and leaves every
// other request on the normal SPA route — this router never serves a human
// a page they'd actually read, only ever a redirect target.
export const shareCardRouter = Router()

shareCardRouter.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }))

export const TOKEN = /^[A-Za-z0-9_-]{40,50}$/

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function slideWord(n: number): string {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'слайд'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'слайда'
  return 'слайдов'
}

/** The title slide's picture if it has one, else the first slide that
 *  does (diagram slides keep theirs a level down, at body.image). Returns
 *  an absolute URL through the token-scoped, unauthenticated media proxy
 *  (routes/shared.ts) — og:image must be absolute; scrapers don't resolve
 *  relative URLs against the page they fetched it from — or the site's
 *  static fallback image if the talk has no pictures at all. */
export function resolveCardImageUrl(slides: Slide[], token: string): string {
  const image = slides.find((s) => s.image)?.image
    ?? slides.find((s): s is DiagramSlide => s.type === 'diagram' && !!s.body.image)?.body.image
  const mediaId = image?.url.match(/\/media\/([^/]+)\/image$/)?.[1]
  return mediaId ? `${config.frontendUrl}/api/shared/${token}/media/${mediaId}/image` : `${config.frontendUrl}/og.png`
}

export function shareCardHtml(title: string, slideCount: number, token: string, imageUrl: string): string {
  const pageUrl = `${config.frontendUrl}/s/${token}`
  const description = `${slideCount} ${slideWord(slideCount)} — Тезариум`
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — Тезариум</title>
<meta property="og:type" content="article">
<meta property="og:site_name" content="Тезариум">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${imageUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${pageUrl}">
</head><body>
<a href="${pageUrl}">${escapeHtml(title)}</a>
</body></html>`
}

shareCardRouter.get('/:token', asyncHandler(async (req, res) => {
  const token = req.params.token
  const pageUrl = `${config.frontendUrl}/s/${token}`
  if (!TOKEN.test(token)) { res.redirect(302, pageUrl); return }

  const talk = await findTalkByShareToken(token)
  if (!talk?.slides) { res.redirect(302, pageUrl); return }

  const title = talk.title || config.frontendUrl
  const imageUrl = resolveCardImageUrl(talk.slides, token)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.send(shareCardHtml(title, talk.slides.length, token, imageUrl))
}))
