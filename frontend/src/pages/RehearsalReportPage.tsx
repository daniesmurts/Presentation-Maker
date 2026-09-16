import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mic, Trash2, Sparkles, Undo2 } from 'lucide-react'
import { getTalk, replaceTalkSlides } from '../api/talks'
import { getRehearsal, listRehearsals, reviewRehearsal, applySpokenNotes, deleteRehearsal } from '../api/rehearsals'
import { errorMessage, errorUpgrade } from '../api/client'
import Spinner from '../components/ui/Spinner'
import Button, { buttonClass } from '../components/ui/Button'
import { Pill } from '../components/ui/Field'
import HelpLink from '../components/ui/HelpLink'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { copy, plural } from '../lib/copy'
import { mmss } from '../components/talks/useStageScale'
import type { Rehearsal, RehearsalCoverage, Slide } from '../../../shared/types'

// The report: numbers first (they are free and instant), the review under
// a button (it costs a model pass and is metered on the free tier). Per
// slide: a time bar against the plan, coverage, what was missed and added,
// and «how you said it» with a checkbox — the checked ones replace the
// speaker's text in one write, undoable once.

const TONE: Record<RehearsalCoverage, 'ok' | 'warn' | 'bad' | 'plain'> = { covered: 'ok', partial: 'warn', skipped: 'bad', no_speech: 'plain' }
// Comfortable speaking pace in Russian is ~100–140 wpm; English ~130–160.
// One band for both — the copy says «fast» only past where audiences
// measurably lose the thread.
const PACE = { slow: 90, fast: 160 }

