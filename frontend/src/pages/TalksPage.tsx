import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listTalks } from '../api/talks'
import Spinner from '../components/ui/Spinner'
import { copy, INTENT_LABEL, AUDIENCE_LABEL, slidesCount } from '../lib/copy'

export default function TalksPage() {
  const { data, isLoading } = useQuery({ queryKey: ['talks'], queryFn: listTalks })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">{copy.list.heading}</h1>
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
