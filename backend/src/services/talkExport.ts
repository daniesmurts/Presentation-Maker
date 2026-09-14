import { logger } from '../lib/logger'
import { renderFormulaToPng } from './formulaRenderer'
import { cleanForSlide, latexToPlainText } from './latexText'
import { containFit } from '../lib/imageSize'
import { loadSlideImage } from './slideImageSource'
import { getTheme, applyBrand, type AppliedTheme, type BrandKit } from './themes'
import { contrastRatio, textOn } from '../lib/brandColor'
import type {
  Talk, Slide, SlideImage, TitleSlide, BulletsSlide, ConceptSlide, FormulaSlide,
  ComparisonSlide, DiagramSlide, DiscussionSlide, CtaSlide, SummarySlide, TalkLanguage,
} from '../../../shared/types'

// Native .pptx export — ported from the parent's presentationExport.ts
// (CLAUDE.md §2), restructured so the THEME is data (themes.ts) and no
// module state carries between exports: everything a layout reads comes
// through `Ctx`. A layout per slide type; formulas rendered to PNG via
// MathJax → resvg with a Unicode fallback; images fitted by intrinsic size
// (§3.5). pptxgenjs is imported lazily so the backend boots without it.

const SLIDE_W = 10      // inches, 16:9
const SLIDE_H = 5.63

// Never hand pptxgenjs a non-positive or non-finite extent — DrawingML
// requires cx/cy > 0, and a negative one makes PowerPoint refuse to open
// the deck, which is exactly what a formula slide produced in the parent
// once its stacked images overran the slide height. Overflowing the edge is
// ugly; a negative extent is fatal, so every computed height goes through here.
const MIN_SHAPE_H = 0.2
function clampH(h: number): number {
  return Number.isFinite(h) && h > MIN_SHAPE_H ? h : MIN_SHAPE_H
}

// pptxgenjs's type surface is deliberately not imported — the lazy import
// is the only place the package is named.
type Pptx = any

interface Ctx {
  theme:    AppliedTheme
  language: TalkLanguage
  margin:   number
}

const L = {
  ru: { imageMissing: 'Изображение недоступно для экспорта', imageNone: (q: string) => `Изображение не выбрано: «${q}»`, key: 'ГЛАВНОЕ', next: 'ЧТО ДАЛЬШЕ', author: 'Тезариум' },
  en: { imageMissing: 'Image unavailable for export',         imageNone: (q: string) => `No image chosen: “${q}”`,       key: 'KEY POINTS', next: 'NEXT',        author: 'Tezarium' },
}

export interface ExportOptions {
  themeId?: string | null
  brand?:   BrandKit | null
}

export async function generateTalkPptx(talk: Pick<Talk, 'title' | 'slides' | 'language' | 'theme_id'>, opts: ExportOptions = {}): Promise<Buffer> {
  const slides = talk.slides
  if (!slides || slides.length === 0) throw new Error('No slides to export')

  const theme = applyBrand(getTheme(opts.themeId ?? talk.theme_id), opts.brand ?? null, contrastRatio, textOn)
  const ctx: Ctx = { theme, language: talk.language, margin: theme.margin }
  if (opts.brand?.accent && theme.labelColor !== theme.palette.accent) {
    logger.info({ message: '[PPTX export] brand accent below 4.5:1 on the theme ground — labels fall back to ink2', accent: opts.brand.accent, theme: theme.id, ratio: contrastRatio(opts.brand.accent, theme.palette.bg).toFixed(2) })
  }

  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'TEZARIUM_16_9', width: SLIDE_W, height: SLIDE_H })
  pptx.layout = 'TEZARIUM_16_9'
  pptx.author = L[ctx.language].author
  pptx.title  = talk.title

  // Sequential, not Promise.all — pptxgenjs slides render in call order and
  // an image fetch has no reason to race the others.
  for (const slide of slides) await addSlide(pptx, slide, ctx)

  const data = await pptx.write({ outputType: 'nodebuffer' })
  return fixDanglingSlideMasterEntries(data as Buffer)
}

