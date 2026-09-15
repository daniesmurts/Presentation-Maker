import { useRef, useState } from 'react'
import { Copy, Check, AlertTriangle, Image as ImageIcon, ArrowUp, ArrowDown, Pencil, RefreshCw, Trash2, Undo2, Upload, X, Sparkles } from 'lucide-react'
import type { Slide, SlideImage, TalkLanguage } from '../../../../shared/types'
import { BlockMath, InlineText } from './Math'
import { slideToText } from './slideText'
import SlideEditor from './SlideEditor'
import Button from '../ui/Button'
import { inputClass } from '../ui/Field'
import { copy, SLIDE_TYPE_LABEL } from '../../lib/copy'
import { sectionTitle } from '../../../../shared/slideDesign'

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
  /** Generated pictures (Design v3, L3): absent when generation is not configured. */
  onGenerate?:  (idx: number, prompt: string) => Promise<void>
  getPrompt?:   (idx: number) => Promise<string>
}

// The manuscript row («Редакция»): the slide on the left, the speaker's
// text in the margin on the right, at the same height — like a note in the
// margin of a draft. The article is `display: contents`, so its two cells
// sit directly in the page's grid (slide column · 280px margin) and line
// up across every row; under lg the grid is one column and the margin note
// simply follows its slide. The cell grows to fit, which is exactly why the
// «не влезает» flag exists — the slide will not (shared/slideFit.ts).

// A speaking-time estimate for the margin: ≈110 words/min in Russian,
// ≈140 in English (conference pace, measured against ИСПУМ lecture notes
// read aloud). Rounded to 5 s — the number is a feel, not a stopwatch.
export function speakingSeconds(text: string, language: TalkLanguage): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const wpm = language === 'ru' ? 110 : 140
  return Math.max(5, Math.round((words / wpm) * 60 / 5) * 5)
}

interface Props {
  slide:        Slide
  number:       number
  total:        number
  language:     TalkLanguage
  notesEnabled: boolean
  overfull?:    string   // reason from slideFit, when over budget
  edit?:        SlideEditActions
  isFirst?:     boolean
  isLast?:      boolean
  selected?:    boolean
  onSelect?:    (idx: number, opts: { range: boolean }) => void
}

