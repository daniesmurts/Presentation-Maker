import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import { forgotPassword } from '../api/auth'
import { errorMessage } from '../api/client'
import { copy } from '../lib/copy'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  // The backend's response is always the same generic line (never reveals
  // whether the address is registered) — shown once and the form stays,
  // so a typo'd address can be corrected and resubmitted.
  const [sent, setSent] = useState<string>()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(undefined)
    try {
      setSent(await forgotPassword(email))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="display text-[34px] leading-none text-ink tracking-tight">{copy.brand}</div>
        </div>
        <form onSubmit={submit} className="space-y-4 border-t border-border-strong pt-5">
          <h1 className="eyebrow text-accent">{copy.auth.forgot.title}</h1>
          <p className="text-sm text-ink-secondary">{copy.auth.forgot.hint}</p>
          <Field label={copy.auth.email} htmlFor="email">
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="email" required disabled={!!sent} />
          </Field>
          {error && <div role="alert" className="px-3 py-2 bg-danger-bg text-danger text-sm rounded-md">{error}</div>}
          {sent && <div role="status" className="px-3 py-2 bg-success-bg text-success text-sm rounded-md">{sent}</div>}
          {!sent && <Button type="submit" loading={busy} className="w-full">{copy.auth.forgot.submit}</Button>}
          <p className="text-center text-sm">
            <Link to="/login" className="text-accent underline underline-offset-4 hover:text-accent-deep">{copy.auth.forgot.backToLogin}</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
