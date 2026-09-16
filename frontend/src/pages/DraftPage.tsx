import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, SendHorizontal, Loader2 } from 'lucide-react'
import { getDraft, sendMessage, saveCard, deleteDraft, collectDraft } from '../api/drafts'
import { errorMessage, errorUpgrade } from '../api/client'
import Spinner from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import { Field, inputClass, proseInputClass } from '../components/ui/Field'
import { useToast } from '../lib/toast'
import { copy, INTENT_LABEL, AUDIENCE_LABEL, minutesCount } from '../lib/copy'
import {
  INTENTS, AUDIENCES, LENGTH_PRESETS, MIN_SLIDE_COUNT, MAX_SLIDE_COUNT, draftMissing,
  type Draft, type DraftCard, type DraftMessage, type Intent, type Audience, type TalkLanguage,
} from '../../../shared/types'

// The draft page («Набросок»): a manuscript like the talk page — the
// conversation in the column, the card in the 280 px margin. The document
// is the scrollport (no inner overflow container: CLAUDE.md §6, sticky
// audit), so the card is sticky to the viewport and the composer to the
// bottom of it. Under lg the card folds into a disclosure under the chat —
// the conversation is what a phone is for; the card is checked at the end.

const CARD_SAVE_DELAY_MS = 800

export default function DraftPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: draft, isLoading } = useQuery({ queryKey: ['draft', id], queryFn: () => getDraft(id) })

  const setDraft = (d: Draft) => qc.setQueryData(['draft', id], d)

  // ── The card: local copy, saved after a pause; the server's copy wins
  //    whenever a reply arrives (it merged the model's changes over ours).
  const [card, setCard] = useState<DraftCard | null>(null)
  const dirty = useRef(false)
  const saveTimer = useRef<number>()
  // Only the first load seeds the card from the row. A save's echo must not
  // overwrite what is being typed (the server drops an empty thesis line —
  // the one the cursor is on), and a reply replaces the card explicitly.
  useEffect(() => { if (draft && card === null) setCard(draft.card) }, [draft, card])

  const save = useMutation({
    mutationFn: (c: DraftCard) => saveCard(id, c),
    onSuccess: (d) => { dirty.current = false; setDraft(d); void qc.invalidateQueries({ queryKey: ['drafts'] }) },
    onError:   (err) => toast(errorMessage(err), 'error'),
  })
  function editCard(patch: Partial<DraftCard>) {
    setCard((c) => {
      if (!c) return c
      const next = { ...c, ...patch }
      dirty.current = true
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => save.mutate(next), CARD_SAVE_DELAY_MS)
      return next
    })
  }
  /** A turn must see the card as edited — flush before sending. */
  async function flushCard() {
    window.clearTimeout(saveTimer.current)
    if (dirty.current && card) await save.mutateAsync(card)
  }

  // ── The conversation.
  const [text, setText] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const send = useMutation({
    mutationFn: async (t: string) => { await flushCard(); return sendMessage(id, t) },
    onMutate:  (t) => { setPending(t); setText('') },
    onSuccess: (d) => { setDraft(d); setCard(d.card); dirty.current = false; void qc.invalidateQueries({ queryKey: ['drafts'] }) },
    onError:   (err, t) => { setText(t); toast(errorMessage(err), 'error') },
    onSettled: () => setPending(null),
  })
  const endRef = useRef<HTMLDivElement>(null)
  // Keyed on the card too: the first render with messages still shows the
  // spinner (the card is seeded one effect later), so the marker does not
  // exist yet. Optional call: jsdom has no scrollIntoView.
  const mounted = card !== null
  useEffect(() => { if (mounted) endRef.current?.scrollIntoView?.({ block: 'end' }) }, [draft?.messages.length, pending, mounted])

  function submit() {
    const t = text.trim()
    if (!t || send.isPending) return
    send.mutate(t)
  }

  const collect = useMutation({
    mutationFn: async () => { await flushCard(); return collectDraft(id) },
    onSuccess: (job) => { void qc.invalidateQueries({ queryKey: ['drafts'] }); navigate(`/jobs/${job.id}`) },
    onError:   (err) => toast(errorMessage(err) + (errorUpgrade(err) ? ` ${copy.billing.upgradeLink}` : ''), 'error'),
  })
  const remove = useMutation({
    mutationFn: () => deleteDraft(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['drafts'] }); navigate('/drafts') },
    onError:   (err) => toast(errorMessage(err), 'error'),
  })

  if (isLoading || !draft || !card) return <Spinner />

  // Rendered twice (the margin ≥ lg, the disclosure below it) — each with
  // its own id prefix so every <label> still points at its own control.
  const cardPanel = (prefix: string) => (
    <CardPanel prefix={prefix} card={card} onEdit={editCard} jobId={draft.job_id}
               onCollect={() => collect.mutate()} collecting={collect.isPending} />
  )

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="eyebrow text-accent mb-1.5">{copy.draft.kind}</div>
          <h1 className={`display font-semibold text-[30px] leading-tight ${card.title ? 'text-ink' : 'text-ink-secondary'}`}>{card.title || copy.draft.untitled}</h1>
        </div>
        <Button variant="quiet" size="icon" aria-label={copy.draft.delete} title={copy.draft.delete}
                onClick={() => { if (window.confirm(copy.draft.deleteConfirm)) remove.mutate() }}>
          <Trash2 className="w-4 h-4" aria-hidden />
        </Button>
      </div>

      <div className="border-t border-border-strong grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-x-8">
        {/* The conversation */}
        <section className="min-w-0 pt-5" aria-label={copy.draft.editor}>
          {draft.messages.length === 0 && !pending && (
            <div className="mb-6">
              <p className="font-display text-[17px] leading-relaxed text-ink max-w-[60ch]">{copy.draft.empty}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {copy.draft.starters.map((s) => (
                  <button key={s.label} type="button" onClick={() => send.mutate(s.text)} disabled={send.isPending}
                          className="h-9 px-3.5 rounded-full border border-border-strong bg-surface text-sm text-ink hover:bg-surface-soft transition-colors">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ol className="space-y-4">
            {draft.messages.map((m, i) => <Message key={i} m={m} />)}
            {pending && <Message m={{ role: 'user', text: pending, at: '' }} />}
            {send.isPending && (
              <li className="flex items-center gap-2 text-sm text-ink-secondary" role="status">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> {copy.draft.thinking}
              </li>
            )}
          </ol>

          {/* The composer stays at the bottom of the viewport; under lg it
              sits above the bottom bar (h-14 + safe area). */}
          <div className="sticky bottom-14 lg:bottom-0 mt-6 pt-3 pb-3 bg-surface">
            <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex items-end gap-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000}
                        placeholder={copy.draft.placeholder} aria-label={copy.draft.placeholder}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
                        className={`${proseInputClass} resize-none max-h-48 min-h-[44px]`} />
              <Button type="submit" size="icon" aria-label={copy.draft.send} title={copy.draft.send}
                      disabled={!text.trim() || send.isPending} loading={send.isPending}>
                {!send.isPending && <SendHorizontal className="w-4 h-4" aria-hidden />}
              </Button>
            </form>
            <p className="text-[11px] text-ink-tertiary mt-1.5 hidden sm:block">{copy.draft.sendHint}</p>
          </div>
          {/* Below the composer, so scrolling to it brings the composer to
              its in-flow place and nothing sits under the sticky strip. As
              tall as the composer's offset above the bottom bar under lg —
              otherwise the strip still lifts 56 px over the last reply. */}
          <div ref={endRef} className="h-14 lg:h-0" aria-hidden />
        </section>

        {/* The card: the margin ≥ lg, a disclosure under the chat below it. */}
        <aside className="hidden lg:block pt-5">
          <div className="sticky top-6 space-y-4">{cardPanel('m')}</div>
        </aside>
        <details className="lg:hidden mt-2 border-t border-border pt-3">
          <summary className="text-sm font-medium text-ink cursor-pointer min-h-[44px] flex items-center">{copy.draft.card}</summary>
          <div className="space-y-4 pt-3">{cardPanel('s')}</div>
        </details>
      </div>
    </div>
  )
}

function Message({ m }: { m: DraftMessage }) {
  const user = m.role === 'user'
  return (
    <li className={`flex ${user ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] lg:max-w-[75%] rounded-lg px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${
        user ? 'bg-accent-light text-ink' : 'bg-surface-soft text-ink font-display'}`}>
        <div className="text-[11px] uppercase tracking-[0.08em] text-ink-secondary mb-1 font-sans">{user ? copy.draft.you : copy.draft.editor}</div>
        {m.text}
      </div>
    </li>
  )
}

// ── The card ────────────────────────────────────────────────────────────────

const selectClass = `${inputClass} h-9 text-sm`
const NONE = ''

function CardPanel({ prefix, card, onEdit, jobId, onCollect, collecting }: {
  prefix: string; card: DraftCard; onEdit: (p: Partial<DraftCard>) => void; jobId: string | null; onCollect: () => void; collecting: boolean
}) {
  const D = copy.draft
  const id = (k: string) => `${prefix}-${k}`
  const missing = draftMissing(card)
  const presetMinutes = LENGTH_PRESETS.some((p) => p.minutes === card.duration_minutes) ? String(card.duration_minutes) : card.duration_minutes == null ? NONE : 'custom'

  return (
    <div className="text-sm">
      <div className="eyebrow text-ink-tertiary mb-1 hidden lg:block">{D.card}</div>
      <p className="text-xs text-ink-secondary mb-4">{D.cardHint}</p>

      <div className="space-y-3.5">
        <Field label={copy.form.title} htmlFor={id("title")}>
          <input id={id("title")} value={card.title} onChange={(e) => onEdit({ title: e.target.value })} maxLength={200} className={`${proseInputClass} text-[15px] py-1.5`} />
        </Field>
        <Field label={copy.form.intent} htmlFor={id("intent")}>
          <select id={id("intent")} value={card.intent ?? NONE} onChange={(e) => onEdit({ intent: (e.target.value || null) as Intent | null })} className={selectClass}>
            <option value={NONE}>{D.lengthAny}</option>
            {INTENTS.map((i) => <option key={i} value={i}>{INTENT_LABEL[i]}</option>)}
          </select>
        </Field>
        <Field label={copy.form.audience} htmlFor={id("audience")}>
          <select id={id("audience")} value={card.audience ?? NONE} onChange={(e) => onEdit({ audience: (e.target.value || null) as Audience | null })} className={selectClass}>
            <option value={NONE}>{D.lengthAny}</option>
            {AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={D.length} htmlFor={id("length")}>
            <select id={id("length")} value={presetMinutes} onChange={(e) => onEdit({ duration_minutes: e.target.value === NONE ? null : Number(e.target.value) })} className={selectClass}>
              <option value={NONE}>{D.lengthAny}</option>
              {LENGTH_PRESETS.map((p) => <option key={p.id} value={p.minutes}>{minutesCount(p.minutes)}</option>)}
              {presetMinutes === 'custom' && <option value="custom">{minutesCount(card.duration_minutes!)}</option>}
            </select>
          </Field>
          <Field label={copy.form.slideCount} htmlFor={id("slides")}>
            <input id={id("slides")} type="number" inputMode="numeric" min={MIN_SLIDE_COUNT} max={MAX_SLIDE_COUNT} value={card.slide_count ?? ''}
                   onChange={(e) => onEdit({ slide_count: e.target.value === '' ? null : Number(e.target.value) })} className={`${inputClass} h-9 text-sm`} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={copy.form.language} htmlFor={id("lang")}>
            <select id={id("lang")} value={card.language} onChange={(e) => onEdit({ language: e.target.value as TalkLanguage })} className={selectClass}>
              <option value="ru">Русский</option><option value="en">English</option>
            </select>
          </Field>
          <Field label={copy.form.notes} htmlFor={id("notes")}>
            <select id={id("notes")} value={card.notes_enabled == null ? NONE : card.notes_enabled ? 'on' : 'off'}
                    onChange={(e) => onEdit({ notes_enabled: e.target.value === NONE ? null : e.target.value === 'on' })} className={selectClass}>
              <option value={NONE}>{D.notesAny}</option><option value="on">{D.notesOn}</option><option value="off">{D.notesOff}</option>
            </select>
          </Field>
        </div>
        <Field label={D.theses} hint={D.thesesHint} htmlFor={id("theses")}>
          <textarea id={id("theses")} value={card.theses.join('\n')} rows={Math.min(14, Math.max(4, card.theses.length + 1))}
                    onChange={(e) => onEdit({ theses: e.target.value.split('\n') })}
                    className={`${proseInputClass} text-[14px] resize-y`} />
        </Field>
        <Field label={D.tone} htmlFor={id("tone")}>
          <input id={id("tone")} value={card.tone} onChange={(e) => onEdit({ tone: e.target.value })} maxLength={300} className={`${inputClass} h-9 text-sm`} />
        </Field>
        {card.open_questions.length > 0 && (
          <div>
            <div className="text-xs font-medium text-ink mb-1">{D.openQuestions}</div>
            <ul className="text-xs text-ink-secondary list-disc pl-4 space-y-0.5">{card.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-border space-y-3">
        <p className={`text-xs ${missing.length ? 'text-ink-secondary' : 'text-success'}`}>
          {missing.length ? D.missing(missing.map((m) => D.missingLabel[m])) : D.ready}
        </p>
        {jobId && (
          <p className="text-xs text-ink-secondary">
            <Link to={`/jobs/${jobId}`} className="text-accent hover:text-accent-deep underline underline-offset-2">{D.collectedLink}</Link>
          </p>
        )}
        <Button onClick={onCollect} disabled={missing.length > 0} loading={collecting} className="w-full">
          {jobId ? D.collectAgain : D.collect}
        </Button>
        <p className="text-xs text-ink-secondary">{D.collectHint}</p>
      </div>
    </div>
  )
}
