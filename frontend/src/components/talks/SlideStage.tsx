import type { Slide } from '../../../../shared/types'
import type { ThemeSwatch } from '../../api/brand'
import { G, fitTitle, fitList, DISPLAY_REGULAR_EM } from '../../../../shared/slideGeometry'
import { backgroundSvg, backgroundCssUrl, backgroundRole, hasTreatment, SOLID } from '../../../../shared/slideBackground'
import { sectionTitle } from '../../../../shared/slideDesign'
import { BlockMath, InlineText } from './Math'

// A slide drawn at slide proportions for the projector — 960×540 CSS px,
// scaled to whatever box it is given with a transform, so the layout never
// reflows between the preview thumbnail and the fullscreen stage. Themes v2:
// every number is shared/slideGeometry.ts (percent of width → px here, 1 =
// 9.6 px), the same source as the .pptx, the PDF and the public site's
// deck, in the faces a .pptx can carry (Georgia / Arial). Design v3: the
// theme's background recipe is drawn here as the SAME SVG the exporters
// rasterise (shared/slideBackground.ts), inlined as a CSS background.

export const STAGE_W = 960
export const STAGE_H = 540
const U = (v: number) => (v / 100) * STAGE_W
const DISPLAY = 'Georgia, "PT Serif", serif'
const BODY = 'Arial, "Helvetica Neue", sans-serif'
const MONO = '"Courier New", "PT Mono", monospace'

interface Props { slide: Slide; theme: ThemeSwatch; scale: number; index?: number; total?: number; talkTitle?: string }

