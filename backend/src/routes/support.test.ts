import { describe, it, expect } from 'vitest'
import { readContactParams, MESSAGE_MAX_CHARS } from './support'
import { ValidationError } from '../errors/AppError'

const ok = { category: 'support', name: 'Иван', email: 'ivan@example.com', message: 'Не открывается экспорт .pptx' }

describe('readContactParams', () => {
  it('reads a minimal valid submission and trims whitespace', () => {
    expect(readContactParams({ ...ok, name: '  Иван  ' })).toEqual(ok)
  })

  it('defaults an unset category to general', () => {
    const { category } = readContactParams({ name: ok.name, email: ok.email, message: ok.message })
    expect(category).toBe('general')
  })

  it('rejects an unknown category, missing name, bad email, and empty message', () => {
    for (const bad of [{ ...ok, category: 'sales' }, { ...ok, name: '' }, { ...ok, email: 'not-an-email' }, { ...ok, message: '' }]) {
      expect(() => readContactParams(bad)).toThrow(ValidationError)
    }
  })

  it('caps the message length', () => {
    expect(() => readContactParams({ ...ok, message: 'x'.repeat(MESSAGE_MAX_CHARS + 1) })).toThrow(ValidationError)
  })

  it('never trusts non-string fields', () => {
    expect(() => readContactParams({ ...ok, email: 12345 })).toThrow(ValidationError)
  })
})
