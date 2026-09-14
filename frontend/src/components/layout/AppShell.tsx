import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Plus, LogOut } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { copy } from '../../lib/copy'

// `min-h-screen` on the outer flex, NOT `h-screen`: with h-screen the body
// stops scrolling and a wrapper becomes the scrollport, which silently
// captures every `position: sticky` inside it (CLAUDE.md §6). The document
// scrolls; the header sticks to the viewport.
export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 bg-surface border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <NavLink to="/talks" className="font-semibold text-ink tracking-tight">{copy.brand}</NavLink>
          <nav className="flex items-center gap-1 ml-2">
            <NavLink to="/talks" end className={({ isActive }) => `h-8 px-3 inline-flex items-center rounded-md text-sm ${isActive ? 'bg-accent-light text-accent' : 'text-ink-secondary hover:text-ink hover:bg-surface-soft'}`}>
              {copy.nav.talks}
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {/* Icon-only under sm: at 375px the label wrapped to two lines and
                pushed the sign-out button off the right edge (Phase 2 mobile check). */}
            <NavLink to="/talks/new" aria-label={copy.nav.newTalk} title={copy.nav.newTalk}
                     className="h-9 min-w-[36px] px-2 sm:px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium bg-accent-light text-accent hover:bg-accent hover:text-white">
              <Plus className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">{copy.nav.newTalk}</span>
            </NavLink>
            <span className="hidden sm:block text-xs text-ink-secondary ml-2 truncate max-w-[16ch]">{user?.display_name || user?.email}</span>
            <button onClick={() => void logout().then(() => navigate('/login'))} title={copy.nav.logout} aria-label={copy.nav.logout}
              className="h-9 w-9 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-soft">
              <LogOut className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
      <footer className="max-w-5xl mx-auto px-4 py-6 text-xs text-ink-secondary">{copy.brand} · {__APP_VERSION__}</footer>
    </div>
  )
}