export default function SlideCard({ slide, number, total, language, notesEnabled, overfull, edit, isFirst, isLast, selected, onSelect }: Props) {
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
  const canHaveImage = !['title', 'section', 'agenda', 'stats', 'quote', 'summary', 'cta'].includes(slide.type)
  const imageSlot = !canHaveImage ? null : edit
    ? <ImageSlot query={imageQuery ?? ''} image={image ?? null} busy={edit.busy} onUpload={(f) => edit.onUpload(idx, f)} onRemove={() => edit.onRemoveImage(idx)}
                 onGenerate={edit.onGenerate ? (p) => edit.onGenerate!(idx, p) : undefined} getPrompt={edit.getPrompt ? () => edit.getPrompt!(idx) : undefined} />
    : image ? <ImageSlot query={imageQuery ?? ''} image={image} /> : null

  const cell = 'py-6 border-b border-border min-w-0'

  return (
    <article className="contents" aria-label={`Слайд ${number}`}>
      <div className={`${cell} grid grid-cols-[52px_minmax(0,1fr)] gap-x-3`}>
        {/* The number IS the selection control: a real checkbox in a 44px
            label, keyboard and screen reader for free, shift-click extends
            from the last one — forty slides is otherwise forty taps. Selected
            = marked with the highlighter (the marker token means only this).
            Without onSelect (the shared view) it is just the number. */}
        <div className="pt-0.5">
          {onSelect ? (
            <label title={copy.talk.selectSlide(number)}
                   className={`inline-flex items-center justify-center min-w-[44px] h-11 -ml-2 rounded-md font-mono text-sm cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/60 ${
                     selected ? 'bg-marker text-marker-ink' : 'text-ink-secondary hover:bg-surface-soft hover:text-ink'}`}>
              <input type="checkbox" checked={Boolean(selected)} onChange={() => {}} onClick={(e) => onSelect(idx, { range: e.shiftKey })}
                     className="sr-only" aria-label={copy.talk.selectSlide(number)} />
              {selected ? <Check className="w-4 h-4" aria-hidden /> : String(number).padStart(2, '0')}
            </label>
          ) : (
            <span className="inline-flex items-center h-11 font-mono text-sm text-ink-secondary">{String(number).padStart(2, '0')}</span>
          )}
          <div className="font-mono text-[11px] text-ink-tertiary -mt-1">/ {String(total).padStart(2, '0')}</div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5">
            <span className="eyebrow text-accent">{SLIDE_TYPE_LABEL[slide.type]}</span>
            {overfull && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning bg-warning-bg px-1.5 rounded-sm leading-5" title={copy.talk.overfullTip(overfull)}>
                <AlertTriangle className="w-3 h-3" aria-hidden /> {copy.talk.overfull}
              </span>
            )}
          </div>

          {edit && mode === 'regenerate' && (
            <div className="mb-4 p-3 bg-surface-soft rounded-md space-y-2">
              <label htmlFor={`instr-${idx}`} className="block text-xs font-medium text-ink-secondary">{copy.talk.edit.instructionLabel}</label>
              <div className="flex gap-2">
                <input id={`instr-${idx}`} className={inputClass} value={instruction} onChange={(e) => setInstruction(e.target.value)}
                       placeholder={copy.talk.edit.instructionPh} maxLength={500} autoFocus
                       onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void regenerate() } }} />
                <Button size="md" loading={edit.busy} onClick={() => void regenerate()}>{copy.talk.edit.regenerate}</Button>
              </div>
            </div>
          )}

          {edit && mode === 'edit' ? (
            <SlideEditor slide={slide} notesEnabled={notesEnabled} saving={edit.busy} onCancel={() => setMode('view')}
                         onSave={(edited) => { edit.onSave(idx, edited); setMode('view') }} />
          ) : (
            <>
              <Body slide={slide} imageSlot={imageSlot} />
              {slide.type !== 'diagram' && slide.type !== 'image-full' && imageSlot && <div className="mt-4">{imageSlot}</div>}
            </>
          )}

          {/* Actions: quiet chips, always present (touch has no hover), 32px. */}
          <div className="flex flex-wrap items-center gap-1 mt-4 -ml-2">
            {edit && <>
              <Chip label={copy.talk.edit.edit} icon={<Pencil className="w-3.5 h-3.5" />} active={mode === 'edit'} disabled={edit.busy} onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')} />
              <Chip label={copy.talk.edit.regenerate} icon={<RefreshCw className="w-3.5 h-3.5" />} active={mode === 'regenerate'} disabled={edit.busy} onClick={() => setMode(mode === 'regenerate' ? 'view' : 'regenerate')} />
              {edit.onUndo && <Chip label={copy.talk.edit.undo} icon={<Undo2 className="w-3.5 h-3.5" />} disabled={edit.busy} onClick={() => edit.onUndo!(idx)} />}
              <Chip label={copy.talk.edit.up}   icon={<ArrowUp className="w-3.5 h-3.5" />}   iconOnly disabled={isFirst || edit.busy} onClick={() => edit.onMove(idx, idx - 1)} />
              <Chip label={copy.talk.edit.down} icon={<ArrowDown className="w-3.5 h-3.5" />} iconOnly disabled={isLast  || edit.busy} onClick={() => edit.onMove(idx, idx + 1)} />
            </>}
            <Chip label={copied ? copy.talk.copied : copy.talk.copy} icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} onClick={copyText} />
            {edit && <Chip label={copy.talk.edit.remove} icon={<Trash2 className="w-3.5 h-3.5" />} iconOnly danger disabled={edit.busy}
                           onClick={() => { if (window.confirm(copy.talk.edit.removeConfirm)) edit.onDelete(idx) }} className="ml-auto" />}
          </div>
        </div>
      </div>

      {notesEnabled && (
        <aside className={`${cell} lg:pl-0`}>
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <span className="eyebrow text-ink-tertiary">{copy.talk.notes}</span>
            {slide.notes && <span className="font-mono text-[11px] text-ink-tertiary tabular-nums">{copy.talk.seconds(speakingSeconds(slide.notes, language))}</span>}
          </div>
          {slide.notes
            ? <p className="font-display text-[15px] text-ink-secondary leading-relaxed whitespace-pre-line max-w-[44ch]"><InlineText text={slide.notes} /></p>
            : <p className="font-display italic text-[15px] text-ink-tertiary max-w-[40ch]">{copy.talk.noNotes}</p>}
        </aside>
      )}
    </article>
  )
}

