import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getJob, confirmOutline } from '../api/talks'
import { errorMessage } from '../api/client'
import OutlineEditor from '../components/talks/OutlineEditor'
import Spinner from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import { copy } from '../lib/copy'
import type { OutlineSlide } from '../../../shared/types'

// Polls the job. The status line never says «failed» until the row does —
// a silent retry on the server must not flash an error in the UI.
const POLL_MS = 2000

export default function JobPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string>()
  // Which stage the user is waiting on, so the copy can say "план" vs "слайды".
  const [stage, setStage] = useState<'plan' | 'write'>('plan')

  const { data: job, error } = useQuery({
    queryKey: ['job', id],
    queryFn: () => getJob(id),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'pending' || s === 'processing' ? POLL_MS : false
    },
    // Keep polling in a background tab: a user who switches away while the
    // deck is written must come back to the finished talk, not to a spinner
    // that only wakes on the next click. Found in the Phase 2 browser check —
    // the poll stopped the moment the tab was hidden.
    refetchIntervalInBackground: true,
  })

  useEffect(() => {
    if (job?.status === 'ready' && job.talk_id) navigate(`/talks/${job.talk_id}`, { replace: true })
    if (job?.status === 'outline_ready') setStage('plan')
  }, [job, navigate])

  async function confirm(outline: OutlineSlide[]) {
    setConfirming(true); setConfirmError(undefined)
    try {
      const next = await confirmOutline(id, outline)
      // The poll's interval is derived from the cached status; left at
      // 'outline_ready' it would never restart (found in the Phase 2
      // browser check: confirm returned 202 and the page sat on the spinner
      // with no further requests).
      qc.setQueryData(['job', id], next)
      setStage('write')
    } catch (err) {
      setConfirmError(errorMessage(err))
      setConfirming(false)
    }
  }

  if (error) return <Failed message={errorMessage(error)} />
  if (!job) return <Spinner />

  if (job.status === 'failed') return <Failed message={job.error_message ?? copy.errors.generic} />

  if (job.status === 'outline_ready' && job.outline && !confirming) {
    return <OutlineEditor outline={job.outline} onConfirm={confirm} onCancel={() => navigate('/talks/new')} confirming={confirming} error={confirmError} />
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-8 flex flex-col items-center gap-3 text-center">
      <Spinner />
      <p className="text-sm text-ink-secondary max-w-[48ch]">{stage === 'write' || job.outline ? copy.job.writing : copy.job.planning}</p>
    </div>
  )
}

function Failed({ message }: { message: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-6 space-y-4 max-w-xl">
      <h1 className="text-base font-semibold text-ink">{copy.job.failedLead}</h1>
      <p role="alert" className="text-sm text-danger">{message}</p>
      <Link to="/talks/new"><Button variant="secondary">{copy.job.back}</Button></Link>
    </div>
  )
}
