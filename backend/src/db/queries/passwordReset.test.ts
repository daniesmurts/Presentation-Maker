import { describe, it, expect } from 'vitest'
import { hashToken, generateRawToken } from './passwordReset'

describe('passwordReset token hashing', () => {
  it('generates high-entropy, unique raw tokens', () => {
    const a = generateRawToken()
    const b = generateRawToken()
    expect(a).not.toBe(b)
    expect(a).toHaveLength(64) // 32 bytes, hex-encoded
  })

  it('hashes deterministically so a lookup by hash works', () => {
    const raw = generateRawToken()
    expect(hashToken(raw)).toBe(hashToken(raw))
  })

  it('never stores the raw token as its own hash', () => {
    const raw = generateRawToken()
    expect(hashToken(raw)).not.toBe(raw)
  })
})
