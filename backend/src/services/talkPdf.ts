import path from 'node:path'
import { cleanForSlide } from './latexText'
import { renderFormulaToPng } from './formulaRenderer'
import { loadSlideImage } from './slideImageSource'
import { imageSize } from '../lib/imageSize'
import { contrastRatio, textOn } from '../lib/brandColor'
import { getTheme, applyBrand, type AppliedTheme, type BrandKit } from './themes'
import type { Slide, Talk, TalkLanguage } from '../../../shared/types'

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

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts')
const FONTS = {
  serif:  path.join(FONT_DIR, 'PTSerif-Bold.ttf'),
  serifR: path.join(FONT_DIR, 'PTSerif-Regular.ttf'),
  sans:   path.join(FONT_DIR, 'PTSans-Regular.ttf'),
  sansB:  path.join(FONT_DIR, 'PTSans-Bold.ttf'),
  serifX:  path.join(FONT_DIR, 'DejaVuSerif-Bold.ttf'),
  serifRX: path.join(FONT_DIR, 'DejaVuSerif.ttf'),
  sansX:   path.join(FONT_DIR, 'DejaVuSans.ttf'),
  sansBX:  path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
}
type FontName = 'serif' | 'serifR' | 'sans' | 'sansB'
const FALLBACK: Record<FontName, keyof typeof FONTS> = { serif: 'serifX', serifR: 'serifRX', sans: 'sansX', sansB: 'sansBX' }

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
  await Promise.all([
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
  return { images, formulas }
}

export async function generateTalkPdf(talk: Pick<Talk, 'title' | 'slides' | 'language' | 'theme_id'>, opts: PdfOptions = {}): Promise<Buffer> {
  const slides = talk.slides ?? []
  if (slides.length === 0) throw new Error('No slides to export')
  const theme = applyBrand(getTheme(opts.themeId ?? talk.theme_id), opts.brand ?? null, contrastRatio, textOn)
  const prepared = await prepare(slides, theme)
  const PDFDocument = (await import('pdfkit')).default

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false, info: { Title: talk.title, Author: talk.language === 'ru' ? 'Тезариум' : 'Tezarium' } })
    for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, file)
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const r = new Renderer(doc, theme, talk.language, prepared)
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
  constructor(private doc: Doc, private theme: AppliedTheme, private language: TalkLanguage, private prepared: Prepared) {
    this.p = theme.palette
    this.M = theme.margin * PT_PER_IN
    this.display = family(theme.fonts.display)
    this.body = family(theme.fonts.body)
  }

  private font(kind: 'display' | 'body' | 'bodyBold'): FontName {
    if (kind === 'display') return this.display === 'serif' ? 'serif' : 'sansB'
    if (kind === 'bodyBold') return this.body === 'serif' ? 'serif' : 'sansB'
    return this.body === 'serif' ? 'serifR' : 'sans'
  }

  /** Height `text` would take, without drawing — for panels drawn behind text. */
  private measure(s: string, kind: 'display' | 'body' | 'bodyBold', size: number, w: number, maxH?: number): number {
    const clean = cleanForSlide(s)
    if (!clean) return 0
    this.doc.font(faceFor(this.font(kind), clean)).fontSize(size)
    return Math.min(this.doc.heightOfString(clean, { width: w, lineGap: 2 }), maxH ?? Infinity)
  }

  /** Draw text, face chosen per paragraph; returns the height used. */
  private text(s: string, kind: 'display' | 'body' | 'bodyBold', size: number, color: string, x: number, y: number, w: number, o: { align?: 'left' | 'center'; maxH?: number; lineGap?: number } = {}): number {
    const clean = cleanForSlide(s)
    if (!clean) return 0
    const f = this.font(kind)
    this.doc.font(faceFor(f, clean)).fontSize(size).fillColor(hex(color))
    const opts = { width: w, align: o.align ?? 'left', lineGap: o.lineGap ?? 2, ...(o.maxH ? { height: o.maxH, ellipsis: true } : {}) }
    const h = Math.min(this.doc.heightOfString(clean, opts), o.maxH ?? Infinity)
    this.doc.text(clean, x, y, opts)
    return h
  }

  private bullets(items: string[], x: number, y: number, w: number, size: number, color: string, maxY: number): number {
    let yy = y
    for (const item of items) {
      if (yy >= maxY - size) break
      this.doc.font(faceFor(this.font('body'), '•')).fontSize(size).fillColor(hex(this.p.accent)).text('•', x, yy, { width: 12, lineBreak: false })
      yy += this.text(item, 'body', size, color, x + 14, yy, w - 14, { maxH: maxY - yy }) + 5
    }
    return yy - y
  }

  private header(title: string): number {
    const { doc, p, M } = this
    doc.rect(0, 0, PAGE_W, 0.12 * PT_PER_IN).fill(hex(p.accent))
    this.text(title, 'display', 24, p.ink, M, 0.3 * PT_PER_IN, PAGE_W - M * 2, { maxH: 0.75 * PT_PER_IN })
    return 1.3 * PT_PER_IN
  }

  private page(): void {
    this.doc.addPage()
    this.doc.rect(0, 0, PAGE_W, PAGE_H).fill(hex(this.p.bg))
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
    this.page()
    const W = PAGE_W - M * 2
    const image = slide.type === 'diagram' ? slide.body.image : slide.image
    const hasSide = Boolean(image) && slide.type !== 'diagram' && !['title', 'summary', 'cta'].includes(slide.type)
    const cw = hasSide ? W - 3.3 * PT_PER_IN : W
    const L = this.language === 'ru'
      ? { key: 'ГЛАВНОЕ', next: 'ЧТО ДАЛЬШЕ', none: (q: string) => `Изображение не выбрано: «${q}»`, missing: 'Изображение недоступно' }
      : { key: 'KEY POINTS', next: 'NEXT', none: (q: string) => `No image chosen: “${q}”`, missing: 'Image unavailable' }

    if (slide.type === 'title') {
      doc.rect(0, 0, PAGE_W, 0.14 * PT_PER_IN).fill(hex(p.accent))
      doc.rect(0, PAGE_H - 0.5 * PT_PER_IN, PAGE_W, 0.5 * PT_PER_IN).fill(hex(p.panel))
      let y = 1.1 * PT_PER_IN
      const brand = this.theme.brand
      if (brand?.logo) {
        const size = imageSize(brand.logo.buffer)
        if (size) {
          const scale = Math.min((2.6 * PT_PER_IN) / size.width, (0.85 * PT_PER_IN) / size.height)
          const w = size.width * scale, h = size.height * scale
          doc.image(brand.logo.buffer, (PAGE_W - w) / 2, 0.75 * PT_PER_IN, { width: w, height: h })
          y = 0.75 * PT_PER_IN + h + 0.25 * PT_PER_IN
        }
      }
      if (brand?.name) y += this.text(brand.name, 'body', 11, p.ink2, M, y, W, { align: 'center' }) + 8
      if (slide.body.subtitle) y += this.text(slide.body.subtitle.toUpperCase(), 'bodyBold', 11, p.ink2, M, y, W, { align: 'center' }) + 10
      y += this.text(slide.title, 'display', 30, p.ink, M, y, W, { align: 'center', maxH: 1.5 * PT_PER_IN }) + 14
      doc.rect((PAGE_W - 1.1 * PT_PER_IN) / 2, y, 1.1 * PT_PER_IN, 3).fill(hex(p.accent))
      if (slide.body.presenter) this.text(slide.body.presenter, 'body', 12, p.ink2, M, y + 16, W, { align: 'center' })
      return
    }

    const top = this.header(slide.title)
    const maxY = PAGE_H - 0.3 * PT_PER_IN
    if (hasSide) this.picture(index, { x: PAGE_W - M - 3 * PT_PER_IN, y: top, w: 3 * PT_PER_IN, h: maxY - top }, L.missing)

    switch (slide.type) {
      case 'bullets':
        this.bullets(slide.body.items, M, top, cw, 16, p.ink, maxY); break
      case 'concept': {
        // Panel first, then the text on it — measured, not drawn twice.
        const defH = this.measure(slide.body.definition, 'body', 18, cw - 20, 1.2 * PT_PER_IN)
        doc.rect(M, top, cw, defH + 16).fill(hex(p.panel))
        this.text(slide.body.definition, 'body', 18, p.ink, M + 10, top + 8, cw - 20, { maxH: 1.2 * PT_PER_IN })
        this.bullets(slide.body.supporting, M, top + defH + 30, cw, 14, p.ink2, maxY); break
      }
      case 'formula': {
        const n = slide.body.formulas.length || 1
        const reserve = slide.body.explanation ? 0.9 * PT_PER_IN : 0
        const per = (maxY - top - reserve) / n
        let y = top
        for (const f of slide.body.formulas) {
          const r = this.prepared.formulas.get(f.latex)
          const capH = f.caption ? 18 : 0
          const budget = Math.max(20, per - capH - 6)
          if (r) {
            let w = cw * 0.85, h = w / r.aspect
            if (h > Math.min(budget, 1.8 * PT_PER_IN)) { h = Math.min(budget, 1.8 * PT_PER_IN); w = h * r.aspect }
            doc.image(r.buffer, M + (cw - w) / 2, y, { width: w, height: h }); y += h + 6
          } else {
            y += this.text(f.latex, 'body', 20, p.ink, M, y, cw, { align: 'center', maxH: budget }) + 6
          }
          if (f.caption) y += this.text(f.caption, 'body', 12, p.ink3, M, y, cw, { align: 'center' }) + 4
        }
        if (slide.body.explanation) this.text(slide.body.explanation, 'body', 14, p.ink2, M, y + 6, cw, { maxH: maxY - y - 6 }); break
      }
      case 'comparison': {
        const cols = slide.body.columns, gap = 0.3 * PT_PER_IN
        const colW = (cw - gap * (cols.length - 1)) / cols.length
        cols.forEach((c, i) => {
          const x = M + i * (colW + gap)
          doc.rect(x, top, colW, 0.5 * PT_PER_IN).fill(hex(p.panel))
          this.text(c.header.toUpperCase(), 'bodyBold', 12, this.theme.labelColor, x, top + 12, colW, { align: 'center', maxH: 24 })
          this.bullets(c.items, x, top + 0.6 * PT_PER_IN, colW, 12, p.ink, maxY)
        }); break
      }
      case 'diagram': {
        const box = { x: M, y: top, w: W, h: 2.9 * PT_PER_IN }
        this.picture(index, box, slide.body.image ? L.missing : L.none(slide.body.image_query))
        let y = box.y + box.h + 10
        if (slide.body.caption) y += this.text(slide.body.caption, 'bodyBold', 12, p.ink, M, y, W, { align: 'center' }) + 6
        this.bullets(slide.body.points, M, y, W, 11, p.ink2, maxY); break
      }
      case 'discussion': {
        const qh = this.text(slide.body.question, 'display', 20, p.ink, M, top, cw, { maxH: 1.0 * PT_PER_IN })
        this.bullets(slide.body.prompts, M, top + qh + 16, cw, 14, p.ink2, maxY); break
      }
      case 'cta': {
        const ah = this.text(slide.body.action, 'display', 26, p.ink, M, top, W, { maxH: 1.3 * PT_PER_IN })
        doc.rect(M, top + ah + 10, 1.1 * PT_PER_IN, 3).fill(hex(p.accent))
        let y = top + ah + 24
        y += this.bullets(slide.body.reasons, M, y, W, 14, p.ink2, maxY - (slide.body.contact ? 30 : 0))
        if (slide.body.contact) this.text(slide.body.contact, 'bodyBold', 14, this.theme.labelColor, M, y + 6, W, { maxH: 24 }); break
      }
      case 'summary': {
        const half = (W - 0.3 * PT_PER_IN) / 2
        if (slide.body.takeaways.length) {
          this.text(L.key, 'bodyBold', 11, this.theme.labelColor, M, top, half)
          this.bullets(slide.body.takeaways, M, top + 22, half, 13, p.ink, maxY)
        }
        if (slide.body.next_steps.length) {
          const x = M + half + 0.3 * PT_PER_IN
          this.text(L.next, 'bodyBold', 11, this.theme.labelColor, x, top, half)
          this.bullets(slide.body.next_steps, x, top + 22, half, 13, p.ink2, maxY)
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
