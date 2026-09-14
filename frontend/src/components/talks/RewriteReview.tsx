import { useMemo, useState } from 'react'
import type { Slide, TalkLanguage } from '../../../../shared/types'
import Button from '../ui/Button'
import { slideToText } from './slideText'
import { copy } from '../../lib/copy'

// The diff view for a deck-level rewrite (CLAUDE.md §5.7). Before and after
// side by side, per slide, as the plain text the exporter would write —
// which is what a reader compares, not JSON. Unchanged slides are folded;
// each changed one has an accept box; nothing is written until «Применить».

interface Props {
  current:  Slide[]
  proposal: Slide[]
  language: TalkLanguage
  busy:     boolean
  onApply:  (accept: number[]) => void
  onDismiss: () => void
}

export default function RewriteReview({ current, proposal, language, busy, onApply, onDismiss }: Props) {
  const rows = useMemo(() => current.map((before, i) => {
    const after = proposal[i]
    const a = slideToText(before, i + 1, language), b = after ? slideToText(after, i + 1, language) : a
    return { i, before, after, a, b, changed: Boolean(after) && a !== b }
  }), [current, proposal, language])
  const changed = rows.filter((r) => r.changed)
  const [accept, setAccept] = useState<Set<number>>(() => new Set(changed.map((r) => r.i)))

  return (
    <section className="border-l-2 border-accent pl-5 py-1 space-y-4 appear" aria-labelledby="rw-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="rw-heading" className="display text-[21px] font-medium text-ink">{copy.rewrite.review(current.length, changed.length)}</h2>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAccept(new Set(changed.map((r) => r.i)))}>{copy.rewrite.acceptAll}</Button>
          <Button size="sm" variant="ghost" onClick={() => setAccept(new Set())}>{copy.rewrite.rejectAll}</Button>
        </div>
      </div>

      <ol className="space-y-3">
        {rows.map((r) => r.changed ? (
          <li key={r.i} className="border border-border rounded-md overflow-hidden">
            <label className="flex items-center gap-3 px-3 min-h-[44px] bg-surface-soft cursor-pointer">
              <input type="checkbox" checked={accept.has(r.i)} onChange={(e) => setAccept((s) => { const n = new Set(s); e.target.checked ? n.add(r.i) : n.delete(r.i); return n })} className="w-4 h-4 accent-accent" />
              <span className="font-mono text-xs text-ink-secondary">{String(r.i + 1).padStart(2, '0')}</span><span className="font-display text-[15px] font-medium text-ink">{r.before.title}</span>
            </label>
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="p-3"><div className="eyebrow mb-1.5">{copy.rewrite.before}</div><pre className="whitespace-pre-wrap font-sans text-xs text-ink-secondary leading-relaxed">{r.a}</pre></div>
              <div className="p-3"><div className="eyebrow text-accent mb-1.5">{copy.rewrite.after}</div><pre className="whitespace-pre-wrap font-sans text-xs text-ink leading-relaxed">{r.b}</pre></div>
            </div>
          </li>
        ) : (
          <li key={r.i} className="px-3 py-1.5 text-xs text-ink-tertiary"><span className="font-mono">{String(r.i + 1).padStart(2, '0')}</span> {r.before.title} — {copy.rewrite.unchanged}</li>
        ))}
      </ol>

      <div className="flex items-center gap-2">
        <Button onClick={() => onApply([...accept])} loading={busy} disabled={accept.size === 0}>{copy.rewrite.apply(accept.size)}</Button>
        <Button variant="ghost" onClick={onDismiss} disabled={busy}>{copy.rewrite.dismiss}</Button>
      </div>
    </section>
  )
}