function Chip({ label, icon, onClick, disabled, danger, active, iconOnly, className = '' }: {
  label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; active?: boolean; iconOnly?: boolean; className?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`h-8 ${iconOnly ? 'w-8 justify-center' : 'px-2.5'} inline-flex items-center gap-1.5 rounded-md text-xs transition-colors disabled:opacity-30 disabled:cursor-default ${
        active ? 'bg-accent-light text-accent'
        : danger ? 'text-ink-secondary hover:text-danger hover:bg-danger-bg'
        : 'text-ink-secondary hover:text-ink hover:bg-surface-soft'} ${className}`}>
      {icon}{!iconOnly && <span>{label}</span>}
    </button>
  )
}

// The one image slot: a picture with a credit line and replace/remove, or a
// dashed slot with the model's suggested query and an upload control. A
// real <label> wraps the hidden file input so the whole chip is the target.
function ImageSlot({ query, image, busy, onUpload, onRemove, onGenerate, getPrompt }: {
  query: string; image: SlideImage | null; busy?: boolean
  onUpload?: (file: File) => void; onRemove?: () => void
  onGenerate?: (prompt: string) => Promise<void>; getPrompt?: () => Promise<string>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  // The generate disclosure: opened with the proposed prompt, editable,
  // one action. Explanation at the control (CLAUDE.md §6).
  const [promptOpen, setPromptOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  async function openPrompt() {
    if (!getPrompt) return
    setPromptOpen(true)
    if (!prompt) { try { setPrompt(await getPrompt()) } catch { /* the field stays empty; the user can type */ } }
  }
  async function generate() {
    if (!onGenerate) return
    setGenerating(true)
    try { await onGenerate(prompt.trim()); setPromptOpen(false) } finally { setGenerating(false) }
  }
  const generateButton = onGenerate && (
    <button type="button" onClick={() => void openPrompt()} disabled={busy || generating} title={copy.talk.image.generateHint}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border bg-surface hover:bg-surface-soft hover:text-ink">
      <Sparkles className="w-3.5 h-3.5" aria-hidden /> {image ? copy.talk.image.redo : copy.talk.image.generate}
    </button>
  )
  const promptPanel = promptOpen && onGenerate && (
    <div className="mt-2 p-3 rounded-md bg-surface-soft space-y-2">
      <label className="block text-xs font-medium text-ink-secondary">{copy.talk.image.promptLabel}
        <textarea className={`${inputClass} mt-1 resize-y font-normal`} rows={3} maxLength={500} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={generating} />
      </label>
      <p className="text-[11px] text-ink-tertiary">{copy.talk.image.promptHint}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void generate()} loading={generating} disabled={busy}>{copy.talk.image.go}</Button>
        <Button size="sm" variant="ghost" onClick={() => setPromptOpen(false)} disabled={generating}>{copy.talk.edit.cancel}</Button>
      </div>
    </div>
  )
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
          {generateButton}
          {onRemove && <button type="button" onClick={onRemove} disabled={busy} className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-border hover:bg-danger-bg hover:text-danger">
            <X className="w-3.5 h-3.5" aria-hidden /> {copy.talk.image.remove}
          </button>}
        </figcaption>
        {promptPanel}
      </figure>
    )
  }
  return (
    <div className="border border-dashed border-border-strong rounded-md px-3 py-2.5 flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
      <span className="inline-flex items-center gap-2"><ImageIcon className="w-4 h-4 flex-shrink-0" aria-hidden /> {query ? copy.talk.imageSlot(query) : copy.talk.image.hint}</span>
      <span className="ml-auto inline-flex items-center gap-2">
        {generateButton}
        {onUpload && <label className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border bg-surface cursor-pointer hover:bg-surface-soft hover:text-ink">
          <Upload className="w-3.5 h-3.5" aria-hidden /> {copy.talk.image.upload}{fileInput}
        </label>}
      </span>
      {promptPanel && <div className="basis-full">{promptPanel}</div>}
    </div>
  )
}

