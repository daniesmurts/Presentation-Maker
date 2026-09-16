import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../../api/admin'
import Spinner from '../../components/ui/Spinner'
import { copy } from '../../lib/copy'
import { fmtDateTime, Table, TH, TD, NUM, Section } from './AdminLayout'

const H = copy.admin.health

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="text-xs text-ink-secondary">{label}</div>
      <div className={`font-mono tabular-nums text-[22px] leading-tight mt-1 ${tone === 'bad' ? 'text-danger' : tone === 'warn' ? 'text-warning' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-xs text-ink-secondary mt-1">{sub}</div>}
    </div>
  )
}

const fmtUsd = (n: number) => `$${n.toFixed(3)}`

export default function AdminHealthPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'health'], queryFn: getHealth, refetchInterval: 60_000 })
  if (isLoading || !data) return <Spinner />
  const { jobs, spend, providers, usage_by_day: usage } = data
  const capBusted = spend.cap_usd != null && spend.today_usd >= spend.cap_usd

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {(Object.keys(jobs.by_status) as Array<keyof typeof jobs.by_status>).map((s) => (
          <Stat key={s} label={H.jobsByStatus[s]} value={jobs.by_status[s]} tone={s === 'failed' && jobs.by_status[s] > 0 ? 'bad' : undefined} />
        ))}
        <Stat label={`${H.spend} — ${H.spendToday}`} value={fmtUsd(spend.today_usd)}
              sub={spend.cap_usd != null ? H.spendCap(spend.cap_usd) : H.spendNoCap} tone={capBusted ? 'bad' : undefined} />
        <Stat label={H.stuck} value={jobs.stuck.length} tone={jobs.stuck.length > 0 ? 'warn' : undefined} />
      </div>

      <Section title={H.stuck}>
        {jobs.stuck.length === 0 ? <p className="text-sm text-ink-secondary">{H.stuckEmpty}</p> : (
          <Table>
            <thead><tr><th className={TH}>{H.cols.owner}</th><th className={TH}>Статус</th><th className={`${TH} text-right`}>{H.cols.attempts}</th><th className={TH}>{H.cols.since}</th></tr></thead>
            <tbody>{jobs.stuck.map((j) => (
              <tr key={j.id}>
                <td className={`${TD} text-xs`}>{j.owner_email ?? j.workspace_id}</td>
                <td className={`${TD} text-xs`}>{j.status}</td>
                <td className={`${TD} ${NUM}`}>{j.attempts}</td>
                <td className={`${TD} font-mono text-xs`}>{fmtDateTime(j.updated_at)}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Section>

      <Section title={H.failed}>
        {jobs.recent_failed.length === 0 ? <p className="text-sm text-ink-secondary">{H.failedEmpty}</p> : (
          <Table>
            <thead><tr><th className={TH}>{H.cols.owner}</th><th className={TH}>{H.cols.error}</th><th className={`${TH} text-right`}>{H.cols.attempts}</th><th className={TH}>{H.cols.date}</th></tr></thead>
            <tbody>{jobs.recent_failed.map((j) => (
              <tr key={j.id}>
                <td className={`${TD} text-xs whitespace-nowrap`}>{j.owner_email ?? j.workspace_id}</td>
                <td className={`${TD} text-xs text-danger max-w-md`}>{j.error_message ?? ''}</td>
                <td className={`${TD} ${NUM}`}>{j.attempts}</td>
                <td className={`${TD} font-mono text-xs`}>{fmtDateTime(j.updated_at)}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Section>

      <Section title={H.providers}>
        {providers.length === 0 ? <p className="text-sm text-ink-secondary">{H.providersEmpty}</p> : (
          <Table>
            <thead><tr>
              <th className={TH}>{H.cols.model}</th><th className={TH}>{H.cols.account}</th>
              <th className={`${TH} text-right`}>{H.cols.calls}</th><th className={`${TH} text-right`}>{H.cols.errorRate}</th>
              <th className={`${TH} text-right`}>{H.cols.cost}</th><th className={TH}>{H.cols.lastError}</th>
            </tr></thead>
            <tbody>{providers.map((p) => {
              const rate = p.calls > 0 ? (100 * p.failed / p.calls) : 0
              return (
                <tr key={`${p.model}-${p.account}`}>
                  <td className={`${TD} font-mono text-xs`}>{p.model}</td>
                  <td className={`${TD} text-xs`}>{p.account ?? '—'}</td>
                  <td className={`${TD} ${NUM}`}>{p.calls}</td>
                  <td className={`${TD} ${NUM} ${rate > 10 ? 'text-danger' : ''}`}>{rate.toFixed(0)}%</td>
                  <td className={`${TD} ${NUM}`}>{fmtUsd(p.cost_usd)}</td>
                  <td className={`${TD} font-mono text-xs text-danger`}>{p.last_error_code ?? ''}</td>
                </tr>
              )
            })}</tbody>
          </Table>
        )}
      </Section>

      <Section title={`${H.spendByDay} (14 дней)`}>
        <Table>
          <thead><tr><th className={TH}>{H.cols.date}</th><th className={`${TH} text-right`}>{H.cols.calls}</th><th className={`${TH} text-right`}>{H.cols.cost}</th><th className={`${TH} text-right`}>{H.cols.failedCol}</th></tr></thead>
          <tbody>{spend.by_day.map((d) => (
            <tr key={d.date}>
              <td className={`${TD} font-mono text-xs`}>{d.date}</td>
              <td className={`${TD} ${NUM}`}>{d.calls}</td>
              <td className={`${TD} ${NUM}`}>{fmtUsd(d.cost_usd)}</td>
              <td className={`${TD} ${NUM} ${d.failed > 0 ? 'text-danger' : ''}`}>{d.failed}</td>
            </tr>
          ))}</tbody>
        </Table>
      </Section>

      <Section title={`${H.usage} (14 дней)`}>
        <Table>
          <thead><tr>
            <th className={TH}>{H.cols.date}</th><th className={`${TH} text-right`}>{H.cols.talks}</th>
            <th className={`${TH} text-right`}>{H.cols.exportsPptx}</th><th className={`${TH} text-right`}>{H.cols.exportsPdf}</th>
            <th className={`${TH} text-right`}>{H.cols.images}</th>
          </tr></thead>
          <tbody>{usage.map((d) => (
            <tr key={d.date}>
              <td className={`${TD} font-mono text-xs`}>{d.date}</td>
              <td className={`${TD} ${NUM}`}>{d.talks}</td>
              <td className={`${TD} ${NUM}`}>{d.exports_pptx}</td>
              <td className={`${TD} ${NUM}`}>{d.exports_pdf}</td>
              <td className={`${TD} ${NUM}`}>{d.images}</td>
            </tr>
          ))}</tbody>
        </Table>
      </Section>
    </div>
  )
}