export default function SlideStage({ slide, theme, scale, index = 0, total = 1, talkTitle = '' }: Props) {
  const c = { bg: `#${theme.bg}`, ink: `#${theme.ink}`, ink2: `#${theme.ink2}`, accent: `#${theme.accent}`, panel: `#${theme.panel}` }
  const recipe = theme.background ?? SOLID
  const role = backgroundRole(slide, recipe)
  const bgImage = hasTreatment(recipe, role) ? backgroundCssUrl(backgroundSvg({ bg: theme.bg, accent: theme.accent, ink: theme.ink, panel: theme.panel }, recipe, role)) : undefined
  const image = slide.type === 'diagram' ? slide.body.image : slide.image
  const hasSide = Boolean(image) && !['title', 'section', 'agenda', 'stats', 'quote', 'image-full', 'summary', 'cta', 'diagram'].includes(slide.type)
  // Design v3 (L2): the colour of a slide's big element under its design.
  const emphasis = slide.design?.emphasis === 'plain' ? c.ink : c.accent
  // The header's fitted size and the content region under it, in px — the
  // lists below shrink into their share of it (slideGeometry.ts fitList).
  const m = U(G.marginX)
  const headFit = fitTitle(slide.title, 100 - G.marginX * 2, G.titleSize, 2)
  const qW = (hasSide ? STAGE_W - 2 * m - 288 - 28 : STAGE_W - 2 * m)
  const qFit = fitTitle(slide.type === 'discussion' ? slide.body.question : slide.type === 'cta' ? slide.body.action : '', (qW / STAGE_W) * 100 * (G.qMaxW / 100), G.qSize, 3, slide.type === 'discussion' ? DISPLAY_REGULAR_EM : undefined)
  const regionH = STAGE_H - U(G.top) - U(headFit.size * G.titleLine) * headFit.lines - U(G.titlePad) - U(G.rule) - U(G.titleGap) - U(G.bottom)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const kick = (text: string, color = c.accent) => (
    <div style={{ fontSize: U(G.kickSize), letterSpacing: '0.14em', textTransform: 'uppercase', color, fontWeight: 700, fontFamily: BODY }}><InlineText text={text} /></div>
  )
  const footer = (left: string) => (
    <div style={{ position: 'absolute', left: m, right: m, bottom: U(G.footerY), display: 'flex', justifyContent: 'space-between', fontSize: U(G.footerSize), color: c.ink2 }}>
      <span style={{ fontFamily: BODY }}>{left}</span><span style={{ fontFamily: MONO }}>{pad2(index + 1)} / {pad2(total)}</span>
    </div>
  )

  return (
    <div style={{ width: STAGE_W * scale, height: STAGE_H * scale, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left', background: c.bg, backgroundImage: bgImage, backgroundSize: '100% 100%', color: c.ink, position: 'relative', fontFamily: BODY, lineHeight: G.bodyLine }}>
        {slide.type === 'title' || slide.type === 'section' ? (
          // A section break is the title slide's composition: kicker = the part, lead where the presenter goes.
          <>
            <div style={{ position: 'absolute', left: m, right: m, bottom: U(G.tsBottom), display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div style={{ width: U(G.tsRuleW), height: U(G.tsRuleH), background: c.accent, marginBottom: U(G.tsRuleGap) }} />
              {slide.type === 'title' && slide.body.subtitle && <div style={{ marginBottom: U(G.tsKickGap) }}>{kick(slide.body.subtitle, c.ink2)}</div>}
              {slide.type === 'section' && slide.body.kicker && <div style={{ marginBottom: U(G.tsKickGap) }}>{kick(slide.body.kicker, emphasis)}</div>}
              <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: U(fitTitle(slide.type === 'section' ? sectionTitle(slide) : slide.title, (100 - G.marginX * 2) * (G.tsMaxW / 100), G.tsTitleSize, 3).size), lineHeight: G.titleLine, letterSpacing: '-0.01em', maxWidth: `${G.tsMaxW}%`, textWrap: 'balance' }}><InlineText text={slide.type === 'section' ? sectionTitle(slide) : slide.title} /></h1>
              {slide.type === 'title' && slide.body.presenter && <div style={{ marginTop: U(G.tsTitleGap), fontSize: U(G.tsWhoSize), color: c.ink2 }}>{slide.body.presenter}</div>}
              {slide.type === 'section' && slide.body.lead && <div style={{ marginTop: U(G.tsTitleGap), fontSize: U(G.tsWhoSize), color: c.ink2, maxWidth: `${G.tsMaxW}%` }}><InlineText text={slide.body.lead} /></div>}
            </div>
            {footer(slide.type === 'title' ? '' : talkTitle)}
          </>
        ) : slide.type === 'quote' ? (
          <>
            <div style={{ position: 'absolute', left: m, right: m, top: U(G.top) + 36, bottom: U(G.bottom) }}>
              {kick(slide.title)}
              <div style={{ marginTop: U(G.tsKickGap), fontFamily: DISPLAY, fontSize: U(G.qSize), lineHeight: G.titleLine, maxWidth: `${G.qMaxW}%`, fontStyle: 'italic' }}>«<InlineText text={slide.body.quote} />»</div>
              {slide.body.attribution && <div style={{ marginTop: U(G.titleGap), fontSize: U(G.subSize), fontWeight: 700, color: emphasis }}>— {slide.body.attribution}</div>}
            </div>
            {footer(talkTitle)}
          </>
        ) : slide.type === 'image-full' && image ? (
          // The picture covers the slide; the title and caption on a scrim. White on 65 % black: ≥ 7:1 against the scrim.
          <>
            <img src={image.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: U(15.5), background: 'rgba(0,0,0,0.65)', color: '#FFFFFF', padding: `${U(1.5)}px ${m}px` }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: U(G.titleSize), lineHeight: G.titleLine }}><InlineText text={slide.title} /></div>
              {slide.body.caption && <div style={{ marginTop: 4, fontSize: U(G.subSize) }}><InlineText text={slide.body.caption} /></div>}
            </div>
          </>
        ) : slide.type === 'discussion' || slide.type === 'cta' ? (
          <>
            <div style={{ position: 'absolute', left: m, right: hasSide ? m + 288 + 28 : m, top: U(G.top) + 36, bottom: U(G.bottom) }}>
              {kick(slide.title)}
              <div style={{ marginTop: U(G.tsKickGap), fontFamily: DISPLAY, fontSize: U(qFit.size), lineHeight: G.titleLine, maxWidth: `${G.qMaxW}%`, fontStyle: slide.type === 'discussion' ? 'italic' : 'normal', fontWeight: slide.type === 'discussion' ? 400 : 700 }}>
                <InlineText text={slide.type === 'discussion' ? slide.body.question : slide.body.action} />
              </div>
              <div style={{ marginTop: U(G.titleGap) }}>
                <List items={slide.type === 'discussion' ? slide.body.prompts : slide.body.reasons} c={c} size={U(G.subSize)} color={c.ink2}
                      box={{ h: STAGE_H - U(G.top) - 36 - U(G.kickSize) * 1.6 - U(G.tsKickGap) - U(qFit.size * G.titleLine) * qFit.lines - U(G.titleGap) - U(G.bottom) - (slide.type === 'cta' && slide.body.contact ? U(G.subSize) * 2 : 0), w: qW }} />
                {slide.type === 'cta' && slide.body.contact && <div style={{ marginTop: U(G.bodyGap), fontSize: U(G.subSize), fontWeight: 700, color: c.accent }}>{slide.body.contact}</div>}
              </div>
            </div>
            {footer(talkTitle)}
          </>
        ) : (
          <>
            <div style={{ position: 'absolute', left: m, right: m, top: U(G.top), bottom: U(G.bottom), display: 'flex', flexDirection: 'column' }}>
              {/* The same shrink the exporters apply (slideGeometry.ts fitTitle): a title past two lines gets smaller, here as there. */}
              <h2 style={{ margin: 0, paddingBottom: U(G.titlePad), borderBottom: `${U(G.rule)}px solid ${c.accent}`, fontFamily: DISPLAY, fontWeight: 700, fontSize: U(headFit.size), lineHeight: G.titleLine, letterSpacing: '-0.01em', textWrap: 'balance' }}><InlineText text={slide.title} /></h2>
              <div style={{ marginTop: U(G.titleGap), flex: 1, minHeight: 0, marginRight: hasSide ? 288 + 28 : 0 }}>
                <Body slide={slide} c={c} emphasis={emphasis} regionH={regionH} regionW={hasSide ? STAGE_W - 2 * m - 288 - 28 : STAGE_W - 2 * m} />
              </div>
            </div>
            {hasSide && image && (
              <div style={{ position: 'absolute', right: m, top: U(G.top) + U(G.titleSize * G.titleLine) + U(G.titlePad) + U(G.rule) + U(G.titleGap), bottom: U(G.bottom), width: 288, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={image.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
            )}
            {footer(talkTitle)}
          </>
        )}
      </div>
    </div>
  )
}

// `box`: the height and width the list may take, in px — the size shrinks
// to fit, as in the exporters (the same arithmetic, so the preview shows
// what the deck will).
function List({ items, c, size, color, box }: { items: string[]; c: { accent: string }; size: number; color?: string; box: { h: number; w: number } }) {
  const fitted = U(fitList(items, (box.w / STAGE_W) * 100, size / (STAGE_W / 100), (box.h / STAGE_W) * 100))
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: U(G.bodyGap), fontSize: fitted, color }}>
      {items.map((t, i) => (
        <li key={i} style={{ position: 'relative', paddingLeft: U(G.bulletIndent) }}>
          <span style={{ position: 'absolute', left: 0, top: '0.55em', width: U(G.bullet), height: U(G.bullet), borderRadius: '50%', background: c.accent }} aria-hidden />
          <InlineText text={t} />
        </li>
      ))}
    </ul>
  )
}

