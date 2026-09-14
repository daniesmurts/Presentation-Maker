import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OutlineEditor from './OutlineEditor'
import type { OutlineSlide } from '../../../../shared/types'

const OUTLINE: OutlineSlide[] = [
  { type: 'title', title: 'Вступление', brief: '' },
  { type: 'bullets', title: 'Проблема', brief: 'x' },
  { type: 'summary', title: 'Итоги', brief: '' },
]

describe('OutlineEditor', () => {
  it('moves a slide up by swapping with its neighbour and confirms the new order', () => {
    const onConfirm = vi.fn()
    render(<OutlineEditor outline={OUTLINE} onConfirm={onConfirm} onCancel={() => {}} confirming={false} />)
    fireEvent.click(screen.getAllByLabelText('Выше')[2])
    fireEvent.click(screen.getByText('Написать слайды'))
    expect(onConfirm.mock.calls[0][0].map((s: OutlineSlide) => s.title)).toEqual(['Вступление', 'Итоги', 'Проблема'])
  })

  it('drops blank-title rows from what is confirmed and says how many were dropped', () => {
    const onConfirm = vi.fn()
    render(<OutlineEditor outline={OUTLINE} onConfirm={onConfirm} onCancel={() => {}} confirming={false} />)
    fireEvent.change(screen.getByLabelText('Заголовок слайда 2'), { target: { value: '   ' } })
    expect(screen.getByText(/1 без заголовка/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Написать слайды'))
    expect(onConfirm.mock.calls[0][0]).toHaveLength(2)
  })

  it('disables confirm when nothing usable is left', () => {
    render(<OutlineEditor outline={[{ type: 'bullets', title: '', brief: '' }]} onConfirm={() => {}} onCancel={() => {}} confirming={false} />)
    expect(screen.getByText('Написать слайды').closest('button')).toBeDisabled()
  })

  it('inserts a new row after the clicked one', () => {
    render(<OutlineEditor outline={OUTLINE} onConfirm={() => {}} onCancel={() => {}} confirming={false} />)
    fireEvent.click(screen.getAllByLabelText('Добавить слайд ниже')[0])
    expect(screen.getAllByLabelText(/Заголовок слайда/)).toHaveLength(4)
    expect(screen.getByLabelText('Заголовок слайда 2')).toHaveValue('')
  })
})
