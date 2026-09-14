import { useState } from 'react'
import { ArrowUp, ArrowDown, Plus, X } from 'lucide-react'
import Button from '../ui/Button'
import { inputClass } from '../ui/Field'
import { copy, SLIDE_TYPE_LABEL, slidesCount } from '../../lib/copy'
import { MAX_SLIDE_COUNT, SLIDE_TYPES, type OutlineSlide, type SlideType } from '../../../../shared/types'

// The approval gate. The outline pass costs one call and lands in seconds;
// expansion costs ~one call per five slides. This is the seam between them:
// the user sees the plan while it is still cheap to change, and «Написать
// слайды» is what spends the rest. Structure only — title, type, order,
// which slides exist. A body editor here would ask the user to write the
// deck themselves, which is the opposite of the point.

const BLANK: OutlineSlide = { type: 'bullets', title: '', brief: '' }

interface Props {
  outline:    OutlineSlide[]
  onConfirm:  (outline: OutlineSlide[]) => void
  onCancel:   () => void
  confirming: boolean
  error?:     string
}

export default function OutlineEditor({ outline, onConfirm, onCancel, confirming, error }: Props) {
  const [rows, setRows] = useState<OutlineSlide[]>(outline)

  const update = (i: number, patch: Partial<OutlineSlide>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  const remove = (i: number) => setRows((r) => r.filter((_, j) => j !== i))
  // Swap, not splice — the moved row trades places with its neighbour and
  // nothing else shifts, which is what the eye expects from ↑/↓.
  const move = (i: number, delta: number) => setRows((r) => {
    const j = i + delta
    if (j < 0 || j >= r.length) return r
    const next = [...r]; [next[i], next[j]] = [next[j], next[i]]; return next
  })
  const insertAfter = (i: number) => setRows((r) => [...r.slice(0, i + 1), { ...BLANK }, ...r.slice(i + 1)])

  const usable = rows.filter((r) => r.title.trim().length > 0)
  const full = rows.length >= MAX_SLIDE_COUNT

  return (
    <section className="space-y-5 appear max-w-3xl" aria-labelledby="outline-heading">
      <div>
        <div className="eyebrow text-accent mb-1.5">{copy.talk.kind}</div>
        <h2 id="outline-heading" className="display font-semibold text-[30px] leading-tight text-ink">{copy.outline.heading}</h2>
        <p className="text-sm text-ink-secondary mt-1 max-w-[62ch]">{copy.outline.lead}</p>
      </div>

      <ol className="border-t border-border-strong">
        {rows.map((row, i) => (
          <li key={i} className="grid grid-cols-[36px_1fr] sm:grid-cols-[36px_140px_1fr_auto] gap-2 items-start py-3 border-b border-border">
            <div className="font-mono text-sm text-ink-secondary pt-2 tabular-nums">{String(i + 1).padStart(2, '0')}</div>
            <select value={row.type} onChange={(e) => update(i, { type: e.target.value as SlideType })} aria-label={`Тип слайда ${i + 1}`}
                    className={`${inputClass} h-9 py-0 sm:col-start-2`}>
              {SLIDE_TYPES.map((t) => <option key={t} value={t}>{SLIDE_TYPE_LABEL[t]}</option>)}
            </select>
            <div className="space-y-1.5 col-start-2 sm:col-start-3">
              <input value={row.title} onChange={(e) => update(i, { title: e.target.value })} placeholder={copy.outline.titlePh}
                     aria-label={`Заголовок слайда ${i + 1}`} maxLength={200} className={`${inputClass} font-display text-[16px]`} />
              <textarea value={row.brief} onChange={(e) => update(i, { brief: e.target.value })} placeholder={copy.outline.briefPh}
                        aria-label={`Описание слайда ${i + 1}`} rows={2} maxLength={600} className={`${inputClass} text-xs text-ink-secondary resize-y`} />
            </div>
            <div className="flex items-center gap-0.5 col-start-2 sm:col-start-4 sm:pt-0.5">
              <IconButton label={copy.outline.up}     disabled={i === 0}               onClick={() => move(i, -1)}><ArrowUp className="w-4 h-4" /></IconButton>
              <IconButton label={copy.outline.down}   disabled={i === rows.length - 1} onClick={() => move(i, +1)}><ArrowDown className="w-4 h-4" /></IconButton>
              <IconButton label={copy.outline.insert} disabled={full}                  onClick={() => insertAfter(i)}><Plus className="w-4 h-4" /></IconButton>
              <IconButton label={copy.outline.remove} danger                            onClick={() => remove(i)}><X className="w-4 h-4" /></IconButton>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-ink-secondary">{copy.outline.empty}</li>}
      </ol>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => setRows((r) => [...r, { ...BLANK }])} disabled={full}>
          <Plus className="w-3.5 h-3.5" aria-hidden /> {copy.outline.add}
        </Button>
        <div className="text-xs text-ink-secondary">
          {slidesCount(usable.length)}{usable.length !== rows.length && ` · ${copy.outline.noTitle(rows.length - usable.length)}`}
        </div>
      </div>

      {error && <div role="alert" className="px-3 py-2 bg-danger-bg text-danger text-sm rounded-md">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => onConfirm(usable)} loading={confirming} disabled={usable.length === 0 || confirming}>{copy.outline.confirm}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={confirming}>{copy.outline.cancel}</Button>
        {confirming && <span className="text-xs text-ink-secondary">{copy.outline.writing}</span>}
      </div>
    </section>
  )
}

function IconButton({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-md border border-transparent transition-colors disabled:opacity-30 disabled:cursor-default ${
        danger ? 'text-ink-secondary hover:text-danger hover:bg-danger-bg' : 'text-ink-secondary hover:text-ink hover:bg-surface-soft'}`}>
      {children}
    </button>
  )
}
