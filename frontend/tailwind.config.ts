import type { Config } from 'tailwindcss'

// Tokens live in src/index.css as RGB channels so opacity modifiers work
// (bg-accent/10). Contrast ratios are recorded next to each token there.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        bg:              'rgb(var(--c-bg) / <alpha-value>)',
        surface:         'rgb(var(--c-surface) / <alpha-value>)',
        'surface-soft':  'rgb(var(--c-surface-soft) / <alpha-value>)',
        ink:             'rgb(var(--c-ink) / <alpha-value>)',
        'ink-secondary': 'rgb(var(--c-ink-secondary) / <alpha-value>)',
        'ink-tertiary':  'rgb(var(--c-ink-tertiary) / <alpha-value>)',
        accent:          'rgb(var(--c-accent) / <alpha-value>)',
        'accent-deep':   'rgb(var(--c-accent-deep) / <alpha-value>)',
        'accent-light':  'rgb(var(--c-accent-light) / <alpha-value>)',
        success:         'rgb(var(--c-success) / <alpha-value>)',
        'success-bg':    'rgb(var(--c-success-bg) / <alpha-value>)',
        warning:         'rgb(var(--c-warning) / <alpha-value>)',
        'warning-bg':    'rgb(var(--c-warning-bg) / <alpha-value>)',
        danger:          'rgb(var(--c-danger) / <alpha-value>)',
        'danger-bg':     'rgb(var(--c-danger-bg) / <alpha-value>)',
        border:          'var(--c-border)',
        'border-strong': 'var(--c-border-strong)',
      },
      borderRadius: { sm: '6px', md: '10px', lg: '14px', xl: '20px' },
    },
  },
  plugins: [],
} satisfies Config
