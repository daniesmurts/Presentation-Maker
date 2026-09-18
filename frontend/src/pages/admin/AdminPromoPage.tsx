import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listPromoCodes, createPromoCode, setPromoCodeActive } from '../../api/admin'
import { errorMessage } from '../../api/client'
import Button from '../../components/ui/Button'
import { Field, inputClass, Pill } from '../../components/ui/Field'
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

  // Percent has a sensible default; the other kinds do not (a «fixed 20»
  // is not a discount anyone means).
  function pickKind(k: typeof KINDS[number]) { setKind(k); setValue(k === 'percent' ? '20' : '') }
  const n = Number(value)
  const canCreate = code.trim().length > 0 && Number.isInteger(n) && n > 0 && (kind !== 'percent' || n < 100)
  const preview = canCreate
    ? `${P.preview[kind](code.trim().toUpperCase(), n)} · ${P.preview.uses(maxUses.trim() ? Number(maxUses) : null)} · ${P.preview.until(validUntil || null)}`
    : P.preview.empty

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
      {/* A form, not a strip of inputs: labels above, one grid, the value
          field named by the kind, and a sentence that reads the code back
          the way a user will meet it — the check before «Создать». */}
      <form onSubmit={create} className="border border-border rounded-lg p-5 space-y-5">
        <div className="eyebrow text-ink-tertiary">{P.newCode}</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr] gap-4">
          <Field label={P.code} hint={P.codeHint} htmlFor="promo-code">
            <input id="promo-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={32} placeholder="WELCOME20" className={`${inputClass} h-10 font-mono`} />
          </Field>
          <Field label={P.kind} htmlFor="promo-kind">
            <select id="promo-kind" value={kind} onChange={(e) => pickKind(e.target.value as typeof kind)} className={`${inputClass} h-10`}>
              {KINDS.map((k) => <option key={k} value={k}>{P.kindLabel[k]}</option>)}
            </select>
          </Field>
          <Field label={P.kindOpt[kind]} htmlFor="promo-value">
            <input id="promo-value" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} required inputMode="numeric" className={`${inputClass} h-10 font-mono`} />
          </Field>
          <Field label={P.maxUses} htmlFor="promo-uses">
            <input id="promo-uses" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={P.noLimit} className={`${inputClass} h-10 font-mono`} />
          </Field>
          <Field label={P.validUntil} htmlFor="promo-until">
            <input id="promo-until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={`${inputClass} h-10`} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border">
          <Button type="submit" loading={busy} disabled={!canCreate}>{P.create}</Button>
          <p className={`text-sm ${canCreate ? 'text-ink' : 'text-ink-secondary'}`}>{preview}</p>
        </div>
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
