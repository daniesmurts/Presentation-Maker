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
import { G, inch, titleLines } from '../../../shared/slideGeometry'
import { backgroundRole, type BackgroundRole } from '../../../shared/slideBackground'
import { renderBackgroundPng } from './slideBackground'

// Native .pptx export — ported from the parent's presentationExport.ts
// (CLAUDE.md §2), restructured so the THEME is data (themes.ts) and no
// module state carries between exports: everything a layout reads comes
// through `Ctx`. Themes v2 (TODO J): every number is shared/slideGeometry.ts,
// the same source the PDF, the React stage and the public site draw from —
// the landing shows a deck, and this is what makes the download match it. A layout per slide type; formulas rendered to PNG via
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
  title:    string                       // the talk's title, for the footer
  pos:      { index: number; total: number }
  /** Slide-layout name per background role (Design v3, L1). */
  layouts:  Record<BackgroundRole, string>
}

// Percent of width → inches, and → points for font sizes (1 unit = 7.2 pt).
const I  = (v: number) => inch(v, SLIDE_W)
const PT = (v: number) => Math.round(v * 7.2)

const L = {
  ru: { imageMissing: 'Изображение недоступно для экспорта', imageNone: (q: string) => `Изображение не выбрано: «${q}»`, key: 'ГЛАВНОЕ', next: 'ЧТО ДАЛЬШЕ', author: 'Тезариум' },
  en: { imageMissing: 'Image unavailable for export',         imageNone: (q: string) => `No image chosen: “${q}”`,       key: 'KEY POINTS', next: 'WHAT NEXT',   author: 'Tezarium' },
}

export interface ExportOptions {
  themeId?: string | null
  brand?:   BrandKit | null
}

export async function generateTalkPptx(talk: Pick<Talk, 'title' | 'slides' | 'language' | 'theme_id'>, opts: ExportOptions = {}): Promise<Buffer> {
  const slides = talk.slides
  if (!slides || slides.length === 0) throw new Error('No slides to export')

  const theme = applyBrand(getTheme(opts.themeId ?? talk.theme_id), opts.brand ?? null, contrastRatio, textOn)
  if (opts.brand?.accent && theme.labelColor !== theme.palette.accent) {
    logger.info({ message: '[PPTX export] brand accent below 4.5:1 on the theme ground — labels fall back to ink2', accent: opts.brand.accent, theme: theme.id, ratio: contrastRatio(opts.brand.accent, theme.palette.bg).toFixed(2) })
  }

  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'TEZARIUM_16_9', width: SLIDE_W, height: SLIDE_H })
  pptx.layout = 'TEZARIUM_16_9'
  pptx.author = L[talk.language].author
  pptx.title  = talk.title

  // Design v3: the background is a slide LAYOUT per role — the raster is
  // embedded once and every slide of that role inherits it. A slide must
  // not set its own `background` then, or the colour overrides the
  // picture; the layout carries the flat colour when there is no picture.
  const layouts: Record<BackgroundRole, string> = { hero: 'TZ_HERO', quiet: 'TZ_QUIET' }
  let bgBytes = 0
  for (const role of ['hero', 'quiet'] as const) {
    const png = await renderBackgroundPng(theme.palette, theme.background, role)
    bgBytes += png?.bytes ?? 0
    pptx.defineSlideMaster({ title: layouts[role], background: png ? { data: png.dataUri } : { color: theme.palette.bg } })
  }
  if (bgBytes) logger.info({ message: '[PPTX export] background rasters embedded', theme: theme.id, kind: theme.background.kind, bytes: bgBytes })
  const ctx: Ctx = { theme, language: talk.language, margin: theme.margin, title: talk.title, pos: { index: 0, total: slides.length }, layouts }

  // Sequential, not Promise.all — pptxgenjs slides render in call order and
  // an image fetch has no reason to race the others.
  for (const [i, slide] of slides.entries()) await addSlide(pptx, slide, { ...ctx, pos: { index: i, total: slides.length } })

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
// Content must end here (G.bottom above the edge); the footer sits below.
const BOTTOM = SLIDE_H - I(G.bottom)

