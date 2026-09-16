import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { listSupport } from '../../api/admin'
import Spinner from '../../components/ui/Spinner'
import { Pill } from '../../components/ui/Field'
import { buttonClass } from '../../components/ui/Button'
import { copy } from '../../lib/copy'
import { fmtDateTime } from './AdminLayout'

const TONE = { general: 'plain', support: 'warn', billing: 'accent' } as const

export default function AdminSupportPage() {
  const S = copy.admin.support
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'support', page], queryFn: () => listSupport(page), placeholderData: keepPreviousData })
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  if (isLoading || !data) return <Spinner />
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-secondary">{data.total} {S.total(data.total)}</p>
      {data.rows.length === 0 && <p className="text-sm text-ink-secondary border-t border-border-strong pt-6">{S.empty}</p>}
      <ul className="border-t border-border-strong">
        {data.rows.map((m) => (
          <li key={m.id} className="border-b border-border py-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Pill tone={TONE[m.category as keyof typeof TONE] ?? 'plain'}>{S.category[m.category] ?? m.category}</Pill>
                <span className="font-medium text-ink">{m.name}</span>
                <span className="text-ink-secondary">{m.email}</span>
                {m.workspace_id && <Link to={`/admin/workspaces/${m.workspace_id}`} className="text-xs">{S.workspace}</Link>}
                <time dateTime={m.created_at} className="font-mono text-xs text-ink-tertiary">{fmtDateTime(m.created_at)}</time>
              </div>
              <p className="text-sm text-ink whitespace-pre-wrap max-w-[70ch]">{m.message}</p>
            </div>
            <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${copy.brand}`)}`} className={`${buttonClass('ghost', 'sm')} self-start`}>{S.reply}</a>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={buttonClass('ghost', 'sm')}>{copy.admin.workspaces.prev}</button>
          <span className="font-mono text-xs text-ink-secondary">{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={buttonClass('ghost', 'sm')}>{copy.admin.workspaces.next}</button>
        </div>
      )}
    </div>
  )
}
