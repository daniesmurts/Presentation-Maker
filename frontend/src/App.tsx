import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import AuthPage from './pages/AuthPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import TalksPage from './pages/TalksPage'
import NewTalkPage from './pages/NewTalkPage'
import DraftsPage from './pages/DraftsPage'
import DraftPage from './pages/DraftPage'
import JobPage from './pages/JobPage'
import TalkPage from './pages/TalkPage'
import BrandPage from './pages/BrandPage'
import BillingPage from './pages/BillingPage'
import SharedPage from './pages/SharedPage'
import PresentPage from './pages/PresentPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOverviewPage from './pages/admin/AdminOverviewPage'
import AdminWorkspacesPage from './pages/admin/AdminWorkspacesPage'
import AdminWorkspacePage from './pages/admin/AdminWorkspacePage'
import AdminSupportPage from './pages/admin/AdminSupportPage'
import AdminPromoPage from './pages/admin/AdminPromoPage'
import AdminReferralsPage from './pages/admin/AdminReferralsPage'
import AdminHealthPage from './pages/admin/AdminHealthPage'
import Spinner from './components/ui/Spinner'
import { useAuth } from './lib/auth'
import { trackPageview } from './lib/metrika'

// initMetrika() (main.tsx) already sends the first hit as part of its own
// 'init' call — skip this effect's first run so the landing pageview isn't
// double-counted, then send one per route change after that.
function useMetrikaPageviews() {
  const location = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    trackPageview(location.pathname + location.search)
  }, [location.pathname, location.search])
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

// The panel is not a place a non-admin should learn exists: no 403 page, the library.
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user?.is_admin) return <Navigate to="/talks" replace />
  return <>{children}</>
}

export default function App() {
  const { user, loading } = useAuth()
  useMetrikaPageviews()
  return (
    <Routes>
      <Route path="/login"    element={!loading && user ? <Navigate to="/talks" replace /> : <AuthPage mode="login" />} />
      <Route path="/register" element={!loading && user ? <Navigate to="/talks" replace /> : <AuthPage mode="register" />} />
      {/* Not gated on `user`, unlike /login and /register: a reset link is
          clicked precisely when the account's password is in doubt, and a
          stale session in this browser (another tab, another account) must
          not stand between the user and resetting it. */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password"  element={<ResetPasswordPage />} />
      <Route path="/s/:token"  element={<SharedPage />} />
      <Route path="/talks/:id/present" element={<RequireAuth><PresentPage /></RequireAuth>} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/talks"      element={<TalksPage />} />
        <Route path="/talks/new"  element={<NewTalkPage />} />
        <Route path="/talks/:id"  element={<TalkPage />} />
        <Route path="/jobs/:id"   element={<JobPage />} />
        <Route path="/drafts"     element={<DraftsPage />} />
        <Route path="/drafts/:id" element={<DraftPage />} />
        <Route path="/brand"      element={<BrandPage />} />
        <Route path="/billing"    element={<BillingPage />} />
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="workspaces"     element={<AdminWorkspacesPage />} />
          <Route path="workspaces/:id" element={<AdminWorkspacePage />} />
          <Route path="support"        element={<AdminSupportPage />} />
          <Route path="promo-codes"    element={<AdminPromoPage />} />
          <Route path="referrals"      element={<AdminReferralsPage />} />
          <Route path="health"         element={<AdminHealthPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/talks" replace />} />
    </Routes>
  )
}
