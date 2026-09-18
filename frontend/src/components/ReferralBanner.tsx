import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gift, Copy, Check, X } from 'lucide-react'
import { getMyReferral } from '../api/referrals'
import { useAuth } from '../lib/auth'
import { copy } from '../lib/copy'

const DISMISS_KEY = 'tezarium-referral-banner-dismissed'

// The referral pitch on the page everyone actually opens (TalksPage), not
// just the tariff page it also lives on (ReferralCard.tsx) — decided
// 2026-09-16 after noticing the tariff page is a one-visit page for most
// accounts. Dismissible and persisted, same as the onboarding cards
// (CLAUDE.md §6): once someone has seen the pitch, it stops repeating
// itself at them every time they come here to actually get work done.
export default function ReferralBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false } })
  const [copied, setCopied] = useState(false)
  // Billing off in this installation (dev box, on-prem) → no Pro to
  // reward, so the query never even runs — matches how the rest of the
  // app gates on user.features.billing.
  const { data } = useQuery({ queryKey: ['referral', 'me'], queryFn: getMyReferral, enabled: !!user?.features.billing })

  if (!user?.features.billing || dismissed || !data?.url) return null
  // On a phone two banners push the first talk below the fold (CLAUDE.md
  // §6, content first). The e-mail one matters more; this one waits for it.
  const emailPending = !user.email_verified_at

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode — dismissal just doesn't persist */ }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(data!.url!); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard unavailable */ }
  }

  const B = copy.referralBanner
  const line = data.rewarded > 0 ? B.rewarded(data.rewarded, data.referrer_reward_days)
    : data.invited > 0 ? B.pending(data.invited, data.referrer_reward_days)
    : B.pitch(data.referrer_reward_days)

  // Icon · text · close on one row; the action under the text on a phone,
  // inline from sm. Three columns beside a 7-line text column is what a
  // user's screenshot showed (2026-09-18).
  return (
    <div className={`${emailPending ? 'hidden sm:grid' : 'grid'} mb-4 grid-cols-[16px_minmax(0,1fr)_16px] sm:grid-cols-[16px_minmax(0,1fr)_auto_16px] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 rounded-md text-sm bg-accent-light text-ink`}>
      <Gift className="w-4 h-4 text-accent" aria-hidden />
      <span className="min-w-0">{line}</span>
      <button onClick={dismiss} aria-label={B.dismiss} className="sm:col-start-4 h-11 w-11 -m-3.5 sm:h-auto sm:w-auto sm:m-0 inline-flex items-center justify-center text-ink-tertiary hover:text-ink">
        <X className="w-4 h-4" aria-hidden />
      </button>
      <button onClick={() => void copyLink()} className="col-start-2 sm:col-start-3 sm:row-start-1 justify-self-start h-8 sm:h-auto text-accent underline underline-offset-4 hover:text-accent-deep inline-flex items-center gap-1.5 whitespace-nowrap">
        {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
        {copied ? B.copied : B.copy}
      </button>
    </div>
  )
}
