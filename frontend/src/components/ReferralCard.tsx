import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Check } from 'lucide-react'
import { getMyReferral } from '../api/referrals'
import { copy } from '../lib/copy'

// The referral card (TODO M phase 4): one link, one copy button, three
// counts. Nothing to configure — the code is generated on first load.
export default function ReferralCard() {
  const { data } = useQuery({ queryKey: ['referral', 'me'], queryFn: getMyReferral })
  const [copied, setCopied] = useState(false)
  const R = copy.billing.referral
  if (!data?.url) return null

  async function copyLink() {
    try { await navigator.clipboard.writeText(data!.url!); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard unavailable */ }
  }

  return (
    <section className="border border-border rounded-lg p-5 space-y-3">
      <div>
        <div className="display font-semibold text-[18px] text-ink">{R.heading}</div>
        <p className="text-sm text-ink-secondary mt-1 max-w-[56ch]">{R.lead(data.invitee_discount_percent, data.referrer_reward_days)}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="font-mono text-sm bg-surface-soft border border-border rounded-md px-3 py-2 truncate max-w-full">{data.url}</code>
        <button type="button" onClick={() => void copyLink()}
                className="h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-md border border-border-strong text-ink hover:bg-surface-soft">
          {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
          {copied ? R.copied : R.copy}
        </button>
      </div>
      <div className="flex gap-5 text-sm text-ink-secondary font-mono tabular-nums">
        <span>{data.invited} {R.invited}</span>
        <span>{data.paid} {R.paid}</span>
        <span>{data.rewarded} {R.rewarded}</span>
      </div>
    </section>
  )
}
