import { useRef, useState } from 'react'
import { Copy, Check, AlertTriangle, Image as ImageIcon, ArrowUp, ArrowDown, Pencil, RefreshCw, Trash2, Undo2, Upload, X } from 'lucide-react'
import type { Slide, SlideImage, TalkLanguage } from '../../../../shared/types'
import { BlockMath, InlineText } from './Math'
import { slideToText } from './slideText'
import SlideEditor from './SlideEditor'
import Button from '../ui/Button'
import { inputClass } from '../ui/Field'
import { copy, SLIDE_TYPE_LABEL } from '../../lib/copy'

// Editing is a set of callbacks the page owns; the card only knows which
// mode it is in. `busy` disables every action while any write is in flight
// — two structural edits racing would desynchronise indices.
export interface SlideEditActions {
  busy:         boolean
  onMove:       (from: number, to: number) => void
  onDelete:     (idx: number) => void
  onSave:       (idx: number, slide: Slide) => void
  onRegenerate: (idx: number, instruction: string) => Promise<void>
  onUndo?:      (idx: number) => void   // present only while a previous version is held
  onUpload:     (idx: number, file: File) => void
  onRemoveImage:(idx: number) => void
}

// One card per slide. Renders each type with its own layout; the card grows
// to fit, which is exactly why the "Много текста" flag exists — the slide
// will not (shared/slideFit.ts).

interface Props {
  slide:        Slide
  number:       number
  language:     TalkLanguage
  notesEnabled: boolean
  overfull?:    string   // reason from slideFit, when over budget
  edit?:        SlideEditActions
  isFirst?:     boolean
  isLast?:      boolean
}

export default function SlideCard({ slide, number, language, notesEnabled, overfull, edit, isFirst, isLast }: Props) {
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<'view' | 'edit' | 'regenerate'>('view')
  const [instruction, setInstruction] = useState('')
  const idx = number - 1
  async function regenerate() {
    if (!edit) return
    await edit.onRegenerate(idx, instruction.trim())
    setMode('view')
  }
  function copyText() {
    void navigator.clipboard?.writeText(slideToText(slide, number, language)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  const imageQuery = slide.type === 'diagram' ? slide.body.image_query : slide.image_query
  const image = slide.type === 'diagram' ? slide.body.image : slide.image
  // Only the types the exporter lays an image out for (talkExport.ts's
  // addSideImage / diagram box). Offering a slot on a title or summary slide
  // would store a picture the deck never shows.
  const canHaveImage = !['title', 'summary', 'cta'].includes(slide.type)
  const imageSlot = !canHaveImage ? null : edit
    ? <ImageSlot query={imageQuery ?? ''} image={image ?? null} busy={edit.busy} onUpload={(f) => edit.onUpload(idx, f)} onRemove={() => edit.onRemoveImage(idx)} />
    : image ? <ImageSlot query={imageQuery ?? ''} image={image} /> : null

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
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          {edit && <>
            <Icon label={copy.talk.edit.up}   disabled={isFirst || edit.busy} onClick={() => edit.onMove(idx, idx - 1)}><ArrowUp className="w-4 h-4" /></Icon>
            <Icon label={copy.talk.edit.down} disabled={isLast  || edit.busy} onClick={() => edit.onMove(idx, idx + 1)}><ArrowDown className="w-4 h-4" /></Icon>
            <Icon label={mode === 'edit' ? copy.talk.edit.close : copy.talk.edit.edit} disabled={edit.busy} active={mode === 'edit'} onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}><Pencil className="w-4 h-4" /></Icon>
            <Icon label={copy.talk.edit.regenerate} disabled={edit.busy} active={mode === 'regenerate'} onClick={() => setMode(mode === 'regenerate' ? 'view' : 'regenerate')}><RefreshCw className="w-4 h-4" /></Icon>
            {edit.onUndo && <Icon label={copy.talk.edit.undo} disabled={edit.busy} onClick={() => edit.onUndo!(idx)}><Undo2 className="w-4 h-4" /></Icon>}
            <Icon label={copy.talk.edit.remove} disabled={edit.busy} danger onClick={() => { if (window.confirm(copy.talk.edit.removeConfirm)) edit.onDelete(idx) }}><Trash2 className="w-4 h-4" /></Icon>
          </>}
          <button onClick={copyText} className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs text-ink-secondary border border-border hover:bg-surface-soft hover:text-ink">
            {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
            <span className="hidden sm:inline">{copied ? copy.talk.copied : copy.talk.copy}</span>
          </button>
        </div>
      </header>

      {edit && mode === 'regenerate' && (
        <div className="p-4 bg-surface-soft border-b border-border space-y-2">
          <label htmlFor={`instr-${idx}`} className="block text-xs font-medium text-ink-secondary">{copy.talk.edit.instructionLabel}</label>
          <div className="flex gap-2">
            <input id={`instr-${idx}`} className={inputClass} value={instruction} onChange={(e) => setInstruction(e.target.value)}
                   placeholder={copy.talk.edit.instructionPh} maxLength={500}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void regenerate() } }} />
            <Button size="md" loading={edit.busy} onClick={() => void regenerate()}>{copy.talk.edit.regenerate}</Button>
          </div>
        </div>
      )}

      {edit && mode === 'edit' && (
        <SlideEditor slide={slide} notesEnabled={notesEnabled} saving={edit.busy} onCancel={() => setMode('view')}
                     onSave={(edited) => { edit.onSave(idx, edited); setMode('view') }} />
      )}

      <div className={notesEnabled ? 'grid md:grid-cols-[3fr_2fr]' : ''}>
        <div className={notesEnabled ? 'md:border-r border-border' : ''}>
          <Body slide={slide} imageSlot={imageSlot} />
          {slide.type !== 'diagram' && imageSlot && <div className="px-4 pb-4">{imageSlot}</div>}
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