function contentRegion(ctx: Ctx, hasImage: boolean): { x: number; w: number } {
  const fullW = SLIDE_W - ctx.margin * 2
  return { x: ctx.margin, w: hasImage ? fullW - SIDE_IMAGE_W - SIDE_IMAGE_GAP : fullW }
}

async function addSideImage(s: Pptx, ctx: Ctx, image: SlideImage | null | undefined, top: number): Promise<void> {
  if (!image) return
  const box = { x: SLIDE_W - ctx.margin - SIDE_IMAGE_W, y: top, w: SIDE_IMAGE_W, h: BOTTOM - top }
  const img = await fetchImageAsDataUri(image.url)
  if (img) addFittedImage(s, img, box)
  else addImagePlaceholder(s, ctx, box, L[ctx.language].imageMissing)
}

// ─── Per-slide-type rendering ──────────────────────────────────────────────

/** A new slide on the layout for its background role. */
function newSlide(pptx: Pptx, slide: Slide, ctx: Ctx): Pptx {
  return pptx.addSlide({ masterName: ctx.layouts[backgroundRole(slide.type)] })
}

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

const pad2 = (n: number) => String(n).padStart(2, '0')

// The footer on every slide: the talk's title left (the brand name on the
// title slide, where the title is the slide), «01 / 05» right in mono.
function addFooter(s: Pptx, ctx: Ctx, left: string | null): void {
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const h = 0.3
  const y = SLIDE_H - I(G.footerY) - h / 2
  if (left) s.addText(cleanForSlide(left), { x: m, y, w: SLIDE_W - m * 2 - 1.6, h, fontSize: PT(G.footerSize), color: p.ink2, fontFace: fonts.body, valign: 'middle' })
  // «01 / 05» as text; PowerPoint's own number field would show the bare
  // index. The importer treats anything in the bottom strip as furniture,
  // so our own decks round-trip clean (pptxImport.ts isFooterShape).
  s.addText(`${pad2(ctx.pos.index + 1)} / ${pad2(ctx.pos.total)}`, { x: SLIDE_W - m - 1.5, y, w: 1.5, h, align: 'right', fontSize: PT(G.footerSize), color: p.ink2, fontFace: fonts.mono, valign: 'middle' })
}

// Shared header of every non-title slide: the title in the display face
// over a hairline in the accent, then the footer. Returns the y where the
// body starts. pptxgenjs cannot measure text, so the title box height comes
// from an estimate of its line count (shared/slideGeometry.ts).
function addHeader(s: Pptx, ctx: Ctx, title: string): number {
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const lines = Math.min(2, titleLines(title))
  const titleH = I(G.titleSize * G.titleLine) * lines
  const y = I(G.top)
  s.addText(cleanForSlide(title), {
    x: m, y, w: SLIDE_W - m * 2, h: titleH, fontFace: fonts.display, fontSize: PT(G.titleSize), bold: true, color: p.ink, valign: 'bottom', fit: 'shrink',
  })
  const ruleY = y + titleH + I(G.titlePad)
  s.addShape('rect', { x: m, y: ruleY, w: SLIDE_W - m * 2, h: I(G.rule), fill: { color: p.accent } })
  addFooter(s, ctx, ctx.title)
  return ruleY + I(G.rule) + I(G.titleGap)
}

function kick(s: Pptx, ctx: Ctx, text: string, x: number, y: number, w: number, color?: string): number {
  const h = I(G.kickSize) * 1.6
  s.addText(cleanForSlide(text).toUpperCase(), { x, y, w, h, fontSize: PT(G.kickSize), bold: true, charSpacing: 2, color: color ?? ctx.theme.labelColor, fontFace: ctx.theme.fonts.body, valign: 'middle' })
  return h
}

function bulletList(items: string[]) {
  return items.map((t) => ({ text: cleanForSlide(t), options: { bullet: { code: '25CF' }, breakLine: true } }))
}

function body(ctx: Ctx, extra: Record<string, unknown> = {}) {
  return { fontFace: ctx.theme.fonts.body, color: ctx.theme.palette.ink, valign: 'top', lineSpacingMultiple: G.bodyLine, paraSpaceAfter: PT(G.bodyGap) * 0.6, ...extra }
}

