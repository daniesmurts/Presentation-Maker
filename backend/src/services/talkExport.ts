import { logger } from '../lib/logger'
import { renderFormulaToPng } from './formulaRenderer'
import { cleanForSlide, latexToPlainText } from './latexText'
import { containFit, imageSize } from '../lib/imageSize'
import { loadSlideImage } from './slideImageSource'
import { getTheme, applyBrand, type AppliedTheme, type BrandKit } from './themes'
import { contrastRatio, textOn } from '../lib/brandColor'
import type {
  Talk, Slide, SlideImage, TitleSlide, BulletsSlide, ConceptSlide, FormulaSlide,
  ComparisonSlide, DiagramSlide, DiscussionSlide, CtaSlide, SummarySlide, TalkLanguage,
  SectionSlide, AgendaSlide, StatsSlide, QuoteSlide, ImageFullSlide,
} from '../../../shared/types'
import { normaliseDesign, sectionTitle } from '../../../shared/slideDesign'
import { G, inch, titleLines, fitTitle, fitList, BODY_EM, DISPLAY_REGULAR_EM } from '../../../shared/slideGeometry'
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
  return pptx.addSlide({ masterName: ctx.layouts[backgroundRole(slide, ctx.theme.background)] })
}

async function addSlide(pptx: Pptx, slide: Slide, ctx: Ctx): Promise<void> {
  switch (slide.type) {
    case 'title':      addTitleSlide(pptx, slide, ctx); return
    case 'section':    addSectionSlide(pptx, slide, ctx); return
    case 'agenda':     addAgendaSlide(pptx, slide, ctx); return
    case 'stats':      addStatsSlide(pptx, slide, ctx); return
    case 'quote':      addQuoteSlide(pptx, slide, ctx); return
    case 'image-full': await addImageFullSlide(pptx, slide, ctx); return
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
  const fit = fitTitle(cleanForSlide(title), PCT(SLIDE_W - m * 2), G.titleSize, 2)
  const titleH = I(fit.size * G.titleLine) * fit.lines
  const y = I(G.top)
  s.addText(cleanForSlide(title), {
    x: m, y, w: SLIDE_W - m * 2, h: titleH, fontFace: fonts.display, fontSize: PT(fit.size), bold: true, color: p.ink, valign: 'bottom', margin: 0,
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

// `margin: 0`: pptxgenjs's default text inset is 0.1 in a side, which no
// other renderer has — the box's x/w ARE the geometry, and the inset is
// what folded «04» in the agenda's number column into «0 / 4».
function body(ctx: Ctx, extra: Record<string, unknown> = {}) {
  return { fontFace: ctx.theme.fonts.body, color: ctx.theme.palette.ink, valign: 'top', lineSpacingMultiple: G.bodyLine, paraSpaceAfter: PT(G.bodyGap) * 0.6, margin: 0, ...extra }
}

// Inches → percent of the slide width, the unit shared/slideGeometry.ts fits in.
const PCT = (inches: number) => (inches / SLIDE_W) * 100

/** A bulleted list in a box, at `size` or smaller: the size is shrunk
 *  until the estimated height fits the box (see slideGeometry.ts — a
 *  list that does not fit runs through the footer on open). */
function addList(s: Pptx, ctx: Ctx, items: string[], box: { x: number; y: number; w: number; h: number }, size: number, extra: Record<string, unknown> = {}): void {
  if (items.length === 0) return
  const line = typeof extra.lineSpacingMultiple === 'number' ? extra.lineSpacingMultiple : G.bodyLine
  const fitted = fitList(items, PCT(box.w), size, PCT(box.h), line)
  s.addText(bulletList(items), { ...box, h: clampH(box.h), fontSize: PT(fitted), ...body(ctx, extra) })
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
  const fit = fitTitle(cleanForSlide(slide.title), PCT(titleW), G.tsTitleSize, 3)
  const titleH = I(fit.size * G.titleLine) * fit.lines
  s.addText(cleanForSlide(slide.title), { x: m, y: bottom - titleH, w: titleW, h: titleH, fontFace: fonts.display, fontSize: PT(fit.size), bold: true, color: p.ink, valign: 'bottom', margin: 0 })
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
  const items = slide.body.items
  // Design v3: `split` sets two columns — only worth it from 4 items and
  // without a side image (three columns of anything is a table).
  const split = normaliseDesign('bullets', slide.design).variant === 'split' && items.length >= 4 && !slide.image
  if (split) {
    const gap = I(G.sGap)
    const colW = (r.w - gap) / 2
    const half = Math.ceil(items.length / 2)
    ;[items.slice(0, half), items.slice(half)].forEach((col, i) => {
      addList(s, ctx, col, { x: r.x + i * (colW + gap), y: top, w: colW, h: BOTTOM - top }, G.bodySize)
    })
  } else if (items.length > 0) {
    addList(s, ctx, items, { x: r.x, y: top, w: r.w, h: BOTTOM - top }, G.bodySize)
  }
  await addSideImage(s, ctx, slide.image, top)
  addNotes(s, slide.notes)
}

// ─── Design v3 (L2) types ──────────────────────────────────────────────────
//
// The rhythm slides. Each is one layout; `emphasis` decides whether the
// big element is drawn in the accent (as a label colour — measured) or in
// the ink. Geometry constants are shared/slideGeometry.ts G.*.

/** The colour a slide's big element takes under its design. */
function emphasisColor(ctx: Ctx, slide: Slide): string {
  return normaliseDesign(slide.type, slide.design).emphasis === 'accent' ? ctx.theme.labelColor : ctx.theme.palette.ink
}

// Section: the title slide's composition, with the kicker as the part and
// the lead where the presenter would be — so a break reads as a small
// title, which is what it is.
function addSectionSlide(pptx: Pptx, slide: SectionSlide, ctx: Ctx): void {
  const s = newSlide(pptx, slide, ctx)
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const w = SLIDE_W - m * 2
  let bottom = SLIDE_H - I(G.tsBottom)
  if (slide.body.lead) {
    const lead = fitTitle(cleanForSlide(slide.body.lead), PCT(w * (G.tsMaxW / 100)), G.tsWhoSize, 3, BODY_EM)
    const h = I(lead.size * G.bodyLine) * lead.lines
    s.addText(cleanForSlide(slide.body.lead), { x: m, y: bottom - h, w: w * (G.tsMaxW / 100), h, fontSize: PT(lead.size), color: p.ink2, fontFace: fonts.body, valign: 'bottom', margin: 0 })
    bottom -= h + I(G.tsTitleGap)
  }
  const title = cleanForSlide(sectionTitle(slide))
  const fit = fitTitle(title, PCT(w * (G.tsMaxW / 100)), G.tsTitleSize, 3)
  const titleH = I(fit.size * G.titleLine) * fit.lines
  s.addText(title, { x: m, y: bottom - titleH, w: w * (G.tsMaxW / 100), h: titleH, fontFace: fonts.display, fontSize: PT(fit.size), bold: true, color: p.ink, valign: 'bottom', margin: 0 })
  bottom -= titleH
  if (slide.body.kicker) {
    bottom -= I(G.tsKickGap)
    const h = I(G.kickSize) * 1.6
    s.addText(cleanForSlide(slide.body.kicker).toUpperCase(), { x: m, y: bottom - h, w, h, fontSize: PT(G.kickSize), bold: true, charSpacing: 2, color: emphasisColor(ctx, slide), fontFace: fonts.body, valign: 'middle' })
    bottom -= h
  }
  bottom -= I(G.tsRuleGap)
  s.addShape('rect', { x: m, y: bottom - I(G.tsRuleH), w: I(G.tsRuleW), h: I(G.tsRuleH), fill: { color: p.accent } })
  addFooter(s, ctx, ctx.title)
  addNotes(s, slide.notes)
}

// Agenda: numbered in mono, one line each; two columns from five items.
function addAgendaSlide(pptx: Pptx, slide: AgendaSlide, ctx: Ctx): void {
  const s = newSlide(pptx, slide, ctx)
  const top = addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const w = SLIDE_W - m * 2
  const items = slide.body.items
  const cols = items.length >= 5 ? 2 : 1
  const gap = I(G.sGap)
  const colW = (w - gap * (cols - 1)) / cols
  const per = Math.ceil(items.length / cols)
  const numW = 0.5   // «04» in Courier New at 18 pt is 0.3 in; with the inset it folded into «0 / 4»
  // Rows are as tall as their text: an item that wraps takes two lines,
  // and the column's size shrinks until every row fits the height.
  const size = fitList(items, PCT(colW), G.bodySize, PCT(BOTTOM - top) * cols, G.bodyLine, G.bodyGap, PCT(numW))
  const lineH = I(size * G.bodyLine), gapH = I(G.bodyGap)
  let col = 0, y = top
  items.forEach((text, i) => {
    if (i > 0 && i % per === 0) { col++; y = top }
    const x = m + col * (colW + gap)
    const rowH = lineH * titleLines(cleanForSlide(text), PCT(colW - numW), size, BODY_EM)
    s.addText(pad2(i + 1), { x, y, w: numW, h: rowH, fontSize: PT(size), color: emphasisColor(ctx, slide), fontFace: fonts.mono, valign: 'top', margin: 0 })
    s.addText(cleanForSlide(text), { x: x + numW, y, w: colW - numW, h: rowH, fontSize: PT(size), color: p.ink, fontFace: fonts.body, valign: 'top', margin: 0 })
    y += rowH + gapH
  })
  addNotes(s, slide.notes)
}

// Stats: the figure is the slide. `three-up`: up to three columns, each a
// value over a rule, a label, a note. `hero-number`: the first figure at
// the title size, its label and note beside/under it. Figures are set in
// the DISPLAY face, not the mono: Courier New at 68 pt reads as a
// typewriter, and the mono's job on a slide is the «01 / 05» footer.
const STAT_VALUE_SIZE = 9.5      // percent of width — larger than the title slide's 6.4
const STAT_COL_VALUE_SIZE = 6.4
function addStatsSlide(pptx: Pptx, slide: StatsSlide, ctx: Ctx): void {
  const s = newSlide(pptx, slide, ctx)
  const top = addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const w = SLIDE_W - m * 2
  const color = emphasisColor(ctx, slide)
  const stats = slide.body.stats
  const hero = normaliseDesign('stats', slide.design).variant === 'hero-number' || stats.length === 1
  if (hero) {
    const [st] = stats
    const valueH = I(STAT_VALUE_SIZE * 1.1)
    const y = top + Math.max(0, (BOTTOM - top - valueH - I(G.bodySize) * 2.6) / 2)
    s.addText(cleanForSlide(st.value), { x: m, y, w, h: valueH, fontSize: PT(STAT_VALUE_SIZE), bold: true, color, fontFace: fonts.display, valign: 'middle', fit: 'shrink' })
    s.addText(cleanForSlide(st.label), { x: m, y: y + valueH, w: w * 0.8, h: I(G.bodySize) * 1.5, fontSize: PT(G.bodySize), color: p.ink, fontFace: fonts.body, valign: 'top' })
    if (st.note) s.addText(cleanForSlide(st.note), { x: m, y: y + valueH + I(G.bodySize) * 1.5, w: w * 0.8, h: clampH(BOTTOM - y - valueH - I(G.bodySize) * 1.5), fontSize: PT(G.subSize), color: p.ink2, fontFace: fonts.body, valign: 'top' })
  } else {
    const gap = I(G.sGap)
    const colW = (w - gap * (stats.length - 1)) / stats.length
    const valueH = I(STAT_COL_VALUE_SIZE * 1.1)
    stats.forEach((st, i) => {
      const x = m + i * (colW + gap)
      s.addShape('rect', { x, y: top, w: colW, h: I(G.rule) * 1.6, fill: { color: p.ink } })
      const vy = top + I(G.rule) * 1.6 + 0.1
      s.addText(cleanForSlide(st.value), { x, y: vy, w: colW, h: valueH, fontSize: PT(STAT_COL_VALUE_SIZE), bold: true, color, fontFace: fonts.display, valign: 'middle', fit: 'shrink' })
      const ly = vy + valueH + 0.05
      s.addText(cleanForSlide(st.label), { x, y: ly, w: colW, h: I(G.bodySize) * 2.7, fontSize: PT(G.bodySize), color: p.ink, fontFace: fonts.body, valign: 'top' })
      if (st.note) s.addText(cleanForSlide(st.note), { x, y: ly + I(G.bodySize) * 2.7, w: colW, h: clampH(BOTTOM - ly - I(G.bodySize) * 2.7), fontSize: PT(G.subSize), color: p.ink2, fontFace: fonts.body, valign: 'top' })
    })
  }
  addNotes(s, slide.notes)
}

// Quote: the question slide's composition — the slide's title as the
// kicker, the quotation large in the display face, the attribution under
// it in the label colour.
function addQuoteSlide(pptx: Pptx, slide: QuoteSlide, ctx: Ctx): void {
  const s = newSlide(pptx, slide, ctx)
  const { palette: p, fonts } = ctx.theme
  const m = ctx.margin
  const w = SLIDE_W - m * 2
  const top = I(G.top) + 0.5
  const kh = kick(s, ctx, slide.title, m, top, w)
  const qy = top + kh + I(G.tsKickGap)
  const text = `«${cleanForSlide(slide.body.quote)}»`
  const fit = fitTitle(text, PCT(w * (G.qMaxW / 100)), G.qSize, 4, DISPLAY_REGULAR_EM)
  const qh = I(fit.size * G.titleLine) * fit.lines
  s.addText(text, { x: m, y: qy, w: w * (G.qMaxW / 100), h: qh, fontFace: fonts.display, fontSize: PT(fit.size), italic: true, color: p.ink, valign: 'top', margin: 0 })
  if (slide.body.attribution) {
    const ay = qy + qh + I(G.titleGap)
    s.addText(`— ${cleanForSlide(slide.body.attribution)}`, { x: m, y: ay, w, h: clampH(Math.min(BOTTOM - ay, I(G.subSize) * 3)), fontSize: PT(G.subSize), bold: true, color: emphasisColor(ctx, slide), fontFace: fonts.body, valign: 'top' })
  }
  addFooter(s, ctx, ctx.title)
  addNotes(s, slide.notes)
}

// Image-full: the picture covers the slide (cover-fitted and cropped by
// the slide edge); a scrim band at the bottom carries the title and the
// caption in white — measured: white on a 65 % black scrim over any
// picture is ≥ 7:1 against the scrim's own colour, and the scrim is what
// the text sits on. No picture yet → the placeholder box under the header.
const SCRIM_H = 1.55
async function addImageFullSlide(pptx: Pptx, slide: ImageFullSlide, ctx: Ctx): Promise<void> {
  const s = newSlide(pptx, slide, ctx)
  const { fonts } = ctx.theme
  const m = ctx.margin
  const w = SLIDE_W - m * 2
  const img = slide.image ? await fetchImageAsDataUri(slide.image.url) : null
  if (img) {
    // Cover, not contain. pptxgenjs's `cover` reads the picture's own
    // proportions from `w`/`h` and the frame from `sizing` — passing the
    // frame in both produced an srcRect of zeros, i.e. a stretch. So `w`/`h`
    // are the intrinsic size from the bytes (§3.5), scaled to the slide width.
    const size = imageSize(img.buffer)
    const natW = SLIDE_W, natH = size ? SLIDE_W * (size.height / size.width) : SLIDE_H
    s.addImage({ data: img.dataUri, x: 0, y: 0, w: natW, h: natH, sizing: { type: 'cover', w: SLIDE_W, h: SLIDE_H } })
    s.addShape('rect', { x: 0, y: SLIDE_H - SCRIM_H, w: SLIDE_W, h: SCRIM_H, fill: { color: '000000', transparency: 35 }, line: { color: '000000', transparency: 100 } })
    const ty = SLIDE_H - SCRIM_H + 0.15
    s.addText(cleanForSlide(slide.title), { x: m, y: ty, w, h: I(G.titleSize * G.titleLine), fontFace: fonts.display, fontSize: PT(G.titleSize), bold: true, color: 'FFFFFF', valign: 'top', fit: 'shrink' })
    if (slide.body.caption) s.addText(cleanForSlide(slide.body.caption), { x: m, y: ty + I(G.titleSize * G.titleLine), w, h: clampH(SLIDE_H - ty - I(G.titleSize * G.titleLine) - 0.1), fontSize: PT(G.subSize), color: 'FFFFFF', fontFace: fonts.body, valign: 'top' })
  } else {
    const top = addHeader(s, ctx, slide.title)
    const extra = slide.body.caption ? 0.45 : 0
    const box = { x: m, y: top, w, h: clampH(BOTTOM - top - extra) }
    addImagePlaceholder(s, ctx, box, slide.image ? L[ctx.language].imageMissing : L[ctx.language].imageNone(cleanForSlide(slide.image_query ?? slide.title)))
    if (slide.body.caption) s.addText(cleanForSlide(slide.body.caption), { x: m, y: box.y + box.h + 0.1, w, h: 0.35, fontSize: PT(G.subSize), color: ctx.theme.palette.ink2, fontFace: fonts.body })
  }
  addNotes(s, slide.notes)
}

async function addConceptSlide(pptx: Pptx, slide: ConceptSlide, ctx: Ctx): Promise<void> {
  const s = newSlide(pptx, slide, ctx)
  const top = addHeader(s, ctx, slide.title)
  const { palette: p, fonts } = ctx.theme
  const r = contentRegion(ctx, Boolean(slide.image))
  // The panel is as tall as the definition, the definition shrunk to at
  // most three lines (four left the list under it at the shrink floor) — a fixed 1.2 in panel showed a long definition cut
  // off with an ellipsis in the PDF and overflowing the panel in the .pptx.
  const def = cleanForSlide(slide.body.definition)
  const dfit = fitTitle(def, PCT(r.w - I(G.fPadX)), G.bodySize, 3, DISPLAY_REGULAR_EM)
  const defH = clampH(I(dfit.size * 1.2) * dfit.lines + I(G.fPadY) * 0.7)
  s.addShape('rect', { x: r.x, y: top, w: r.w, h: defH, fill: { color: p.panel }, rectRadius: I(G.fRadius) })
  s.addText(def, {
    x: r.x + I(G.fPadX) / 2, y: top, w: r.w - I(G.fPadX), h: defH, fontSize: PT(dfit.size), fontFace: fonts.display, color: p.ink, valign: 'middle', lineSpacingMultiple: 1.2, margin: 0,
  })
  if (slide.body.supporting.length > 0) {
    addList(s, ctx, slide.body.supporting, { x: r.x, y: top + defH + I(G.fExGap), w: r.w, h: BOTTOM - top - defH - I(G.fExGap) }, G.subSize, { color: p.ink2 })
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
      addList(s, ctx, c.items, { x, y: by, w: colW, h: BOTTOM - by }, G.subSize, { lineSpacingMultiple: 1.25 })
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
    addList(s, ctx, slide.body.points, { x: m, y, w: SLIDE_W - m * 2, h: BOTTOM - y }, G.subSize * 0.85, { color: p.ink2, lineSpacingMultiple: 1.15, paraSpaceAfter: 0 })
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
  const fit = fitTitle(cleanForSlide(slide.body.question), PCT(r.w * (G.qMaxW / 100)), G.qSize, 3, DISPLAY_REGULAR_EM)
  const qh = I(fit.size * G.titleLine) * fit.lines
  s.addText(cleanForSlide(slide.body.question), { x: r.x, y: qy, w: r.w * (G.qMaxW / 100), h: qh, fontFace: fonts.display, fontSize: PT(fit.size), italic: true, color: p.ink, valign: 'top', margin: 0 })
  if (slide.body.prompts.length > 0) {
    const py = qy + qh + I(G.titleGap)
    addList(s, ctx, slide.body.prompts, { x: r.x, y: py, w: r.w, h: BOTTOM - py }, G.subSize, { color: p.ink2 })
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
  const fit = fitTitle(cleanForSlide(slide.body.action), PCT(w * (G.qMaxW / 100)), G.qSize, 3)
  const ah = I(fit.size * G.titleLine) * fit.lines
  s.addText(cleanForSlide(slide.body.action), { x: m, y: ay, w: w * (G.qMaxW / 100), h: ah, fontFace: fonts.display, fontSize: PT(fit.size), bold: true, color: p.ink, valign: 'top', margin: 0 })
  let y = ay + ah + I(G.titleGap)
  if (slide.body.reasons.length > 0) {
    const h = slide.body.contact ? Math.max(0.6, BOTTOM - y - 0.5) : BOTTOM - y
    addList(s, ctx, slide.body.reasons, { x: m, y, w, h }, G.subSize, { color: p.ink2 })
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
    addList(s, ctx, slide.body.takeaways, { x: m, y: top, w: slide.body.next_steps.length > 0 ? leftW : w, h: BOTTOM - top }, G.bodySize)
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
    addList(s, ctx, slide.body.next_steps, { x: x + padX, y: top + padY + kh + 0.1, w: rightW - padX * 2, h: h - padY * 2 - kh - 0.1 }, G.subSize, { lineSpacingMultiple: 1.25 })
  }
  addNotes(s, slide.notes)
}
