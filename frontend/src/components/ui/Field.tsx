import type { ReactNode } from 'react'

// Explanation lives at the control (CLAUDE.md §6), as a hint under it.
export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && <p className="text-xs text-ink-secondary max-w-[60ch]">{hint}</p>}
    </div>
  )
}

export const inputClass =
  'w-full px-3 py-2 text-[15px] text-ink bg-surface border border-border-strong rounded-md ' +
  'placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent'

// Long-form text the user writes (тезисы, текст докладчика) is set in the
// display face: it is prose, and it reads as prose.
export const proseInputClass = `${inputClass} font-display leading-relaxed`

// A real <label> wrapper so the whole 44px row is the target (touch has no hover).
export function Checkbox({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 min-h-[44px] py-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-accent cursor-pointer" />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-secondary mt-0.5 max-w-[60ch]">{hint}</span>}
      </span>
    </label>
  )
}

// State, always with a word — colour alone carries nothing (CLAUDE.md §6).
export function Pill({ tone = 'plain', children }: { tone?: 'plain' | 'ok' | 'warn' | 'bad' | 'accent'; children: ReactNode }) {
  const TONE = {
    plain:  'text-ink-secondary bg-surface-soft',
    ok:     'text-success bg-success-bg',
    warn:   'text-warning bg-warning-bg',
    bad:    'text-danger bg-danger-bg',
    accent: 'text-accent bg-accent-light',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-xs font-medium whitespace-nowrap ${TONE[tone]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" aria-hidden />
      {children}
    </span>
  )
}
