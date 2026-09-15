import type { Slide } from '../../../../shared/types'
import type { ThemeSwatch } from '../../api/brand'
import { G } from '../../../../shared/slideGeometry'
import { backgroundSvg, backgroundCssUrl, backgroundRole, hasTreatment, SOLID } from '../../../../shared/slideBackground'
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
  const role = backgroundRole(slide.type)
  const bgImage = hasTreatment(recipe, role) ? backgroundCssUrl(backgroundSvg({ bg: theme.bg, accent: theme.accent, ink: theme.ink, panel: theme.panel }, recipe, role)) : undefined
  const image = slide.type === 'diagram' ? slide.body.image : slide.image
  const hasSide = Boolean(image) && !['title', 'summary', 'cta', 'diagram'].includes(slide.type)
  const m = U(G.marginX)
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
        {slide.type === 'title' ? (
          <>
            <div style={{ position: 'absolute', left: m, right: m, bottom: U(G.tsBottom), display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div style={{ width: U(G.tsRuleW), height: U(G.tsRuleH), background: c.accent, marginBottom: U(G.tsRuleGap) }} />
              {slide.body.subtitle && <div style={{ marginBottom: U(G.tsKickGap) }}>{kick(slide.body.subtitle, c.ink2)}</div>}
              <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: U(G.tsTitleSize), lineHeight: G.titleLine, letterSpacing: '-0.01em', maxWidth: `${G.tsMaxW}%`, textWrap: 'balance' }}><InlineText text={slide.title} /></h1>
              {slide.body.presenter && <div style={{ marginTop: U(G.tsTitleGap), fontSize: U(G.tsWhoSize), color: c.ink2 }}>{slide.body.presenter}</div>}
            </div>
            {footer('')}
          </>
        ) : slide.type === 'discussion' || slide.type === 'cta' ? (
          <>
            <div style={{ position: 'absolute', left: m, right: hasSide ? m + 288 + 28 : m, top: U(G.top) + 36, bottom: U(G.bottom) }}>
              {kick(slide.title)}
              <div style={{ marginTop: U(G.tsKickGap), fontFamily: DISPLAY, fontSize: U(G.qSize), lineHeight: G.titleLine, maxWidth: `${G.qMaxW}%`, fontStyle: slide.type === 'discussion' ? 'italic' : 'normal', fontWeight: slide.type === 'discussion' ? 400 : 700 }}>
                <InlineText text={slide.type === 'discussion' ? slide.body.question : slide.body.action} />
              </div>
              <div style={{ marginTop: U(G.titleGap) }}>
                <List items={slide.type === 'discussion' ? slide.body.prompts : slide.body.reasons} c={c} size={U(G.subSize)} color={c.ink2} />
                {slide.type === 'cta' && slide.body.contact && <div style={{ marginTop: U(G.bodyGap), fontSize: U(G.subSize), fontWeight: 700, color: c.accent }}>{slide.body.contact}</div>}
              </div>
            </div>
            {footer(talkTitle)}
          </>
        ) : (
          <>
            <div style={{ position: 'absolute', left: m, right: m, top: U(G.top), bottom: U(G.bottom), display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ margin: 0, paddingBottom: U(G.titlePad), borderBottom: `${U(G.rule)}px solid ${c.accent}`, fontFamily: DISPLAY, fontWeight: 700, fontSize: U(G.titleSize), lineHeight: G.titleLine, letterSpacing: '-0.01em', textWrap: 'balance' }}><InlineText text={slide.title} /></h2>
              <div style={{ marginTop: U(G.titleGap), flex: 1, minHeight: 0, marginRight: hasSide ? 288 + 28 : 0 }}>
                <Body slide={slide} c={c} />
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

function List({ items, c, size, color }: { items: string[]; c: { accent: string }; size: number; color?: string }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: U(G.bodyGap), fontSize: size, color }}>
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

function Body({ slide, c }: { slide: Slide; c: { bg: string; ink: string; ink2: string; accent: string; panel: string } }) {
  switch (slide.type) {
    case 'bullets':
      return <List items={slide.body.items} c={c} size={U(G.bodySize)} />
    case 'concept':
      return <>
        <Panel c={c}><div style={{ fontFamily: DISPLAY, fontSize: U(G.bodySize), lineHeight: 1.3 }}><InlineText text={slide.body.definition} /></div></Panel>
        <div style={{ marginTop: U(G.fExGap) }}><List items={slide.body.supporting} c={c} size={U(G.subSize)} color={c.ink2} /></div>
      </>
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
          <List items={col.items} c={c} size={U(G.subSize)} />
        </div>)}
      </div>
    case 'diagram':
      return <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: U(G.fRadius), background: slide.body.image ? 'transparent' : c.panel }}>
          {slide.body.image ? <img src={slide.body.image.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: U(G.subSize), color: c.ink2 }}>{slide.body.image_query}</span>}
        </div>
        {slide.body.caption && <p style={{ margin: '8px 0 0', fontSize: U(G.subSize), fontWeight: 700 }}><InlineText text={slide.body.caption} /></p>}
        {slide.body.points.length > 0 && <div style={{ marginTop: 6 }}><List items={slide.body.points} c={c} size={U(G.subSize * 0.85)} color={c.ink2} /></div>}
      </div>
    case 'summary': {
      const [a, b] = G.sCols
      return <div style={{ display: 'grid', gap: U(G.sGap), gridTemplateColumns: slide.body.next_steps.length > 0 ? `${a}fr ${b}fr` : '1fr', alignItems: 'start' }}>
        <List items={slide.body.takeaways} c={c} size={U(G.bodySize)} />
        {slide.body.next_steps.length > 0 && (
          <div style={{ background: c.panel, borderRadius: U(G.fRadius), padding: `${U(G.sPanelPadY)}px ${U(G.sPanelPadX)}px` }}>
            <div style={{ fontSize: U(G.kickSize), letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: c.accent, marginBottom: 8 }}>Что дальше</div>
            <List items={slide.body.next_steps} c={c} size={U(G.subSize)} />
          </div>
        )}
      </div>
    }
    default:
      return null
  }
}
