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

  return (
    <div className="mb-4 flex items-center gap-3 px-3 py-2 rounded-md text-sm bg-accent-light text-ink">
      <Gift className="w-4 h-4 text-accent flex-shrink-0" aria-hidden />
      <span className="flex-1 min-w-0">{line}</span>
      <button onClick={() => void copyLink()} className="text-accent underline underline-offset-4 hover:text-accent-deep flex-shrink-0 inline-flex items-center gap-1.5">
        {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
        {copied ? B.copied : B.copy}
      </button>
      <button onClick={dismiss} aria-label={B.dismiss} className="text-ink-tertiary hover:text-ink flex-shrink-0">
        <X className="w-4 h-4" aria-hidden />
      </button>
    </div>
  )
}
