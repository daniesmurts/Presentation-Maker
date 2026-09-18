import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getDelivered, setDelivered, type DeliveredOutcome } from '../../api/rehearsals'
import { errorMessage } from '../../api/client'
import { useToast } from '../../lib/toast'
import { copy } from '../../lib/copy'

// «Как прошло?» — the one tap after the real thing (TODO O3). Shown on a
// talk with at least one rehearsal and no answer yet; «Ещё нет» hides it
// for three days (per browser — a question, not a state). The answer is
// an event carrying how many rehearsals preceded it, which is the number
// the rehearsal feature is measured by.

const SNOOZE_KEY = (talkId: string) => `tezarium-delivered-snooze-${talkId}`
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000
const CHIP = 'h-8 px-3 rounded-full border border-border-strong bg-surface text-xs text-ink hover:bg-surface-soft'

export default function DeliveredAsk({ talkId, rehearsals }: { talkId: string; rehearsals: number }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const D = copy.rehearsal.delivered
  const { data: delivered, isLoading } = useQuery({ queryKey: ['delivered', talkId], queryFn: () => getDelivered(talkId), enabled: rehearsals > 0 })
  const [snoozed, setSnoozed] = useState(() => { try { return Number(localStorage.getItem(SNOOZE_KEY(talkId)) ?? 0) > Date.now() } catch { return false } })
  const answer = useMutation({
    mutationFn: (outcome: DeliveredOutcome) => setDelivered(talkId, outcome),
    onSuccess: (d) => { qc.setQueryData(['delivered', talkId], d); if (d.outcome === 'bad') toast(D.thanksBad) },
    onError:   (err) => toast(errorMessage(err), 'error'),
  })

  if (rehearsals === 0 || isLoading) return null
  if (delivered) {
    return <span className="text-ink-secondary">{D.done(D.outcome[delivered.outcome], new Date(delivered.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }))}</span>
  }
  if (snoozed) return null
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="text-ink-secondary">{D.ask}</span>
      {(['good', 'ok', 'bad'] as const).map((o) => (
        <button key={o} type="button" className={CHIP} disabled={answer.isPending} onClick={() => answer.mutate(o)}>{D[o]}</button>
      ))}
      <button type="button" className="text-xs text-ink-tertiary hover:text-ink underline underline-offset-2 ml-1"
              onClick={() => { try { localStorage.setItem(SNOOZE_KEY(talkId), String(Date.now() + SNOOZE_MS)) } catch { /* fine */ } setSnoozed(true) }}>
        {D.notYet}
      </button>
    </span>
  )
}
