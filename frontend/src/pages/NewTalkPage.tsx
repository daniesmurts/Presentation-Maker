import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TalkForm from '../components/talks/TalkForm'
import { createJob, type CreateTalkRequest } from '../api/talks'
import { errorMessage, errorUpgrade } from '../api/client'
import { copy } from '../lib/copy'

export default function NewTalkPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [upgrade, setUpgrade] = useState(false)

  async function submit(req: CreateTalkRequest) {
    setBusy(true); setError(undefined); setUpgrade(false)
    try {
      const job = await createJob(req)
      // The job page owns the rest — a refresh mid-generation lands back
      // on the same job instead of on an empty form.
      navigate(`/jobs/${job.id}`)
    } catch (err) {
      setError(errorMessage(err)); setUpgrade(errorUpgrade(err))
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="eyebrow text-accent mb-1.5">{copy.talk.kind}</div>
      <h1 className="display font-semibold text-[30px] leading-tight text-ink mb-1">{copy.nav.newTalk}</h1>
      <p className="text-sm text-ink-secondary mb-2">{copy.tagline}</p>
      {/* The other way in: talk it through first. A link, not a second CTA
          — the form's button stays the one solid action on the screen. */}
      <p className="text-sm text-ink-secondary mb-8">
        {copy.draft.fromForm} <Link to="/drafts" className="text-accent hover:text-accent-deep underline underline-offset-2">{copy.draft.fromFormCta}</Link>
      </p>
      <TalkForm onSubmit={submit} submitting={busy} error={error} upgrade={upgrade} />
    </div>
  )
}
