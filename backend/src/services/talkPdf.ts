import path from 'node:path'
import { cleanForSlide } from './latexText'
import { renderFormulaToPng } from './formulaRenderer'
import { loadSlideImage } from './slideImageSource'
import { imageSize } from '../lib/imageSize'
import { contrastRatio, textOn } from '../lib/brandColor'
import { getTheme, applyBrand, type AppliedTheme, type BrandKit } from './themes'
import type { Slide, Talk, TalkLanguage } from '../../../shared/types'
import { G, pt as pctPt } from '../../../shared/slideGeometry'
import { backgroundRole, type BackgroundRole } from '../../../shared/slideBackground'
import { normaliseDesign, sectionTitle } from '../../../shared/slideDesign'
import { renderBackgroundPng } from './slideBackground'

// A SLIDES PDF (CLAUDE.md §5.5): one landscape 16:9 page per slide, the same
// theme data the .pptx uses — not the parent's reading-order handout. The
// PDF is what gets attached to an e-mail or opened on a phone; the .pptx is
// what gets edited. Hand-laid with pdfkit: no headless browser in the
// container, works offline.
//
// Rules that came from the parent's handout (§3.5, §6):
//  - pictures and formulas are loaded in ONE parallel round before the
//    synchronous layout pass — pdfkit's document is a stream, and an await
//    in the middle of it desynchronises pagination;
//  - PNG/JPEG only — pdfkit throws mid-document on anything else, taking
//    the whole file with it; imageSize() doubles as the format gate;
//  - a font must be registered before the first text() that names it, and
//    a paragraph with glyphs the main face lacks swaps face per PARAGRAPH,
//    never per glyph.

const PAGE_W = 720   // pt — 10in × 72, the exporter's 16:9 geometry
const PAGE_H = 405.36
const PT_PER_IN = 72
// Themes v2: percent-of-width (shared/slideGeometry.ts) → points on this page.
const U = (v: number) => pctPt(v, PAGE_W)
const BOTTOM = PAGE_H - U(G.bottom)

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts')
export const FONTS = {
  serif:  path.join(FONT_DIR, 'PTSerif-Bold.ttf'),
  serifR: path.join(FONT_DIR, 'PTSerif-Regular.ttf'),
  serifI: path.join(FONT_DIR, 'PTSerif-Italic.ttf'),
  mono:   path.join(FONT_DIR, 'PTMono-Regular.ttf'),
  sans:   path.join(FONT_DIR, 'PTSans-Regular.ttf'),
  sansB:  path.join(FONT_DIR, 'PTSans-Bold.ttf'),
  serifX:  path.join(FONT_DIR, 'DejaVuSerif-Bold.ttf'),
  serifRX: path.join(FONT_DIR, 'DejaVuSerif.ttf'),
  sansX:   path.join(FONT_DIR, 'DejaVuSans.ttf'),
  sansBX:  path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
}
type FontName = 'serif' | 'serifR' | 'serifI' | 'sans' | 'sansB' | 'mono'
const FALLBACK: Record<FontName, keyof typeof FONTS> = { serif: 'serifX', serifR: 'serifRX', serifI: 'serifRX', sans: 'sansX', sansB: 'sansBX', mono: 'sansX' }

// Greek, arrows, mathematical operators — what PT lacks. Sub/superscript
// digits are NOT here: latexToPlainText emits them constantly and PT has them.
const NEEDS_FALLBACK = /[Ͱ-Ͽ←-⇿∀-⋿]/

/** Which face to draw `text` in. pdfkit renders a missing glyph as a box and
 *  reports nothing — only this rule (or a human) catches it. */
export function faceFor(font: FontName, text: string): keyof typeof FONTS {
  return NEEDS_FALLBACK.test(text) ? FALLBACK[font] : font
}

// Theme font names are .pptx names; the PDF has these two families.
function family(name: string): 'serif' | 'sans' {
  return /georgia|serif|times|cambria/i.test(name) ? 'serif' : 'sans'
}

const hex = (h: string) => `#${h}`

interface Picture { buffer: Buffer; w: number; h: number }
interface Prepared {
  images:   Map<number, Picture>                 // slide index → its picture, fitted
  formulas: Map<string, { buffer: Buffer; aspect: number }>   // latex → rendered PNG
  backgrounds: Partial<Record<BackgroundRole, Buffer>>   // Design v3: the theme's treatment per role, rasterised
}