// ─── Work around a pptxgenjs 4.0.1 packaging bug ───────────────────────────
//
// createContentTypesXml() writes one `<Override …/ppt/slideMasters/
// slideMasterN.xml>` PER SLIDE (using the slide's index, not the master
// count). This deck has exactly one real slideMaster1.xml, so every deck
// with 2+ slides ships a [Content_Types].xml referencing masters that don't
// exist — PowerPoint's validator flags that as corruption ("found a problem
// with content…") and strips parts. Strip the dangling Overrides from the
// written zip rather than patching the installed library.
async function fixDanglingSlideMasterEntries(pptxBuffer: Buffer): Promise<Buffer> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(pptxBuffer)
  const realMasterCount = Object.keys(zip.files).filter((n) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(n)).length
  const ct = zip.file('[Content_Types].xml')
  if (!ct) return pptxBuffer
  let xml = await ct.async('string')
  xml = xml.replace(/<Override PartName="\/ppt\/slideMasters\/slideMaster(\d+)\.xml"[^>]*\/>/g, (m, n) => (Number(n) > realMasterCount ? '' : m))
  zip.file('[Content_Types].xml', xml)
  return zip.generateAsync({ type: 'nodebuffer' })
}

// ─── Images ─────────────────────────────────────────────────────────────────

async function fetchImageAsDataUri(url: string): Promise<{ dataUri: string; buffer: Buffer } | null> {
  const loaded = await loadSlideImage(url)
  if (!loaded) {
    logger.warn({ message: '[PPTX export] no bytes for slide image, using placeholder', url })
    return null
  }
  return { dataUri: `data:${loaded.mime};base64,${loaded.buffer.toString('base64')}`, buffer: loaded.buffer }
}

/** Draw an image contain-fitted into a box, computing the exact w/h from the
 *  bytes: pptxgenjs stretches to the frame regardless of `sizing:contain`. */
function addFittedImage(s: Pptx, img: { dataUri: string; buffer: Buffer }, box: { x: number; y: number; w: number; h: number }): void {
  const fit = containFit(img.buffer, box.w, box.h)
  const w = fit?.w ?? box.w
  const h = fit?.h ?? box.h
  s.addImage({ data: img.dataUri, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h })
}

function addImagePlaceholder(s: Pptx, ctx: Ctx, box: { x: number; y: number; w: number; h: number }, text: string): void {
  const p = ctx.theme.palette
  s.addShape('rect', { ...box, fill: { color: p.panel }, line: { color: p.border, width: 1, dashType: 'dash' } })
  s.addText(text, { ...box, align: 'center', valign: 'middle', fontSize: 11, italic: true, color: p.ink3, fontFace: ctx.theme.fonts.body })
}

// Non-diagram slides may carry a supplementary image: rendered as a
// right-hand column, shrinking the text region rather than overlapping it.
const SIDE_IMAGE_W = 3.0
const SIDE_IMAGE_GAP = 0.3

function contentRegion(ctx: Ctx, hasImage: boolean): { x: number; w: number } {
  const fullW = SLIDE_W - ctx.margin * 2
  return { x: ctx.margin, w: hasImage ? fullW - SIDE_IMAGE_W - SIDE_IMAGE_GAP : fullW }
}

async function addSideImage(s: Pptx, ctx: Ctx, image: SlideImage | null | undefined): Promise<void> {
  if (!image) return
  const box = { x: SLIDE_W - ctx.margin - SIDE_IMAGE_W, y: 1.3, w: SIDE_IMAGE_W, h: SLIDE_H - 1.6 }
  const img = await fetchImageAsDataUri(image.url)
  if (img) addFittedImage(s, img, box)
  else addImagePlaceholder(s, ctx, box, L[ctx.language].imageMissing)
}

// ─── Per-slide-type rendering ──────────────────────────────────────────────

