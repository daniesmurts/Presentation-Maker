import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { listSupport, setSupportAnswered } from '../../api/admin'
import { errorMessage } from '../../api/client'
import { useToast } from '../../lib/toast'
import Spinner from '../../components/ui/Spinner'
import { Pill } from '../../components/ui/Field'
import { buttonClass } from '../../components/ui/Button'
import { copy } from '../../lib/copy'
import { fmtDateTime } from './AdminLayout'

const TONE = { general: 'plain', support: 'warn', billing: 'accent' } as const
const CHIP = 'h-8 px-3 inline-flex items-center rounded-full border text-xs whitespace-nowrap transition-colors'
const chip = (on: boolean) => `${CHIP} ${on ? 'bg-ink text-bg border-transparent' : 'text-ink-secondary border-border-strong hover:text-ink'}`

export default function AdminSupportPage() {
  const S = copy.admin.support
  const qc = useQueryClient()
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(true)
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'support', page, open], queryFn: () => listSupport(page, open), placeholderData: keepPreviousData })
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  async function mark(id: string, answered: boolean) {
    try {
      await setSupportAnswered(id, answered)
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'support'] }), qc.invalidateQueries({ queryKey: ['admin', 'overview'] })])
    } catch (err) { toast(errorMessage(err), 'error') }
  }

  if (isLoading || !data) return <Spinner />
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" className={chip(open)} onClick={() => { setOpen(true); setPage(1) }}>{S.open}</button>
        <button type="button" className={chip(!open)} onClick={() => { setOpen(false); setPage(1) }}>{S.all}</button>
        <span className="text-xs text-ink-secondary ml-auto">{data.total} {S.total(data.total)}</span>
      </div>
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
                {m.answered_at && <span className="text-xs text-success">{S.answeredBy(m.answered_by_email ?? '—')} · {fmtDateTime(m.answered_at)}</span>}
              </div>
              <p className={`text-sm whitespace-pre-wrap max-w-[70ch] ${m.answered_at ? 'text-ink-secondary' : 'text-ink'}`}>{m.message}</p>
            </div>
            <div className="flex gap-2 self-start">
              <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${copy.brand}`)}`} className={buttonClass('ghost', 'sm')}>{S.reply}</a>
              {m.answered_at
                ? <button type="button" className={buttonClass('quiet', 'sm')} onClick={() => void mark(m.id, false)}>{S.reopen}</button>
                : <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void mark(m.id, true)}>{S.markAnswered}</button>}
            </div>
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
