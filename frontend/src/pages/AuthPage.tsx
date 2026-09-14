import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import { login, register } from '../api/auth'
import { errorMessage } from '../api/client'
import { useAuth } from '../lib/auth'
import { copy } from '../lib/copy'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(undefined)
    try {
      const user = mode === 'login' ? await login(email, password) : await register(email, password, name)
      setUser(user)
      navigate('/talks', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl font-semibold text-ink tracking-tight">{copy.brand}</div>
          <div className="text-sm text-ink-secondary mt-1">{copy.tagline}</div>
        </div>
        <form onSubmit={submit} className="bg-surface border border-border rounded-lg p-5 space-y-4">
          <h1 className="text-base font-semibold text-ink">{mode === 'login' ? copy.auth.loginTitle : copy.auth.registerTitle}</h1>
          {mode === 'register' && (
            <Field label={copy.auth.displayName} htmlFor="name">
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="name" />
            </Field>
          )}
          <Field label={copy.auth.email} htmlFor="email">
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="email" required />
          </Field>
          <Field label={copy.auth.password} htmlFor="password">
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass}
                   autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} />
          </Field>
          {error && <div role="alert" className="px-3 py-2 bg-danger-bg text-danger text-sm rounded-md">{error}</div>}
          <Button type="submit" loading={busy} className="w-full">{mode === 'login' ? copy.auth.login : copy.auth.register}</Button>
          <p className="text-center text-sm">
            <Link to={mode === 'login' ? '/register' : '/login'} className="text-accent underline underline-offset-2 hover:text-accent-deep">
              {mode === 'login' ? copy.auth.toRegister : copy.auth.toLogin}
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
