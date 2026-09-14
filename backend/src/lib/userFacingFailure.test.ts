import { describe, it, expect } from 'vitest'
import { AxiosError } from 'axios'
import { userFacingFailure } from './userFacingFailure'
import { TruncatedResponseError, InvalidModelJsonError } from '../services/llm/modelJson'
import { ValidationError } from '../errors/AppError'

const FALLBACK = 'Не удалось создать выступление. Попробуйте ещё раз.'

describe('userFacingFailure', () => {
  it('never lets a parser message reach the user', () => {
    // The actual production text, 2026-09-09 (parent product).
    const real = new SyntaxError("Expected ',' or ']' after array element in JSON at position 3203")
    const shown = userFacingFailure(real, FALLBACK)
    expect(shown).not.toContain('JSON')
    expect(shown).not.toContain('position')
    expect(shown).toMatch(/^[^A-Za-z]*$/u)   // no Latin letters at all — it is Russian copy
  })

  it('tells the user to shorten the request when the answer was cut off', () => {
    // Not «попробуйте ещё раз»: an identical retry truncates identically.
    const shown = userFacingFailure(new TruncatedResponseError('deepseek-flash', 4400, 'DeepSeek'), FALLBACK)
    expect(shown).toContain('оборвался')
    expect(shown).toMatch(/уменьшите|сократите/)
  })

  it('does suggest a retry when a retry might actually work', () => {
    expect(userFacingFailure(new InvalidModelJsonError('outline'), FALLBACK)).toContain('ещё раз')
  })

  it('passes an AppError through — those are already written for users', () => {
    expect(userFacingFailure(new ValidationError('Загрузите файл (.pptx)'), FALLBACK)).toBe('Загрузите файл (.pptx)')
  })

  it('separates "overloaded" from "down" from "unreachable"', () => {
    const with_ = (status?: number) => new AxiosError('boom', undefined, undefined, undefined,
      status ? { status, data: {}, statusText: '', headers: {}, config: {} as never } : undefined)
    expect(userFacingFailure(with_(429), FALLBACK)).toContain('перегружен')
    expect(userFacingFailure(with_(503), FALLBACK)).toContain('временно недоступен')
    expect(userFacingFailure(with_(), FALLBACK)).toContain('связаться')
  })

  it('uses the product nouns, not the parent’s (no «конспект», no «презентация»)', () => {
    const shown = userFacingFailure(new TruncatedResponseError('m'), FALLBACK)
    expect(shown).not.toMatch(/конспект|презентац|лекци/i)
  })

  it('falls back to the caller’s own wording for anything unrecognised', () => {
    expect(userFacingFailure(new Error('ECONNRESET reading socket'), FALLBACK)).toBe(FALLBACK)
  })
})