async function addSlide(pptx: Pptx, slide: Slide, ctx: Ctx): Promise<void> {
  switch (slide.type) {
    case 'title':      addTitleSlide(pptx, slide, ctx); return
    case 'bullets':    await addBulletsSlide(pptx, slide, ctx); return
    case 'concept':    await addConceptSlide(pptx, slide, ctx); return
    case 'formula':    await addFormulaSlide(pptx, slide, ctx); return
    case 'comparison': await addComparisonSlide(pptx, slide, ctx); return
    case 'diagram':    await addDiagramSlide(pptx, slide, ctx); return
    case 'discussion': await addDiscussionSlide(pptx, slide, ctx); return
    case 'cta':        addCtaSlide(pptx, slide, ctx); return
    case 'summary':    addSummarySlide(pptx, slide, ctx); return
  }
}

function addNotes(s: Pptx, notes: string): void {
  if (notes) s.addNotes(cleanForSlide(notes))
}

// Shared header used by every non-title slide — accent rule + title, so the
// deck reads as one system rather than one layout per type.
function addHeader(s: Pptx, ctx: Ctx, title: string): void {
  const { palette: p, fonts } = ctx.theme
  s.background = { color: p.bg }
  s.addShape('rect', { x: 0, y: 0, w: SLIDE_W, h: 0.12, fill: { color: p.accent } })
  s.addText(cleanForSlide(title), {
    x: ctx.margin, y: 0.3, w: SLIDE_W - ctx.margin * 2, h: 0.7,
    fontFace: fonts.display, fontSize: 24, bold: true, color: p.ink,
  })
}

function bulletList(items: string[]) {
  return items.map((t) => ({ text: cleanForSlide(t), options: { bullet: true, breakLine: true } }))
}

function body(ctx: Ctx, extra: Record<string, unknown> = {}) {
  return { fontFace: ctx.theme.fonts.body, color: ctx.theme.palette.ink, valign: 'top', lineSpacingMultiple: 1.3, ...extra }
}

function addTitleSlide(pptx: Pptx, slide: TitleSlide, ctx: Ctx): void {
  const s = pptx.addSlide()
  const { palette: p, fonts, titleStyle } = ctx.theme
  const m = ctx.margin

  if (titleStyle === 'band') {
    s.background = { color: p.bg }
    s.addShape('rect', { x: 0, y: 1.2, w: SLIDE_W, h: 2.6, fill: { color: p.accent } })
    if (slide.body.subtitle) {
      s.addText(cleanForSlide(slide.body.subtitle).toUpperCase(), {
        x: m, y: 1.4, w: SLIDE_W - m * 2, h: 0.35, align: 'center', fontSize: 11, bold: true, charSpacing: 1.5, color: p.accentText, fontFace: fonts.body,
      })
    }
    s.addText(cleanForSlide(slide.title), {
      x: m, y: 1.8, w: SLIDE_W - m * 2, h: 1.7, align: 'center', valign: 'middle', fontFace: fonts.display, fontSize: 30, bold: true, color: p.accentText,
    })
    if (slide.body.presenter) {
      s.addText(cleanForSlide(slide.body.presenter), { x: m, y: 4.1, w: SLIDE_W - m * 2, h: 0.4, align: 'center', fontSize: 12, color: p.ink2, fontFace: fonts.body })
    }
    const brand = ctx.theme.brand
    if (brand?.logo) {
      const fit = containFit(brand.logo.buffer, 1.8, 0.6)
      s.addImage({ data: brand.logo.dataUri, x: m, y: 0.4, w: fit?.w ?? 1.8, h: fit?.h ?? 0.6 })
    }
    if (brand?.name) {
      s.addText(cleanForSlide(brand.name), { x: m, y: SLIDE_H - 0.7, w: SLIDE_W - m * 2, h: 0.35, align: 'center', fontSize: 11, color: p.ink2, fontFace: fonts.body })
    }
    addNotes(s, slide.notes)
    return
  }

  // Light: the accent appears as GRAPHICS, never as text — reading the
  // title never depends on the accent clearing a text ratio.
  s.background = { color: p.bg }
  s.addShape('rect', { x: 0, y: 0, w: SLIDE_W, h: 0.14, fill: { color: p.accent } })
  s.addShape('rect', { x: 0, y: SLIDE_H - 0.5, w: SLIDE_W, h: 0.5, fill: { color: p.panel } })

  let y = 0.75
  const brand = ctx.theme.brand
  if (brand?.logo) {
    // Drawn at the image's own aspect ratio: pptxgenjs stretches to the
    // frame when given w/h with `sizing: contain`, which is what squashed a
    // wide logo in the parent; containFit computes the true fit.
    const BOX_W = 2.6, BOX_H = 0.85
    const fit = containFit(brand.logo.buffer, BOX_W, BOX_H)
    const w = fit?.w ?? BOX_W, h = fit?.h ?? BOX_H
    s.addImage({ data: brand.logo.dataUri, x: (SLIDE_W - w) / 2, y, w, h })
    y += h + 0.25
  } else {
    y = 1.1
  }
  if (brand?.name) {
    s.addText(cleanForSlide(brand.name), { x: m, y, w: SLIDE_W - m * 2, h: 0.3, align: 'center', fontSize: 11, color: p.ink2, fontFace: fonts.body })
    y += 0.4
  }
  if (slide.body.subtitle) {
    s.addText(cleanForSlide(slide.body.subtitle).toUpperCase(), {
      x: m, y, w: SLIDE_W - m * 2, h: 0.3, align: 'center', fontSize: 11, bold: true, charSpacing: 1.5, color: p.ink2, fontFace: fonts.body,
    })
    y += 0.4
  }
  s.addText(cleanForSlide(slide.title), {
    x: m, y, w: SLIDE_W - m * 2, h: 1.5, align: 'center', valign: 'middle', fontFace: fonts.display, fontSize: 30, bold: true, color: p.ink,
  })
  y += 1.6
  s.addShape('rect', { x: (SLIDE_W - 1.1) / 2, y, w: 1.1, h: 0.045, fill: { color: p.accent } })
  if (slide.body.presenter) {
    s.addText(cleanForSlide(slide.body.presenter), { x: m, y: y + 0.3, w: SLIDE_W - m * 2, h: 0.4, align: 'center', fontSize: 12, color: p.ink2, fontFace: fonts.body })
  }
  addNotes(s, slide.notes)
}

