import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TalkForm from '../components/talks/TalkForm'
import { createJob, type CreateTalkRequest } from '../api/talks'
import { errorMessage } from '../api/client'
import { copy } from '../lib/copy'

export default function NewTalkPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit(req: CreateTalkRequest) {
    setBusy(true); setError(undefined)
    try {
      const job = await createJob(req)
      // The job page owns the rest — a refresh mid-generation lands back
      // on the same job instead of on an empty form.
      navigate(`/jobs/${job.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-ink mb-1">{copy.nav.newTalk}</h1>
      <p className="text-sm text-ink-secondary mb-6">{copy.tagline}</p>
      <TalkForm onSubmit={submit} submitting={busy} error={error} />
    </div>
  )
}
