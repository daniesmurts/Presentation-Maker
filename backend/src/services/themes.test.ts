import { describe, it, expect } from 'vitest'
import { THEMES, applyBrand, fitRecipe, validateTheme, isThemeShape } from './themes'
import { contrastRatio, textOn } from '../lib/brandColor'
import { worstGround, backgroundSvg, hasTreatment } from '../../../shared/slideBackground'

// CLAUDE.md §3.8: contrast is measured, never assumed. The numbers in the
// comments of themes.ts are the numbers this file checks — including the
// ground under a background treatment (Design v3, TODO L1).

const TEXT_FLOOR = 4.5

describe('themes — every text pair clears the floor', () => {
  for (const t of Object.values(THEMES)) {
    it(`${t.id}: ink, ink2 on bg and panel; accent as a label on bg`, () => {
      const p = t.palette
      expect(contrastRatio(p.ink, p.bg)).toBeGreaterThanOrEqual(TEXT_FLOOR)
      expect(contrastRatio(p.ink2, p.bg)).toBeGreaterThanOrEqual(TEXT_FLOOR)
      expect(contrastRatio(p.ink, p.panel)).toBeGreaterThanOrEqual(TEXT_FLOOR)
      expect(contrastRatio(p.ink2, p.panel)).toBeGreaterThanOrEqual(TEXT_FLOOR)
      expect(contrastRatio(p.accent, p.bg)).toBeGreaterThanOrEqual(TEXT_FLOOR)
      expect(contrastRatio(p.accentText, p.accent)).toBeGreaterThanOrEqual(TEXT_FLOOR)
    })

    it(`${t.id}: ink, ink2 and the label colour on the background's worst ground, both roles`, () => {
      const p = t.palette
      for (const role of ['hero', 'quiet'] as const) {
        const ground = worstGround(p, t.background, role)
        if (!ground) continue
        for (const c of [p.ink, p.ink2, p.accent]) expect(contrastRatio(c, ground), `${c} on ${ground} (${role})`).toBeGreaterThanOrEqual(TEXT_FLOOR)
      }
    })

    it(`${t.id}: the shipped recipe needs no refitting`, () => {
      expect(fitRecipe(t.palette, t.background, t.palette.accent, contrastRatio)).toEqual(t.background)
    })
  }

  it('there are twelve themes, every recipe kind is used, and ids are stable', () => {
    expect(Object.keys(THEMES)).toEqual(['default', 'dark', 'warm', 'bold', 'editorial', 'mono', 'forest', 'ocean', 'sand', 'violet', 'slate', 'play'])
    expect(new Set(Object.values(THEMES).map((t) => t.background.kind))).toEqual(new Set(['grid', 'blob', 'wash', 'band', 'solid', 'dots']))
    for (const [id, t] of Object.entries(THEMES)) expect(t.id).toBe(id)
  })

  it('validateTheme passes every shipped theme untouched', () => {
    for (const t of Object.values(THEMES)) {
      const v = validateTheme(t)
      expect(v.issues, t.id).toEqual([])
      expect(v.theme).toEqual(t)
    }
  })
})

describe('applyBrand refits the background to a brand accent', () => {
  // A pale brand accent: as a wash tint it lightens the warm ground and
  // ink2 would dip under the floor at the theme's strength.
  it('lowers the hero strength for a pale accent and leaves a strong one alone', () => {
    const pale = applyBrand(THEMES.warm, { accent: 'F3D27A' }, contrastRatio, textOn)
    expect(pale.background.kind).toBe('wash')
    const ground = worstGround(pale.palette, pale.background, 'hero')
    if (ground) for (const c of [pale.palette.ink, pale.palette.ink2, pale.labelColor]) expect(contrastRatio(c, ground)).toBeGreaterThanOrEqual(TEXT_FLOOR)
    const strong = applyBrand(THEMES.warm, { accent: '7A1E1E' }, contrastRatio, textOn)
    expect(strong.background).toEqual(THEMES.warm.background)
  })

  it('never touches a band — its ground is the bg by geometry', () => {
    const t = applyBrand(THEMES.bold, { accent: 'FFF7C0' }, contrastRatio, textOn)
    expect(t.background).toEqual(THEMES.bold.background)
  })

  it('a recipe that cannot be fitted ends at 0 — a flat ground, never a failing pair', () => {
    // ink2 equal to the accent: any tint moves the ground toward the text.
    const p = { ...THEMES.default.palette, ink2: '8A8A8A', accent: '8A8A8A' }
    const r = fitRecipe(p, { kind: 'wash', hero: 0.9, quiet: 0.5 }, '8A8A8A', contrastRatio)
    expect(r.hero).toBe(0)
    expect(hasTreatment(r, 'hero')).toBe(false)
  })
})

describe('backgroundSvg', () => {
  it('is deterministic and a complete document, and a solid recipe draws only the ground', () => {
    const p = THEMES.default.palette
    const a = backgroundSvg(p, THEMES.default.background, 'hero')
    expect(a).toBe(backgroundSvg(p, THEMES.default.background, 'hero'))
    expect(a.startsWith('<svg ')).toBe(true)
    expect(a.endsWith('</svg>')).toBe(true)
    expect(backgroundSvg(p, { kind: 'solid', hero: 1, quiet: 1 }, 'hero')).not.toContain('<defs>')
  })

  it('uses no opacity except the blob’s fade — every colour is one the tests can name', () => {
    const p = THEMES.default.palette
    for (const kind of ['wash', 'grid', 'dots', 'band'] as const) {
      expect(backgroundSvg(p, { kind, hero: 0.5, quiet: 0.2 }, 'hero')).not.toMatch(/opacity/)
    }
  })
})

describe('validateTheme — the model proposes, the contrast code disposes', () => {
  it('corrects a pale secondary text and a pale accent toward the ground’s opposite, and reports each', () => {
    const t = { ...THEMES.default, id: 'x', palette: { ...THEMES.default.palette, ink2: 'B0B0B0', accent: 'F3D27A' } }
    const v = validateTheme(t)
    const pairs = v.issues.map((i) => i.pair)
    expect(pairs).toContain('ink2/bg')
    expect(pairs).toContain('accent/bg')
    expect(contrastRatio(v.theme.palette.ink2, v.theme.palette.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(v.theme.palette.accent, v.theme.palette.panel)).toBeGreaterThanOrEqual(4.5)
    // accentText is re-checked against the corrected accent
    expect(contrastRatio(v.theme.palette.accentText, v.theme.palette.accent)).toBeGreaterThanOrEqual(4.5)
  })

  it('lowers a recipe strength that pushes ink2 under the floor, and reports it', () => {
    const t = { ...THEMES.dark, id: 'y', background: { kind: 'blob' as const, hero: 0.6, quiet: 0.1 } }
    const v = validateTheme(t)
    expect(v.theme.background.hero).toBeLessThan(0.6)
    expect(v.issues.find((i) => i.pair === 'background.hero')).toBeTruthy()
  })

  it('isThemeShape rejects a missing palette key and a bad hex', () => {
    expect(isThemeShape(THEMES.warm)).toBe(true)
    expect(isThemeShape({ ...THEMES.warm, palette: { ...THEMES.warm.palette, ink: '#123' } })).toBe(false)
    expect(isThemeShape({ id: 'z', name: 'z' })).toBe(false)
  })
})
