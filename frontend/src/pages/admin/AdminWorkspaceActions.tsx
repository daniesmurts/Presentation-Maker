import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { grantPro, revokeGrant, setSpendCap, deactivateUser, reactivateUser, listActions, GRANT_DAYS, type AdminWorkspaceDetail } from '../../api/admin'
import { errorMessage } from '../../api/client'
import Button from '../../components/ui/Button'
import { inputClass } from '../../components/ui/Field'
import { useToast } from '../../lib/toast'
import { copy } from '../../lib/copy'
import { fmtDateTime, Section, Table, TH, TD } from './AdminLayout'

// The admin's writes on one workspace (TODO M phase 2). Every button needs a
// reason — it is the line that makes «I gave X free Pro» defensible later —
// and every result is a row in the journal below. Explanation sits under
// the control it explains (CLAUDE.md §6).

const D = copy.admin.detail

function Reason({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <label className="block text-xs text-ink-secondary">
      {D.reason}
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={D.reasonPh} className={`${inputClass} mt-1`} maxLength={500} />
    </label>
  )
}

export default function AdminWorkspaceActions({ detail }: { detail: AdminWorkspaceDetail }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const w = detail.workspace
  const [busy, setBusy] = useState(false)
  const [days, setDays] = useState<number>(30)
  const [grantReason, setGrantReason] = useState('')
  const [cap, setCap] = useState(w.monthly_spend_cap_usd == null ? '' : String(w.monthly_spend_cap_usd))
  const [capReason, setCapReason] = useState('')
  const [userReason, setUserReason] = useState<Record<string, string>>({})
  const { data: journal } = useQuery({ queryKey: ['admin', 'actions', w.id], queryFn: () => listActions(w.id) })

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['admin', 'workspace', w.id] }),
    qc.invalidateQueries({ queryKey: ['admin', 'actions', w.id] }),
    qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] }),
  ])
  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try { await fn(); await refresh(); toast(D.done, 'success') } catch (err) { toast(errorMessage(err), 'error') } finally { setBusy(false) }
  }

  const isGrant = w.plan_tier === 'pro' && w.plan_source === 'granted'

  return (
    <>
      <Section title={D.actions}>
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={(e) => { e.preventDefault(); void run(() => grantPro(w.id, days, grantReason).then(() => setGrantReason(''))) }} className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block text-xs text-ink-secondary">
                {D.grant}
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputClass} !w-auto mt-1`}>
                  {GRANT_DAYS.map((d) => <option key={d} value={d}>{D.grantDays(d)}</option>)}
                </select>
              </label>
              <Button type="submit" variant="secondary" disabled={busy || grantReason.trim().length < 3}>{D.grant}</Button>
              {isGrant && <Button type="button" variant="danger" size="sm" disabled={busy || grantReason.trim().length < 3} onClick={() => void run(() => revokeGrant(w.id, grantReason).then(() => setGrantReason('')))}>{D.revoke}</Button>}
            </div>
            <Reason id="grant-reason" value={grantReason} onChange={setGrantReason} />
            <p className="text-xs text-ink-secondary max-w-[60ch]">{D.grantHint}{isGrant ? ` ${D.revokeHint}` : ''}</p>
          </form>

          <form onSubmit={(e) => { e.preventDefault(); void run(() => setSpendCap(w.id, cap.trim() === '' ? null : Number(cap), capReason).then(() => setCapReason(''))) }} className="border border-border rounded-lg p-4 space-y-3">
            <label className="block text-xs text-ink-secondary">
              {D.capLabel}
              <div className="flex gap-2 mt-1">
                <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" className={`${inputClass} !w-32 font-mono`} placeholder="—" />
                <Button type="submit" variant="secondary" disabled={busy || capReason.trim().length < 3}>{D.capSave}</Button>
              </div>
            </label>
            <Reason id="cap-reason" value={capReason} onChange={setCapReason} />
            <p className="text-xs text-ink-secondary max-w-[60ch]">{D.capHint}</p>
          </form>
        </div>

        <ul className="divide-y divide-border border border-border rounded-lg">
          {detail.users.map((u) => {
            const r = userReason[u.id] ?? ''
            const off = !!u.deactivated_at
            return (
              <li key={u.id} className="p-4 flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink">{u.email}{off && <span className="ml-2 text-xs text-danger">{D.deactivated}</span>}{u.is_admin && <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-accent">{D.admin}</span>}</div>
                  {!u.is_admin && <div className="mt-1 max-w-sm"><Reason id={`user-${u.id}`} value={r} onChange={(v) => setUserReason({ ...userReason, [u.id]: v })} /></div>}
                </div>
                {!u.is_admin && (off
                  ? <Button type="button" variant="secondary" size="sm" disabled={busy || r.trim().length < 3} onClick={() => void run(() => reactivateUser(u.id, r))}>{D.reactivate}</Button>
                  : <Button type="button" variant="danger" size="sm" disabled={busy || r.trim().length < 3} onClick={() => void run(() => deactivateUser(u.id, r))}>{D.deactivate}</Button>)}
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title={D.journal}>
        {!journal || journal.length === 0 ? <p className="text-sm text-ink-secondary">{D.journalEmpty}</p> : (
          <Table>
            <thead><tr><th className={TH}>Когда</th><th className={TH}>Кто</th><th className={TH}>Что</th><th className={TH}>{D.reason}</th><th className={TH}>Было → стало</th></tr></thead>
            <tbody>{journal.map((a) => (
              <tr key={a.id}>
                <td className={`${TD} font-mono text-xs whitespace-nowrap`}>{fmtDateTime(a.created_at)}</td>
                <td className={`${TD} text-xs`}>{a.admin_email ?? '—'}</td>
                <td className={`${TD} text-xs`}>{D.actionName[a.action] ?? a.action}{a.target_kind === 'user' && <span className="text-ink-secondary"> · {detail.users.find((u) => u.id === a.target_id)?.email ?? a.target_id}</span>}</td>
                <td className={`${TD} text-xs max-w-xs`}>{a.reason ?? ''}</td>
                <td className={`${TD} font-mono text-[11px] text-ink-secondary break-all max-w-md`}>{JSON.stringify(a.before)} → {JSON.stringify(a.after)}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Section>
    </>
  )
}
