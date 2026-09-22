import { Link } from 'react-router-dom'
import { useState } from 'react'
import Button from '../ui/Button'
import HelpLink from '../ui/HelpLink'
import { Field, Checkbox, inputClass, proseInputClass } from '../ui/Field'
import { copy, INTENT_LABEL, INTENT_HINT, AUDIENCE_LABEL, slidesCount, minutesCount } from '../../lib/copy'
import {
  INTENTS, AUDIENCES, LENGTH_PRESETS, MIN_SLIDE_COUNT, MAX_SLIDE_COUNT, estimateSlideCount, notesDefaultFor,
  type Intent, type Audience, type TalkLanguage,
} from '../../../../shared/types'
import type { CreateTalkRequest } from '../../api/talks'

const BRIEF_MAX = 50_000   // keep in step with BRIEF_MAX_CHARS (routes/talks.ts)

// Characters of material per slide past which the deck starts skimming.
// Measured, not guessed (backend/scripts/briefSizeEval.ts, 2026-09-22, one
// deck per point — real Russian material, «только по моим материалам»,
// share of the brief's distinctive terms / figures that reached the deck):
//
//   chars per slide   950   1250   1500   2000   3000
//   terms             57%    59%    47%    34%    13%
//   figures           71%    46%    23%    42%    15%
//
// Noisy at one sample apiece, but the direction is not: by 1 500 the
// figures — the facts a listener checks — are mostly gone, and by 3 000 so
// is everything. 1 200 is the last point that still holds. The form SAYS
// so rather than deciding: a long brief can also be background the author
// does not want on the slides.
const CHARS_PER_SLIDE = 1_200

interface Props {
  onSubmit:   (req: CreateTalkRequest) => void
  submitting: boolean
  error?:     string
  /** True when the error came with upgrade:true — the fix is the tariff page, not the form. */
  upgrade?:   boolean
}

