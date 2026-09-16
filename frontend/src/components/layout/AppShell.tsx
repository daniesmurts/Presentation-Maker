import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Plus, LogOut, Presentation, FileText, Megaphone, Palette, CreditCard, Gauge } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../../lib/auth'
import { copy } from '../../lib/copy'
import ThemeToggle from '../ui/ThemeToggle'
import EmailVerifyBanner from './EmailVerifyBanner'

// The desk («Редакция»): a left rail ≥ lg that holds every kind of material
// the product will make — talks now; posts and ads are listed and marked
// «скоро», not hidden — plus the workspace (brand, tariff). Under lg the rail is a
// bottom bar with the same five destinations (≤5, icon + label).
//
// `min-h-screen` on the outer wrapper, NOT `h-screen`: with h-screen the
// body stops scrolling and a wrapper becomes the scrollport, which silently
// captures every `position: sticky` inside it (CLAUDE.md §6). The document
// scrolls; the rail is sticky to the viewport.

const RAIL_ITEM = 'flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm transition-colors'
const railClass = ({ isActive }: { isActive: boolean }) =>
  `${RAIL_ITEM} ${isActive ? 'bg-surface text-ink font-medium shadow-[inset_0_0_0_1px_var(--c-border-strong)]' : 'text-ink-secondary hover:text-ink hover:bg-surface'}`

function Soon({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className={`${RAIL_ITEM} text-ink-tertiary cursor-default`} title={copy.nav.soonHint(label)} aria-disabled>
      {icon} {label}
      <span className="ml-auto text-[10px] uppercase tracking-[0.08em] border border-border-strong rounded-full px-1.5 leading-4">{copy.nav.soon}</span>
    </div>
  )
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const signOut = () => void logout().then(() => navigate('/login'))
  const ic = 'w-4 h-4 flex-shrink-0'

  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="hidden lg:flex flex-col gap-1 sticky top-0 h-screen px-3.5 py-5 border-r border-border bg-bg">
        <NavLink to="/talks" className="font-display text-xl text-ink px-2.5 pb-4 tracking-tight">{copy.brand}</NavLink>
        <NavLink to="/talks/new" className="h-10 mb-2 inline-flex items-center justify-center gap-2 rounded-md bg-ink text-bg text-sm font-medium hover:bg-ink-hover transition-colors">
          <Plus className={ic} aria-hidden /> {copy.nav.newTalk}
        </NavLink>
        <div className="eyebrow text-ink-tertiary px-2.5 pt-3 pb-1.5">{copy.nav.works}</div>
        <NavLink to="/talks" className={railClass}><Presentation className={ic} aria-hidden /> {copy.nav.talks}</NavLink>
        <Soon icon={<FileText className={ic} aria-hidden />} label={copy.nav.posts} />
        <Soon icon={<Megaphone className={ic} aria-hidden />} label={copy.nav.ads} />
        <div className="eyebrow text-ink-tertiary px-2.5 pt-3 pb-1.5">{copy.nav.workspace}</div>
        <NavLink to="/brand" className={railClass}><Palette className={ic} aria-hidden /> {copy.nav.brand}</NavLink>
        <NavLink to="/billing" className={railClass}>
          <CreditCard className={ic} aria-hidden /> {copy.nav.plan}
          {user?.plan_tier === 'pro' && <span className="ml-auto text-[10px] uppercase tracking-[0.08em] bg-accent-light text-accent rounded-full px-1.5 leading-4">Pro</span>}
        </NavLink>
        {user?.is_admin && (
          <NavLink to="/admin" className={railClass}><Gauge className={ic} aria-hidden /> {copy.nav.admin}</NavLink>
        )}
        <div className="mt-auto pt-3 border-t border-border flex items-center gap-1 px-1">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink-secondary truncate">{user?.display_name || user?.email}</div>
            {user?.quota && <NavLink to="/billing" className="block text-[11px] text-ink-tertiary hover:text-ink truncate">{copy.nav.usage(user.plan_tier === 'pro' ? 'Pro' : 'Free', user.quota.talks.used, user.quota.talks.limit)}</NavLink>}
          </div>
          <ThemeToggle />
          <button onClick={signOut} title={copy.nav.logout} aria-label={copy.nav.logout}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface flex-shrink-0">
            <LogOut className={ic} aria-hidden />
          </button>
        </div>
      </aside>

      {/* Under lg: a slim top strip for the wordmark, a bottom bar for navigation. */}
      <header className="lg:hidden sticky top-0 z-40 bg-bg/95 backdrop-blur border-b border-border">
        <div className="px-4 h-12 flex items-center justify-between">
          <NavLink to="/talks" className="font-display text-lg text-ink tracking-tight">{copy.brand}</NavLink>
          <div className="flex items-center gap-1">
            <span className="text-xs text-ink-secondary truncate max-w-[40vw]">{user?.display_name || user?.email}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* The sheet: content on `surface`, the rail on the paper behind it —
          a second plane, so the page keeps its structure in dark, where a
          hairline alone is not enough (first dark check). */}
      <div className="min-w-0 bg-surface lg:min-h-screen">
        {/* Bottom bar height + safe area reserved below the content so the last row is never under it. */}
        <main className="max-w-5xl mx-auto px-4 lg:px-10 py-6 lg:py-8 pb-24 lg:pb-8">
          <EmailVerifyBanner />
          <Outlet />
        </main>
        <footer className="max-w-5xl mx-auto px-4 lg:px-10 pb-6 text-xs text-ink-tertiary hidden lg:block">{copy.brand} · {__APP_VERSION__}</footer>
      </div>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-border grid grid-cols-5 pb-[env(safe-area-inset-bottom)]" aria-label={copy.nav.works}>
        <BarLink to="/talks" icon={<Presentation className="w-5 h-5" aria-hidden />} label={copy.nav.talks} />
        <BarLink to="/talks/new" icon={<Plus className="w-5 h-5" aria-hidden />} label={copy.nav.newShort} />
        <BarLink to="/brand" icon={<Palette className="w-5 h-5" aria-hidden />} label={copy.nav.brand} />
        <BarLink to="/billing" icon={<CreditCard className="w-5 h-5" aria-hidden />} label={copy.nav.plan} />
        <button onClick={signOut} className="h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] text-ink-secondary">
          <LogOut className="w-5 h-5" aria-hidden /> {copy.nav.logout}
        </button>
      </nav>
    </div>
  )
}

function BarLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] ${isActive ? 'text-ink font-medium' : 'text-ink-secondary'}`}>
      {icon} {label}
    </NavLink>
  )
}
