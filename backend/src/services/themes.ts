// A theme is DATA, not a fork of the exporter (CLAUDE.md §5.1): palette,
// fonts, and the handful of spacing numbers the layouts read. The exporter
// takes a Theme and never names a colour itself. Adding a theme is adding a
// row here; the test in talkExport.test.ts proves two themes produce two
// different decks from the same slides.
//
// Colours are hex WITHOUT '#', as pptxgenjs wants them. Every pair that
// carries text on a slide is for a projector — large text, metres away, a
// different medium from the web app — but the floor is still measured:
// numbers are recorded per theme.
//
// Design v3 (TODO L1): a theme also names a BACKGROUND RECIPE
// (shared/slideBackground.ts) — the treatment behind a slide, at one
// strength for hero slides (title, question, call to action) and a fainter
// one for content. The ground a text box may meet under a treatment is a
// named colour (`worstGround`), and the pairs below are measured against
// it too: the recipe strengths were chosen by lowering them until every
// pair cleared the floor, and themes.test.ts keeps them there.

import { worstGround, type BackgroundRecipe } from '../../../shared/slideBackground'

export interface ThemePalette {
  bg:          string   // slide background
  panel:       string   // tinted panel (definition box, column header, footer band)
  ink:         string   // body text
  ink2:        string   // secondary text
  ink3:        string   // captions
  accent:      string   // rules, labels, small emphasis — graphics and small caps, never body text
  accentText:  string   // text drawn ON the accent (title-slide band, if any)
  border:      string
}

export interface ThemeFonts {
  display: string   // titles
  body:    string   // everything else
  mono:    string   // slide numbers, a formula's short form
  math:    string   // the Unicode fallback for formulas
}

export interface Theme {
  id:      string
  name:    string
  palette: ThemePalette
  fonts:   ThemeFonts
  // Inches, 16:9. The one geometry a theme may vary is the margin; slide
  // size is fixed so slideFit's budgets stay true across themes. Every other
  // number is shared/slideGeometry.ts — themes v2 is one composition in
  // three palettes (the dark 'band' title of v1 is gone: the palette does
  // the theming, the layout stays the same, and a lit room is kinder to a
  // pale title slide anyway).
  margin:  number
  background: BackgroundRecipe
}

// Default — the web app's palette carried to the slide. Measured (WCAG):
//   ink 16201F on white 16.7 · ink2 57635F on white 6.3 / on panel EEF3F3 5.6
//   accent 0F6E6E on white 6.0 (used for labels ≤ 12pt bold and rules)
//   ink3 8A9793 on white 3.0 — captions at ≥ 12pt italic only
// Background: graph-paper grid in the ink. Hero lines E3E4E4 (0.12):
//   ink 13.1 · ink2 4.91 · accent 4.74. Quiet lines F1F2F2 (0.06): ink2 5.58.
export const DEFAULT_THEME: Theme = {
  id: 'default',
  name: 'Тезариум',
  palette: {
    bg: 'FFFFFF', panel: 'EEF3F3', ink: '16201F', ink2: '57635F', ink3: '8A9793',
    accent: '0F6E6E', accentText: 'FFFFFF', border: 'D9E0E0',
  },
  fonts: { display: 'Georgia', body: 'Arial', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6,
  background: { kind: 'grid', hero: 0.12, quiet: 0.06 },
}

// Dark — for a dim room. Measured:
//   ink F4F6F7 on 15211F 15.3 · ink2 C5CFCC on 15211F 10.4 · accent 5FC4BE on 15211F 8.0
//   panel 20302D: ink on it 12.7
// Background: two soft accent blobs on the right. Hero centre 254542
//   (0.22): ink 9.6 · ink2 6.56 · accent 5.04 — at 0.45 ink2 fell to 3.86,
//   which is why the strength is what it is. Quiet centre 1C312F: ink2 8.6.
export const DARK_THEME: Theme = {
  id: 'dark',
  name: 'Тёмная',
  palette: {
    bg: '15211F', panel: '20302D', ink: 'F4F6F7', ink2: 'C5CFCC', ink3: '9AA8A4',
    accent: '5FC4BE', accentText: '15211F', border: '2E3F3B',
  },
  fonts: { display: 'Georgia', body: 'Arial', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6,
  background: { kind: 'blob', hero: 0.22, quiet: 0.10 },
}

// Warm — a serif, paper-toned deck for talks that want to feel considered
// rather than corporate. Measured:
//   ink 1F1A14 on FBF8F2 16.3 · ink2 5C554B on bg 6.9 / on panel F3ECDF 6.3
//   accent 8A5C06 on bg 5.48 / on panel 4.95 (the pair that fails last) · white on it 5.81
//   ink3 8C8378 on bg 3.5 — captions only
// Background: a diagonal wash toward the accent. Hero corner EDE5D6 (0.12):
//   ink 13.8 · ink2 5.88 · accent 4.64 (0.18 put the accent at 4.28).
//   Quiet corner F5F0E6 (0.05): accent 5.12.
export const WARM_THEME: Theme = {
  id: 'warm',
  name: 'Тёплая',
  palette: {
    bg: 'FBF8F2', panel: 'F3ECDF', ink: '1F1A14', ink2: '5C554B', ink3: '8C8378',
    accent: '8A5C06', accentText: 'FFFFFF', border: 'E2D9C8',
  },
  fonts: { display: 'Georgia', body: 'Georgia', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6,
  background: { kind: 'wash', hero: 0.12, quiet: 0.05 },
}

// Bold — deep navy, white type, an amber band: the high-contrast deck for a
// pitch (the fourth theme TODO J asked for). Sans display: a pitch shouts,
// it does not narrate. Measured:
//   ink FFFFFF on 0B0F2A 18.8 · ink2 C7CBE6 on bg 11.8 / on panel 171C3F 10.3
//   accent FFB020 on bg 10.3 / on panel 9.0 · accentText 0B0F2A on accent 10.3
//   ink3 8C92B8 on bg 6.2
// Background: the accent band on the right edge — full accent (FFB020) on
//   hero slides, 604727 (0.35) as a margin strip on content. The band is
//   geometry, not a tint: it never lies under text (slideBackground.ts), so
//   the text ground stays the bg and the pairs above are the pairs.
export const BOLD_THEME: Theme = {
  id: 'bold',
  name: 'Яркая',
  palette: {
    bg: '0B0F2A', panel: '171C3F', ink: 'FFFFFF', ink2: 'C7CBE6', ink3: '8C92B8',
    accent: 'FFB020', accentText: '0B0F2A', border: '2A3060',
  },
  fonts: { display: 'Arial', body: 'Arial', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6,
  background: { kind: 'band', hero: 1, quiet: 0.35 },
}

export const THEMES: Record<string, Theme> = { default: DEFAULT_THEME, dark: DARK_THEME, warm: WARM_THEME, bold: BOLD_THEME }

/** For the picker and the stage: id, name, the colours a swatch needs, and
 *  the background recipe so the browser draws the same treatment. */
export function listThemes(): Array<{ id: string; name: string; bg: string; ink: string; ink2: string; accent: string; panel: string; background: BackgroundRecipe }> {
  return Object.values(THEMES).map((t) => ({ id: t.id, name: t.name, bg: t.palette.bg, ink: t.palette.ink, ink2: t.palette.ink2, accent: t.palette.accent, panel: t.palette.panel, background: t.background }))
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
 *  build may name a theme that has since been renamed. */
export function getTheme(id: string | null | undefined): Theme {
  return (id && THEMES[id]) || DEFAULT_THEME
}
