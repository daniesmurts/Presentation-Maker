import { describe, it, expect } from 'vitest'
import { signRequest, verifyNotification } from './token'

describe('signRequest', () => {
  // The worked example on developer.tbank.ru/eacq/intro/developer/token —
  // a fixture that is NOT our own output (CLAUDE.md §9).
  it('reproduces the portal example', () => {
    const token = signRequest({
      TerminalKey: 'MerchantTerminalKey',
      Amount:      19200,
      OrderId:     '00000',
      Description: 'Подарочная карта на 1000 рублей',
      DATA:        { Phone: '+71234567890' },   // nested → excluded
      Receipt:     { Email: 'a@b.c' },
    }, '11111111111111')
    expect(token).toBe('72dd466f8ace0a37a1f740ce5fb78101712bc0665d91a8108c7c8a0ccd426db2')
  })

  it('ignores an existing Token and null values; booleans sign as text', () => {
    const a = signRequest({ TerminalKey: 't', Success: true, Token: 'garbage', ErrorCode: null }, 'p')
    const b = signRequest({ TerminalKey: 't', Success: 'true' }, 'p')
    expect(a).toBe(b)
  })
})

describe('verifyNotification', () => {
  const password = 'secret-1'
  const body = {
    TerminalKey: 'T1', OrderId: 'ws-1-1', Success: true, Status: 'CONFIRMED',
    PaymentId: 12345, ErrorCode: '0', Amount: 250000, CardId: 77, Pan: '430000******0777',
    ExpDate: '1230', RebillId: 987654321,
  }
  it('accepts a correctly signed body, case-insensitively', () => {
    const Token = signRequest(body, password)
    expect(verifyNotification({ ...body, Token }, password)).toBe(true)
    expect(verifyNotification({ ...body, Token: Token.toUpperCase() }, password)).toBe(true)
  })
  it('rejects a tampered amount, a wrong password, a missing or malformed token', () => {
    const Token = signRequest(body, password)
    expect(verifyNotification({ ...body, Amount: 100, Token }, password)).toBe(false)
    expect(verifyNotification({ ...body, Token }, 'other')).toBe(false)
    expect(verifyNotification(body, password)).toBe(false)
    expect(verifyNotification({ ...body, Token: 'abc' }, password)).toBe(false)
  })
})
