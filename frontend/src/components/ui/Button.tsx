import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

// One solid primary CTA per screen, and it is INK, not the accent: the blue
// pencil marks things, it does not fill buttons (design «Редакция»). The
// second emphasis is tinted (accent-light ground + accent text); everything
// else is a bordered chip or a quiet text action. Actions look like actions:
// ≥40px primary, ≥32px chips. Hover moves away from the ground (ink →
// ink-hover keeps 12.7:1; accent text → accent-deep rises 6.7 → 9.1), never
// fades toward it.
type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger'
type Size = 'md' | 'sm' | 'icon'

const VARIANT: Record<Variant, string> = {
  primary:   'bg-ink text-bg hover:bg-ink-hover border border-transparent',
  secondary: 'bg-accent-light text-accent hover:text-accent-deep hover:bg-accent/15 border border-transparent',
  ghost:     'bg-surface text-ink border border-border-strong hover:bg-surface-soft',
  quiet:     'bg-transparent text-ink-secondary border border-transparent hover:text-ink hover:bg-surface-soft',
  danger:    'bg-surface text-danger border border-danger/30 hover:bg-danger-bg',
}
const SIZE: Record<Size, string> = {
  md:   'h-10 px-4 text-sm',
  sm:   'h-8 px-3 text-xs',
  icon: 'h-10 w-10 text-sm',   // a 40px square for an icon-only action (always with aria-label)
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
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

/** The same look for links and labels that act as buttons (download, file pickers). */
export const buttonClass = (variant: Variant = 'ghost', size: Size = 'md') =>
  `inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${VARIANT[variant]} ${SIZE[size]}`
