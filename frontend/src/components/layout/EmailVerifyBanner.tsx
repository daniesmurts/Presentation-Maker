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

  // Same grid as ReferralBanner: the action under the text on a phone.
  return (
    <div className="mb-4 grid grid-cols-[16px_minmax(0,1fr)_16px] sm:grid-cols-[16px_minmax(0,1fr)_auto_16px] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 rounded-md text-sm bg-accent-light text-ink">
      <Mail className="w-4 h-4 text-accent" aria-hidden />
      <span className="min-w-0 break-words">{copy.auth.verify.banner}{user.email}</span>
      <button onClick={() => setDismissed(true)} aria-label="Скрыть" className="sm:col-start-4 h-11 w-11 -m-3.5 sm:h-auto sm:w-auto sm:m-0 inline-flex items-center justify-center text-ink-tertiary hover:text-ink">
        <X className="w-4 h-4" aria-hidden />
      </button>
      {resent ? (
        <span className="col-start-2 sm:col-start-3 sm:row-start-1 text-accent whitespace-nowrap">{copy.auth.verify.resent}</span>
      ) : (
        <button onClick={() => { void resendVerification(); setResent(true) }} className="col-start-2 sm:col-start-3 sm:row-start-1 justify-self-start h-8 sm:h-auto text-accent underline underline-offset-4 hover:text-accent-deep whitespace-nowrap">
          {copy.auth.verify.resend}
        </button>
      )}
    </div>
  )
}
