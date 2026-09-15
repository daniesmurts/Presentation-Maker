// Runtime helpers around the shared theme data (shared/themes.ts): the
// picker list, the brand kit, the recipe refit, lookup by id.
import { THEMES, DEFAULT_THEME, type Theme, type ThemePalette } from '../../../shared/themes'
import { worstGround, type BackgroundRecipe } from '../../../shared/slideBackground'
export * from '../../../shared/themes'

/** For the picker and the stage: id, name, the colours a swatch needs, and
 *  the background recipe so the browser draws the same treatment. */
export function listThemes(custom?: Theme | null): Array<{ id: string; name: string; bg: string; ink: string; ink2: string; accent: string; panel: string; background: BackgroundRecipe }> {
  const all = custom ? [custom, ...Object.values(THEMES)] : Object.values(THEMES)
  return all.map((t) => ({ id: t.id, name: t.name, bg: t.palette.bg, ink: t.palette.ink, ink2: t.palette.ink2, accent: t.palette.accent, panel: t.palette.panel, background: t.background }))
}

// ─── Brand kit → theme ──────────────────────────────────────────────────────
//
// A workspace's brand kit overrides the theme's accent. The accent is used
// two ways on a slide: as GRAPHICS (rules, the title band, column-header
// fills) — judged at 3:1 and never load-bearing for reading — and as small
// bold TEXT (labels like «ГЛАВНОЕ», comparison headers). A brand colour
// may be pale; measured against the theme's ground, a text-unsafe accent
// keeps the graphics and the labels fall back to ink2. The logo and name
// are drawn on the title slide only.

export interface BrandKit {
  accent?: string | null           // 6-digit hex, no '#'
  name?:   string | null
  logo?:   { dataUri: string; buffer: Buffer } | null
  /** The workspace's own theme (L3), picked as theme_id = 'custom'. */
  customTheme?: Theme | null
}

export interface AppliedTheme extends Theme {
  /** The colour for small bold labels — the accent when it clears 4.5:1 on
   *  the theme ground, else ink2. Recorded per export in the log. */
  labelColor: string
  brand:      BrandKit | null
}

export function applyBrand(theme: Theme, brand: BrandKit | null, contrast: (a: string, b: string) => number, textOn: (hex: string) => string): AppliedTheme {
  const accent = brand?.accent && /^[0-9A-F]{6}$/.test(brand.accent) ? brand.accent : theme.palette.accent
  const palette = { ...theme.palette, accent, accentText: brand?.accent ? textOn(accent) : theme.palette.accentText }
  const labelColor = contrast(accent, theme.palette.bg) >= 4.5 ? accent : theme.palette.ink2
  // The background is tinted with the accent too, so a brand accent changes
  // the ground under a hero title; the recipe is refitted to the new palette.
  const background = fitRecipe(palette, theme.background, labelColor, contrast)
  return { ...theme, palette, labelColor, background, brand: brand ?? null }
}

// The text the background must not fail: ink (body), ink2 (secondary), and
// whatever draws the labels. Both roles, each against its worst ground.
const TEXT_FLOOR = 4.5
const STEP = 0.02

/** The recipe with each role's strength lowered — in 0.02 steps — until
 *  ink, ink2 and the label colour all clear 4.5:1 on that role's worst
 *  ground. A shipped theme's recipe returns unchanged (themes.test.ts
 *  asserts it); a brand accent's may not. `band` never changes: its ground
 *  is the bg by geometry. */
export function fitRecipe(p: ThemePalette, recipe: BackgroundRecipe, labelColor: string, contrast: (a: string, b: string) => number): BackgroundRecipe {
  const fit = (role: 'hero' | 'quiet'): number => {
    let s = recipe[role]
    for (; s > 0; s = Math.max(0, +(s - STEP).toFixed(2))) {
      const ground = worstGround(p, { ...recipe, [role]: s }, role)
      if (!ground) return s
      if ([p.ink, p.ink2, labelColor].every((c) => contrast(c, ground) >= TEXT_FLOOR)) return s
    }
    return 0
  }
  return { ...recipe, hero: fit('hero'), quiet: fit('quiet') }
}

/** Unknown id → default, never a throw: a talk row written by an older
 *  build may name a theme that has since been renamed. `custom` resolves
 *  to the brand kit's theme when there is one, else the default. */
export function getTheme(id: string | null | undefined, brand?: BrandKit | null): Theme {
  if (id === 'custom') return brand?.customTheme ?? DEFAULT_THEME
  return (id && THEMES[id]) || DEFAULT_THEME
}
