import { useState } from 'react'
import { Eye, EyeOff, Check, Circle } from 'lucide-react'
import { inputClass } from './Field'
import { copy } from '../../lib/copy'
import { PASSWORD_RULES, passwordRuleState } from '../../../../shared/password'

// Password input with a show/hide toggle and, on registration, the rules
// as a live checklist under the field — each rule flips to a tick as it is
// met (icon AND colour, never colour alone). The same rules live in
// shared/password.ts and the server enforces them; the checklist is how
// the user learns them before the server says no.
interface Props {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  rules?: boolean
}

export default function PasswordField({ id, value, onChange, autoComplete, rules }: Props) {
  const [shown, setShown] = useState(false)
  const state = rules ? passwordRuleState(value) : null
  return (
    <div className="space-y-2">
      <div className="relative">
        <input id={id} type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
               className={`${inputClass} pr-11`} autoComplete={autoComplete} required minLength={PASSWORD_RULES.minLength}
               placeholder={rules ? copy.auth.passwordPh : undefined}
               aria-describedby={rules ? `${id}-rules` : undefined} />
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? copy.auth.hidePassword : copy.auth.showPassword} aria-pressed={shown}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-soft">
          {shown ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
        </button>
      </div>
      {state && (
        <ul id={`${id}-rules`} className="space-y-1 text-xs" aria-live="polite">
          {state.map((r) => (
            <li key={r.id} className={`flex items-center gap-2 ${r.ok ? 'text-success' : 'text-ink-secondary'}`}>
              {r.ok ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Circle className="w-2 h-2 ml-0.5 mr-1 fill-current opacity-40" aria-hidden />}
              <span>{copy.auth.rules[r.id]}{r.ok && <span className="sr-only"> — {copy.auth.ruleMet}</span>}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
