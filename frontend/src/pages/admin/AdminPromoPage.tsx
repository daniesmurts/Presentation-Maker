import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listPromoCodes, createPromoCode, setPromoCodeActive } from '../../api/admin'
import { errorMessage } from '../../api/client'
import Button from '../../components/ui/Button'
import { inputClass, Pill } from '../../components/ui/Field'
import { useToast } from '../../lib/toast'
import { copy } from '../../lib/copy'
import { fmtDate, Table, TH, TD } from './AdminLayout'

const P = copy.admin.promo
const KINDS = ['percent', 'fixed', 'free_months'] as const

export default function AdminPromoPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'promo-codes'], queryFn: listPromoCodes })
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<typeof KINDS[number]>('percent')
  const [value, setValue] = useState('20')
  const [maxUses, setMaxUses] = useState('')
  const [validUntil, setValidUntil] = useState('')

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await createPromoCode({ code, kind, value: Number(value), max_uses: maxUses.trim() ? Number(maxUses) : null, valid_until: validUntil || null })
      await qc.invalidateQueries({ queryKey: ['admin', 'promo-codes'] })
      setCode(''); setValue(kind === 'percent' ? '20' : ''); setMaxUses(''); setValidUntil('')
      toast(P.done, 'success')
    } catch (err) { toast(errorMessage(err), 'error') } finally { setBusy(false) }
  }
  async function toggle(id: string, active: boolean) {
    try {
      await setPromoCodeActive(id, active)
      await qc.invalidateQueries({ queryKey: ['admin', 'promo-codes'] })
    } catch (err) { toast(errorMessage(err), 'error') }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
        <label className="block text-xs text-ink-secondary">
          {P.code}
          <input value={code} onChange={(e) => setCode(e.target.value)} required maxLength={32} placeholder="WELCOME20" className={`${inputClass} mt-1 !w-40 font-mono uppercase`} />
        </label>
        <label className="block text-xs text-ink-secondary">
          {P.kind}
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={`${inputClass} mt-1 !w-auto`}>
            {KINDS.map((k) => <option key={k} value={k}>{P.kindLabel[k]}</option>)}
          </select>
        </label>
        <label className="block text-xs text-ink-secondary">
          {P.kindOpt[kind]}
          <input value={value} onChange={(e) => setValue(e.target.value)} required inputMode="numeric" className={`${inputClass} mt-1 !w-24 font-mono`} />
        </label>
        <label className="block text-xs text-ink-secondary">
          {P.maxUses}
          <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} inputMode="numeric" placeholder={P.noLimit} className={`${inputClass} mt-1 !w-28 font-mono`} />
        </label>
        <label className="block text-xs text-ink-secondary">
          {P.validUntil}
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={`${inputClass} mt-1 !w-auto`} />
        </label>
        <Button type="submit" variant="secondary" loading={busy} disabled={!code.trim() || !value.trim()}>{P.create}</Button>
      </form>

      {isLoading && <p className="text-sm text-ink-secondary">…</p>}
      {data && data.length === 0 && <p className="text-sm text-ink-secondary border-t border-border-strong pt-6">{P.empty}</p>}
      {data && data.length > 0 && (
        <Table>
          <thead><tr>
            <th className={TH}>{P.cols.code}</th><th className={TH}>{P.cols.kind}</th>
            <th className={TH}>{P.cols.uses}</th><th className={TH}>{P.cols.validUntil}</th>
            <th className={TH}>{P.cols.status}</th><th className={TH}>{P.cols.created}</th><th className={TH}></th>
          </tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.id}>
              <td className={`${TD} font-mono`}>{p.code}</td>
              <td className={`${TD} text-xs`}>{P.kindLabel[p.kind]}: {p.kind === 'percent' ? `${p.value}%` : p.kind === 'fixed' ? `${(p.value / 100).toLocaleString('ru-RU')} ₽` : p.value}</td>
              <td className={`${TD} text-xs`}>{p.redemptions}{p.max_uses ? ` / ${p.max_uses}` : ''} <span className="text-ink-secondary">· {P.redemptions(p.redemptions)}</span></td>
              <td className={`${TD} font-mono text-xs`}>{p.valid_until ? fmtDate(p.valid_until) : P.noExpiry}</td>
              <td className={TD}><Pill tone={p.active ? 'ok' : 'plain'}>{p.active ? P.active : P.inactive}</Pill></td>
              <td className={`${TD} text-xs`}>{p.created_by_email ?? '—'}</td>
              <td className={TD}>
                <Button variant="ghost" size="sm" onClick={() => void toggle(p.id, !p.active)}>{p.active ? P.deactivate : P.activate}</Button>
              </td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </div>
  )
}
