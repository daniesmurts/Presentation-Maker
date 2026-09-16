import { NavLink, Outlet } from 'react-router-dom'
import { copy } from '../../lib/copy'

// The admin panel (TODO M): a heading, three tabs, tables. Operator's
// surface — dense, numbers in mono, no onboarding.

const TAB = 'h-8 px-3 inline-flex items-center rounded-full border text-xs whitespace-nowrap transition-colors'
const tabClass = ({ isActive }: { isActive: boolean }) =>
  `${TAB} ${isActive ? 'bg-ink text-bg border-transparent' : 'text-ink-secondary border-border-strong hover:text-ink'}`

export default function AdminLayout() {
  const S = copy.admin.sections
  return (
    <div className="space-y-5">
      <div>
        <div className="eyebrow text-accent mb-1.5">{copy.admin.nav}</div>
        <h1 className="display font-semibold text-[30px] leading-tight text-ink">{copy.admin.heading}</h1>
        <p className="text-sm text-ink-secondary mt-1">{copy.admin.lead}</p>
      </div>
      <nav className="flex gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0" aria-label={copy.admin.heading}>
        <NavLink to="/admin" end className={tabClass}>{S.overview}</NavLink>
        <NavLink to="/admin/workspaces" className={tabClass}>{S.workspaces}</NavLink>
        <NavLink to="/admin/support" className={tabClass}>{S.support}</NavLink>
        <NavLink to="/admin/promo-codes" className={tabClass}>{S.promo}</NavLink>
        <NavLink to="/admin/referrals" className={tabClass}>{S.referrals}</NavLink>
        <NavLink to="/admin/health" className={tabClass}>{S.health}</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}

export const fmtDate = (iso: string | null | undefined, never = '—') =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : never
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export const fmtUsd = (n: number) => `$${n.toFixed(2)}`
export const fmtRub = (kopecks: number) => `${(kopecks / 100).toLocaleString('ru-RU')} ₽`

export const TH = 'text-left text-[11px] uppercase tracking-[0.08em] text-ink-tertiary font-medium py-2 pr-4 whitespace-nowrap'
export const TD = 'py-2.5 pr-4 text-sm text-ink align-top'
export const NUM = 'font-mono tabular-nums text-right'

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
      <table className="w-full border-collapse border-t border-border-strong [&_tbody_tr]:border-b [&_tbody_tr]:border-border">{children}</table>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="display font-medium text-[19px] text-ink">{title}</h2>
      {children}
    </section>
  )
}