// Title slide: a short accent rule, the kicker (subtitle), the title large
// and low-left, the presenter under it — the block anchored to the bottom.
// The brand logo sits top-left; the brand name takes the footer's left.
function addTitleSlide(pptx: Pptx, slide: TitleSlide, ctx: Ctx): void {
  const s = newSlide(pptx, slide, ctx)
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const w = SLIDE_W - m * 2

  const brand = ctx.theme.brand
  if (brand?.logo) {
    // Drawn at the image's own aspect ratio: pptxgenjs stretches to the
    // frame when given w/h with `sizing: contain`, which is what squashed a
    // wide logo in the parent; containFit computes the true fit.
    const BOX_W = 2.2, BOX_H = 0.7
    const fit = containFit(brand.logo.buffer, BOX_W, BOX_H)
    s.addImage({ data: brand.logo.dataUri, x: m, y: I(G.top), w: fit?.w ?? BOX_W, h: fit?.h ?? BOX_H })
  }

  // Stack upward from the bottom anchor.
  let bottom = SLIDE_H - I(G.tsBottom)
  if (slide.body.presenter) {
    const h = I(G.tsWhoSize) * 1.5
    s.addText(cleanForSlide(slide.body.presenter), { x: m, y: bottom - h, w, h, fontSize: PT(G.tsWhoSize), color: p.ink2, fontFace: fonts.body, valign: 'middle' })
    bottom -= h + I(G.tsTitleGap)
  }
  const titleW = w * (G.tsMaxW / 100)
  const lines = Math.min(3, titleLines(slide.title, (100 - G.marginX * 2) * (G.tsMaxW / 100), G.tsTitleSize))
  const titleH = I(G.tsTitleSize * G.titleLine) * lines
  s.addText(cleanForSlide(slide.title), { x: m, y: bottom - titleH, w: titleW, h: titleH, fontFace: fonts.display, fontSize: PT(G.tsTitleSize), bold: true, color: p.ink, valign: 'bottom', fit: 'shrink' })
  bottom -= titleH
  if (slide.body.subtitle) {
    bottom -= I(G.tsKickGap)
    const h = I(G.kickSize) * 1.6
    s.addText(cleanForSlide(slide.body.subtitle).toUpperCase(), { x: m, y: bottom - h, w, h, fontSize: PT(G.kickSize), bold: true, charSpacing: 2, color: p.ink2, fontFace: fonts.body, valign: 'middle' })
    bottom -= h
  }
  bottom -= I(G.tsRuleGap)
  s.addShape('rect', { x: m, y: bottom - I(G.tsRuleH), w: I(G.tsRuleW), h: I(G.tsRuleH), fill: { color: p.accent } })

  addFooter(s, ctx, brand?.name ?? null)
  addNotes(s, slide.notes)
}

async function addBulletsSlide(pptx: Pptx, slide: BulletsSlide, ctx: Ctx): Promise<void> {
  const s = newSlide(pptx, slide, ctx)
  const top = addHeader(s, ctx, slide.title)
  const r = contentRegion(ctx, Boolean(slide.image))
  if (slide.body.items.length > 0) {
    s.addText(bulletList(slide.body.items), { x: r.x, y: top, w: r.w, h: clampH(BOTTOM - top), fontSize: PT(G.bodySize), ...body(ctx) })
  }
  await addSideImage(s, ctx, slide.image, top)
  addNotes(s, slide.notes)
}

async function addConceptSlide(pptx: Pptx, slide: ConceptSlide, ctx: Ctx): Promise<void> {
  const s = newSlide(pptx, slide, ctx)
  const top = addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const r = contentRegion(ctx, Boolean(slide.image))
  const defH = 1.2
  s.addShape('rect', { x: r.x, y: top, w: r.w, h: defH, fill: { color: p.panel }, rectRadius: I(G.fRadius) })
  s.addText(cleanForSlide(slide.body.definition), {
    x: r.x + I(G.fPadX) / 2, y: top, w: r.w - I(G.fPadX), h: defH, fontSize: PT(G.bodySize), fontFace: fonts.display, color: p.ink, valign: 'middle', lineSpacingMultiple: 1.2,
  })
  if (slide.body.supporting.length > 0) {
    s.addText(bulletList(slide.body.supporting), { x: r.x, y: top + defH + I(G.fExGap), w: r.w, h: clampH(BOTTOM - top - defH - I(G.fExGap)), fontSize: PT(G.subSize), ...body(ctx, { color: p.ink2 }) })
  }
  await addSideImage(s, ctx, slide.image, top)
  addNotes(s, slide.notes)
}

