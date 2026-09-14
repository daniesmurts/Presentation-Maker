import { useState } from 'react'
import { Monitor, Sun, Moon } from 'lucide-react'
import { applyTheme, readTheme, THEME_ORDER, type ThemeChoice } from '../../lib/theme'
import { copy } from '../../lib/copy'

// One button that cycles system → light → dark. The label says the CURRENT
// state (what you are looking at), the title says what a click does.
const ICON = { system: Monitor, light: Sun, dark: Moon } as const

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme)
  const next = THEME_ORDER[(THEME_ORDER.indexOf(choice) + 1) % THEME_ORDER.length]
  const Icon = ICON[choice]
  return (
    <button type="button" onClick={() => { applyTheme(next); setChoice(next) }}
            aria-label={`${copy.theme.switch}: ${copy.theme.choice[choice]}`} title={copy.theme.to(copy.theme.choice[next])}
            className={`h-9 w-9 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-soft transition-colors ${className}`}>
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  )
}
