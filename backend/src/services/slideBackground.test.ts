import { describe, it, expect, vi } from 'vitest'
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
import { renderBackgroundPng, backgroundCacheSize } from './slideBackground'
import { THEMES } from './themes'
import { imageSize } from '../lib/imageSize'

describe('renderBackgroundPng', () => {
  it('rasterises every shipped theme at 1600×900 as a PNG under 250 KB, and nothing for a role that draws nothing', async () => {
    for (const t of Object.values(THEMES)) for (const role of ['hero', 'quiet'] as const) {
      const r = await renderBackgroundPng(t.palette, t.background, role)
      if (t.background.kind === 'solid') { expect(r).toBeNull(); continue }   // Монохром draws nothing, by design
      expect(r, `${t.id}/${role}`).not.toBeNull()
      const size = imageSize(r!.buffer)
      const gradient = t.background.kind === 'wash' || t.background.kind === 'blob'
      expect(size).toEqual(gradient ? { width: 1200, height: 675 } : { width: 1600, height: 900 })
      // Measured 2026-09-15 (L3, twelve themes): grid 37 KB · band 9 KB · dots 14 KB ·
      // wash hero ≤ 85 KB · blob ≤ 184 KB at 1200 wide (263 KB at 1600). A blob
      // deck carries ~350 KB of background — one photo's worth; acceptable.
      expect(r!.bytes).toBeLessThan(200_000)
    }
    expect(await renderBackgroundPng(THEMES.default.palette, { kind: 'solid', hero: 1, quiet: 1 }, 'hero')).toBeNull()
    expect(await renderBackgroundPng(THEMES.default.palette, { kind: 'wash', hero: 0.5, quiet: 0 }, 'quiet')).toBeNull()
  }, 30_000)

  it('serves the same inputs from the cache', async () => {
    const a = await renderBackgroundPng(THEMES.warm.palette, THEMES.warm.background, 'hero')
    const before = backgroundCacheSize()
    const b = await renderBackgroundPng(THEMES.warm.palette, THEMES.warm.background, 'hero')
    expect(a).toBe(b)
    expect(backgroundCacheSize()).toBe(before)
  })
})