async function addBulletsSlide(pptx: Pptx, slide: BulletsSlide, ctx: Ctx): Promise<void> {
  const s = pptx.addSlide()
  addHeader(s, ctx, slide.title)
  const r = contentRegion(ctx, Boolean(slide.image))
  if (slide.body.items.length > 0) {
    s.addText(bulletList(slide.body.items), { x: r.x, y: 1.3, w: r.w, h: SLIDE_H - 1.6, fontSize: 16, ...body(ctx) })
  }
  await addSideImage(s, ctx, slide.image)
  addNotes(s, slide.notes)
}

async function addConceptSlide(pptx: Pptx, slide: ConceptSlide, ctx: Ctx): Promise<void> {
  const s = pptx.addSlide()
  addHeader(s, ctx, slide.title)
  const p = ctx.theme.palette
  const r = contentRegion(ctx, Boolean(slide.image))
  s.addText(cleanForSlide(slide.body.definition), {
    x: r.x, y: 1.3, w: r.w, h: 1.2, fontSize: 18, italic: true, ...body(ctx, { lineSpacingMultiple: 1.2 }), fill: { color: p.panel },
  })
  if (slide.body.supporting.length > 0) {
    s.addText(bulletList(slide.body.supporting), { x: r.x, y: 2.7, w: r.w, h: SLIDE_H - 3.0, fontSize: 14, ...body(ctx, { color: p.ink2 }) })
  }
  await addSideImage(s, ctx, slide.image)
  addNotes(s, slide.notes)
}

// Formula-slide vertical layout. A rendered formula IMAGE is far taller than
// the line of text it replaced, so per-formula height is budgeted against
// the slide rather than taken as a flat cap: four formulas at a flat 1.8"
// cap ran `y` to 9.57" on a 5.63" slide and the explanation box got a
// NEGATIVE height. Budget first, then clamp.
const FORMULA_IMG_MAX_H   = 1.8
const FORMULA_IMG_MIN_H   = 0.3
const FORMULA_TOP         = 1.4
const FORMULA_BOTTOM_PAD  = 0.3
const FORMULA_CAPTION_H   = 0.35
const FORMULA_GAP         = 0.08
const EXPLANATION_RESERVE = 0.9