export interface PdfOptions {
  brand?:   BrandKit | null
  themeId?: string | null
  /** Append a notes page after each slide that has notes. */
  notes?:   boolean
}

// Load everything async up front (rule 1 above).
async function prepare(slides: Slide[], theme: AppliedTheme): Promise<Prepared> {
  const images = new Map<number, Picture>()
  const formulas = new Map<string, { buffer: Buffer; aspect: number }>()
  const backgrounds: Partial<Record<BackgroundRole, Buffer>> = {}
  await Promise.all([
    ...(['hero', 'quiet'] as const).map(async (role) => {
      const r = await renderBackgroundPng(theme.palette, theme.background, role)
      if (r) backgrounds[role] = r.buffer
    }),
    ...slides.map(async (slide, i) => {
      const image = slide.type === 'diagram' ? slide.body.image : slide.image
      if (!image) return
      const loaded = await loadSlideImage(image.url)
      const size = loaded && imageSize(loaded.buffer)
      if (!loaded || !size) return
      images.set(i, { buffer: loaded.buffer, w: size.width, h: size.height })
    }),
    ...slides.flatMap((slide) => slide.type === 'formula'
      ? slide.body.formulas.map(async (f) => {
          const r = await renderFormulaToPng(f.latex, hex(theme.palette.ink))
          if (r) formulas.set(f.latex, { buffer: Buffer.from(r.dataUri.split(',')[1], 'base64'), aspect: r.aspect })
        })
      : []),
  ])
  return { images, formulas, backgrounds }
}

export async function generateTalkPdf(talk: Pick<Talk, 'title' | 'slides' | 'language' | 'theme_id'>, opts: PdfOptions = {}): Promise<Buffer> {
  const slides = talk.slides ?? []
  if (slides.length === 0) throw new Error('No slides to export')
  const theme = applyBrand(getTheme(opts.themeId ?? talk.theme_id, opts.brand), opts.brand ?? null, contrastRatio, textOn)
  const prepared = await prepare(slides, theme)
  const PDFDocument = (await import('pdfkit')).default

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false, info: { Title: talk.title, Author: talk.language === 'ru' ? 'Тезариум' : 'Tezarium' } })
    for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, file)
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const r = new Renderer(doc, theme, talk.language, prepared, talk.title, slides.length)
    slides.forEach((slide, i) => {
      r.slide(slide, i)
      if (opts.notes && slide.notes.trim()) r.notesPage(slide, i)
    })
    doc.end()
  })
}

// pdfkit's type surface is large; the renderer only needs a handful of calls.
type Doc = any

class Renderer {
  private p: AppliedTheme['palette']
  private M: number
  private display: 'serif' | 'sans'
  private body: 'serif' | 'sans'
  constructor(private doc: Doc, private theme: AppliedTheme, private language: TalkLanguage, private prepared: Prepared, private talkTitle: string, private total: number) {
    this.p = theme.palette
    this.M = theme.margin * PT_PER_IN
    this.display = family(theme.fonts.display)
    this.body = family(theme.fonts.body)
  }

  private font(kind: 'display' | 'displayItalic' | 'body' | 'bodyBold' | 'mono'): FontName {
    if (kind === 'mono') return 'mono'
    if (kind === 'display') return this.display === 'serif' ? 'serif' : 'sansB'
    if (kind === 'displayItalic') return 'serifI'
    if (kind === 'bodyBold') return this.body === 'serif' ? 'serif' : 'sansB'
    return this.body === 'serif' ? 'serifR' : 'sans'
  }

  /** Height `text` would take, without drawing — for panels drawn behind text. */
  private measure(s: string, kind: 'display' | 'displayItalic' | 'body' | 'bodyBold' | 'mono', size: number, w: number, maxH?: number, lineGap = 2): number {
    const clean = cleanForSlide(s)
    if (!clean) return 0
    this.doc.font(faceFor(this.font(kind), clean)).fontSize(size)
    return Math.min(this.doc.heightOfString(clean, { width: w, lineGap }), maxH ?? Infinity)
  }

