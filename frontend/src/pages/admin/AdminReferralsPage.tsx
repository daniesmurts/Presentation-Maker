import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { listReferrals } from '../../api/admin'
import { Pill } from '../../components/ui/Field'
import { buttonClass } from '../../components/ui/Button'
import { copy } from '../../lib/copy'
import { fmtDateTime, Table, TH, TD, NUM } from './AdminLayout'

const R = copy.admin.referrals
const TONE = { signed_up: 'plain', paid: 'accent', rewarded: 'ok', capped: 'warn', clawed_back: 'bad' } as const

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="text-xs text-ink-secondary">{label}</div>
      <div className="font-mono tabular-nums text-[22px] leading-tight mt-1 text-ink">{value}</div>
    </div>
  )
}

export default function AdminReferralsPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'referrals', page], queryFn: () => listReferrals(page), placeholderData: keepPreviousData })
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <div className="space-y-6">
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label={R.funnel.invited} value={data.funnel.invited} />
          <Stat label={R.funnel.paid} value={data.funnel.paid} />
          <Stat label={R.funnel.rewarded} value={data.funnel.rewarded} />
          <Stat label={R.funnel.cost} value={data.funnel.reward_days_total} />
        </div>
      )}

      {isLoading && <p className="text-sm text-ink-secondary">…</p>}
      {data && data.rows.length === 0 && <p className="text-sm text-ink-secondary border-t border-border-strong pt-6">{R.empty}</p>}
      {data && data.rows.length > 0 && (
        <Table>
          <thead><tr>
            <th className={TH}>{R.cols.referrer}</th><th className={TH}>{R.cols.referee}</th>
            <th className={TH}>{R.cols.status}</th><th className={`${TH} text-right`}>{R.cols.days}</th><th className={TH}>{R.cols.created}</th>
          </tr></thead>
          <tbody>{data.rows.map((r) => (
            <tr key={r.id}>
              <td className={`${TD} font-mono text-xs`}>{r.referrer_email ?? r.referrer_workspace_id}</td>
              <td className={`${TD} font-mono text-xs`}>{r.referee_email ?? r.referee_workspace_id}</td>
              <td className={TD}><Pill tone={TONE[r.status]}>{R.status[r.status]}</Pill>{r.flagged && <span className="ml-2 text-xs text-danger">⚑</span>}</td>
              <td className={`${TD} ${NUM}`}>{r.reward_days ?? ''}</td>
              <td className={`${TD} font-mono text-xs`}>{fmtDateTime(r.created_at)}</td>
            </tr>
          ))}</tbody>
        </Table>
      )}
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
