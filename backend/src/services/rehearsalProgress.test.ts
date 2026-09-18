import { describe, it, expect } from 'vitest'
import { rehearsalProgress, fillersPer100 } from '../../../shared/rehearsalProgress'

const base = { duration_ms: 20 * 60_000, target_ms: 15 * 60_000, words: 2000, words_per_min: 100, fillers: 40, over_slides: 3 }

describe('rehearsalProgress', () => {
  it('reads time toward the target, fillers per hundred words, pace into the band, fewer slides over', () => {
    const p = rehearsalProgress({ ...base, duration_ms: 16 * 60_000, fillers: 16, words_per_min: 120, over_slides: 1 }, base)
    expect(p.time.better).toBe(true)
    expect(p.fillers).toEqual({ from: 2, to: 0.8, better: true })
    expect(p.wpm?.better).toBeNull()          // 100 → 120: both inside the band, no verdict
    expect(p.over.better).toBe(true)
    expect(p.improved).toBe(3); expect(p.judged).toBe(3)
  })
  it('does not call five seconds a change, and has no time verdict without a target', () => {
    expect(rehearsalProgress({ ...base, duration_ms: base.duration_ms - 3_000 }, base).time.better).toBeNull()
    expect(rehearsalProgress({ ...base, target_ms: null }, { ...base, target_ms: null }).time.better).toBeNull()
  })
  it('judges pace only by the band, and skips it when a run had no recognition', () => {
    expect(rehearsalProgress({ ...base, words_per_min: 170 }, base).wpm?.better).toBe(false)
    expect(rehearsalProgress({ ...base, words_per_min: 120 }, { ...base, words_per_min: 80 }).wpm?.better).toBe(true)
    expect(rehearsalProgress({ ...base, words_per_min: null }, base).wpm).toBeNull()
  })
  it('fillersPer100 is a rate, so a longer run is not punished for more words', () => {
    expect(fillersPer100(40, 2000)).toBe(2)
    expect(fillersPer100(0, 0)).toBe(0)
  })
})