  /** Draw text, face chosen per paragraph; returns the height used. */
  private text(s: string, kind: 'display' | 'displayItalic' | 'body' | 'bodyBold' | 'mono', size: number, color: string, x: number, y: number, w: number, o: { align?: 'left' | 'center' | 'right'; maxH?: number; lineGap?: number; tracking?: number } = {}): number {
    const clean = cleanForSlide(s)
    if (!clean) return 0
    const f = this.font(kind)
    this.doc.font(faceFor(f, clean)).fontSize(size).fillColor(hex(color))
    const opts = { width: w, align: o.align ?? 'left', lineGap: o.lineGap ?? 2, characterSpacing: o.tracking ?? 0, ...(o.maxH ? { height: o.maxH, ellipsis: true } : {}) }
    const h = Math.min(this.doc.heightOfString(clean, opts), o.maxH ?? Infinity)
    this.doc.text(clean, x, y, opts)
    return h
  }

  /** PT's natural line height at `size` (≈1.29–1.33 × size). The CSS spec
   *  sets 1.12 for titles and 1.35 for body; the gap that reaches the body
   *  figure is a point or two, and titles simply take PT's own leading — an
   *  added gap on top of it doubled the leading and pushed a summary off the
   *  page (first render of the demo talk). */
  private lineH(kind: 'display' | 'displayItalic' | 'body' | 'bodyBold' | 'mono', size: number): number {
    this.doc.font(this.font(kind)).fontSize(size)
    return this.doc.currentLineHeight(true)
  }
  private bodyGap(size: number): number { return Math.max(0, size * G.bodyLine - this.lineH('body', size)) }
  private maxLines(kind: 'display' | 'displayItalic' | 'body' | 'bodyBold' | 'mono', size: number, n: number, gap = 0): number { return this.lineH(kind, size) * n + gap * (n - 1) + 1 }

  /** The uppercase label with tracking (slide type, column header, «Что дальше»). */
  private kick(s: string, x: number, y: number, w: number, color = this.theme.labelColor): number {
    return this.text(s.toUpperCase(), 'bodyBold', U(G.kickSize), color, x, y, w, { tracking: 1.2, maxH: U(G.kickSize) * 1.6 })
  }

  /** The largest size ≤ `size` at which `s` sets in `n` lines of `w` —
   *  measured, since pdfkit can; the .pptx estimates the same thing
   *  (slideGeometry.ts fitTitle). Floor 0.6 × size. */
  private shrinkToLines(s: string, kind: 'display' | 'displayItalic' | 'body' | 'bodyBold', size: number, w: number, n: number, lineGap = 0): number {
    let sz = size
    while (sz > size * 0.6 && this.measure(s, kind, sz, w, undefined, lineGap) > this.maxLines(kind, sz, n, lineGap)) sz *= 0.94
    return sz
  }

  /** A bulleted list, shrunk until it fits between `y` and `maxY`. It used
   *  to stop drawing at `maxY` — the last items silently vanished. */
  private bullets(items: string[], x: number, y: number, w: number, size: number, color: string, maxY: number): number {
    if (items.length === 0) return 0
    const indent = U(G.bulletIndent)
    let sz = size
    const heightAt = (z: number) => items.reduce((h, it) => h + this.measure(it, 'body', z, w - indent, undefined, this.bodyGap(z)) + U(G.bodyGap), 0)
    while (sz > size * 0.65 && heightAt(sz) > maxY - y) sz *= 0.94
    let yy = y
    const dot = U(G.bullet)
    for (const item of items) {
      if (yy >= maxY - sz) break
      this.doc.circle(x + dot / 2, yy + sz * 0.55, dot / 2).fill(hex(this.p.accent))
      yy += this.text(item, 'body', sz, color, x + indent, yy, w - indent, { maxH: maxY - yy, lineGap: this.bodyGap(sz) }) + U(G.bodyGap)
    }
    return yy - y
  }

  private footer(left: string | null, index: number): void {
    const { p, M } = this
    const size = U(G.footerSize)
    const y = PAGE_H - U(G.footerY) - size
    if (left) this.text(left, 'body', size, p.ink2, M, y, PAGE_W - M * 2 - 110, { maxH: size * 1.4 })
    this.text(`${String(index + 1).padStart(2, '0')} / ${String(this.total).padStart(2, '0')}`, 'mono', size, p.ink2, PAGE_W - M - 100, y, 100, { align: 'right' })
  }