export default function RehearsalReportPage() {
  const { id = '', rid = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { user, refresh } = useAuth()
  const { data: talk } = useQuery({ queryKey: ['talk', id], queryFn: () => getTalk(id) })
  const { data: rehearsal, isLoading } = useQuery({ queryKey: ['rehearsal', id, rid], queryFn: () => getRehearsal(id, rid) })
  const { data: earlier } = useQuery({ queryKey: ['rehearsals', id], queryFn: () => listRehearsals(id) })
  const setRehearsal = (r: Rehearsal) => qc.setQueryData(['rehearsal', id, rid], r)

  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [previous, setPrevious] = useState<Slide[] | null>(null)

  const review = useMutation({
    mutationFn: () => reviewRehearsal(id, rid),
    onSuccess: (r) => { setRehearsal(r); void refresh(); void qc.invalidateQueries({ queryKey: ['rehearsals', id] }) },
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const apply = useMutation({
    mutationFn: () => applySpokenNotes(id, rid, [...chosen]),
    onSuccess: ({ talk: t, before }) => {
      qc.setQueryData(['talk', id], t)
      setPrevious(before ?? null)
      toast(copy.rehearsal.applied(chosen.size), 'success')
      setChosen(new Set())
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const undo = useMutation({
    mutationFn: () => replaceTalkSlides(id, previous!),
    onSuccess: (t) => { qc.setQueryData(['talk', id], t); setPrevious(null); toast(copy.rehearsal.undone) },
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const remove = useMutation({
    mutationFn: () => deleteRehearsal(id, rid),
    onSuccess: () => { toast(copy.rehearsal.deleted); void qc.invalidateQueries({ queryKey: ['rehearsals', id] }); navigate(`/talks/${id}`) },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const transcripts = useMemo(() => {
    const n = talk?.slides?.length ?? 0
    const out = new Array<string>(n).fill('')
    for (const s of rehearsal?.segments ?? []) if (s.slide < n) out[s.slide] += (out[s.slide] ? ' ' : '') + s.text
    return out
  }, [rehearsal, talk])

  if (isLoading || !talk || !rehearsal) return <Spinner />
  const m = rehearsal.metrics
  const slides = talk.slides ?? []
  const r = rehearsal.review
  const reviewsLeft = (() => { const q = user?.quota?.reviews; return q && q.limit != null ? Math.max(0, q.limit - q.used) : Infinity })()
  const pace = m.words_per_min == null ? null : m.words_per_min < PACE.slow ? copy.rehearsal.paceSlow : m.words_per_min > PACE.fast ? copy.rehearsal.paceFast : copy.rehearsal.paceOk
  const overall = m.target_ms ? (m.total_ms > m.target_ms * 1.1 ? 'over' : m.total_ms < m.target_ms * 0.7 ? 'under' : 'ok') : null
  const maxMs = Math.max(1, ...m.slides.map((s) => Math.max(s.ms, s.target_ms ?? 0)))
  const applicable = new Set((r?.slides ?? []).filter((s) => s.spoken_notes.trim()).map((s) => s.slide))
  const toggle = (i: number) => setChosen((c) => { const n = new Set(c); if (n.has(i)) n.delete(i); else n.add(i); return n })

  return (
    <div className="space-y-6 max-w-[880px]">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow text-accent mb-1.5">{copy.rehearsal.of(talk.title)}</div>
          <h1 className="display font-semibold text-[30px] leading-tight text-ink">{copy.rehearsal.report}</h1>
          <p className="text-sm text-ink-secondary mt-1">{new Date(rehearsal.started_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/talks/${id}/rehearse`} className={buttonClass('ghost')}><Mic className="w-4 h-4" aria-hidden /> {copy.rehearsal.again}</Link>
          <Link to={`/talks/${id}`} className={buttonClass('quiet')}>{copy.rehearsal.backToTalk}</Link>
        </div>
      </div>

      {/* Numbers — free, instant. */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label={copy.rehearsal.total} value={mmss(m.total_ms)}
              note={m.target_ms ? `${copy.rehearsal.target} ${mmss(m.target_ms)}${overall === 'over' ? ` · ${copy.rehearsal.overTime}` : overall === 'under' ? ` · ${copy.rehearsal.underTime}` : ''}` : undefined}
              tone={overall === 'over' ? 'bad' : overall === 'under' ? 'warn' : 'plain'} />
        <Stat label={copy.rehearsal.words} value={String(m.words)} />
        <Stat label={copy.rehearsal.wpm} value={m.words_per_min == null ? '—' : String(m.words_per_min)} note={pace ?? undefined} tone={pace === copy.rehearsal.paceOk ? 'ok' : pace ? 'warn' : 'plain'} />
        <Stat label={copy.rehearsal.fillers} value={String(m.fillers)} note={m.filler_examples.length ? m.filler_examples.map((f) => `«${f}»`).join(', ') : undefined} tone={m.fillers > Math.max(5, m.words / 50) ? 'warn' : 'plain'} />
      </dl>
      {!m.target_ms && <p className="text-xs text-ink-secondary">{copy.rehearsal.noTarget}</p>}

      {/* The review — under a button because it costs. */}
      {!r && (
        <div className="rounded-lg bg-accent-light/60 border border-accent/15 p-5">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="font-medium text-ink">{copy.rehearsal.reviewCta}</div>
              <p className="text-sm text-ink-secondary mt-1">{copy.rehearsal.reviewLead} <HelpLink to="rehearsal" /></p>
              {user?.features?.billing && Number.isFinite(reviewsLeft) && <p className="text-xs text-ink-secondary mt-2">{copy.rehearsal.reviewFree(reviewsLeft)}</p>}
              {rehearsal.review_status === 'failed' && !review.isPending && <p className="text-xs text-danger mt-2">{copy.rehearsal.reviewFailed}</p>}
            </div>
            {rehearsal.segments.length > 0 && (
              reviewsLeft > 0 || !user?.features?.billing
                ? <Button onClick={() => review.mutate()} loading={review.isPending}><Sparkles className="w-4 h-4" aria-hidden /> {rehearsal.review_status === 'failed' ? copy.rehearsal.retry : copy.rehearsal.reviewCta}</Button>
                : <Link to="/billing" className={buttonClass('primary')}>{copy.billing.upgradeLink}</Link>
            )}
          </div>
          {review.isPending && <p className="text-sm text-ink-secondary mt-3">{copy.rehearsal.reviewing}</p>}
          {review.isError && errorUpgrade(review.error) && <Link to="/billing" className="text-sm text-accent hover:text-accent-deep underline mt-2 inline-block">{copy.billing.upgradeLink}</Link>}
        </div>
      )}
      {r && (
        <section className="rounded-lg border border-border p-5 space-y-4">
          <div>
            <div className="eyebrow text-ink-secondary mb-1">{copy.rehearsal.summary}</div>
            <p className="text-[15px] leading-relaxed text-ink">{r.summary}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {r.strengths.length > 0 && <List title={copy.rehearsal.strengths} items={r.strengths} />}
            {r.improvements.length > 0 && <List title={copy.rehearsal.improvements} items={r.improvements} />}
          </div>
        </section>
      )}

      {/* Per slide. */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-medium text-ink">{copy.rehearsal.perSlide}</h2>
          {r && applicable.size > 0 && (
            <div className="flex items-center gap-2">
              {previous && <Button variant="quiet" size="sm" onClick={() => undo.mutate()} loading={undo.isPending}><Undo2 className="w-3.5 h-3.5" aria-hidden /> {copy.rehearsal.undo}</Button>}
              <Button variant="secondary" size="sm" disabled={chosen.size === 0} onClick={() => apply.mutate()} loading={apply.isPending}>{copy.rehearsal.applyNotes(chosen.size)}</Button>
            </div>
          )}
        </div>
        {r && applicable.size > 0 && <p className="text-xs text-ink-secondary mb-3">{copy.rehearsal.applyHint}</p>}
        <ol className="divide-y divide-border border-t border-b border-border">
          {slides.map((s, i) => {
            const sm = m.slides[i]
            const sr = r?.slides[i]
            const said = transcripts[i]
            return (
              <li key={i} className="py-3 grid grid-cols-[2rem_1fr] gap-3">
                <div className="font-mono text-xs text-ink-tertiary pt-1 tabular-nums">{i + 1}</div>
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-ink truncate">{s.title}</span>
                    {sr && <Pill tone={TONE[sr.coverage]}>{copy.rehearsal.coverageLabel[sr.coverage]}</Pill>}
                    {sm?.over && <Pill tone="bad">{copy.rehearsal.overTime}</Pill>}
                  </div>
                  {sm && (
                    <div className="flex items-center gap-3 text-xs text-ink-secondary">
                      <div className="flex-1 h-2 rounded bg-surface-soft relative overflow-hidden" title={copy.rehearsal.time}>
                        {sm.target_ms != null && <div className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${(sm.target_ms / maxMs) * 100}%` }} />}
                        <div className={`absolute inset-y-0 left-0 ${sm.over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${(sm.ms / maxMs) * 100}%` }} />
                      </div>
                      <span className="font-mono tabular-nums w-24 text-right">{mmss(sm.ms)}{sm.target_ms != null && <span className="text-ink-tertiary"> / {mmss(sm.target_ms)}</span>}</span>
                    </div>
                  )}
                  {sr && (sr.verdict || sr.missed.length > 0 || sr.added.length > 0) && (
                    <div className="text-sm space-y-1">
                      {sr.verdict && <p className="text-ink">{sr.verdict}</p>}
                      {sr.missed.length > 0 && <p className="text-ink-secondary"><span className="text-warning">{copy.rehearsal.missed}:</span> {sr.missed.join(' · ')}</p>}
                      {sr.added.length > 0 && <p className="text-ink-secondary"><span className="text-accent">{copy.rehearsal.added}:</span> {sr.added.join(' · ')}</p>}
                    </div>
                  )}
                  {sr?.spoken_notes && (
                    <label className="flex gap-3 items-start rounded-md bg-surface-soft p-3 cursor-pointer">
                      <input type="checkbox" className="mt-1 accent-ink" checked={chosen.has(i)} onChange={() => toggle(i)} />
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wider text-ink-secondary mb-1">{copy.rehearsal.spoken}</div>
                        <p className="font-display text-[15px] leading-relaxed text-ink whitespace-pre-line">{sr.spoken_notes}</p>
                      </div>
                    </label>
                  )}
                  {said && !sr?.spoken_notes && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-ink-secondary hover:text-ink">{copy.rehearsal.transcript} · {plural(sm?.words ?? 0, 'слово', 'слова', 'слов')}</summary>
                      <p className="mt-1 text-ink-secondary leading-relaxed">{said}</p>
                    </details>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-medium text-ink mb-2">{copy.rehearsal.earlier}</h2>
          <ul className="text-sm space-y-1">
            {(earlier ?? []).filter((e) => e.id !== rid).map((e) => (
              <li key={e.id}><Link to={`/talks/${id}/rehearsals/${e.id}`} className="text-accent hover:text-accent-deep underline">
                {new Date(e.started_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Link>
                <span className="text-ink-secondary"> · {mmss(e.duration_ms)} · {plural(e.words, 'слово', 'слова', 'слов')}{e.review_status === 'ready' ? ` · ${copy.rehearsal.report.toLowerCase()}` : ''}</span></li>
            ))}
            {(earlier ?? []).filter((e) => e.id !== rid).length === 0 && <li className="text-ink-secondary">{copy.rehearsal.none}</li>}
          </ul>
        </div>
        <Button variant="quiet" size="sm" onClick={() => { if (confirm(copy.rehearsal.delete + '?')) remove.mutate() }} loading={remove.isPending}><Trash2 className="w-3.5 h-3.5" aria-hidden /> {copy.rehearsal.delete}</Button>
      </section>
    </div>
  )
}

function Stat({ label, value, note, tone = 'plain' }: { label: string; value: string; note?: string; tone?: 'plain' | 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'bad' ? 'text-danger' : 'text-ink-secondary'
  return (
    <div className="rounded-lg border border-border p-4">
      <dt className="text-xs text-ink-secondary">{label}</dt>
      <dd className="font-mono text-2xl text-ink tabular-nums mt-1">{value}</dd>
      {note && <dd className={`text-xs mt-1 ${color}`}>{note}</dd>}
    </div>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="eyebrow text-ink-secondary mb-1">{title}</div>
      <ul className="text-sm text-ink space-y-1 list-disc pl-4">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  )
}
