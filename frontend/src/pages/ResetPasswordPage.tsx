import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import PasswordField from '../components/ui/PasswordField'
import { passwordIsStrong } from '../../../shared/password'
import { resetPassword } from '../api/auth'
import { errorMessage } from '../api/client'
import { copy } from '../lib/copy'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(undefined)
    try {
      await resetPassword(token, password)
      setDone(true)
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
        <div className="space-y-4 border-t border-border-strong pt-5">
          <h1 className="eyebrow text-accent">{copy.auth.reset.title}</h1>
          {!token && (
            <div role="alert" className="px-3 py-2 bg-danger-bg text-danger text-sm rounded-md">{copy.auth.reset.invalidToken}</div>
          )}
          {token && done && (
            <>
              <div role="status" className="px-3 py-2 bg-success-bg text-success text-sm rounded-md">{copy.auth.reset.success}</div>
              <Button onClick={() => navigate('/login')} className="w-full">{copy.auth.reset.toLogin}</Button>
            </>
          )}
          {token && !done && (
            <form onSubmit={submit} className="space-y-4">
              <Field label={copy.auth.password} htmlFor="password">
                <PasswordField id="password" value={password} onChange={setPassword} autoComplete="new-password" rules />
              </Field>
              {error && <div role="alert" className="px-3 py-2 bg-danger-bg text-danger text-sm rounded-md">{error}</div>}
              <Button type="submit" loading={busy} disabled={!passwordIsStrong(password)} className="w-full">{copy.auth.reset.submit}</Button>
            </form>
          )}
          <p className="text-center text-sm">
            <Link to="/login" className="text-accent underline underline-offset-4 hover:text-accent-deep">{copy.auth.forgot.backToLogin}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