const H = ({ children }: { children: React.ReactNode }) => <h3 className="display text-[21px] font-medium leading-snug text-ink mb-3">{children}</h3>

const Bullet = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => (
  <li className={`flex gap-2.5 leading-relaxed ${muted ? 'text-[14px] text-ink-secondary' : 'text-[15px] text-ink'}`}>
    <span className="w-1 h-1 rounded-full bg-accent mt-[0.65em] flex-shrink-0" aria-hidden />
    <span>{children}</span>
  </li>
)

function Body({ slide, imageSlot }: { slide: Slide; imageSlot: React.ReactNode }) {
  switch (slide.type) {
    case 'title':
      return (
        <div>
          <h3 className="display font-semibold text-[30px] leading-tight text-ink"><InlineText text={slide.title} /></h3>
          {slide.body.subtitle && <p className="text-[15px] text-ink-secondary mt-2 max-w-[60ch]">{slide.body.subtitle}</p>}
          {slide.body.presenter && <p className="text-xs text-ink-secondary mt-3">{slide.body.presenter}</p>}
        </div>
      )
    case 'bullets':
      return <div><H><InlineText text={slide.title} /></H><ul className={slide.design?.variant === 'split' && slide.body.items.length >= 4 ? 'grid sm:grid-cols-2 gap-x-6 gap-y-1.5' : 'space-y-1.5'}>{slide.body.items.map((b, i) => <Bullet key={i}><InlineText text={b} /></Bullet>)}</ul></div>
    case 'section':
      return (
        <div className="py-2">
          {slide.body.kicker && <div className="eyebrow text-accent mb-2">{slide.body.kicker}</div>}
          <h3 className="display font-semibold text-[30px] leading-tight text-ink"><InlineText text={sectionTitle(slide)} /></h3>
          {slide.body.lead && <p className="text-[15px] text-ink-secondary mt-2 max-w-[60ch]"><InlineText text={slide.body.lead} /></p>}
        </div>
      )
    case 'agenda':
      return (
        <div>
          <H><InlineText text={slide.title} /></H>
          <ol className="space-y-1.5">
            {slide.body.items.map((b, i) => <li key={i} className="flex gap-3 text-[15px] text-ink leading-relaxed"><span className="font-mono text-accent">{String(i + 1).padStart(2, '0')}</span><InlineText text={b} /></li>)}
          </ol>
        </div>
      )
    case 'stats': {
      const hero = slide.design?.variant === 'hero-number' || slide.body.stats.length === 1
      const color = slide.design?.emphasis === 'plain' ? 'text-ink' : 'text-accent'
      return (
        <div>
          <H><InlineText text={slide.title} /></H>
          <div className={hero ? '' : 'grid gap-4'} style={hero ? undefined : { gridTemplateColumns: `repeat(${slide.body.stats.length}, minmax(0, 1fr))` }}>
            {slide.body.stats.map((st, i) => (
              <div key={i} className={hero ? '' : 'min-w-0 border-t-2 border-ink pt-2'}>
                <div className={`display font-semibold leading-none ${color} ${hero ? 'text-[56px]' : 'text-[34px]'}`}>{st.value}</div>
                <div className="text-[15px] text-ink mt-2"><InlineText text={st.label} /></div>
                {st.note && <div className="text-[13px] text-ink-secondary mt-1"><InlineText text={st.note} /></div>}
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'quote':
      return (
        <div>
          <H><InlineText text={slide.title} /></H>
          <p className="font-display italic text-[21px] text-ink leading-snug max-w-[50ch]">«<InlineText text={slide.body.quote} />»</p>
          {slide.body.attribution && <p className="text-sm text-accent font-medium mt-3">— {slide.body.attribution}</p>}
        </div>
      )
    case 'image-full':
      return (
        <div>
          <H><InlineText text={slide.title} /></H>
          {imageSlot}
          {slide.body.caption && <p className="text-[15px] text-ink-secondary mt-2"><InlineText text={slide.body.caption} /></p>}
        </div>
      )
    case 'concept':
      return (
        <div>
          <H><InlineText text={slide.title} /></H>
          <p className="font-display text-[17px] text-ink leading-relaxed border-l-2 border-accent pl-3 mb-3 max-w-[60ch]"><InlineText text={slide.body.definition} /></p>
          <ul className="space-y-1.5">{slide.body.supporting.map((s, i) => <Bullet key={i} muted><InlineText text={s} /></Bullet>)}</ul>
        </div>
      )
    case 'formula':
      return (
        <div>
          <H><InlineText text={slide.title} /></H>
          <div className="bg-surface-soft rounded-md py-3 px-4 space-y-3">
            {slide.body.formulas.map((f, i) => (
              <div key={i}>
                <BlockMath latex={f.latex} />
                {f.caption && <div className="text-xs text-ink-secondary text-center mt-1"><InlineText text={f.caption} /></div>}
              </div>
            ))}
          </div>
          {slide.body.explanation && <p className="text-[14px] text-ink-secondary leading-relaxed mt-3 max-w-[60ch]"><InlineText text={slide.body.explanation} /></p>}
        </div>
      )
    case 'comparison':
      return (
        <div>
          <H><InlineText text={slide.title} /></H>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${slide.body.columns.length}, minmax(0, 1fr))` }}>
            {slide.body.columns.map((c, i) => (
              <div key={i} className="min-w-0 border-t-2 border-ink pt-2">
                <div className="eyebrow text-ink mb-2"><InlineText text={c.header} /></div>
                <ul className="space-y-1.5">{c.items.map((it, j) => <Bullet key={j} muted><InlineText text={it} /></Bullet>)}</ul>
              </div>
            ))}
          </div>
        </div>
      )
    case 'diagram':
      return (
        <div>
          <H><InlineText text={slide.title} /></H>
          {imageSlot}
          {slide.body.caption && <p className="text-[15px] text-ink mt-2"><InlineText text={slide.body.caption} /></p>}
          {slide.body.points.length > 0 && <ul className="mt-3 space-y-1.5">{slide.body.points.map((p, i) => <Bullet key={i} muted><InlineText text={p} /></Bullet>)}</ul>}
        </div>
      )
    case 'discussion':
      return (
        <div>
          <H><InlineText text={slide.title} /></H>
          <p className="font-display text-[19px] text-ink leading-snug max-w-[50ch]"><InlineText text={slide.body.question} /></p>
          <ul className="mt-3 space-y-1.5">{slide.body.prompts.map((p, i) => <Bullet key={i} muted><InlineText text={p} /></Bullet>)}</ul>
        </div>
      )
    case 'cta':
      return (
        <div>
          <H><InlineText text={slide.title} /></H>
          <p className="font-display text-[21px] text-ink leading-snug max-w-[50ch]"><InlineText text={slide.body.action} /></p>
          <ul className="mt-3 space-y-1.5">{slide.body.reasons.map((r, i) => <Bullet key={i}><InlineText text={r} /></Bullet>)}</ul>
          {slide.body.contact && <p className="text-sm text-accent mt-4">{slide.body.contact}</p>}
        </div>
      )
    case 'summary':
      return (
        <div>
          <H><InlineText text={slide.title} /></H>
          <ul className="space-y-1.5">{slide.body.takeaways.map((t, i) => <Bullet key={i}><InlineText text={t} /></Bullet>)}</ul>
          {slide.body.next_steps.length > 0 && (
            <ul className="mt-3 pt-3 border-t border-border space-y-1.5">{slide.body.next_steps.map((t, i) => <Bullet key={i} muted><InlineText text={t} /></Bullet>)}</ul>
          )}
        </div>
      )
  }
}
