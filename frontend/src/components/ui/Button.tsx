import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

// One solid primary CTA per screen; a second emphasis is tinted (CLAUDE.md
// §6). Actions look like actions: bordered, ≥40px for primary, ≥32px for
// chips. Hover darkens (accent → accent-deep, 6.04 → 8.71), never fades.
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'sm'

const VARIANT: Record<Variant, string> = {
  primary:   'bg-accent text-white hover:bg-accent-deep border border-transparent',
  secondary: 'bg-accent-light text-accent hover:bg-accent hover:text-white border border-transparent',
  ghost:     'bg-surface text-ink border border-border-strong hover:bg-surface-soft',
  danger:    'bg-surface text-danger border border-danger/30 hover:bg-danger-bg',
}
const SIZE: Record<Size, string> = {
  md: 'h-10 px-4 text-sm',
  sm: 'h-8 px-3 text-xs',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?:    Size
  loading?: boolean
  children: ReactNode
}

export default function Button({ variant = 'primary', size = 'md', loading, disabled, children, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
