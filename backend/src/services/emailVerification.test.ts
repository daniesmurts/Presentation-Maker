import { describe, it, expect } from 'vitest'
import { emailVerifyToken, extractUserIdFromVerifyToken, verifyEmailVerifyToken, emailVerifyUrl } from './emailVerification'

describe('emailVerification', () => {
  it('round-trips a token for the email it was signed with', () => {
    const token = emailVerifyToken('user-1', 'a@b.com')
    expect(extractUserIdFromVerifyToken(token)).toBe('user-1')
    expect(verifyEmailVerifyToken(token, 'a@b.com')).toBe('user-1')
  })

  it('is case-insensitive on the email, matching how it is stored', () => {
    const token = emailVerifyToken('user-1', 'A@B.com')
    expect(verifyEmailVerifyToken(token, 'a@b.com')).toBe('user-1')
  })

  it('invalidates the link if the account email changed since it was sent', () => {
    const token = emailVerifyToken('user-1', 'old@b.com')
    expect(verifyEmailVerifyToken(token, 'new@b.com')).toBeNull()
  })

  it('rejects a forged signature', () => {
    expect(verifyEmailVerifyToken('user-1.deadbeef', 'a@b.com')).toBeNull()
  })

  it('rejects a malformed token', () => {
    expect(verifyEmailVerifyToken('not-a-token', 'a@b.com')).toBeNull()
    expect(extractUserIdFromVerifyToken('not-a-token')).toBeNull()
  })

  it('builds a link under /api/auth/verify-email carrying the token', () => {
    const url = emailVerifyUrl('user-1', 'a@b.com')
    expect(url).toContain('/api/auth/verify-email?token=')
    expect(url.endsWith(emailVerifyToken('user-1', 'a@b.com'))).toBe(true)
  })
})
