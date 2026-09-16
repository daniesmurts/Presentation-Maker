import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { listWorkspaces, type WorkspaceSort } from '../../api/admin'
import Spinner from '../../components/ui/Spinner'
import { inputClass, Pill } from '../../components/ui/Field'
import { buttonClass } from '../../components/ui/Button'
import { copy } from '../../lib/copy'
import { fmtDate, fmtUsd, Table, TH, TD, NUM } from './AdminLayout'

const CHIP = 'h-8 px-3 inline-flex items-center rounded-full border text-xs whitespace-nowrap transition-colors'
const chip = (on: boolean) => `${CHIP} ${on ? 'bg-ink text-bg border-transparent' : 'text-ink-secondary border-border-strong hover:text-ink'}`

export default function AdminWorkspacesPage() {
  const W = copy.admin.workspaces
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const tier = (params.get('tier') === 'free' || params.get('tier') === 'pro' ? params.get('tier') : undefined) as 'free' | 'pro' | undefined
  const sort = (params.get('sort') ?? 'created') as WorkspaceSort
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [draft, setDraft] = useState(q)

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'workspaces', { q, tier, sort, page }],
    queryFn: () => listWorkspaces({ q: q || undefined, tier, sort, page }),
    placeholderData: keepPreviousData,
  })
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); set({ q: draft.trim() || undefined }) }} className="flex flex-wrap gap-2 items-center">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={W.search} className={`${inputClass} max-w-xs`} aria-label={W.search} />
        <div className="flex gap-2">
          <button type="button" className={chip(!tier)} onClick={() => set({ tier: undefined })}>{W.tierAll}</button>
          <button type="button" className={chip(tier === 'free')} onClick={() => set({ tier: 'free' })}>{W.tierFree}</button>
          <button type="button" className={chip(tier === 'pro')} onClick={() => set({ tier: 'pro' })}>{W.tierPro}</button>
        </div>
        <select value={sort} onChange={(e) => set({ sort: e.target.value })} className={`${inputClass} !w-auto`} aria-label="Сортировка">
          {(Object.keys(W.sort) as WorkspaceSort[]).map((k) => <option key={k} value={k}>{W.sort[k]}</option>)}
        </select>
        {data && <span className="text-xs text-ink-secondary ml-auto">{data.total} {W.total(data.total)}</span>}
      </form>

      {isLoading && <Spinner />}
      {data && data.rows.length === 0 && <p className="text-sm text-ink-secondary border-t border-border-strong pt-6">{W.empty}</p>}
      {data && data.rows.length > 0 && (
        <Table>
          <thead><tr>
            <th className={TH}>{W.cols.name}</th><th className={TH}>{W.cols.tier}</th>
            <th className={`${TH} text-right`}>{W.cols.talks}</th><th className={`${TH} text-right`}>{W.cols.spend}</th>
            <th className={TH}>{W.cols.active}</th><th className={TH}>{W.cols.created}</th>
          </tr></thead>
          <tbody>
            {data.rows.map((w) => (
              <tr key={w.id} className="hover:bg-surface-soft/60">
                <td className={TD}>
                  <Link to={`/admin/workspaces/${w.id}`} className="text-ink hover:text-accent no-underline">
                    <div className="font-medium">{w.owner_email ?? w.name}</div>
                    <div className="text-xs text-ink-secondary">{w.owner_name || w.name}{w.users > 1 ? ` · ${w.users}` : ''}</div>
                  </Link>
                </td>
                <td className={TD}>
                  <Pill tone={w.plan_tier === 'pro' ? 'accent' : 'plain'}>{w.plan_tier === 'pro' ? 'Pro' : 'Free'}</Pill>
                  {w.plan_tier === 'pro' && w.plan_expires_at && <div className="text-xs text-ink-secondary mt-1 font-mono">{fmtDate(w.plan_expires_at)}{w.auto_renew ? '' : ` · ${W.noRenew}`}</div>}
                </td>
                <td className={`${TD} ${NUM}`}>{w.talks}</td>
                <td className={`${TD} ${NUM}`}>{fmtUsd(w.spend_month_usd)}</td>
                <td className={`${TD} font-mono text-xs`}>{fmtDate(w.last_active_at, W.never)}</td>
                <td className={`${TD} font-mono text-xs`}>{fmtDate(w.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} className={buttonClass('ghost', 'sm')}>{W.prev}</button>
          <span className="font-mono text-xs text-ink-secondary">{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} className={buttonClass('ghost', 'sm')}>{W.next}</button>
        </div>
      )}
    </div>
  )
}
