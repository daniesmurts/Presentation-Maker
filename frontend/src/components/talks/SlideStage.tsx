import type { Slide } from '../../../../shared/types'
import type { ThemeSwatch } from '../../api/brand'
import { BlockMath, InlineText } from './Math'

// A slide drawn at slide proportions for the projector — 960×540 CSS px,
// scaled to whatever box it is given with a transform, so the layout never
// reflows between the preview thumbnail and the fullscreen stage. Colours
// come from the theme swatch (the same data the exporter uses); the
// geometry mirrors talkExport.ts (header rule, 0.6in margins ≈ 58px).

export const STAGE_W = 960
export const STAGE_H = 540

interface Props { slide: Slide; theme: ThemeSwatch; scale: number }

export default function SlideStage({ slide, theme, scale }: Props) {
  const c = { bg: `#${theme.bg}`, ink: `#${theme.ink}`, accent: `#${theme.accent}`, panel: `#${theme.panel}` }
  const image = slide.type === 'diagram' ? slide.body.image : slide.image
  const hasSide = Boolean(image) && !['title', 'summary', 'cta', 'diagram'].includes(slide.type)

  return (
    <div style={{ width: STAGE_W * scale, height: STAGE_H * scale, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left', background: c.bg, color: c.ink, position: 'relative', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
        {slide.type === 'title' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-16">
            <div className="absolute inset-x-0 top-0 h-3" style={{ background: c.accent }} />
            <div className="absolute inset-x-0 bottom-0 h-12" style={{ background: c.panel }} />
            {slide.body.subtitle && <div className="text-sm font-semibold tracking-widest uppercase opacity-70 mb-3">{slide.body.subtitle}</div>}
            <h1 className="text-5xl font-bold leading-tight" style={{ fontFamily: 'Georgia, serif' }}><InlineText text={slide.title} /></h1>
            <div className="w-24 h-1 mt-6" style={{ background: c.accent }} />
            {slide.body.presenter && <div className="text-lg opacity-70 mt-5">{slide.body.presenter}</div>}
          </div>
        ) : (
          <>
            <div className="absolute inset-x-0 top-0 h-3" style={{ background: c.accent }} />
            <h2 className="absolute left-[58px] right-[58px] top-[28px] text-3xl font-bold leading-tight line-clamp-2" style={{ fontFamily: 'Georgia, serif' }}><InlineText text={slide.title} /></h2>
            <div className="absolute left-[58px] top-[125px] bottom-[30px]" style={{ right: hasSide ? 58 + 288 + 28 : 58 }}>
              <Body slide={slide} c={c} />
            </div>
            {hasSide && image && (
              <div className="absolute right-[58px] top-[125px] bottom-[30px] w-[288px] flex items-center justify-center">
                <img src={image.url} alt="" className="max-w-full max-h-full object-contain" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const Li = ({ children, c, size, muted }: { children: React.ReactNode; c: { accent: string }; size: number; muted?: boolean }) => (
  <li className="flex gap-3 leading-snug" style={{ fontSize: size, opacity: muted ? 0.75 : 1 }}>
    <span style={{ color: c.accent }} aria-hidden>•</span><span><InlineText text={String(children)} /></span>
  </li>
)

function Body({ slide, c }: { slide: Slide; c: { bg: string; ink: string; accent: string; panel: string } }) {
  switch (slide.type) {
    case 'bullets':
      return <ul className="space-y-4">{slide.body.items.map((b, i) => <Li key={i} c={c} size={26}>{b}</Li>)}</ul>
    case 'concept':
      return <>
        <p className="text-2xl italic leading-snug px-5 py-4 mb-6" style={{ background: c.panel }}><InlineText text={slide.body.definition} /></p>
        <ul className="space-y-3">{slide.body.supporting.map((s, i) => <Li key={i} c={c} size={20} muted>{s}</Li>)}</ul>
      </>
    case 'formula':
      return <div className="flex flex-col items-center gap-3">
        {/* A long formula (a \text{}-heavy one especially) must fit the stage
            width; size by length rather than let KaTeX overflow. */}
        {slide.body.formulas.map((f, i) => <div key={i} className="text-center max-w-full overflow-hidden"><div className={f.latex.length > 90 ? 'text-lg' : f.latex.length > 45 ? 'text-2xl' : 'text-3xl'}><BlockMath latex={f.latex} /></div>{f.caption && <div className="text-base opacity-60"><InlineText text={f.caption} /></div>}</div>)}
        {slide.body.explanation && <p className="text-xl opacity-80 mt-4 self-start"><InlineText text={slide.body.explanation} /></p>}
      </div>
    case 'comparison':
      return <div className="grid gap-6 h-full" style={{ gridTemplateColumns: `repeat(${slide.body.columns.length}, minmax(0, 1fr))` }}>
        {slide.body.columns.map((col, i) => <div key={i}>
          <div className="text-sm font-bold tracking-wide uppercase text-center py-3 mb-4" style={{ background: c.panel, color: c.accent }}><InlineText text={col.header} /></div>
          <ul className="space-y-2">{col.items.map((it, j) => <Li key={j} c={c} size={19}>{it}</Li>)}</ul>
        </div>)}
      </div>
    case 'diagram':
      return <div className="h-full flex flex-col">
        <div className="flex-1 min-h-0 flex items-center justify-center rounded" style={{ background: slide.body.image ? 'transparent' : c.panel }}>
          {slide.body.image ? <img src={slide.body.image.url} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-lg opacity-50">{slide.body.image_query}</span>}
        </div>
        {slide.body.caption && <p className="text-lg font-semibold text-center mt-3"><InlineText text={slide.body.caption} /></p>}
        {slide.body.points.length > 0 && <ul className="flex gap-6 justify-center mt-2 text-base opacity-75">{slide.body.points.map((p, i) => <li key={i}><InlineText text={p} /></li>)}</ul>}
      </div>
    case 'discussion':
      return <>
        <p className="text-4xl font-bold leading-tight mb-8" style={{ fontFamily: 'Georgia, serif' }}><InlineText text={slide.body.question} /></p>
        <ul className="space-y-3">{slide.body.prompts.map((p, i) => <Li key={i} c={c} size={22} muted>{p}</Li>)}</ul>
      </>
    case 'cta':
      return <>
        <p className="text-4xl font-bold leading-tight" style={{ fontFamily: 'Georgia, serif' }}><InlineText text={slide.body.action} /></p>
        <div className="w-24 h-1 my-6" style={{ background: c.accent }} />
        <ul className="space-y-3">{slide.body.reasons.map((r, i) => <Li key={i} c={c} size={22}>{r}</Li>)}</ul>
        {slide.body.contact && <p className="text-xl font-semibold mt-8" style={{ color: c.accent }}>{slide.body.contact}</p>}
      </>
    case 'summary':
      return <div className="grid grid-cols-2 gap-10">
        <ul className="space-y-3">{slide.body.takeaways.map((t, i) => <Li key={i} c={c} size={22}>{t}</Li>)}</ul>
        <ul className="space-y-3">{slide.body.next_steps.map((t, i) => <Li key={i} c={c} size={20} muted>{t}</Li>)}</ul>
      </div>
    default:
      return null
  }
}
