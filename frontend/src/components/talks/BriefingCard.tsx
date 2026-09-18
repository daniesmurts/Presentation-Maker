import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Download, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { makeBriefing, briefingPdfUrl } from '../../api/talks'
import { errorMessage } from '../../api/client'
import Button, { buttonClass } from '../ui/Button'
import { useToast } from '../../lib/toast'
import { copy } from '../../lib/copy'
import type { Talk } from '../../../../shared/types'

// The briefing on screen (TODO O4) — the same content as the PDF, so what
// gets screenshotted and what gets printed are one thing. Collapsed by
// default once it exists: the slides are the page; this is the thing you
// take with you.

export default function BriefingCard({ talk }: { talk: Talk }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const B = copy.briefing
  const b = talk.briefing
  const [open, setOpen] = useState(!b)
  const make = useMutation({
    mutationFn: () => makeBriefing(talk.id),
    onSuccess: (t) => { qc.setQueryData(['talk', talk.id], t); setOpen(true) },
    onError:   (err) => toast(errorMessage(err), 'error'),
  })
  const stale = b && new Date(b.generated_at) < new Date(talk.updated_at)

  return (
    <section className="bg-surface border border-border rounded-lg">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink flex items-center gap-2"><FileText className="w-4 h-4 text-accent" aria-hidden /> {B.title}</div>
          {!b && <p className="text-xs text-ink-secondary mt-0.5 max-w-[70ch]">{B.lead}</p>}
          {b && <p className="text-xs text-ink-secondary mt-0.5">{B.remakeHint} {new Date(b.generated_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{stale ? ' — слайды с тех пор менялись' : ''}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {b && <a href={briefingPdfUrl(talk.id)} target="_blank" rel="noopener" className={buttonClass('secondary', 'sm')}><Download className="w-3.5 h-3.5" aria-hidden /> {B.pdf}</a>}
          {b
            ? <Button size="sm" variant="quiet" onClick={() => make.mutate()} loading={make.isPending} title={B.remake}><RefreshCw className="w-3.5 h-3.5" aria-hidden /> <span className="hidden sm:inline">{B.remake}</span></Button>
            : <Button size="sm" onClick={() => make.mutate()} loading={make.isPending}>{B.make}</Button>}
          {b && <Button size="sm" variant="quiet" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? <ChevronUp className="w-4 h-4" aria-hidden /> : <ChevronDown className="w-4 h-4" aria-hidden />}<span className="sr-only">{open ? B.close : B.open}</span></Button>}
        </div>
      </div>
      {make.isPending && <p className="px-4 pb-3 text-sm text-ink-secondary">{B.making}</p>}
      {b && open && (
        <div className="border-t border-border px-4 py-4 grid lg:grid-cols-[minmax(0,1fr)_260px] gap-x-8 gap-y-5">
          <div className="space-y-5">
            <div>
              <div className="eyebrow text-accent mb-2">{B.gist}</div>
              <ol className="space-y-2">
                {b.gist.map((g, i) => (
                  <li key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
                    <span className="font-mono text-xs text-ink-tertiary pt-1">{String(i + 1).padStart(2, '0')}</span>
                    <span className="font-display text-[16px] leading-relaxed text-ink">{g}</span>
                  </li>
                ))}
              </ol>
            </div>
            {b.ask && (
              <div>
                <div className="eyebrow text-accent mb-2">{B.ask}</div>
                <p className="font-display text-[16px] leading-relaxed text-ink border border-accent/40 rounded-md px-4 py-3">{b.ask}</p>
              </div>
            )}
            {b.question.q && (
              <div>
                <div className="eyebrow text-accent mb-2">{B.question}</div>
                <p className="font-display italic text-[16px] leading-relaxed text-ink">{b.question.q}</p>
                {b.question.a && <p className="text-sm leading-relaxed text-ink mt-2"><span className="text-ink-secondary">{B.answer}:</span> {b.question.a}</p>}
              </div>
            )}
            {b.opener && (
              <div>
                <div className="eyebrow text-accent mb-2">{B.opener}</div>
                <p className="font-display text-[16px] leading-relaxed text-ink">«{b.opener}»</p>
              </div>
            )}
          </div>
          {b.numbers.length > 0 && (
            <aside>
              <div className="eyebrow text-accent mb-2">{B.numbers}</div>
              <dl className="space-y-3">
                {b.numbers.map((n, i) => (
                  <div key={i} className="border-t border-border pt-2">
                    <dd className="font-display font-semibold text-[26px] leading-tight text-ink">{n.value}</dd>
                    <dt className="text-xs text-ink-secondary mt-0.5">{n.label}</dt>
                  </div>
                ))}
              </dl>
            </aside>
          )}
        </div>
      )}
    </section>
  )
}
