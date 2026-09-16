import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { PenLine, Plus } from 'lucide-react'
import { listDrafts, createDraft } from '../api/drafts'
import { errorMessage } from '../api/client'
import Spinner from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import { useToast } from '../lib/toast'
import { copy } from '../lib/copy'

// The sketches («Наброски»): the same editorial rows as the talks list. A
// draft's condition is how far the conversation went and whether it was
// collected into a talk.

export default function DraftsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['drafts'], queryFn: listDrafts })
  const create = useMutation({
    mutationFn: () => createDraft(),
    onSuccess: (d) => navigate(`/drafts/${d.id}`),
    onError:   (err) => toast(errorMessage(err), 'error'),
  })
  const n = data?.length ?? 0

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow text-accent mb-1.5">{copy.nav.works}</div>
          <h1 className="display font-semibold text-[30px] leading-tight text-ink">{copy.draft.heading}</h1>
          <p className="text-sm text-ink-secondary mt-1">{copy.draft.lead(n)}</p>
        </div>
        {n > 0 && <Button onClick={() => create.mutate()} loading={create.isPending}><Plus className="w-4 h-4" aria-hidden /> {copy.draft.newDraft}</Button>}
      </div>

      {isLoading && <Spinner />}
      {data && data.length === 0 && (
        <div className="border-t border-border-strong pt-8 text-center">
          <p className="text-sm text-ink-secondary max-w-[52ch] mx-auto">{copy.draft.empty}</p>
          <Button className="mt-4" onClick={() => create.mutate()} loading={create.isPending}>{copy.draft.emptyCta}</Button>
        </div>
      )}
      {data && data.length > 0 && (
        <ul className="border-t border-border-strong">
          {data.map((d) => (
            <li key={d.id} className="border-b border-border">
              <Link to={`/drafts/${d.id}`} className="grid grid-cols-[20px_minmax(0,1fr)] sm:grid-cols-[20px_minmax(0,1fr)_88px] gap-x-4 gap-y-1 items-baseline py-3.5 -mx-2 px-2 rounded-md hover:bg-surface transition-colors">
                <PenLine className="w-4 h-4 text-ink-tertiary self-center" aria-hidden />
                <div className="min-w-0">
                  <div className={`display text-[17px] font-medium leading-snug ${d.title ? 'text-ink' : 'text-ink-secondary'}`}>{d.title || copy.draft.untitled}</div>
                  <div className="text-xs text-ink-secondary mt-0.5">
                    {copy.draft.messages(d.message_count)}
                    {d.job_id && <> · <span className="text-success">{copy.draft.collected}</span></>}
                  </div>
                </div>
                <time dateTime={d.updated_at} className="hidden sm:block text-xs text-ink-secondary tabular-nums text-right">
                  {new Date(d.updated_at).toLocaleDateString('ru-RU')}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