function Panel({ children, c }: { children: React.ReactNode; c: { panel: string } }) {
  return <div style={{ background: c.panel, borderRadius: U(G.fRadius), padding: `${U(G.fPadY)}px ${U(G.fPadX)}px` }}>{children}</div>
}

function Body({ slide, c, emphasis, regionH, regionW }: { slide: Slide; c: { bg: string; ink: string; ink2: string; accent: string; panel: string }; emphasis: string; regionH: number; regionW: number }) {
  const full = { h: regionH, w: regionW }
  switch (slide.type) {
    case 'bullets': {
      const items = slide.body.items
      if (slide.design?.variant === 'split' && items.length >= 4 && !slide.image) {
        const half = Math.ceil(items.length / 2)
        const col = { h: regionH, w: (regionW - U(G.sGap)) / 2 }
        return <div style={{ display: 'grid', gap: U(G.sGap), gridTemplateColumns: '1fr 1fr' }}>
          <List items={items.slice(0, half)} c={c} size={U(G.bodySize)} box={col} /><List items={items.slice(half)} c={c} size={U(G.bodySize)} box={col} />
        </div>
      }
      return <List items={items} c={c} size={U(G.bodySize)} box={full} />
    }
    case 'agenda': {
      const items = slide.body.items
      const cols = items.length >= 5 ? 2 : 1
      // Column-wise like the exporters: 01 02 03 down the left, 04 05 06 down the right.
      const per = Math.ceil(items.length / cols)
      return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: U(G.sGap), fontSize: U(G.bodySize) }}>
        {Array.from({ length: cols }, (_, c) => <ol key={c} start={c * per + 1} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', rowGap: U(G.bodyGap), alignContent: 'start' }}>
          {items.slice(c * per, (c + 1) * per).map((t, i) => <li key={i} style={{ display: 'flex', gap: U(1.2) }}><span style={{ fontFamily: MONO, color: emphasis, flexShrink: 0 }}>{String(c * per + i + 1).padStart(2, '0')}</span><InlineText text={t} /></li>)}
        </ol>)}
      </div>
    }
    case 'stats': {
      const stats = slide.body.stats
      const hero = slide.design?.variant === 'hero-number' || stats.length === 1
      if (hero) {
        const [st] = stats
        return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: U(9.5), lineHeight: 1.1, color: emphasis }}>{st.value}</div>
          <div style={{ marginTop: 6, fontSize: U(G.bodySize), maxWidth: '80%' }}><InlineText text={st.label} /></div>
          {st.note && <div style={{ marginTop: 4, fontSize: U(G.subSize), color: c.ink2, maxWidth: '80%' }}><InlineText text={st.note} /></div>}
        </div>
      }
      return <div style={{ display: 'grid', gap: U(G.sGap), gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map((st, i) => <div key={i} style={{ borderTop: `${U(G.rule) * 1.6}px solid ${c.ink}`, paddingTop: 8 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: U(6.4), lineHeight: 1.1, color: emphasis }}>{st.value}</div>
          <div style={{ marginTop: 6, fontSize: U(G.bodySize) }}><InlineText text={st.label} /></div>
          {st.note && <div style={{ marginTop: 4, fontSize: U(G.subSize), color: c.ink2 }}><InlineText text={st.note} /></div>}
        </div>)}
      </div>
    }
    case 'image-full':
      // No picture yet: the placeholder under the header, like a diagram.
      return <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: U(G.fRadius), background: c.panel }}>
          <span style={{ fontSize: U(G.subSize), color: c.ink2 }}>{slide.image_query ?? ''}</span>
        </div>
        {slide.body.caption && <p style={{ margin: '8px 0 0', fontSize: U(G.subSize), color: c.ink2 }}><InlineText text={slide.body.caption} /></p>}
      </div>
    case 'concept': {
      // The definition at most three lines, shrunk like the exporters do; the
      // panel's height follows it, and the list takes what is left.
      const dfit = fitTitle(slide.body.definition, ((regionW - U(G.fPadX) * 2) / STAGE_W) * 100, G.bodySize, 3, DISPLAY_REGULAR_EM)
      const panelH = U(dfit.size * 1.3) * dfit.lines + U(G.fPadY) * 2
      return <>
        <Panel c={c}><div style={{ fontFamily: DISPLAY, fontSize: U(dfit.size), lineHeight: 1.3 }}><InlineText text={slide.body.definition} /></div></Panel>
        <div style={{ marginTop: U(G.fExGap) }}><List items={slide.body.supporting} c={c} size={U(G.subSize)} color={c.ink2} box={{ h: regionH - panelH - U(G.fExGap), w: regionW }} /></div>
      </>
    }
    case 'formula':
      return <>
        <Panel c={c}>
          <div style={{ display: 'grid', gap: U(G.fCapGap) }}>
            {slide.body.formulas.map((f, i) => (
              <div key={i} style={{ maxWidth: '100%', overflow: 'hidden' }}>
                {/* A long formula (a \text{}-heavy one especially) must fit the stage width; size by length rather than let KaTeX overflow. */}
                <div style={{ fontSize: f.latex.length > 70 ? 16 : f.latex.length > 40 ? 22 : U(G.fSize) }}><BlockMath latex={f.latex} /></div>
                {f.caption && <div style={{ fontFamily: MONO, fontSize: U(G.fCapSize), color: c.ink2 }}><InlineText text={f.caption} /></div>}
              </div>
            ))}
          </div>
        </Panel>
        {slide.body.explanation && <p style={{ margin: `${U(G.fExGap)}px 0 0`, fontSize: U(G.subSize), color: c.ink2, maxWidth: '80%' }}><InlineText text={slide.body.explanation} /></p>}
      </>
    case 'comparison':
      return <div style={{ display: 'grid', gap: U(G.sGap), gridTemplateColumns: `repeat(${slide.body.columns.length}, minmax(0, 1fr))` }}>
        {slide.body.columns.map((col, i) => <div key={i} style={{ borderTop: `${U(G.rule) * 1.6}px solid ${c.ink}`, paddingTop: 6 }}>
          <div style={{ fontSize: U(G.kickSize), letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: c.accent, marginBottom: 8 }}><InlineText text={col.header} /></div>
          <List items={col.items} c={c} size={U(G.subSize)} box={{ h: regionH - U(G.rule) * 1.6 - 6 - U(G.kickSize) * 1.6 - 8, w: (regionW - U(G.sGap) * (slide.body.columns.length - 1)) / slide.body.columns.length }} />
        </div>)}
      </div>
    case 'diagram':
      return <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: U(G.fRadius), background: slide.body.image ? 'transparent' : c.panel }}>
          {slide.body.image ? <img src={slide.body.image.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: U(G.subSize), color: c.ink2 }}>{slide.body.image_query}</span>}
        </div>
        {slide.body.caption && <p style={{ margin: '8px 0 0', fontSize: U(G.subSize), fontWeight: 700 }}><InlineText text={slide.body.caption} /></p>}
        {slide.body.points.length > 0 && <div style={{ marginTop: 6 }}><List items={slide.body.points} c={c} size={U(G.subSize * 0.85)} color={c.ink2} box={{ h: 64, w: regionW }} /></div>}
      </div>
    case 'summary': {
      const [a, b] = G.sCols
      const hasNext = slide.body.next_steps.length > 0
      const leftW = hasNext ? ((regionW - U(G.sGap)) * a) / (a + b) : regionW
      const rightW = regionW - U(G.sGap) - leftW
      return <div style={{ display: 'grid', gap: U(G.sGap), gridTemplateColumns: hasNext ? `${a}fr ${b}fr` : '1fr', alignItems: 'start' }}>
        <List items={slide.body.takeaways} c={c} size={U(G.bodySize)} box={{ h: regionH, w: leftW }} />
        {slide.body.next_steps.length > 0 && (
          <div style={{ background: c.panel, borderRadius: U(G.fRadius), padding: `${U(G.sPanelPadY)}px ${U(G.sPanelPadX)}px` }}>
            <div style={{ fontSize: U(G.kickSize), letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: c.accent, marginBottom: 8 }}>Что дальше</div>
            <List items={slide.body.next_steps} c={c} size={U(G.subSize)} box={{ h: regionH - U(G.sPanelPadY) * 2 - U(G.kickSize) * 1.6 - 8, w: rightW - U(G.sPanelPadX) * 2 }} />
          </div>
        )}
      </div>
    }
    default:
      return null
  }
}
