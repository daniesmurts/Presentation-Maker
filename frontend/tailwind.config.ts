import type { Config } from 'tailwindcss'

// Tokens live in src/index.css as RGB channels so opacity modifiers work
// (bg-accent/10). Contrast ratios are recorded next to each token there.
// Three faces (all with full Cyrillic): Literata for display and speaker
// notes, Golos Text for the UI, JetBrains Mono for numbers. Fallbacks are
// the PT faces the PDF exporter vendors, so a slow font load still reads
// as the same product.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['"Golos Text"', '"PT Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['Literata', '"PT Serif"', 'Georgia', 'serif'],
        mono:    ['"JetBrains Mono"', '"PT Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg:              'rgb(var(--c-bg) / <alpha-value>)',
        surface:         'rgb(var(--c-surface) / <alpha-value>)',
        'surface-soft':  'rgb(var(--c-surface-soft) / <alpha-value>)',
        ink:             'rgb(var(--c-ink) / <alpha-value>)',
        'ink-hover':     'rgb(var(--c-ink-hover) / <alpha-value>)',
        'ink-secondary': 'rgb(var(--c-ink-secondary) / <alpha-value>)',
        'ink-tertiary':  'rgb(var(--c-ink-tertiary) / <alpha-value>)',
        accent:          'rgb(var(--c-accent) / <alpha-value>)',
        'accent-deep':   'rgb(var(--c-accent-deep) / <alpha-value>)',
        'accent-light':  'rgb(var(--c-accent-light) / <alpha-value>)',
        marker:          'rgb(var(--c-marker) / <alpha-value>)',
        'marker-ink':    'rgb(var(--c-marker-ink) / <alpha-value>)',
        success:         'rgb(var(--c-success) / <alpha-value>)',
        'success-bg':    'rgb(var(--c-success-bg) / <alpha-value>)',
        warning:         'rgb(var(--c-warning) / <alpha-value>)',
        'warning-bg':    'rgb(var(--c-warning-bg) / <alpha-value>)',
        danger:          'rgb(var(--c-danger) / <alpha-value>)',
        'danger-bg':     'rgb(var(--c-danger-bg) / <alpha-value>)',
        border:          'var(--c-border)',
        'border-strong': 'var(--c-border-strong)',
      },
      borderRadius: { sm: '4px', md: '6px', lg: '10px', xl: '14px' },
    },
  },
  plugins: [],
} satisfies Config
