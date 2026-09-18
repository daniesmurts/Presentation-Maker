import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TalksPage from './TalksPage'

// The empty state — a new account's first screen — leads with the editor
// (TODO O2): one primary that opens a draft, the form one link away.

vi.mock('../api/talks', () => ({ listTalks: vi.fn(async () => []), importPptx: vi.fn() }))
vi.mock('../api/drafts', () => ({ createDraft: vi.fn(async () => ({ id: 'd7' })) }))
vi.mock('../components/ReferralBanner', () => ({ default: () => null }))
vi.mock('../lib/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { email: 'a@b.c', features: { billing: false }, email_verified_at: 'x' } }) }))

describe('TalksPage — empty', () => {
  it('offers the editor first and opens a draft', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/talks']}><Routes>
      <Route path="/talks" element={<TalksPage />} />
      <Route path="/drafts/:id" element={<div>draft page</div>} />
    </Routes></MemoryRouter></QueryClientProvider>)
    const cta = await screen.findByRole('button', { name: /Рассказать редактору/ })
    expect(screen.getByRole('link', { name: 'или заполните форму' })).toHaveProperty('pathname', '/talks/new')
    fireEvent.click(cta)
    await waitFor(() => expect(screen.getByText('draft page')).toBeTruthy())
  })
})