export default function TalkForm({ onSubmit, submitting, error, upgrade }: Props) {
  const [title, setTitle]       = useState('')
  const [brief, setBrief]       = useState('')
  const [intent, setIntent]     = useState<Intent>('inform')
  const [audience, setAudience] = useState<Audience>('team')
  const [language, setLanguage] = useState<TalkLanguage>('ru')
  const [minutes, setMinutes]   = useState<number>(15)
  const [slideCount, setSlideCount] = useState<string>('')
  // Notes follow the intent until the user touches the toggle (CLAUDE.md §10).
  const [notesTouched, setNotesTouched] = useState(false)
  const [notes, setNotes]       = useState(notesDefaultFor('inform'))
  const [strict, setStrict]     = useState(false)
  const [review, setReview]     = useState(true)

  function pickIntent(i: Intent) {
    setIntent(i)
    if (!notesTouched) setNotes(notesDefaultFor(i))
  }

  const estimated = slideCount ? Number(slideCount) : estimateSlideCount(minutes)
  const slideCountBad = slideCount !== '' && (!Number.isInteger(Number(slideCount)) || Number(slideCount) < MIN_SLIDE_COUNT || Number(slideCount) > MAX_SLIDE_COUNT)
  const canSubmit = title.trim().length > 0 && !slideCountBad && brief.length <= BRIEF_MAX && !submitting
  // Not an error: a hint under the slide count, where the fix is.
  const suggestedSlides = Math.min(MAX_SLIDE_COUNT, Math.ceil(brief.trim().length / CHARS_PER_SLIDE))
  const briefWantsMore  = brief.trim().length > 0 && suggestedSlides > estimated

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({
      title: title.trim(), brief: brief.trim(), intent, audience, language,
      duration_minutes: minutes,
      ...(slideCount ? { slide_count: Number(slideCount) } : {}),
      notes_enabled: notes, strict_to_brief: strict && brief.trim().length > 0, review_outline: review,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      <Field label={copy.form.title} hint={copy.form.titleHint} htmlFor="title">
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required className={`${proseInputClass} text-[19px]`} autoFocus />
      </Field>

      <Field label={copy.form.brief} hint={copy.form.briefHint} htmlFor="brief">
        <textarea id="brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={8} maxLength={BRIEF_MAX} className={`${proseInputClass} resize-y`} />
        <div className="text-xs text-ink-tertiary text-right font-mono tabular-nums">{brief.length.toLocaleString('ru-RU')} / {BRIEF_MAX.toLocaleString('ru-RU')}</div>
      </Field>

      <fieldset>
        <legend className="block text-sm font-medium text-ink mb-2.5">{copy.form.intent}</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {INTENTS.map((i) => (
            <label key={i} className={`min-h-[44px] px-3 py-2 rounded-md border cursor-pointer transition-colors ${
              intent === i ? 'border-accent bg-accent-light' : 'border-border-strong bg-surface hover:bg-surface-soft'}`}>
              <input type="radio" name="intent" value={i} checked={intent === i} onChange={() => pickIntent(i)} className="sr-only" />
              <span className={`block text-sm font-medium ${intent === i ? 'text-accent' : 'text-ink'}`}>{INTENT_LABEL[i]}</span>
              <span className="block text-xs text-ink-secondary">{INTENT_HINT[i]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={copy.form.audience} htmlFor="audience">
          <select id="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className={`${inputClass} h-10`}>
            {AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
          </select>
        </Field>
        <Field label={copy.form.language} htmlFor="language">
          <select id="language" value={language} onChange={(e) => setLanguage(e.target.value as TalkLanguage)} className={`${inputClass} h-10`}>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </Field>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-ink mb-2.5">{copy.form.length}</legend>
        <div className="flex flex-wrap gap-2">
          {LENGTH_PRESETS.map((p) => (
            <label key={p.id} className={`h-10 px-3 inline-flex items-center rounded-md border text-sm cursor-pointer ${
              minutes === p.minutes && !slideCount ? 'border-accent bg-accent-light text-accent font-medium' : 'border-border-strong bg-surface text-ink hover:bg-surface-soft'}`}>
              <input type="radio" name="length" checked={minutes === p.minutes} onChange={() => { setMinutes(p.minutes); setSlideCount('') }} className="sr-only" />
              {minutesCount(p.minutes)}
            </label>
          ))}
          <label className="h-10 inline-flex items-center gap-2 text-sm text-ink-secondary">
            <span>{copy.form.slideCount}</span>
            <input type="number" inputMode="numeric" min={MIN_SLIDE_COUNT} max={MAX_SLIDE_COUNT} value={slideCount}
                   onChange={(e) => setSlideCount(e.target.value)} aria-label={copy.form.slideCount}
                   className={`${inputClass} w-20 h-10 ${slideCountBad ? 'border-danger' : ''}`} />
          </label>
        </div>
        <p className="text-xs text-ink-secondary mt-2">
          {slideCountBad ? `От ${MIN_SLIDE_COUNT} до ${MAX_SLIDE_COUNT}` : `≈ ${slidesCount(estimated)}`}
        </p>
        {briefWantsMore && !slideCountBad && (
          <p className="text-xs text-ink-secondary mt-1">
            {copy.form.briefLong(suggestedSlides)}{' '}
            <button type="button" className="text-accent hover:text-accent-deep underline underline-offset-2" onClick={() => setSlideCount(String(suggestedSlides))}>
              {copy.form.briefLongAction(suggestedSlides)}
            </button>
          </p>
        )}
      </fieldset>

      <div className="divide-y divide-border border-y border-border">
        <Checkbox checked={notes} onChange={(v) => { setNotes(v); setNotesTouched(true) }} label={copy.form.notes} hint={copy.form.notesHint} />
        <Checkbox checked={strict} onChange={setStrict} label={copy.form.strict} hint={<>{copy.form.strictHint} <HelpLink to="strict" /></>} />
        <Checkbox checked={review} onChange={setReview} label={copy.form.reviewOutline} hint={<>{copy.form.reviewHint} <HelpLink to="outline" /></>} />
      </div>

      {error && (
        <div role="alert" className="px-3 py-2 bg-danger-bg text-danger text-sm rounded-md">
          {error}{upgrade && <> <Link to="/billing" className="font-medium underline underline-offset-2">{copy.billing.upgradeLink}</Link></>}
        </div>
      )}

      <Button type="submit" loading={submitting} disabled={!canSubmit}>{review ? copy.form.submit : copy.form.submitNoGate}</Button>
    </form>
  )
}
