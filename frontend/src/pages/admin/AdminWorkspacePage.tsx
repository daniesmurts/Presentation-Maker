import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { getWorkspace } from '../../api/admin'
import Spinner from '../../components/ui/Spinner'
import { Pill } from '../../components/ui/Field'
import { copy, INTENT_LABEL, AUDIENCE_LABEL } from '../../lib/copy'
import type { Intent, Audience } from '../../../../shared/types'
import { fmtDate, fmtDateTime, fmtRub, fmtUsd, Table, TH, TD, NUM, Section } from './AdminLayout'
import AdminWorkspaceActions from './AdminWorkspaceActions'

type Tone = 'ok' | 'warn' | 'bad' | 'plain' | 'accent'
const PAYMENT_TONE: Record<string, Tone> = { CONFIRMED: 'ok', AUTHORIZED: 'warn', NEW: 'plain', FORM_SHOWED: 'plain', REFUNDED: 'warn', PARTIAL_REFUNDED: 'warn' }
const JOB_TONE: Record<string, Tone> = { ready: 'ok', outline_ready: 'accent', processing: 'warn', pending: 'plain', failed: 'bad' }

export default function AdminWorkspacePage() {
  const { id = '' } = useParams()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'workspace', id], queryFn: () => getWorkspace(id) })
  const D = copy.admin.detail
  if (isLoading || !data) return <Spinner />
  const { workspace: w } = data
  const owner = data.users[0]

  return (
    <div className="space-y-8">
      <Link to="/admin/workspaces" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink no-underline"><ArrowLeft className="w-4 h-4" aria-hidden /> {D.back}</Link>

      <div>
        <h2 className="display font-semibold text-[24px] text-ink">{owner?.email ?? w.name}</h2>
        <div className="text-sm text-ink-secondary mt-1 flex flex-wrap gap-x-3 gap-y-1 items-center">
          <span>{w.name}</span>
          <span className="font-mono text-xs">{w.id}</span>
          <span>{copy.admin.workspaces.cols.created.toLowerCase()} {fmtDate(w.created_at)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 items-center text-sm">
          <Pill tone={w.plan_tier === 'pro' ? 'accent' : 'plain'}>{w.plan_tier === 'pro' ? `Pro · ${w.plan_source === 'granted' ? D.granted : D.paid}` : 'Free'}</Pill>
          {w.plan_expires_at && <span className="text-ink-secondary">{D.until} <span className="font-mono">{fmtDate(w.plan_expires_at)}</span></span>}
          {w.plan_tier === 'pro' && <span className="text-ink-secondary">{D.autoRenew}: {w.auto_renew ? 'да' : 'нет'}</span>}
          {w.card_last4 && <span className="text-ink-secondary">{D.card} ···{w.card_last4}</span>}
          {w.renewal_failures > 0 && <span className="text-danger">{w.renewal_failures} {D.renewalFailures}</span>}
          {w.monthly_spend_cap_usd != null && <span className="text-ink-secondary">{D.cap} {fmtUsd(w.monthly_spend_cap_usd)}</span>}
          {w.style_learning && <span className="text-ink-secondary">{D.styleLearning}</span>}
        </div>
      </div>

      <Section title={D.users}>
        <Table>
          <thead><tr><th className={TH}>E-mail</th><th className={TH}>Имя</th><th className={TH}>152-ФЗ</th><th className={TH}>Создан</th></tr></thead>
          <tbody>{data.users.map((u) => (
            <tr key={u.id}>
              <td className={TD}>{u.email}{u.is_admin && <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-accent">{D.admin}</span>}{u.deactivated_at && <span className="ml-2 text-xs text-danger">{D.deactivated}</span>}</td>
              <td className={TD}>{u.display_name ?? '—'}</td>
              <td className={`${TD} text-xs`}>{u.terms_accepted_at ? <span className="text-success">{D.terms} {u.terms_version}</span> : <span className="text-warning">{D.termsNo}</span>}</td>
              <td className={`${TD} font-mono text-xs`}>{fmtDate(u.created_at)}</td>
            </tr>
          ))}</tbody>
        </Table>
      </Section>

      <AdminWorkspaceActions detail={data} />

      <Section title={`${D.talks} · ${data.talks.length}`}>
        {data.talks.length === 0 ? <p className="text-sm text-ink-secondary">{D.none}</p> : (
          <Table>
            <thead><tr><th className={TH}>Название</th><th className={TH}>Тип</th><th className={`${TH} text-right`}>Сл.</th><th className={TH}>Тема</th><th className={TH}>Статус</th><th className={TH}>Создано</th></tr></thead>
            <tbody>{data.talks.map((t) => (
              <tr key={t.id}>
                <td className={`${TD} display`}>{t.title}</td>
                <td className={`${TD} text-xs text-ink-secondary`}>{INTENT_LABEL[t.intent as Intent] ?? t.intent} · {AUDIENCE_LABEL[t.audience as Audience] ?? t.audience}{t.language === 'en' ? ' · EN' : ''}</td>
                <td className={`${TD} ${NUM}`}>{t.slides}</td>
                <td className={`${TD} font-mono text-xs`}>{t.theme_id}</td>
                <td className={`${TD} text-xs`}>{[t.approved_at && copy.list.status.approved, t.shared && copy.list.status.shared].filter(Boolean).join(' · ') || copy.list.status.draft}</td>
                <td className={`${TD} font-mono text-xs`}>{fmtDate(t.created_at)}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Section>

      <Section title={D.payments}>
        {data.payments.length === 0 ? <p className="text-sm text-ink-secondary">{D.none}</p> : (
          <Table>
            <thead><tr><th className={TH}>Когда</th><th className={TH}>Вид</th><th className={`${TH} text-right`}>Сумма</th><th className={TH}>Статус</th><th className={TH}>Период</th></tr></thead>
            <tbody>{data.payments.map((p) => (
              <tr key={p.id}>
                <td className={`${TD} font-mono text-xs`}>{fmtDateTime(p.created_at)}</td>
                <td className={`${TD} text-xs`}>{p.kind === 'renewal' ? 'продление' : 'оплата'}</td>
                <td className={`${TD} ${NUM}`}>{fmtRub(p.amount_kopecks)}</td>
                <td className={TD}><Pill tone={PAYMENT_TONE[p.status] ?? 'bad'}>{p.status}</Pill>{p.error_code && <span className="ml-2 font-mono text-xs text-danger">{p.error_code}</span>}</td>
                <td className={`${TD} font-mono text-xs`}>{p.period_start ? `${fmtDate(p.period_start)} – ${fmtDate(p.period_end)}` : '—'}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Section>

      <Section title={D.spend}>
        {data.spend.length === 0 ? <p className="text-sm text-ink-secondary">{D.none}</p> : (
          <Table>
            <thead><tr><th className={TH}>Месяц</th><th className={`${TH} text-right`}>Вызовов</th><th className={`${TH} text-right`}>USD</th><th className={TH}></th></tr></thead>
            <tbody>{data.spend.map((s) => (
              <tr key={s.month}>
                <td className={`${TD} font-mono`}>{s.month}</td>
                <td className={`${TD} ${NUM}`}>{s.calls}</td>
                <td className={`${TD} ${NUM}`}>{fmtUsd(s.cost_usd)}</td>
                <td className={`${TD} text-xs`}>{s.failed > 0 && <span className="text-danger">{D.failed(s.failed)}</span>}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Section>

      <Section title={D.jobs}>
        {data.jobs.length === 0 ? <p className="text-sm text-ink-secondary">{D.none}</p> : (
          <Table>
            <thead><tr><th className={TH}>Когда</th><th className={TH}>Вид</th><th className={TH}>Статус</th><th className={`${TH} text-right`}>Попыток</th><th className={TH}>Ошибка</th></tr></thead>
            <tbody>{data.jobs.map((j) => (
              <tr key={j.id}>
                <td className={`${TD} font-mono text-xs`}>{fmtDateTime(j.created_at)}</td>
                <td className={`${TD} text-xs`}>{j.kind}</td>
                <td className={TD}><Pill tone={JOB_TONE[j.status] ?? 'plain'}>{j.status}</Pill></td>
                <td className={`${TD} ${NUM}`}>{j.attempts}</td>
                <td className={`${TD} text-xs text-ink-secondary max-w-md`}>{j.error_message ?? ''}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Section>

      <Section title={D.events}>
        {data.events.length === 0 ? <p className="text-sm text-ink-secondary">{D.none}</p> : (
          <Table>
            <thead><tr><th className={TH}>Когда</th><th className={TH}>Событие</th><th className={TH}>Детали</th></tr></thead>
            <tbody>{data.events.map((e) => (
              <tr key={e.id}>
                <td className={`${TD} font-mono text-xs whitespace-nowrap`}>{fmtDateTime(e.created_at)}</td>
                <td className={`${TD} font-mono text-xs`}>{e.event}{e.format ? ` · ${e.format}` : ''}</td>
                <td className={`${TD} font-mono text-xs text-ink-secondary break-all`}>{e.metadata ? JSON.stringify(e.metadata) : ''}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Section>
    </div>
  )
}
