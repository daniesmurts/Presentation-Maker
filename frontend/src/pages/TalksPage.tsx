import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Loader2 } from 'lucide-react'
import { listTalks, importPptx } from '../api/talks'
import { errorMessage } from '../api/client'
import Spinner from '../components/ui/Spinner'
import { useToast } from '../lib/toast'
import { copy, INTENT_LABEL, AUDIENCE_LABEL, slidesCount } from '../lib/copy'

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
    <label title={copy.import.hint} className={`h-10 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium border cursor-pointer ${
      busy ? 'opacity-60 cursor-wait' : ''} bg-accent-light text-accent border-transparent hover:bg-accent hover:text-white`}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Upload className="w-4 h-4" aria-hidden />}
      {busy ? copy.import.busy : copy.import.button}
      <input type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" onChange={pick} disabled={busy} />
    </label>
  )
}

export default function TalksPage() {
  const { data, isLoading } = useQuery({ queryKey: ['talks'], queryFn: listTalks })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-ink">{copy.list.heading}</h1>
        <ImportChip />
      </div>
      {isLoading && <Spinner />}
      {data && data.length === 0 && (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <p className="text-sm text-ink-secondary">{copy.list.empty}</p>
          <Link to="/talks/new" className="inline-flex h-10 px-4 items-center mt-4 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-deep">{copy.list.emptyCta}</Link>
        </div>
      )}
      {data && data.length > 0 && (
        <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
          {data.map((t) => (
            <li key={t.id}>
              <Link to={`/talks/${t.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-soft">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink truncate">{t.title}</div>
                  <div className="text-xs text-ink-secondary mt-0.5">
                    {INTENT_LABEL[t.intent]} · {AUDIENCE_LABEL[t.audience]} · {slidesCount(t.slide_count)}
                  </div>
                </div>
                <time dateTime={t.created_at} className="text-xs text-ink-secondary tabular-nums flex-shrink-0">
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
