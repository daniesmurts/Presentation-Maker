import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { getBilling, checkout, verifyOrder, cancelRenewal, resumeRenewal, type Billing } from '../api/billing'
import { me } from '../api/auth'
import { errorMessage } from '../api/client'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { copy } from '../lib/copy'

// The tariff page: what the workspace is on, until when, from which card —
// and one solid CTA (subscribe) or one tinted one (stop auto-renew). The
// explanation of how charging works is a disclosure under the button, not a
// column (CLAUDE.md §6). After the hosted form T-Bank sends the user back
// here with ?result=…&order=…; the page asks the API whether the order went
// through, because the webhook can lag the redirect by seconds.

// ru-RU appends « г.» to a long date; the sentences around it carry their own full stop.
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '')
const fmtRub  = (kopecks: number) => `${(kopecks / 100).toLocaleString('ru-RU')} ₽`

export default function BillingPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { setUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const { data, isLoading } = useQuery({ queryKey: ['billing'], queryFn: getBilling })
  const [busy, setBusy] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const [outcome, setOutcome] = useState<'paid' | 'pending' | 'failed' | null>(null)

  const result = params.get('result'), order = params.get('order')

  // The return from the payment form: ask once, then poll a few times while
  // the webhook lands. The user's session is refreshed so the .pptx item
  // unlocks without a reload.
  useEffect(() => {
    if (result === 'fail') { setOutcome('failed'); return }
    if (result !== 'success' || !order) return
    let attempts = 0, stop = false
    const tick = async () => {
      try {
        const r = await verifyOrder(order)
        if (stop) return
        if (r.paid) {
          setOutcome('paid')
          await qc.invalidateQueries({ queryKey: ['billing'] })
          setUser(await me())
          return
        }
        if (['REJECTED', 'AUTH_FAIL', 'DEADLINE_EXPIRED', 'CANCELED'].includes(r.status)) { setOutcome('failed'); return }
        setOutcome('pending')
        if (++attempts < 10) setTimeout(() => void tick(), 3000)
      } catch { if (!stop) setOutcome('pending') }
    }
    void tick()
    return () => { stop = true }
  }, [result, order, qc, setUser])

  const apply = (b: Billing) => qc.setQueryData(['billing'], b)
  async function run(fn: () => Promise<Billing>, ok: string) {
    setBusy(true)
    try { apply(await fn()); toast(ok, 'success') } catch (err) { toast(errorMessage(err), 'error') } finally { setBusy(false) }
  }
  async function pay() {
    setBusy(true)
    try {
      const { url } = await checkout()
      window.location.assign(url)   // the hosted form; T-Bank brings the user back to /billing
    } catch (err) { toast(errorMessage(err), 'error'); setBusy(false) }
  }

  if (isLoading || !data) return <Spinner />
  const isPro = data.tier === 'pro'
  const expires = data.expires_at ? fmtDate(data.expires_at) : null
  const renewalBroken = isPro && data.renewal_failures > 0 && data.auto_renew

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <div className="eyebrow text-accent mb-1.5">{copy.nav.workspace}</div>
        <h1 className="display font-semibold text-[30px] leading-tight text-ink">{copy.billing.heading}</h1>
        <p className="text-sm text-ink-secondary mt-1.5 max-w-[62ch]">{isPro ? copy.billing.leadPro : copy.billing.leadFree}</p>
      </div>

      {outcome && (
        <div role="status" className={`px-3 py-2 text-sm rounded-md ${outcome === 'paid' ? 'bg-success-bg text-success' : outcome === 'failed' ? 'bg-danger-bg text-danger' : 'bg-accent-light text-accent'}`}>
          {outcome === 'paid' ? copy.billing.paid : outcome === 'failed' ? copy.billing.failed : copy.billing.pending}
          {outcome !== 'pending' && <button type="button" onClick={() => { setOutcome(null); setParams({}, { replace: true }) }} className="ml-3 underline underline-offset-2">ок</button>}
        </div>
      )}

      {!data.enabled ? (
        <p className="text-sm text-ink-secondary">{copy.billing.off}</p>
      ) : (
        <section className="border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <div className="display font-semibold text-[22px] text-ink">{isPro ? copy.billing.pro : copy.billing.free}</div>
              {isPro && expires && (
                <p className="text-sm text-ink-secondary mt-1">
                  {copy.billing.proUntil(expires)}. {' '}
                  {renewalBroken ? <span className="text-danger">{copy.billing.renewFailed(expires)}</span>
                    : data.auto_renew && data.card_last4 ? copy.billing.renewsOn(expires, data.card_last4)
                    : copy.billing.endsOn(expires)}
                </p>
              )}
            </div>
            <div className="font-mono text-sm text-ink-secondary tabular-nums">{copy.billing.price(data.price_rub)}</div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!isPro || renewalBroken || !data.card_last4 ? (
              <Button onClick={() => void pay()} loading={busy}>{isPro ? copy.billing.payAgain : copy.billing.subscribe(data.price_rub)}</Button>
            ) : data.auto_renew ? (
              <Button variant="secondary" onClick={() => void run(cancelRenewal, copy.billing.cancelled)} loading={busy}>{copy.billing.cancel}</Button>
            ) : (
              <Button onClick={() => void run(resumeRenewal, copy.billing.resumed)} loading={busy}>{copy.billing.resume}</Button>
            )}
          </div>

          <div>
            <button type="button" onClick={() => setHowOpen((o) => !o)} aria-expanded={howOpen}
                    className="inline-flex items-center gap-1 h-8 text-sm text-ink-secondary hover:text-ink">
              <ChevronDown className={`w-4 h-4 transition-transform ${howOpen ? 'rotate-180' : ''}`} aria-hidden /> {copy.billing.howTitle}
            </button>
            {howOpen && (
              <ul className="mt-2 space-y-1.5 text-sm text-ink-secondary list-disc pl-5 max-w-[62ch]">
                {copy.billing.how.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
          </div>
        </section>
      )}

      {data.enabled && (
        <section>
          <h2 className="eyebrow text-ink-tertiary mb-2">{copy.billing.history}</h2>
          {data.payments.length === 0 ? (
            <p className="text-sm text-ink-secondary">{copy.billing.noPayments}</p>
          ) : (
            <ul className="divide-y divide-border border-t border-b border-border">
              {data.payments.map((p) => (
                <li key={p.id} className="py-2.5 flex items-baseline gap-3 text-sm">
                  <span className="font-mono text-ink-secondary tabular-nums w-28 flex-shrink-0">{fmtDate(p.created_at)}</span>
                  <span className="text-ink flex-1 min-w-0">
                    {copy.billing.kind[p.kind] ?? p.kind}
                    {p.period_end && <span className="text-ink-secondary"> — до {fmtDate(p.period_end)}</span>}
                  </span>
                  <span className={`text-xs ${p.status === 'CONFIRMED' ? 'text-success' : ['REJECTED', 'AUTH_FAIL', 'INIT_FAILED', 'CANCELED', 'DEADLINE_EXPIRED'].includes(p.status) ? 'text-danger' : 'text-ink-secondary'}`}>{copy.billing.status(p.status)}</span>
                  <span className="font-mono tabular-nums text-ink">{fmtRub(p.amount_kopecks)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
