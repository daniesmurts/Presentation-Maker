import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Mail, X } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { copy } from '../../lib/copy'
import { resendVerification } from '../../api/auth'

// Soft gate (decided 2026-09-16): shown, never blocking. Dismissible for
// this browser tab only — it comes back on reload until the address is
// actually verified, same as an unread-mail indicator would.
export default function EmailVerifyBanner() {
  const { user, refresh } = useAuth()
  const [params, setParams] = useSearchParams()
  const [dismissed, setDismissed] = useState(false)
  const [resent, setResent] = useState(false)
  const [toast, setToast] = useState<'verified' | 'notVerified'>()

  useEffect(() => {
    const verified = params.get('verified')
    if (verified === '1') { setToast('verified'); void refresh() }
    else if (verified === '0') setToast('notVerified')
    if (verified !== null) {
      params.delete('verified')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (toast) {
    const ok = toast === 'verified'
    return (
      <div role="status" className={`mb-4 flex items-center gap-2 px-3 py-2 rounded-md text-sm ${ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}>
        {ok ? copy.auth.verify.verified : copy.auth.verify.notVerified}
      </div>
    )
  }

  if (!user || user.email_verified_at || dismissed) return null

  return (
    <div className="mb-4 flex items-center gap-3 px-3 py-2 rounded-md text-sm bg-accent-light text-ink">
      <Mail className="w-4 h-4 text-accent flex-shrink-0" aria-hidden />
      <span className="flex-1 min-w-0 truncate">{copy.auth.verify.banner}{user.email}</span>
      {resent ? (
        <span className="text-accent flex-shrink-0">{copy.auth.verify.resent}</span>
      ) : (
        <button onClick={() => { void resendVerification(); setResent(true) }} className="text-accent underline underline-offset-4 hover:text-accent-deep flex-shrink-0">
          {copy.auth.verify.resend}
        </button>
      )}
      <button onClick={() => setDismissed(true)} aria-label="Скрыть" className="text-ink-tertiary hover:text-ink flex-shrink-0">
        <X className="w-4 h-4" aria-hidden />
      </button>
    </div>
  )
}
