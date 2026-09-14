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
  'w-full px-3 py-2 text-sm text-ink bg-surface border border-border-strong rounded-md ' +
  'placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent'

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
