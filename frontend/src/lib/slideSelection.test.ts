import { describe, it, expect } from 'vitest'
import { remapAfterMove, remapAfterDelete, remapAfterInsert, toSlideNumbers, rangeBetween } from './slideSelection'

const sel = (...i: number[]) => new Set(i)
const arr = (s: Set<number>) => [...s].sort((a, b) => a - b)

describe('remapAfterMove — splice semantics, matching the server', () => {
  it('the moved slide follows itself', () => {
    expect(arr(remapAfterMove(sel(1), 1, 4))).toEqual([4])
    expect(arr(remapAfterMove(sel(4), 4, 1))).toEqual([1])
  })
  it('slides between shift toward the vacated position; outside ones stay', () => {
    // deck a b c d e; move a(0) to 3 → b c d a e. Selected c(2) → 1; e(4) → 4.
    expect(arr(remapAfterMove(sel(2, 4), 0, 3))).toEqual([1, 4])
    // move e(4) to 1 → a e b c d. Selected b(1) → 2; a(0) → 0.
    expect(arr(remapAfterMove(sel(0, 1), 4, 1))).toEqual([0, 2])
  })
  it('a no-op move returns the same set', () => {
    const s = sel(2)
    expect(remapAfterMove(s, 2, 2)).toBe(s)
  })
})

describe('remapAfterDelete', () => {
  it('the deleted slide leaves the selection and later ones shift down — the bug this file exists for', () => {
    // tick 3 and 7 (idx 2, 6), delete slide 5 (idx 4) → 3 and 6, not 3 and 8
    expect(arr(remapAfterDelete(sel(2, 6), 4))).toEqual([2, 5])
    expect(arr(remapAfterDelete(sel(2, 4), 4))).toEqual([2])
  })
})

describe('remapAfterInsert', () => {
  it('later slides shift up; the new slide is not selected', () => {
    expect(arr(remapAfterInsert(sel(1, 3), 1))).toEqual([1, 4])
  })
})

describe('helpers', () => {
  it('toSlideNumbers speaks the user’s 1-based deck order', () => {
    expect(toSlideNumbers(sel(4, 0, 2))).toEqual([1, 3, 5])
  })
  it('rangeBetween is inclusive and direction-agnostic', () => {
    expect(rangeBetween(5, 2)).toEqual([2, 3, 4, 5])
    expect(rangeBetween(3, 3)).toEqual([3])
  })
})
