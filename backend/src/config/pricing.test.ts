import { describe, it, expect } from 'vitest'
import { calculateDeepSeekCost, isDeepSeekPeakHour } from './pricing'

// Rates confirmed against api-docs.deepseek.com/quick_start/pricing
// (2026-09-22): miss $0.30 / hit $0.006 / out $1.20 per 1M at peak, half
// off-peak. The hit rate is what makes a long brief affordable — it is the
// prompt's prefix in every expansion call.
const PEAK = new Date('2026-09-22T02:00:00Z')      // Tuesday 02:00 UTC
const OFF  = new Date('2026-09-20T02:00:00Z')      // Sunday

describe('calculateDeepSeekCost', () => {
  it('prices an uncached call at the miss rate, and halves it off-peak', () => {
    expect(calculateDeepSeekCost(1_000_000, 0, 'deepseek-flash', PEAK)).toBeCloseTo(0.30, 6)
    expect(calculateDeepSeekCost(0, 1_000_000, 'deepseek-flash', PEAK)).toBeCloseTo(1.20, 6)
    expect(calculateDeepSeekCost(1_000_000, 1_000_000, 'deepseek-flash', OFF)).toBeCloseTo(0.75, 6)
    expect(isDeepSeekPeakHour(PEAK)).toBe(true)
    expect(isDeepSeekPeakHour(OFF)).toBe(false)
  })

  it('charges the cached share at the hit rate — 50× cheaper, the rest at the miss rate', () => {
    // The measured shape of a second expansion batch: 11 776 of 11 962 cached.
    const all   = calculateDeepSeekCost(11_962, 0, 'deepseek-flash', PEAK)
    const real  = calculateDeepSeekCost(11_962, 0, 'deepseek-flash', PEAK, 11_776)
    expect(real).toBeLessThan(all / 3)
    expect(real).toBeCloseTo((186 / 1e6) * 0.30 + (11_776 / 1e6) * 0.006, 8)
  })

  it('never lets a cached count exceed or go below the input it belongs to', () => {
    const full = calculateDeepSeekCost(1000, 0, 'deepseek-flash', PEAK, 5000)   // provider nonsense
    expect(full).toBeCloseTo((1000 / 1e6) * 0.006, 8)
    expect(calculateDeepSeekCost(1000, 0, 'deepseek-flash', PEAK, -5)).toBeCloseTo((1000 / 1e6) * 0.30, 8)
  })
})
