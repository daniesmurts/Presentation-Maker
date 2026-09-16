import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DraftPage from './DraftPage'
import { EMPTY_DRAFT_CARD, type Draft } from '../../../shared/types'

// The draft page: a starter chip is a first message; the reply fills the
// card; the button is enabled only once the card would pass the form's
// reader; «Собрать» lands on the job page.

const base: Draft = {
  id: 'd1', workspace_id: 'w', owner_id: 'u', title: '', messages: [], card: EMPTY_DRAFT_CARD, job_id: null,
  created_at: '2026-09-16T00:00:00Z', updated_at: '2026-09-16T00:00:00Z',
}
const replied: Draft = {
  ...base, title: 'Итоги квартала',
  messages: [{ role: 'user', text: 'Итоги квартала для руководства', at: '' }, { role: 'assistant', text: 'Кому именно — совету директоров?', at: '' }],
  card: { ...EMPTY_DRAFT_CARD, title: 'Итоги квартала', intent: 'report', audience: 'executives', theses: ['Выручка +18%'], open_questions: ['Сколько минут?'] },
}
vi.mock('../api/drafts', () => ({
  getDraft:     vi.fn(async () => base),
  sendMessage:  vi.fn(async () => replied),
  saveCard:     vi.fn(async (_id: string, card: Draft['card']) => ({ ...replied, card })),
  deleteDraft:  vi.fn(),
  collectDraft: vi.fn(async () => ({ id: 'job9' })),
}))
vi.mock('../lib/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/drafts/d1']}>
        <Routes>
          <Route path="/drafts/:id" element={<DraftPage />} />
          <Route path="/jobs/:id"   element={<div>job page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DraftPage', () => {
  it('sends a starter, shows the reply, fills the card and enables the hand-off', async () => {
    const api = await import('../api/drafts')
    mount()
    const chip = await screen.findByRole('button', { name: 'Есть тема, нет структуры' })
    const collect = screen.getAllByRole('button', { name: 'Собрать выступление' })[0]
    expect(collect).toHaveProperty('disabled', true)
    expect(screen.getAllByText(/не хватает: темы, цели, аудитории, тезисов/)[0]).toBeTruthy()

    fireEvent.click(chip)
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('d1', expect.stringContaining('есть тема')))
    expect(await screen.findByText('Кому именно — совету директоров?')).toBeTruthy()
    expect(screen.getAllByText('Сколько минут?')[0]).toBeTruthy()
    expect((screen.getAllByLabelText('Тема выступления')[0] as HTMLInputElement).value).toBe('Итоги квартала')
    expect(screen.getAllByText('Всё на месте — можно собирать.')[0]).toBeTruthy()

    const ready = screen.getAllByRole('button', { name: 'Собрать выступление' })[0]
    expect(ready).toHaveProperty('disabled', false)
    fireEvent.click(ready)
    await waitFor(() => expect(api.collectDraft).toHaveBeenCalledWith('d1'))
    expect(await screen.findByText('job page')).toBeTruthy()
  })

  it('a typed message goes out on Enter and the field clears', async () => {
    const api = await import('../api/drafts')
    mount()
    const box = await screen.findByPlaceholderText(/Напишите редактору/)
    fireEvent.change(box, { target: { value: 'Питч для инвесторов' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('d1', 'Питч для инвесторов'))
    expect((box as HTMLTextAreaElement).value).toBe('')
  })
})
