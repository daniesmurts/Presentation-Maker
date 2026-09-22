import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TalkForm from './TalkForm'

// The brief may now be 50 000 characters (2026-09-22). A long brief is not
// an error — but a long brief in a short deck drops material, so the form
// offers the slide count that fits it, where the number is.

const mount = () => render(<TalkForm onSubmit={vi.fn()} submitting={false} />)
const briefField = () => screen.getByLabelText(/Тезисы|Ваши тезисы|О чём/i) as HTMLTextAreaElement

describe('TalkForm — a long brief', () => {
  it('accepts up to 50 000 characters', () => {
    mount()
    expect(briefField().maxLength).toBe(50_000)
  })

  it('offers more slides when the material outgrows the chosen length, and sets it on click', () => {
    mount()
    fireEvent.change(briefField(), { target: { value: 'т'.repeat(24_000) } })   // ≈ 20 slides
    const offer = screen.getByRole('button', { name: /Поставить 20/ })
    expect(screen.getByText(/Материала хватит слайдов на 20/)).toBeTruthy()
    fireEvent.click(offer)
    expect((screen.getByLabelText('Или точное число слайдов') as HTMLInputElement).value).toBe('20')
  })

  it('says nothing when the deck already has room', () => {
    mount()
    fireEvent.change(briefField(), { target: { value: 'т'.repeat(2_000) } })
    expect(screen.queryByText(/Материала хватит/)).toBeNull()
  })
})