// Formula: the formulas in a panel, each as its MathJax picture (or the
// Unicode fallback) with its short form under it in mono; the explanation
// below the panel. A rendered formula IMAGE is far taller than the line of
// text it replaced, so per-formula height is budgeted against the slide
// rather than taken as a flat cap: four formulas at a flat 1.8" cap once ran
// `y` to 9.57" on a 5.63" slide and the explanation got a NEGATIVE height.
const FORMULA_IMG_MAX_H = 1.6
const FORMULA_IMG_MIN_H = 0.3
const FORMULA_GAP       = 0.08
const EXPLANATION_H     = 0.9

async function addFormulaSlide(pptx: Pptx, slide: FormulaSlide, ctx: Ctx): Promise<void> {
  const s = newSlide(pptx, slide, ctx)
  const top = addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const r = contentRegion(ctx, Boolean(slide.image))
  const formulas = slide.body.formulas
  const hasExplanation = Boolean(slide.body.explanation)
  const padY = I(G.fPadY), padX = I(G.fPadX)
  const capH = I(G.fCapSize) * 1.5

  const panelMaxH = BOTTOM - top - (hasExplanation ? EXPLANATION_H + I(G.fExGap) : 0)
  const innerAvail = panelMaxH - padY * 2
  const perFormula = formulas.length > 0 ? innerAvail / formulas.length : innerAvail

  // Lay out first to know the panel's height, then draw the panel, then the content on it.
  const items: Array<{ kind: 'img'; data: string; w: number; h: number } | { kind: 'text'; text: string; h: number }> = []
  const caps: Array<string | null> = []
  let used = 0
  for (const f of formulas) {
    const ch = f.caption ? capH + I(G.fCapGap) : 0
    const budget = Math.max(FORMULA_IMG_MIN_H, perFormula - ch - FORMULA_GAP)
    const rendered = await renderFormulaToPng(f.latex, `#${p.ink}`)
    if (rendered && Number.isFinite(rendered.aspect) && rendered.aspect > 0) {
      const maxH = Math.min(FORMULA_IMG_MAX_H, budget)
      let w = r.w - padX * 2
      let h = w / rendered.aspect
      if (h > maxH) { h = maxH; w = h * rendered.aspect }
      items.push({ kind: 'img', data: rendered.dataUri, w, h }); used += h
    } else {
      const h = Math.min(0.6, budget)
      items.push({ kind: 'text', text: latexToPlainText(f.latex), h }); used += h
    }
    caps.push(f.caption || null); used += ch + FORMULA_GAP
  }
  const panelH = clampH(Math.min(panelMaxH, used + padY * 2))
  s.addShape('rect', { x: r.x, y: top, w: r.w, h: panelH, fill: { color: p.panel }, rectRadius: I(G.fRadius) })

  let y = top + padY
  items.forEach((it, i) => {
    if (it.kind === 'img') { s.addImage({ data: it.data, x: r.x + padX, y, w: it.w, h: it.h }); y += it.h }
    else { s.addText(it.text, { x: r.x + padX, y, w: r.w - padX * 2, h: clampH(it.h), fontFace: fonts.math, fontSize: PT(G.fSize), color: p.ink, valign: 'middle' }); y += it.h }
    const cap = caps[i]
    if (cap) { y += I(G.fCapGap); s.addText(cleanForSlide(cap), { x: r.x + padX, y, w: r.w - padX * 2, h: capH, fontSize: PT(G.fCapSize), color: p.ink2, fontFace: fonts.mono, valign: 'middle' }); y += capH }
    y += FORMULA_GAP
  })
  if (hasExplanation) {
    const ey = top + panelH + I(G.fExGap)
    s.addText(cleanForSlide(slide.body.explanation!), {
      x: r.x, y: ey, w: r.w * 0.8, h: clampH(BOTTOM - ey), fontSize: PT(G.subSize), ...body(ctx, { color: p.ink2, lineSpacingMultiple: 1.3, paraSpaceAfter: 0 }),
    })
  }
  await addSideImage(s, ctx, slide.image, top)
  addNotes(s, slide.notes)
}

