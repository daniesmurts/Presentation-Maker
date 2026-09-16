import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getOverview } from '../../api/admin'
import Spinner from '../../components/ui/Spinner'
import { copy } from '../../lib/copy'
import { fmtRub, fmtUsd } from './AdminLayout'

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'bad' }) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="text-xs text-ink-secondary">{label}</div>
      <div className={`font-mono tabular-nums text-[26px] leading-tight mt-1 ${tone === 'bad' ? 'text-danger' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-xs text-ink-secondary mt-1">{sub}</div>}
    </div>
  )
}

export default function AdminOverviewPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'overview'], queryFn: getOverview, refetchInterval: 60_000 })
  if (isLoading || !data) return <Spinner />
  const O = copy.admin.overview
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat label={O.users} value={data.users.total} sub={`+${data.users.new_7d} ${O.new7} · +${data.users.new_30d} ${O.new30}`} />
      <Stat label={O.active7} value={data.workspaces.active_7d} />
      <Stat label={O.pro} value={data.workspaces.pro} />
      <Stat label={`${O.month}: ${O.revenue}`} value={fmtRub(data.month.revenue_kopecks)} />
      <Stat label={`${O.month}: ${O.talks}`} value={data.month.talks} />
      <Stat label={`${O.month}: ${O.exports}`} value={data.month.exports_pptx + data.month.exports_pdf} sub={`.pptx ${data.month.exports_pptx} · PDF ${data.month.exports_pdf}`} />
      <Stat label={`${O.month}: ${O.spend}`} value={fmtUsd(data.month.spend_usd)} />
      <Link to="/admin/support" className="contents"><Stat label={O.support} value={data.support.open} sub={`+${data.support.last_7d} ${O.support7}`} /></Link>
      <Stat label={`${O.jobs}: ${O.failed24}`} value={data.jobs.failed_24h} tone={data.jobs.failed_24h > 0 ? 'bad' : undefined} />
      <Stat label={`${O.jobs}: ${O.stuck}`} value={data.jobs.stuck} tone={data.jobs.stuck > 0 ? 'bad' : undefined} />
    </div>
  )
}
