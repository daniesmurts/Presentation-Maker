import { useState, type ReactNode } from 'react'
import Button from '../ui/Button'
import { inputClass } from '../ui/Field'
import { copy } from '../../lib/copy'
import type {
  Slide, TitleSlide, BulletsSlide, ConceptSlide, FormulaSlide, ComparisonSlide, DiagramSlide, DiscussionSlide, CtaSlide, SummarySlide,
} from '../../../../shared/types'

// In-place slide editing. One form per slide type rather than a shape-driven
// generic editor: the bodies are a discriminated union, and a generic editor
// would have to widen them to `unknown` — losing exactly the type safety
// that keeps a hand-edited slide renderable by the viewer and the exporter.
// String arrays edit as one-item-per-line text: people reorder and add
// bullets far more than they edit one in place.

const F = copy.talk.edit.fields

function linesToArray(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="block text-xs font-medium text-ink-secondary mb-1">{label}</span>{children}</label>
}
const Text  = ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
  <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
const Area  = ({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }) =>
  <textarea className={`${inputClass} resize-y`} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
const Lines = ({ value, onChange, rows = 4 }: { value: string[]; onChange: (v: string[]) => void; rows?: number }) =>
  <textarea className={`${inputClass} resize-y`} rows={rows} value={value.join('\n')} onChange={(e) => onChange(linesToArray(e.target.value))} placeholder={F.perLine} />

interface Props {
  slide:        Slide
  notesEnabled: boolean
  saving:       boolean
  onSave:       (slide: Slide) => void
  onCancel:     () => void
}

export default function SlideEditor({ slide, notesEnabled, saving, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Slide>(slide)
  // Body patches are per-type, so the cast is contained here.
  function patch<T extends Slide>(p: Partial<T['body']>) {
    setDraft((d) => ({ ...d, body: { ...d.body, ...p } }) as Slide)
  }

  return (
    <div className="p-4 space-y-3 bg-surface-soft border-b border-border">
      <Row label={F.title}><Text value={draft.title} onChange={(title) => setDraft((d) => ({ ...d, title }))} /></Row>
      {bodyFields(draft, patch)}
      {notesEnabled && <Row label={F.notes}><Area rows={6} value={draft.notes} onChange={(notes) => setDraft((d) => ({ ...d, notes }))} /></Row>}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={() => onSave(draft)} loading={saving}>{copy.talk.edit.save}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>{copy.talk.edit.cancel}</Button>
      </div>
    </div>
  )
}

function bodyFields(draft: Slide, patch: <T extends Slide>(p: Partial<T['body']>) => void): ReactNode {
  switch (draft.type) {
    case 'title': {
      const b = (draft as TitleSlide).body
      return <>
        <Row label={F.subtitle}><Text value={b.subtitle ?? ''} onChange={(subtitle) => patch<TitleSlide>({ subtitle: subtitle || null })} /></Row>
        <Row label={F.presenter}><Text value={b.presenter ?? ''} onChange={(presenter) => patch<TitleSlide>({ presenter: presenter || null })} /></Row>
      </>
    }
    case 'bullets': {
      const b = (draft as BulletsSlide).body
      return <Row label={F.items}><Lines value={b.items} onChange={(items) => patch<BulletsSlide>({ items })} /></Row>
    }
    case 'concept': {
      const b = (draft as ConceptSlide).body
      return <>
        <Row label={F.definition}><Area value={b.definition} onChange={(definition) => patch<ConceptSlide>({ definition })} /></Row>
        <Row label={F.supporting}><Lines value={b.supporting} onChange={(supporting) => patch<ConceptSlide>({ supporting })} /></Row>
      </>
    }
    case 'formula': {
      const b = (draft as FormulaSlide).body
      const set = (i: number, p: Partial<{ latex: string; caption: string }>) =>
        patch<FormulaSlide>({ formulas: b.formulas.map((x, j) => (j === i ? { ...x, ...p } : x)) })
      return <>
        {b.formulas.map((f, i) => (
          <div key={i} className="grid sm:grid-cols-2 gap-2">
            <Row label={F.formula(i + 1)}><Text value={f.latex} onChange={(latex) => set(i, { latex })} /></Row>
            <Row label={F.caption}><Text value={f.caption} onChange={(caption) => set(i, { caption })} /></Row>
          </div>
        ))}
        {/* Blank writes back null: the renderer tests this field for presence. */}
        <Row label={F.explanation}><Area value={b.explanation ?? ''} onChange={(e) => patch<FormulaSlide>({ explanation: e.trim() || null })} /></Row>
      </>
    }
    case 'comparison': {
      const b = (draft as ComparisonSlide).body
      const set = (i: number, p: Partial<{ header: string; items: string[] }>) =>
        patch<ComparisonSlide>({ columns: b.columns.map((x, j) => (j === i ? { ...x, ...p } : x)) })
      return <div className="grid sm:grid-cols-2 gap-3">
        {b.columns.map((c, i) => (
          <div key={i} className="space-y-2">
            <Row label={F.column(i + 1)}><Text value={c.header} onChange={(header) => set(i, { header })} /></Row>
            <Row label={F.columnItems}><Lines value={c.items} onChange={(items) => set(i, { items })} /></Row>
          </div>
        ))}
      </div>
    }
    case 'diagram': {
      const b = (draft as DiagramSlide).body
      return <>
        <Row label={F.diagramCaption}><Text value={b.caption} onChange={(caption) => patch<DiagramSlide>({ caption })} /></Row>
        <Row label={F.points}><Lines rows={3} value={b.points} onChange={(points) => patch<DiagramSlide>({ points })} /></Row>
        <Row label={F.imageQuery}><Text value={b.image_query} onChange={(image_query) => patch<DiagramSlide>({ image_query })} /></Row>
      </>
    }
    case 'discussion': {
      const b = (draft as DiscussionSlide).body
      return <>
        <Row label={F.question}><Area rows={2} value={b.question} onChange={(question) => patch<DiscussionSlide>({ question })} /></Row>
        <Row label={F.prompts}><Lines rows={3} value={b.prompts} onChange={(prompts) => patch<DiscussionSlide>({ prompts })} /></Row>
        <Row label={F.angles}><Lines rows={3} value={b.expected_angles} onChange={(expected_angles) => patch<DiscussionSlide>({ expected_angles })} /></Row>
      </>
    }
    case 'cta': {
      const b = (draft as CtaSlide).body
      return <>
        <Row label={F.action}><Area rows={2} value={b.action} onChange={(action) => patch<CtaSlide>({ action })} /></Row>
        <Row label={F.reasons}><Lines rows={3} value={b.reasons} onChange={(reasons) => patch<CtaSlide>({ reasons })} /></Row>
        <Row label={F.contact}><Text value={b.contact ?? ''} onChange={(contact) => patch<CtaSlide>({ contact: contact.trim() || null })} /></Row>
      </>
    }
    case 'summary': {
      const b = (draft as SummarySlide).body
      return <>
        <Row label={F.takeaways}><Lines value={b.takeaways} onChange={(takeaways) => patch<SummarySlide>({ takeaways })} /></Row>
        <Row label={F.nextSteps}><Lines rows={3} value={b.next_steps} onChange={(next_steps) => patch<SummarySlide>({ next_steps })} /></Row>
      </>
    }
  }
}
