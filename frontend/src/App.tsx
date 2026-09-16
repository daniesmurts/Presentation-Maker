import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import AuthPage from './pages/AuthPage'
import TalksPage from './pages/TalksPage'
import NewTalkPage from './pages/NewTalkPage'
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
import Spinner from './components/ui/Spinner'
import { useAuth } from './lib/auth'

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
  return (
    <Routes>
      <Route path="/login"    element={!loading && user ? <Navigate to="/talks" replace /> : <AuthPage mode="login" />} />
      <Route path="/register" element={!loading && user ? <Navigate to="/talks" replace /> : <AuthPage mode="register" />} />
      <Route path="/s/:token"  element={<SharedPage />} />
      <Route path="/talks/:id/present" element={<RequireAuth><PresentPage /></RequireAuth>} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/talks"      element={<TalksPage />} />
        <Route path="/talks/new"  element={<NewTalkPage />} />
        <Route path="/talks/:id"  element={<TalkPage />} />
        <Route path="/jobs/:id"   element={<JobPage />} />
        <Route path="/brand"      element={<BrandPage />} />
        <Route path="/billing"    element={<BillingPage />} />
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="workspaces"     element={<AdminWorkspacesPage />} />
          <Route path="workspaces/:id" element={<AdminWorkspacePage />} />
          <Route path="support"        element={<AdminSupportPage />} />
          <Route path="promo-codes"    element={<AdminPromoPage />} />
          <Route path="referrals"      element={<AdminReferralsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/talks" replace />} />
    </Routes>
  )
}