async function addFormulaSlide(pptx: Pptx, slide: FormulaSlide, ctx: Ctx): Promise<void> {
  const s = pptx.addSlide()
  addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const r = contentRegion(ctx, Boolean(slide.image))
  const formulas = slide.body.formulas
  const hasExplanation = Boolean(slide.body.explanation)

  const available = SLIDE_H - FORMULA_TOP - FORMULA_BOTTOM_PAD - (hasExplanation ? EXPLANATION_RESERVE : 0)
  const perFormula = formulas.length > 0 ? available / formulas.length : available

  let y = FORMULA_TOP
  for (const f of formulas) {
    const captionH = f.caption ? FORMULA_CAPTION_H : 0
    const bodyBudget = Math.max(FORMULA_IMG_MIN_H, perFormula - captionH - FORMULA_GAP)

    const rendered = await renderFormulaToPng(f.latex, `#${p.ink}`)
    if (rendered && Number.isFinite(rendered.aspect) && rendered.aspect > 0) {
      const maxH = Math.min(FORMULA_IMG_MAX_H, bodyBudget)
      let w = r.w * 0.85
      let h = w / rendered.aspect
      if (h > maxH) { h = maxH; w = h * rendered.aspect }
      s.addImage({ data: rendered.dataUri, x: r.x + (r.w - w) / 2, y, w, h })
      y += h + FORMULA_GAP
    } else {
      const h = Math.min(0.7, bodyBudget)
      s.addText(latexToPlainText(f.latex), { x: r.x, y, w: r.w, h: clampH(h), align: 'center', fontFace: fonts.math, fontSize: 20, color: p.ink })
      y += h + FORMULA_GAP
    }
    if (f.caption) {
      s.addText(cleanForSlide(f.caption), { x: r.x, y, w: r.w, h: FORMULA_CAPTION_H, align: 'center', fontSize: 12, italic: true, color: p.ink3, fontFace: fonts.body })
      y += captionH
    }
  }
  if (hasExplanation) {
    s.addText(cleanForSlide(slide.body.explanation!), {
      x: r.x, y: y + 0.1, w: r.w, h: clampH(SLIDE_H - y - 0.1 - FORMULA_BOTTOM_PAD), fontSize: 14, ...body(ctx, { color: p.ink2, lineSpacingMultiple: 1.2 }),
    })
  }
  await addSideImage(s, ctx, slide.image)
  addNotes(s, slide.notes)
}

async function addComparisonSlide(pptx: Pptx, slide: ComparisonSlide, ctx: Ctx): Promise<void> {
  const s = pptx.addSlide()
  addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const r = contentRegion(ctx, Boolean(slide.image))
  const cols = slide.body.columns
  const gap = 0.3
  const colW = (r.w - gap * (cols.length - 1)) / cols.length
  cols.forEach((c, i) => {
    const x = r.x + i * (colW + gap)
    s.addShape('rect', { x, y: 1.3, w: colW, h: 0.5, fill: { color: p.panel }, line: { color: p.border, width: 0.5 } })
    s.addText(cleanForSlide(c.header).toUpperCase(), { x, y: 1.3, w: colW, h: 0.5, align: 'center', valign: 'middle', fontSize: 12, bold: true, color: ctx.theme.labelColor, fontFace: fonts.body })
    if (c.items.length > 0) {
      s.addText(bulletList(c.items), { x, y: 1.9, w: colW, h: SLIDE_H - 2.2, fontSize: 12, ...body(ctx, { lineSpacingMultiple: 1.2 }) })
    }
  })
  await addSideImage(s, ctx, slide.image)
  addNotes(s, slide.notes)
}

