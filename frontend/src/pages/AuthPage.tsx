import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import PasswordField from '../components/ui/PasswordField'
import { passwordIsStrong } from '../../../shared/password'
import { login, register } from '../api/auth'
import { errorMessage } from '../api/client'
import { useAuth } from '../lib/auth'
import { copy } from '../lib/copy'

// A referral link (CLAUDE.md TODO M phase 4) arrives as ?ref=CODE on
// /register; kept in localStorage so a code from an earlier visit still
// applies if the user leaves and comes back to finish signing up.
const REF_KEY = 'tezarium-ref'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [consent, setConsent] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const ref = params.get('ref')
    if (ref) { try { localStorage.setItem(REF_KEY, ref) } catch { /* private mode — the code still works this visit */ } }
  }, [params])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(undefined)
    try {
      const ref = params.get('ref') ?? (() => { try { return localStorage.getItem(REF_KEY) } catch { return null } })()
      const user = mode === 'login' ? await login(email, password, rememberMe) : await register(email, password, name, consent, ref)
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
        <div className="mb-8">
          <div className="display text-[34px] leading-none text-ink tracking-tight">{copy.brand}</div>
          <div className="font-display text-[19px] text-ink mt-2">{copy.taglineParts[0]}<span className="marker-under">{copy.taglineParts[1]}</span></div>
        </div>
        <form onSubmit={submit} className="space-y-4 border-t border-border-strong pt-5">
          <h1 className="eyebrow text-accent">{mode === 'login' ? copy.auth.loginTitle : copy.auth.registerTitle}</h1>
          {mode === 'register' && (
            <Field label={copy.auth.displayName} htmlFor="name">
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="name" />
            </Field>
          )}
          <Field label={copy.auth.email} htmlFor="email">
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="email" required />
          </Field>
          <Field label={copy.auth.password} htmlFor="password">
            <PasswordField id="password" value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} rules={mode === 'register'} />
          </Field>
          {mode === 'login' && (
            <div className="flex items-center justify-between -mt-1">
              <label className="flex items-center gap-2 min-h-[32px] cursor-pointer">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 accent-accent cursor-pointer" />
                <span className="text-sm text-ink-secondary">{copy.auth.rememberMe}</span>
              </label>
              <Link to="/forgot-password" className="text-sm text-accent underline underline-offset-4 hover:text-accent-deep">{copy.auth.forgotPassword}</Link>
            </div>
          )}
          {mode === 'register' && (
            // A real <label> around the 44px row (touch has no hover); the
            // document links open the public site in a new tab so the form
            // is not lost. Consent gates the button — the server checks too.
            <label className="flex items-start gap-3 min-h-[44px] py-1 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="mt-1 w-4 h-4 accent-accent cursor-pointer flex-shrink-0" />
              <span className="text-sm text-ink-secondary leading-snug">
                {copy.auth.consent.before}
                <a href={copy.auth.consent.termsUrl} target="_blank" rel="noopener" className="text-accent underline underline-offset-4 hover:text-accent-deep" onClick={(e) => e.stopPropagation()}>{copy.auth.consent.terms}</a>
                {copy.auth.consent.and}
                <a href={copy.auth.consent.privacyUrl} target="_blank" rel="noopener" className="text-accent underline underline-offset-4 hover:text-accent-deep" onClick={(e) => e.stopPropagation()}>{copy.auth.consent.privacy}</a>
                {copy.auth.consent.after}
              </span>
            </label>
          )}
          {error && <div role="alert" className="px-3 py-2 bg-danger-bg text-danger text-sm rounded-md">{error}</div>}
          <Button type="submit" loading={busy} disabled={mode === 'register' && (!consent || !passwordIsStrong(password))} className="w-full">{mode === 'login' ? copy.auth.login : copy.auth.register}</Button>
          <p className="text-center text-sm">
            <Link to={mode === 'login' ? '/register' : '/login'} className="text-accent underline underline-offset-4 hover:text-accent-deep">
              {mode === 'login' ? copy.auth.toRegister : copy.auth.toLogin}
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
