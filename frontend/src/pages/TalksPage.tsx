import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Loader2, Presentation, PenLine } from 'lucide-react'
import { listTalks, importPptx, type TalkListItem } from '../api/talks'
import { errorMessage } from '../api/client'
import Spinner from '../components/ui/Spinner'
import { buttonClass } from '../components/ui/Button'
import ReferralBanner from '../components/ReferralBanner'
import { useToast } from '../lib/toast'
import { copy, INTENT_LABEL, AUDIENCE_LABEL } from '../lib/copy'

// The library («Работы»). Editorial rows, not cards: a serif title, one
// line of metadata, the state as a dot with a word — «Готово», «по ссылке»
// — so a talk's condition reads before it is opened. The filter row already
// holds the kinds of material that do not exist yet, dashed and inert.

// «Загрузить .pptx» — the adoption lever (CLAUDE.md §8 step 4). A real
// <label> around the file input so the chip itself is the target.
function ImportChip() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const r = await importPptx(file)
      void qc.invalidateQueries({ queryKey: ['talks'] })
      toast(copy.import.done(r.source_slide_count, r.images_imported), 'success')
      navigate(`/talks/${r.talk.id}`)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <label title={copy.import.hint} className={`${buttonClass('ghost')} ${busy ? 'opacity-60 cursor-wait' : ''}`}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Upload className="w-4 h-4" aria-hidden />}
      {busy ? copy.import.busy : copy.import.button}
      <input type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" onChange={pick} disabled={busy} />
    </label>
  )
}

const CHIP = 'h-8 px-3 inline-flex items-center rounded-full border text-xs whitespace-nowrap'

function Status({ t }: { t: TalkListItem }) {
  const S = copy.list.status
  const parts: string[] = []
  if (t.approved_at) parts.push(S.approved)
  if (t.shared) parts.push(S.shared)
  const ok = parts.length > 0
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${ok ? 'text-success' : 'text-ink-secondary'}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? 'bg-success' : 'bg-ink-tertiary'}`} aria-hidden />
      {ok ? parts.join(' · ') : S.draft}
    </span>
  )
}

export default function TalksPage() {
  const { data, isLoading } = useQuery({ queryKey: ['talks'], queryFn: listTalks })
  const n = data?.length ?? 0

  return (
    <div className="space-y-5">
      <ReferralBanner />
      {/* Heading and actions side by side from sm; on a phone the two chips
          get their own row (side by side they ran off the screen). */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="display font-semibold text-[30px] leading-tight text-ink">{copy.list.heading}</h1>
          <p className="text-sm text-ink-secondary mt-1">{copy.list.lead(n)}</p>
        </div>
        {/* Two ways in, two weights: the editor is the second emphasis on
            this screen (tinted — the rail's «Новое выступление» is the one
            solid CTA); the import is a utility and stays a bordered chip.
            Same size, different ground, so they read as different kinds
            of action rather than as a pair. */}
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          <Link to="/drafts" className={buttonClass('secondary')} title={copy.draft.lead(0)}><PenLine className="w-4 h-4" aria-hidden /> {copy.draft.fromTalks}</Link>
          <ImportChip />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        <span className={`${CHIP} bg-ink text-bg border-transparent`}>{copy.list.filterAll}</span>
        <span className={`${CHIP} text-ink-secondary border-border-strong`}>{copy.nav.talks}</span>
        <span className={`${CHIP} text-ink-tertiary border-dashed border-border-strong`} title={copy.nav.soonHint(copy.nav.posts)}>{copy.nav.posts}</span>
        <span className={`${CHIP} text-ink-tertiary border-dashed border-border-strong`} title={copy.nav.soonHint(copy.nav.ads)}>{copy.nav.ads}</span>
      </div>

      {isLoading && <Spinner />}
      {data && data.length === 0 && (
        <div className="border-t border-border-strong pt-8 text-center">
          <p className="text-sm text-ink-secondary">{copy.list.empty}</p>
          <Link to="/talks/new" className={`${buttonClass('primary')} mt-4`}>{copy.list.emptyCta}</Link>
        </div>
      )}
      {data && data.length > 0 && (
        <ul className="border-t border-border-strong">
          {data.map((t) => (
            <li key={t.id} className="border-b border-border">
              <Link to={`/talks/${t.id}`} className="grid grid-cols-[20px_minmax(0,1fr)] sm:grid-cols-[20px_minmax(0,1fr)_150px_88px] gap-x-4 gap-y-1 items-baseline py-3.5 -mx-2 px-2 rounded-md hover:bg-surface transition-colors">
                <Presentation className="w-4 h-4 text-ink-tertiary self-center" aria-hidden />
                <div className="min-w-0">
                  <div className="display text-[17px] font-medium leading-snug text-ink">{t.title}</div>
                  <div className="text-xs text-ink-secondary mt-0.5">
                    {INTENT_LABEL[t.intent]} · {AUDIENCE_LABEL[t.audience]} · {copy.list.slidesShort(t.slide_count)}
                    {t.notes_enabled ? ` · ${copy.list.status.withNotes}` : ''}
                    {t.language === 'en' ? ' · EN' : ''}
                  </div>
                </div>
                <div className="col-start-2 sm:col-start-3"><Status t={t} /></div>
                <time dateTime={t.created_at} className="hidden sm:block text-xs text-ink-secondary tabular-nums text-right">
                  {new Date(t.created_at).toLocaleDateString('ru-RU')}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