async function addComparisonSlide(pptx: Pptx, slide: ComparisonSlide, ctx: Ctx): Promise<void> {
  const s = newSlide(pptx, slide, ctx)
  const top = addHeader(s, ctx, slide.title)
  const { palette: p } = ctx.theme
  const r = contentRegion(ctx, Boolean(slide.image))
  const cols = slide.body.columns
  const gap = I(G.sGap)
  const colW = (r.w - gap * (cols.length - 1)) / cols.length
  cols.forEach((c, i) => {
    const x = r.x + i * (colW + gap)
    // A rule over each column and its header as a kicker — a table without a cage.
    s.addShape('rect', { x, y: top, w: colW, h: I(G.rule) * 1.6, fill: { color: p.ink } })
    const kh = kick(s, ctx, c.header, x, top + I(G.rule) * 1.6 + 0.05, colW, ctx.theme.labelColor)
    const by = top + I(G.rule) * 1.6 + 0.05 + kh + 0.1
    if (c.items.length > 0) {
      s.addText(bulletList(c.items), { x, y: by, w: colW, h: clampH(BOTTOM - by), fontSize: PT(G.subSize), ...body(ctx, { lineSpacingMultiple: 1.25 }) })
    }
  })
  await addSideImage(s, ctx, slide.image, top)
  addNotes(s, slide.notes)
}

async function addDiagramSlide(pptx: Pptx, slide: DiagramSlide, ctx: Ctx): Promise<void> {
  const s = newSlide(pptx, slide, ctx)
  const top = addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const extra = (slide.body.caption ? 0.4 : 0) + (slide.body.points.length > 0 ? 0.9 : 0)
  const box = { x: m, y: top, w: SLIDE_W - m * 2, h: clampH(BOTTOM - top - extra) }
  const img = slide.body.image ? await fetchImageAsDataUri(slide.body.image.url) : null
  if (img) addFittedImage(s, img, box)
  else addImagePlaceholder(s, ctx, box, slide.body.image ? L[ctx.language].imageMissing : L[ctx.language].imageNone(cleanForSlide(slide.body.image_query)))

  let y = box.y + box.h + 0.1
  if (slide.body.caption) {
    s.addText(cleanForSlide(slide.body.caption), { x: m, y, w: SLIDE_W - m * 2, h: 0.35, fontSize: PT(G.subSize), bold: true, color: p.ink, fontFace: fonts.body })
    y += 0.4
  }
  if (slide.body.points.length > 0) {
    s.addText(bulletList(slide.body.points), { x: m, y, w: SLIDE_W - m * 2, h: clampH(BOTTOM - y), fontSize: PT(G.subSize * 0.85), ...body(ctx, { color: p.ink2, lineSpacingMultiple: 1.15, paraSpaceAfter: 0 }) })
  }
  addNotes(s, slide.notes)
}

// Question: no header rule — the slide's title becomes the kicker, the
// question is the slide, large and italic; the prompts sit under it quieter.
async function addDiscussionSlide(pptx: Pptx, slide: DiscussionSlide, ctx: Ctx): Promise<void> {
  const s = newSlide(pptx, slide, ctx)
  const { palette: p, fonts } = ctx.theme
  const r = contentRegion(ctx, Boolean(slide.image))
  const top = I(G.top) + 0.5
  const kh = kick(s, ctx, slide.title, r.x, top, r.w)
  const qy = top + kh + I(G.tsKickGap)
  const lines = Math.min(3, titleLines(slide.body.question, (100 - G.marginX * 2) * (G.qMaxW / 100), G.qSize))
  const qh = I(G.qSize * G.titleLine) * lines
  s.addText(cleanForSlide(slide.body.question), { x: r.x, y: qy, w: r.w * (G.qMaxW / 100), h: qh, fontFace: fonts.display, fontSize: PT(G.qSize), italic: true, color: p.ink, valign: 'top', fit: 'shrink' })
  if (slide.body.prompts.length > 0) {
    const py = qy + qh + I(G.titleGap)
    s.addText(bulletList(slide.body.prompts), { x: r.x, y: py, w: r.w, h: clampH(BOTTOM - py), fontSize: PT(G.subSize), ...body(ctx, { color: p.ink2 }) })
  }
  addFooter(s, ctx, ctx.title)
  await addSideImage(s, ctx, slide.image, qy)
  addNotes(s, slide.notes)
}