  /** Content-slide header: the title over a hairline; returns where the body starts. */
  private header(title: string, index: number): number {
    const { doc, p, M } = this
    const size = this.shrinkToLines(title, 'display', U(G.titleSize), PAGE_W - M * 2, 2)
    const h = this.text(title, 'display', size, p.ink, M, U(G.top), PAGE_W - M * 2, { maxH: this.maxLines('display', size, 2), lineGap: 0 })
    const ruleY = U(G.top) + h + U(G.titlePad)
    doc.rect(M, ruleY, PAGE_W - M * 2, U(G.rule)).fill(hex(p.accent))
    this.footer(this.talkTitle, index)
    return ruleY + U(G.rule) + U(G.titleGap)
  }

  /** A new page on the flat ground, with the role's background picture
   *  over it when the theme draws one (a notes page has none). */
  private page(role: BackgroundRole | null = null): void {
    this.doc.addPage()
    this.doc.rect(0, 0, PAGE_W, PAGE_H).fill(hex(this.p.bg))
    const bg = role && this.prepared.backgrounds[role]
    if (bg) {
      // pdfkit embeds a Buffer again on every image() call — twelve pages
      // of a blob theme were 700 KB of the same picture. Opened once per
      // role, the object is one XObject referenced from every page.
      this.bgImages[role] ??= this.doc.openImage(bg)
      this.doc.image(this.bgImages[role], 0, 0, { width: PAGE_W, height: PAGE_H })
    }
  }
  private bgImages: Partial<Record<BackgroundRole, unknown>> = {}

  private panel(x: number, y: number, w: number, h: number): void {
    this.doc.roundedRect(x, y, w, h, U(G.fRadius)).fill(hex(this.p.panel))
  }

  private picture(index: number, box: { x: number; y: number; w: number; h: number }, placeholder: string): void {
    const pic = this.prepared.images.get(index)
    const { doc, p } = this
    if (pic) {
      const scale = Math.min(box.w / pic.w, box.h / pic.h, 1)
      const w = pic.w * scale, h = pic.h * scale
      doc.image(pic.buffer, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, { width: w, height: h })
    } else {
      doc.rect(box.x, box.y, box.w, box.h).dash(3, { space: 3 }).stroke(hex(p.border)).undash()
      doc.font(faceFor('sans', placeholder)).fontSize(10).fillColor(hex(p.ink3)).text(placeholder, box.x, box.y + box.h / 2 - 6, { width: box.w, align: 'center' })
    }
  }

