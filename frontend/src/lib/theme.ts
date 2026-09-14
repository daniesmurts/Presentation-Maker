// Theme choice: system (default) · light · dark. The choice is stamped on
// <html data-theme> so CSS can prefer it over prefers-color-scheme in both
// directions (index.css); "system" removes the stamp. Persisted per browser
// — a preference, not data, so localStorage is the right place. The same
// key is read by the inline script in index.html before first paint, so a
// dark choice never flashes light.
export type ThemeChoice = 'system' | 'light' | 'dark'
export const THEME_KEY = 'tezarium-theme'
export const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark']

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch { return 'system' }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
  try { choice === 'system' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, choice) } catch { /* private mode */ }
}
