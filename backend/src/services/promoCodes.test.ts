import { describe, it, expect } from 'vitest'
import { normaliseCode, discountKopecks, readCreateInput, MIN_CHARGE_KOPECKS } from './promoCodes'
import { ValidationError } from '../errors/AppError'

describe('normaliseCode', () => {
  it('uppercases and trims a valid code', () => {
    expect(normaliseCode('  welcome20  ')).toBe('WELCOME20')
  })
  it('rejects too short, too long, and invalid characters', () => {
    for (const bad of ['AB', 'x'.repeat(33), 'has spaces', 'lower$case']) {
      expect(() => normaliseCode(bad)).toThrow(ValidationError)
    }
  })
})

describe('discountKopecks', () => {
  const price = 250_000   // 2500 ₽
  it('percent takes a share of the price', () => {
    expect(discountKopecks('percent', 20, price)).toBe(50_000)
  })
  it('fixed takes a flat amount', () => {
    expect(discountKopecks('fixed', 100_000, price)).toBe(100_000)
  })
  it('never discounts below the 1 ₽ floor for an oversized fixed code', () => {
    expect(discountKopecks('fixed', 500_000, price)).toBe(price - MIN_CHARGE_KOPECKS)
  })
  it('a code discounting the full price still leaves the 1 ₽ floor charged', () => {
    expect(discountKopecks('fixed', price, price)).toBe(price - MIN_CHARGE_KOPECKS)
  })
})

describe('readCreateInput', () => {
  const admin = 'admin-1'
  it('reads a valid percent code', () => {
    expect(readCreateInput({ code: 'welcome20', kind: 'percent', value: 20 }, admin))
      .toEqual({ code: 'WELCOME20', kind: 'percent', value: 20, maxUses: null, validUntil: null, createdBy: admin })
  })
  it('rejects a percent of 100+ (use free_months instead)', () => {
    expect(() => readCreateInput({ code: 'FREE', kind: 'percent', value: 100 }, admin)).toThrow(ValidationError)
  })
  it('rejects more than 12 free months', () => {
    expect(() => readCreateInput({ code: 'YEARPLUS', kind: 'free_months', value: 13 }, admin)).toThrow(ValidationError)
  })
  it('rejects a non-positive or non-integer value', () => {
    for (const bad of [0, -5, 1.5]) {
      expect(() => readCreateInput({ code: 'X', kind: 'fixed', value: bad }, admin)).toThrow(ValidationError)
    }
  })
  it('reads max_uses and valid_until when given, rejects a bad date', () => {
    expect(readCreateInput({ code: 'LAUNCH', kind: 'fixed', value: 50_000, max_uses: '10', valid_until: '2026-12-31' }, admin))
      .toMatchObject({ maxUses: 10, validUntil: '2026-12-31' })
    expect(() => readCreateInput({ code: 'BAD', kind: 'fixed', value: 1, valid_until: 'not-a-date' }, admin)).toThrow(ValidationError)
  })
})