async function addDiagramSlide(pptx: Pptx, slide: DiagramSlide, ctx: Ctx): Promise<void> {
  const s = pptx.addSlide()
  addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const box = { x: m, y: 1.3, w: SLIDE_W - m * 2, h: 2.9 }
  const img = slide.body.image ? await fetchImageAsDataUri(slide.body.image.url) : null
  if (img) addFittedImage(s, img, box)
  else addImagePlaceholder(s, ctx, box, slide.body.image ? L[ctx.language].imageMissing : L[ctx.language].imageNone(cleanForSlide(slide.body.image_query)))

  let y = box.y + box.h + 0.15
  if (slide.body.caption) {
    s.addText(cleanForSlide(slide.body.caption), { x: m, y, w: SLIDE_W - m * 2, h: 0.35, align: 'center', fontSize: 12, bold: true, color: p.ink, fontFace: fonts.body })
    y += 0.35
  }
  if (slide.body.points.length > 0) {
    s.addText(bulletList(slide.body.points), { x: m, y, w: SLIDE_W - m * 2, h: clampH(SLIDE_H - y - 0.2), fontSize: 11, ...body(ctx, { color: p.ink2, lineSpacingMultiple: 1.1 }) })
  }
  addNotes(s, slide.notes)
}

async function addDiscussionSlide(pptx: Pptx, slide: DiscussionSlide, ctx: Ctx): Promise<void> {
  const s = pptx.addSlide()
  addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const r = contentRegion(ctx, Boolean(slide.image))
  s.addText(cleanForSlide(slide.body.question), { x: r.x, y: 1.3, w: r.w, h: 1.0, fontFace: fonts.display, fontSize: 20, bold: true, color: p.ink, valign: 'top' })
  if (slide.body.prompts.length > 0) {
    s.addText(bulletList(slide.body.prompts), { x: r.x, y: 2.4, w: r.w, h: SLIDE_H - 2.7, fontSize: 14, ...body(ctx, { color: p.ink2 }) })
  }
  await addSideImage(s, ctx, slide.image)
  addNotes(s, slide.notes)
}

// Call to action: the ask set large in the display face, the reasons under
// it, the contact line in the accent. One ask per slide, so nothing competes.
function addCtaSlide(pptx: Pptx, slide: CtaSlide, ctx: Ctx): void {
  const s = pptx.addSlide()
  addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const w = SLIDE_W - m * 2
  s.addText(cleanForSlide(slide.body.action), { x: m, y: 1.35, w, h: 1.3, fontFace: fonts.display, fontSize: 26, bold: true, color: p.ink, valign: 'middle' })
  s.addShape('rect', { x: m, y: 2.75, w: 1.1, h: 0.045, fill: { color: p.accent } })
  let y = 2.95
  if (slide.body.reasons.length > 0) {
    const h = slide.body.contact ? 1.6 : SLIDE_H - y - 0.3
    s.addText(bulletList(slide.body.reasons), { x: m, y, w, h: clampH(h), fontSize: 14, ...body(ctx, { color: p.ink2 }) })
    y += h + 0.1
  }
  if (slide.body.contact) {
    s.addText(cleanForSlide(slide.body.contact), { x: m, y, w, h: clampH(SLIDE_H - y - 0.3), fontSize: 14, bold: true, color: ctx.theme.labelColor, fontFace: fonts.body, valign: 'top' })
  }
  addNotes(s, slide.notes)
}

function addSummarySlide(pptx: Pptx, slide: SummarySlide, ctx: Ctx): void {
  const s = pptx.addSlide()
  addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const half = (SLIDE_W - m * 2 - 0.3) / 2
  const t = L[ctx.language]
  if (slide.body.takeaways.length > 0) {
    s.addText(t.key, { x: m, y: 1.3, w: half, h: 0.35, fontSize: 11, bold: true, color: ctx.theme.labelColor, fontFace: fonts.body })
    s.addText(bulletList(slide.body.takeaways), { x: m, y: 1.7, w: half, h: SLIDE_H - 2.0, fontSize: 13, ...body(ctx, { lineSpacingMultiple: 1.2 }) })
  }
  if (slide.body.next_steps.length > 0) {
    const x = m + half + 0.3
    s.addText(t.next, { x, y: 1.3, w: half, h: 0.35, fontSize: 11, bold: true, color: ctx.theme.labelColor, fontFace: fonts.body })
    s.addText(bulletList(slide.body.next_steps), { x, y: 1.7, w: half, h: SLIDE_H - 2.0, fontSize: 13, ...body(ctx, { color: p.ink2, lineSpacingMultiple: 1.2 }) })
  }
  addNotes(s, slide.notes)
}