function Icon({ children, label, onClick, disabled, danger, active }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-md border transition-colors disabled:opacity-30 disabled:cursor-default ${
        active ? 'border-accent bg-accent-light text-accent'
        : danger ? 'border-transparent text-ink-secondary hover:text-danger hover:bg-danger-bg'
        : 'border-transparent text-ink-secondary hover:text-ink hover:bg-surface-soft'}`}>
      {children}
    </button>
  )
}

// The one image slot: a picture with a credit line and replace/remove, or a
// dashed slot with the model's suggested query and an upload control. A
// real <label> wraps the hidden file input so the whole chip is the target.
function ImageSlot({ query, image, busy, onUpload, onRemove }: {
  query: string; image: SlideImage | null; busy?: boolean
  onUpload?: (file: File) => void; onRemove?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && onUpload) onUpload(f)
    e.target.value = ''
  }
  const fileInput = onUpload && <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={pick} disabled={busy} />

  if (image) {
    return (
      <figure className="m-0">
        <img src={image.url} alt={query || ''} width={image.width ?? undefined} height={image.height ?? undefined}
             className="max-h-72 w-auto max-w-full rounded-md border border-border object-contain bg-surface-soft" />
        <figcaption className="mt-1.5 flex items-center gap-3 text-xs text-ink-secondary">
          {image.source_host && <span>{image.source_host}</span>}
          {onUpload && <label className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-border cursor-pointer hover:bg-surface-soft hover:text-ink">
            <Upload className="w-3.5 h-3.5" aria-hidden /> {copy.talk.image.replace}{fileInput}
          </label>}
          {onRemove && <button type="button" onClick={onRemove} disabled={busy} className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-border hover:bg-danger-bg hover:text-danger">
            <X className="w-3.5 h-3.5" aria-hidden /> {copy.talk.image.remove}
          </button>}
        </figcaption>
      </figure>
    )
  }
  return (
    <div className="border border-dashed border-border-strong rounded-md px-3 py-3 flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
      <span className="inline-flex items-center gap-2"><ImageIcon className="w-4 h-4 flex-shrink-0" aria-hidden /> {query ? copy.talk.imageSlot(query) : copy.talk.image.hint}</span>
      {onUpload && <label className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border bg-surface cursor-pointer hover:bg-surface-soft hover:text-ink ml-auto">
        <Upload className="w-3.5 h-3.5" aria-hidden /> {copy.talk.image.upload}{fileInput}
      </label>}
    </div>
  )
}

const Bullet = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => (
  <li className={`flex gap-2 leading-relaxed ${muted ? 'text-[13px] text-ink-secondary' : 'text-sm text-ink'}`}>
    <span className="text-accent mt-0.5 flex-shrink-0 select-none" aria-hidden>•</span>
    <span>{children}</span>
  </li>
)

function Body({ slide, imageSlot }: { slide: Slide; imageSlot: React.ReactNode }) {
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
          {imageSlot}
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
