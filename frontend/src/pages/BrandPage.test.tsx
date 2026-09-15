import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BrandPage from './BrandPage'
import { THEMES } from '../../../shared/themes'
import type { Theme } from '../../../shared/themes'

// Design v3 (L3): the «Своя тема» section — propose from a description,
// see the validator's corrections, save; the saved theme joins the list.

const swatches = Object.values(THEMES).map((t) => ({ id: t.id, name: t.name, bg: t.palette.bg, ink: t.palette.ink, ink2: t.palette.ink2, accent: t.palette.accent, panel: t.palette.panel, background: t.background }))
const candidate: Theme = { ...THEMES.dark, id: 'custom', name: 'Финтех' }
vi.mock('../api/brand', async (orig) => ({
  ...(await orig<typeof import('../api/brand')>()),
  getBrand: vi.fn(async () => ({ brand: { accent: '2F4FD0', name: 'ООО Пример', logo: null, contrast: [] }, themes: swatches, custom_theme: null, style_learning: false, image_generation: false })),
  generateTheme: vi.fn(async () => ({ theme: candidate, issues: [{ pair: 'accent/bg', ratio: 3.2, floor: 4.5 }] })),
  saveTheme: vi.fn(async (theme: Theme) => ({ theme, issues: [], themes: [{ id: 'custom', name: theme.name, bg: theme.palette.bg, ink: theme.palette.ink, ink2: theme.palette.ink2, accent: theme.palette.accent, panel: theme.palette.panel, background: theme.background }, ...swatches] })),
}))
vi.mock('../lib/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><BrandPage /></QueryClientProvider>)
}

describe('BrandPage — custom theme', () => {
  it('proposes from a description, shows the correction by name, saves, and reports the theme as current', async () => {
    const { generateTheme, saveTheme } = await import('../api/brand')
    mount()
    const input = await screen.findByPlaceholderText(/финтех/)
    fireEvent.change(input, { target: { value: 'финтех, надёжно, тёмная' } })
    fireEvent.click(screen.getByRole('button', { name: 'Предложить' }))
    await waitFor(() => expect(generateTheme).toHaveBeenCalledWith('финтех, надёжно, тёмная'))
    expect(await screen.findByText(/Предложение — Финтех/)).toBeTruthy()
    expect(screen.getByText(/accent\/bg: было 3\.2:1, нужно 4\.5:1/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить как свою тему' }))
    await waitFor(() => expect(saveTheme).toHaveBeenCalled())
    expect(await screen.findByText(/Сейчас: «Финтех»/)).toBeTruthy()
  })

  it('the accent buttons are disabled without a brand accent', async () => {
    const api = await import('../api/brand')
    vi.mocked(api.getBrand).mockResolvedValueOnce({ brand: { accent: null, name: null, logo: null, contrast: [] }, themes: swatches, custom_theme: null, style_learning: false, image_generation: false })
    mount()
    expect((await screen.findByRole('button', { name: 'светлая' })) as HTMLButtonElement).toHaveProperty('disabled', true)
  })
})
