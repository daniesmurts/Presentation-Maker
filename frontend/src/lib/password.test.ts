import { describe, it, expect } from 'vitest'
import { passwordIsStrong, passwordRuleState } from '../../../shared/password'

// The rules the registration checklist shows; the server refuses what fails them.
describe('password rules', () => {
  it('needs 8+ characters, a capital and a digit', () => {
    expect(passwordIsStrong('Password1')).toBe(true)
    expect(passwordIsStrong('password1')).toBe(false)   // no capital
    expect(passwordIsStrong('Password')).toBe(false)    // no digit
    expect(passwordIsStrong('Pass1')).toBe(false)       // short
  })
  it('a Cyrillic capital counts — the founding users type Russian', () => {
    expect(passwordIsStrong('Пароль123')).toBe(true)
  })
  it('reports each rule separately, in the order the checklist shows them', () => {
    expect(passwordRuleState('abc').map((r) => `${r.id}:${r.ok}`)).toEqual(['length:false', 'upper:false', 'digit:false'])
    expect(passwordRuleState('Abcdefg1').every((r) => r.ok)).toBe(true)
  })
})