// Call to action: the ask set large in the display face, the reasons under
// it, the contact line in the label colour. One ask per slide, so nothing competes.
function addCtaSlide(pptx: Pptx, slide: CtaSlide, ctx: Ctx): void {
  const s = newSlide(pptx, slide, ctx)
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const w = SLIDE_W - m * 2
  const top = I(G.top) + 0.5
  const kh = kick(s, ctx, slide.title, m, top, w)
  const ay = top + kh + I(G.tsKickGap)
  const lines = Math.min(3, titleLines(slide.body.action, (100 - G.marginX * 2) * (G.qMaxW / 100), G.qSize))
  const ah = I(G.qSize * G.titleLine) * lines
  s.addText(cleanForSlide(slide.body.action), { x: m, y: ay, w: w * (G.qMaxW / 100), h: ah, fontFace: fonts.display, fontSize: PT(G.qSize), bold: true, color: p.ink, valign: 'top', fit: 'shrink' })
  let y = ay + ah + I(G.titleGap)
  if (slide.body.reasons.length > 0) {
    const h = slide.body.contact ? Math.max(0.6, BOTTOM - y - 0.5) : BOTTOM - y
    s.addText(bulletList(slide.body.reasons), { x: m, y, w, h: clampH(h), fontSize: PT(G.subSize), ...body(ctx, { color: p.ink2 }) })
    y += h + 0.05
  }
  if (slide.body.contact) {
    s.addText(cleanForSlide(slide.body.contact), { x: m, y, w, h: clampH(BOTTOM - y), fontSize: PT(G.subSize), bold: true, color: ctx.theme.labelColor, fontFace: fonts.body, valign: 'top' })
  }
  addFooter(s, ctx, ctx.title)
  addNotes(s, slide.notes)
}

// Summary: the takeaways left, «Что дальше» in a panel on the right.
function addSummarySlide(pptx: Pptx, slide: SummarySlide, ctx: Ctx): void {
  const s = newSlide(pptx, slide, ctx)
  const top = addHeader(s, ctx, slide.title)
  const { palette: p } = ctx.theme
  const m = ctx.margin
  const t = L[ctx.language]
  const w = SLIDE_W - m * 2
  const gap = I(G.sGap)
  const [a, b] = G.sCols
  const leftW = ((w - gap) * a) / (a + b)
  const rightW = w - gap - leftW
  if (slide.body.takeaways.length > 0) {
    s.addText(bulletList(slide.body.takeaways), { x: m, y: top, w: slide.body.next_steps.length > 0 ? leftW : w, h: clampH(BOTTOM - top), fontSize: PT(G.bodySize), ...body(ctx) })
  }
  if (slide.body.next_steps.length > 0) {
    const x = m + leftW + gap
    const padY = I(G.sPanelPadY), padX = I(G.sPanelPadX)
    // The panel's height follows its content: the kicker plus each step's
    // estimated lines (the inner width in percent of the slide, less the
    // bullet indent), with the list's own leading and spacing.
    const innerPct = ((rightW - padX * 2) / SLIDE_W) * 100 - G.bulletIndent
    const stepLines = slide.body.next_steps.reduce((n, t) => n + titleLines(t, innerPct, G.subSize), 0)
    const est = padY * 2 + I(G.kickSize) * 1.6 + 0.15 + stepLines * I(G.subSize * G.bodyLine) + slide.body.next_steps.length * I(G.bodyGap)
    const h = clampH(Math.min(BOTTOM - top, est))
    s.addShape('rect', { x, y: top, w: rightW, h, fill: { color: p.panel }, rectRadius: I(G.fRadius) })
    const kh = kick(s, ctx, t.next, x + padX, top + padY, rightW - padX * 2)
    s.addText(bulletList(slide.body.next_steps), { x: x + padX, y: top + padY + kh + 0.1, w: rightW - padX * 2, h: clampH(h - padY * 2 - kh - 0.1), fontSize: PT(G.subSize), ...body(ctx, { lineSpacingMultiple: 1.25 }) })
  }
  addNotes(s, slide.notes)
}
