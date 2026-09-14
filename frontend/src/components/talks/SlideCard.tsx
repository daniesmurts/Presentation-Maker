import { useState } from 'react'
import { Copy, Check, AlertTriangle, Image as ImageIcon } from 'lucide-react'
import type { Slide, TalkLanguage } from '../../../../shared/types'
import { BlockMath, InlineText } from './Math'
import { slideToText } from './slideText'
import { copy, SLIDE_TYPE_LABEL } from '../../lib/copy'

// One card per slide. Renders each type with its own layout; the card grows
// to fit, which is exactly why the "Много текста" flag exists — the slide
// will not (shared/slideFit.ts).

interface Props {
  slide:        Slide
  number:       number
  language:     TalkLanguage
  notesEnabled: boolean
  overfull?:    string   // reason from slideFit, when over budget
}

export default function SlideCard({ slide, number, language, notesEnabled, overfull }: Props) {
  const [copied, setCopied] = useState(false)
  function copyText() {
    void navigator.clipboard?.writeText(slideToText(slide, number, language)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  const imageQuery = slide.type === 'diagram' ? slide.body.image_query : slide.image_query

  return (
    <article className="bg-surface border border-border rounded-lg overflow-hidden appear" aria-label={`Слайд ${number}`}>
      <header className="flex items-center gap-2.5 px-4 h-11 border-b border-border">
        <span className="text-[11px] font-semibold bg-accent-light text-accent px-2 py-0.5 rounded-sm uppercase tracking-wide flex-shrink-0">
          {number}
        </span>
        <span className="text-[11px] font-medium text-ink-secondary uppercase tracking-wide flex-shrink-0">
          {SLIDE_TYPE_LABEL[slide.type]}
        </span>
        {slide.type !== 'title' && (
          <h3 className="text-[15px] font-semibold text-ink truncate"><InlineText text={slide.title} /></h3>
        )}
        {overfull && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-warning-bg text-warning px-1.5 py-0.5 rounded-sm flex-shrink-0 whitespace-nowrap"
                title={copy.talk.overfullTip(overfull)}>
            <AlertTriangle className="w-3 h-3" aria-hidden /> {copy.talk.overfull}
          </span>
        )}
        <button onClick={copyText} className="ml-auto h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs text-ink-secondary border border-border hover:bg-surface-soft hover:text-ink flex-shrink-0">
          {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
          {copied ? copy.talk.copied : copy.talk.copy}
        </button>
      </header>

      <div className={notesEnabled ? 'grid md:grid-cols-[3fr_2fr]' : ''}>
        <div className={notesEnabled ? 'md:border-r border-border' : ''}>
          <Body slide={slide} />
          {imageQuery && slide.type !== 'diagram' && <ImageSlot query={imageQuery} />}
        </div>
        {notesEnabled && (
          <aside className="p-4 bg-surface-soft">
            <div className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider mb-2">{copy.talk.notes}</div>
            {slide.notes
              ? <p className="text-[13px] text-ink-secondary leading-relaxed whitespace-pre-line"><InlineText text={slide.notes} /></p>
              : <p className="text-[13px] text-ink-tertiary">{copy.talk.noNotes}</p>}
          </aside>
        )}
      </div>
    </article>
  )
}

function ImageSlot({ query }: { query: string }) {
  // A dashed slot with the model's suggested query. Search and upload arrive
  // with TODO B; until then the query tells the user what to find.
  return (
    <div className="mx-4 mb-4 border border-dashed border-border-strong rounded-md px-3 py-2 flex items-center gap-2 text-xs text-ink-secondary">
      <ImageIcon className="w-4 h-4 flex-shrink-0" aria-hidden /> {copy.talk.imageSlot(query)}
    </div>
  )
}

const Bullet = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => (
  <li className={`flex gap-2 leading-relaxed ${muted ? 'text-[13px] text-ink-secondary' : 'text-sm text-ink'}`}>
    <span className="text-accent mt-0.5 flex-shrink-0 select-none" aria-hidden>•</span>
    <span>{children}</span>
  </li>
)

function Body({ slide }: { slide: Slide }) {
  switch (slide.type) {
    case 'title':
      return (
        <div className="p-8 text-center">
          <h2 className="text-2xl font-semibold text-ink tracking-tight"><InlineText text={slide.title} /></h2>
          {slide.body.subtitle && <p className="text-sm text-ink-secondary mt-2">{slide.body.subtitle}</p>}
          {slide.body.presenter && <p className="text-xs text-ink-secondary mt-4">{slide.body.presenter}</p>}
        </div>
      )
    case 'bullets':
      return <ul className="p-4 space-y-2">{slide.body.items.map((b, i) => <Bullet key={i}><InlineText text={b} /></Bullet>)}</ul>
    case 'concept':
      return (
        <div className="p-4">
          <p className="text-[15px] text-ink leading-relaxed border-l-2 border-accent pl-3 mb-3"><InlineText text={slide.body.definition} /></p>
          <ul className="space-y-1.5">{slide.body.supporting.map((s, i) => <Bullet key={i} muted><InlineText text={s} /></Bullet>)}</ul>
        </div>
      )
    case 'formula':
      return (
        <div className="p-4">
          <div className="bg-surface-soft rounded-md py-3 px-4 space-y-3">
            {slide.body.formulas.map((f, i) => (
              <div key={i}>
                <BlockMath latex={f.latex} />
                {f.caption && <div className="text-xs text-ink-secondary text-center mt-1"><InlineText text={f.caption} /></div>}
              </div>
            ))}
          </div>
          {slide.body.explanation && <p className="text-[13px] text-ink-secondary leading-relaxed mt-3"><InlineText text={slide.body.explanation} /></p>}
        </div>
      )
    case 'comparison':
      return (
        <div className="p-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${slide.body.columns.length}, minmax(0, 1fr))` }}>
          {slide.body.columns.map((c, i) => (
            <div key={i} className="border border-border rounded-md overflow-hidden min-w-0">
              <div className="px-3 py-1.5 bg-surface-soft text-[11px] font-semibold text-ink uppercase tracking-wide border-b border-border"><InlineText text={c.header} /></div>
              <ul className="p-3 space-y-1.5">{c.items.map((it, j) => <Bullet key={j} muted><InlineText text={it} /></Bullet>)}</ul>
            </div>
          ))}
        </div>
      )
    case 'diagram':
      return (
        <div className="p-4">
          <div className="border border-dashed border-border-strong rounded-md px-3 py-6 text-center text-xs text-ink-secondary flex flex-col items-center gap-2">
            <ImageIcon className="w-6 h-6" aria-hidden /> {copy.talk.imageSlot(slide.body.image_query)}
          </div>
          {slide.body.caption && <p className="text-sm text-ink text-center mt-2"><InlineText text={slide.body.caption} /></p>}
          {slide.body.points.length > 0 && <ul className="mt-3 space-y-1.5">{slide.body.points.map((p, i) => <Bullet key={i} muted><InlineText text={p} /></Bullet>)}</ul>}
        </div>
      )
    case 'discussion':
      return (
        <div className="p-4">
          <p className="text-lg font-semibold text-ink leading-snug"><InlineText text={slide.body.question} /></p>
          <ul className="mt-3 space-y-1.5">{slide.body.prompts.map((p, i) => <Bullet key={i} muted><InlineText text={p} /></Bullet>)}</ul>
        </div>
      )
    case 'cta':
      return (
        <div className="p-6">
          <p className="text-xl font-semibold text-ink leading-snug"><InlineText text={slide.body.action} /></p>
          <ul className="mt-3 space-y-1.5">{slide.body.reasons.map((r, i) => <Bullet key={i}><InlineText text={r} /></Bullet>)}</ul>
          {slide.body.contact && <p className="text-sm text-accent mt-4">{slide.body.contact}</p>}
        </div>
      )
    case 'summary':
      return (
        <div className="p-4">
          <ul className="space-y-2">{slide.body.takeaways.map((t, i) => <Bullet key={i}><InlineText text={t} /></Bullet>)}</ul>
          {slide.body.next_steps.length > 0 && (
            <ul className="mt-3 pt-3 border-t border-border space-y-1.5">{slide.body.next_steps.map((t, i) => <Bullet key={i} muted><InlineText text={t} /></Bullet>)}</ul>
          )}
        </div>
      )
  }
}