  slide(slide: Slide, index: number): void {
    const { doc, p, M } = this
    this.page(backgroundRole(slide, this.theme.background))
    const W = PAGE_W - M * 2
    const image = slide.type === 'diagram' ? slide.body.image : slide.image
    const hasSide = Boolean(image) && !['diagram', 'image-full', 'title', 'section', 'agenda', 'stats', 'quote', 'summary', 'cta'].includes(slide.type)
    const cw = hasSide ? W - 3.3 * PT_PER_IN : W
    const L = this.language === 'ru'
      ? { next: 'Что дальше', none: (q: string) => `Изображение не выбрано: «${q}»`, missing: 'Изображение недоступно' }
      : { next: 'What next', none: (q: string) => `No image chosen: “${q}”`, missing: 'Image unavailable' }
    const bodySize = U(G.bodySize), subSize = U(G.subSize)

    if (slide.type === 'title') {
      // Anchored to the bottom, stacked upward: presenter, title, kicker, rule.
      const brand = this.theme.brand
      if (brand?.logo) {
        const size = imageSize(brand.logo.buffer)
        if (size) {
          const scale = Math.min((2.2 * PT_PER_IN) / size.width, (0.7 * PT_PER_IN) / size.height)
          doc.image(brand.logo.buffer, M, U(G.top), { width: size.width * scale, height: size.height * scale })
        }
      }
      let bottom = PAGE_H - U(G.tsBottom)
      if (slide.body.presenter) {
        const h = this.measure(slide.body.presenter, 'body', U(G.tsWhoSize), W)
        this.text(slide.body.presenter, 'body', U(G.tsWhoSize), p.ink2, M, bottom - h, W)
        bottom -= h + U(G.tsTitleGap)
      }
      const tw = W * (G.tsMaxW / 100), tSize = this.shrinkToLines(slide.title, 'display', U(G.tsTitleSize), tw, 3), tMax = this.maxLines('display', tSize, 3)
      const th = this.measure(slide.title, 'display', tSize, tw, tMax, 0)
      this.text(slide.title, 'display', tSize, p.ink, M, bottom - th, tw, { maxH: tMax, lineGap: 0 })
      bottom -= th
      if (slide.body.subtitle) {
        bottom -= U(G.tsKickGap)
        const h = U(G.kickSize) * 1.6
        this.kick(slide.body.subtitle, M, bottom - h + U(G.kickSize) * 0.3, W, p.ink2)
        bottom -= h
      }
      bottom -= U(G.tsRuleGap)
      doc.rect(M, bottom - U(G.tsRuleH), U(G.tsRuleW), U(G.tsRuleH)).fill(hex(p.accent))
      this.footer(brand?.name ?? null, index)
      return
    }

    // Design v3 (L2) — the rhythm types. Same compositions as talkExport.ts.
    const emphasis = normaliseDesign(slide.type, slide.design).emphasis === 'accent' ? this.theme.labelColor : p.ink

    if (slide.type === 'section') {
      let bottom = PAGE_H - U(G.tsBottom)
      const tw = W * (G.tsMaxW / 100)
      if (slide.body.lead) {
        const h = this.measure(slide.body.lead, 'body', U(G.tsWhoSize), tw, this.maxLines('body', U(G.tsWhoSize), 3))
        this.text(slide.body.lead, 'body', U(G.tsWhoSize), p.ink2, M, bottom - h, tw, { maxH: h })
        bottom -= h + U(G.tsTitleGap)
      }
      const title = sectionTitle(slide)
      const tSize = this.shrinkToLines(title, 'display', U(G.tsTitleSize), tw, 3), tMax = this.maxLines('display', tSize, 3)
      const th = this.measure(title, 'display', tSize, tw, tMax, 0)
      this.text(title, 'display', tSize, p.ink, M, bottom - th, tw, { maxH: tMax, lineGap: 0 })
      bottom -= th
      if (slide.body.kicker) {
        bottom -= U(G.tsKickGap)
        const h = U(G.kickSize) * 1.6
        this.kick(slide.body.kicker, M, bottom - h + U(G.kickSize) * 0.3, W, emphasis)
        bottom -= h
      }
      bottom -= U(G.tsRuleGap)
      doc.rect(M, bottom - U(G.tsRuleH), U(G.tsRuleW), U(G.tsRuleH)).fill(hex(p.accent))
      this.footer(this.talkTitle, index)
      return
    }

    if (slide.type === 'quote') {
      const top = U(G.top) + 36
      const kh = this.kick(slide.title, M, top, W)
      const qy = top + kh + U(G.tsKickGap)
      const qw = W * (G.qMaxW / 100), qSize = this.shrinkToLines(`«${slide.body.quote}»`, 'displayItalic', U(G.qSize), qw, 4)
      const qh = this.text(`«${slide.body.quote}»`, 'displayItalic', qSize, p.ink, M, qy, qw, { maxH: this.maxLines('displayItalic', qSize, 4), lineGap: 0 })
      if (slide.body.attribution) this.text(`— ${slide.body.attribution}`, 'bodyBold', subSize, emphasis, M, qy + qh + U(G.titleGap), W, { maxH: subSize * 3 })
      this.footer(this.talkTitle, index)
      return
    }

    if (slide.type === 'image-full') {
      const pic = this.prepared.images.get(index)
      if (pic) {
        // Cover: scale to fill the page and crop what overflows, centred.
        const scale = Math.max(PAGE_W / pic.w, PAGE_H / pic.h)
        const w = pic.w * scale, h = pic.h * scale
        doc.save().rect(0, 0, PAGE_W, PAGE_H).clip()
        doc.image(pic.buffer, (PAGE_W - w) / 2, (PAGE_H - h) / 2, { width: w, height: h })
        doc.restore()
        const scrimH = 1.55 * PT_PER_IN
        doc.save().fillOpacity(0.65).rect(0, PAGE_H - scrimH, PAGE_W, scrimH).fill('#000000').restore()
        const ty = PAGE_H - scrimH + 11
        const th = this.text(slide.title, 'display', U(G.titleSize), 'FFFFFF', M, ty, W, { maxH: this.maxLines('display', U(G.titleSize), 1), lineGap: 0 })
        if (slide.body.caption) this.text(slide.body.caption, 'body', subSize, 'FFFFFF', M, ty + th + 4, W, { maxH: PAGE_H - ty - th - 12 })
      } else {
        const top = this.header(slide.title, index)
        const extra = slide.body.caption ? 32 : 0
        const box = { x: M, y: top, w: W, h: BOTTOM - top - extra }
        this.picture(index, box, slide.image ? L.missing : L.none(slide.image_query ?? slide.title))
        if (slide.body.caption) this.text(slide.body.caption, 'body', subSize, p.ink2, M, box.y + box.h + 8, W, { maxH: 24 })
      }
      return
    }

    if (slide.type === 'discussion' || slide.type === 'cta') {
      // No header rule: the title is the kicker, the question / the ask is the slide.
      const top = U(G.top) + 36
      const kh = this.kick(slide.title, M, top, cw)
      const qy = top + kh + U(G.tsKickGap)
      const qw = cw * (G.qMaxW / 100)
      const main = slide.type === 'discussion' ? slide.body.question : slide.body.action
      const qKind = slide.type === 'discussion' ? 'displayItalic' as const : 'display' as const
      const qSize = this.shrinkToLines(main, qKind, U(G.qSize), qw, 3)
      const qh = this.text(main, qKind, qSize, p.ink, M, qy, qw, { maxH: this.maxLines(qKind, qSize, 3), lineGap: 0 })
      let y = qy + qh + U(G.titleGap)
      if (slide.type === 'discussion') {
        this.bullets(slide.body.prompts, M, y, cw, subSize, p.ink2, BOTTOM)
        if (hasSide) this.picture(index, { x: PAGE_W - M - 3 * PT_PER_IN, y: qy, w: 3 * PT_PER_IN, h: BOTTOM - qy }, L.missing)
      } else {
        y += this.bullets(slide.body.reasons, M, y, W, subSize, p.ink2, BOTTOM - (slide.body.contact ? 30 : 0))
        if (slide.body.contact) this.text(slide.body.contact, 'bodyBold', subSize, this.theme.labelColor, M, y + 4, W, { maxH: 24 })
      }
      this.footer(this.talkTitle, index)
      return
    }

    const top = this.header(slide.title, index)
    if (hasSide) this.picture(index, { x: PAGE_W - M - 3 * PT_PER_IN, y: top, w: 3 * PT_PER_IN, h: BOTTOM - top }, L.missing)

    switch (slide.type) {
      case 'bullets': {
        const items = slide.body.items
        const split = normaliseDesign('bullets', slide.design).variant === 'split' && items.length >= 4 && !hasSide
        if (split) {
          const gap = U(G.sGap), colW = (cw - gap) / 2, half = Math.ceil(items.length / 2)
          this.bullets(items.slice(0, half), M, top, colW, bodySize, p.ink, BOTTOM)
          this.bullets(items.slice(half), M + colW + gap, top, colW, bodySize, p.ink, BOTTOM)
        } else this.bullets(items, M, top, cw, bodySize, p.ink, BOTTOM)
        break
      }
      case 'agenda': {
        const items = slide.body.items
        const cols = items.length >= 5 ? 2 : 1
        const gap = U(G.sGap), colW = (W - gap * (cols - 1)) / cols, per = Math.ceil(items.length / cols)
        const numW = 0.5 * PT_PER_IN
        let col = 0, y = top
        items.forEach((t, i) => {
          if (i > 0 && i % per === 0) { col++; y = top }
          const x = M + col * (colW + gap)
          const rowH = this.measure(t, 'body', bodySize, colW - numW, this.maxLines('body', bodySize, 2, 2))
          if (y + rowH > BOTTOM + 2) return
          this.text(String(i + 1).padStart(2, '0'), 'mono', bodySize, emphasis, x, y, numW, { maxH: rowH })
          this.text(t, 'body', bodySize, p.ink, x + numW, y, colW - numW, { maxH: rowH })
          y += rowH + U(G.bodyGap)
        })
        break
      }
      case 'stats': {
        const stats = slide.body.stats
        const hero = normaliseDesign('stats', slide.design).variant === 'hero-number' || stats.length === 1
        if (hero) {
          const [st] = stats
          const vSize = U(9.5), vH = this.lineH('display', vSize)
          const y = top + Math.max(0, (BOTTOM - top - vH - bodySize * 2.6) / 2)
          this.text(st.value, 'display', vSize, emphasis, M, y, W, { maxH: vH })
          const lh = this.text(st.label, 'body', bodySize, p.ink, M, y + vH + 4, W * 0.8, { maxH: this.maxLines('body', bodySize, 2, 2) })
          if (st.note) this.text(st.note, 'body', subSize, p.ink2, M, y + vH + 4 + lh + 4, W * 0.8, { maxH: BOTTOM - y - vH - lh - 8 })
        } else {
          const gap = U(G.sGap), colW = (W - gap * (stats.length - 1)) / stats.length
          const vSize = U(6.4), vH = this.lineH('display', vSize)
          stats.forEach((st, i) => {
            const x = M + i * (colW + gap)
            doc.rect(x, top, colW, U(G.rule) * 1.6).fill(hex(p.ink))
            const vy = top + U(G.rule) * 1.6 + 8
            this.text(st.value, 'display', vSize, emphasis, x, vy, colW, { maxH: vH })
            const ly = vy + vH + 4
            // Two lines of label, measured with the default 2 pt lineGap —
            // 2.7 × the size (and maxLines without the gap) was one line short.
            const lh = this.text(st.label, 'body', bodySize, p.ink, x, ly, colW, { maxH: this.maxLines('body', bodySize, 2, 2) })
            if (st.note) this.text(st.note, 'body', subSize, p.ink2, x, ly + lh + 4, colW, { maxH: BOTTOM - ly - lh - 4 })
          })
        }
        break
      }
      case 'concept': {
        // Panel first, then the text on it — measured, not drawn twice.
        const padX = U(G.fPadX) / 2, padY = 12
        // Three lines at most, shrunk to fit rather than cut with an ellipsis.
        const dSize = this.shrinkToLines(slide.body.definition, 'display', bodySize, cw - padX * 2, 3, 4)
        const dMax = this.maxLines('display', dSize, 3, 4)
        const defH = this.measure(slide.body.definition, 'display', dSize, cw - padX * 2, dMax, 4)
        this.panel(M, top, cw, defH + padY * 2)
        this.text(slide.body.definition, 'display', dSize, p.ink, M + padX, top + padY, cw - padX * 2, { maxH: dMax, lineGap: 4 })
        this.bullets(slide.body.supporting, M, top + defH + padY * 2 + U(G.fExGap), cw, subSize, p.ink2, BOTTOM); break
      }
      case 'formula': {
        const padY = U(G.fPadY), padX = U(G.fPadX)
        const capH = U(G.fCapSize) * 1.5
        const reserve = slide.body.explanation ? 0.9 * PT_PER_IN + U(G.fExGap) : 0
        const panelMax = BOTTOM - top - reserve
        const n = slide.body.formulas.length || 1
        const per = (panelMax - padY * 2) / n
        // Measure the stack, draw the panel, then the stack on it.
        const rows = slide.body.formulas.map((f) => {
          const r = this.prepared.formulas.get(f.latex)
          const ch = f.caption ? capH + U(G.fCapGap) : 0
          const budget = Math.max(20, per - ch - 6)
          if (r) { let w = cw - padX * 2, h = w / r.aspect; const cap = Math.min(budget, 1.6 * PT_PER_IN); if (h > cap) { h = cap; w = h * r.aspect } return { f, r, w, h, ch } }
          return { f, r: null, w: cw - padX * 2, h: Math.min(budget, 44), ch }
        })
        const stackH = rows.reduce((a, x) => a + x.h + x.ch + 6, 0)
        const panelH = Math.min(panelMax, stackH + padY * 2)
        this.panel(M, top, cw, panelH)
        let y = top + padY
        for (const row of rows) {
          if (row.r) doc.image(row.r.buffer, M + padX, y, { width: row.w, height: row.h })
          else this.text(row.f.latex, 'display', U(G.fSize), p.ink, M + padX, y, row.w, { maxH: row.h })
          y += row.h
          if (row.f.caption) { y += U(G.fCapGap); this.text(row.f.caption, 'mono', U(G.fCapSize), p.ink2, M + padX, y, row.w, { maxH: capH }); y += capH }
          y += 6
        }
        if (slide.body.explanation) { const ey = top + panelH + U(G.fExGap); this.text(slide.body.explanation, 'body', subSize, p.ink2, M, ey, cw * 0.8, { maxH: BOTTOM - ey, lineGap: this.bodyGap(subSize) }) }
        break
      }
      case 'comparison': {
        const cols = slide.body.columns, gap = U(G.sGap)
        const colW = (cw - gap * (cols.length - 1)) / cols.length
        cols.forEach((c, i) => {
          const x = M + i * (colW + gap)
          doc.rect(x, top, colW, U(G.rule) * 1.6).fill(hex(p.ink))
          const kh = this.kick(c.header, x, top + U(G.rule) * 1.6 + 6, colW)
          this.bullets(c.items, x, top + U(G.rule) * 1.6 + 6 + kh + 8, colW, subSize, p.ink, BOTTOM)
        }); break
      }
      case 'diagram': {
        const extra = (slide.body.caption ? 28 : 0) + (slide.body.points.length > 0 ? 64 : 0)
        const box = { x: M, y: top, w: W, h: BOTTOM - top - extra }
        this.picture(index, box, slide.body.image ? L.missing : L.none(slide.body.image_query))
        let y = box.y + box.h + 8
        if (slide.body.caption) y += this.text(slide.body.caption, 'bodyBold', subSize, p.ink, M, y, W) + 6
        this.bullets(slide.body.points, M, y, W, subSize * 0.85, p.ink2, BOTTOM); break
      }
      case 'summary': {
        const gap = U(G.sGap)
        const [a, b] = G.sCols
        const leftW = ((W - gap) * a) / (a + b), rightW = W - gap - leftW
        const hasNext = slide.body.next_steps.length > 0
        if (slide.body.takeaways.length) this.bullets(slide.body.takeaways, M, top, hasNext ? leftW : W, bodySize, p.ink, BOTTOM)
        if (hasNext) {
          const x = M + leftW + gap, padY = U(G.sPanelPadY), padX = U(G.sPanelPadX)
          // Measure the steps to size the panel, then draw panel → kicker → steps.
          const stepsH = slide.body.next_steps.reduce((acc, t) => acc + this.measure(t, 'body', subSize, rightW - padX * 2 - U(G.bulletIndent), undefined, this.bodyGap(subSize)) + U(G.bodyGap), 0)
          const kickH = U(G.kickSize) * 1.6 + 8
          const h = Math.min(BOTTOM - top, padY * 2 + kickH + stepsH)
          this.panel(x, top, rightW, h)
          this.kick(L.next, x + padX, top + padY, rightW - padX * 2)
          this.bullets(slide.body.next_steps, x + padX, top + padY + kickH, rightW - padX * 2, subSize, p.ink, top + h - padY)
        }
        break
      }
    }
  }

  /** A plain page of the speaker notes, after the slide it belongs to. */
  notesPage(slide: Slide, index: number): void {
    const { p, M } = this
    this.page()
    const label = this.language === 'ru' ? `Текст докладчика · слайд ${index + 1}` : `Speaker notes · slide ${index + 1}`
    this.text(label, 'bodyBold', 10, p.ink3, M, M, PAGE_W - M * 2)
    this.text(slide.title, 'display', 16, p.ink, M, M + 18, PAGE_W - M * 2, { maxH: 40 })
    this.text(slide.notes, 'body', 12, p.ink, M, M + 64, PAGE_W - M * 2, { maxH: PAGE_H - M * 2 - 64, lineGap: 4 })
  }
}

export function pdfFileName(title: string, suffix: string): string {
  return `${title.trim() || 'talk'}${suffix}.pdf`
}
