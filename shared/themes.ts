// A theme is DATA, not a fork of the exporter (CLAUDE.md §5.1): palette,
// fonts, and the handful of spacing numbers the layouts read. The exporter
// takes a Theme and never names a colour itself. Adding a theme is adding a
// row here; the test in talkExport.test.ts proves two themes produce two
// different decks from the same slides.
//
// SHARED (Design v3, L3): the backend exports with it, the browser previews
// with it, the landing builds its deck from it — one file, no copies (the
// site used to carry the palettes by hand, «keep in step»). Nothing here
// may import Node. `validateTheme()` at the bottom is what lets a theme
// arrive from anywhere — a row below, a model's answer, a brand kit — and
// be trusted the same way: measured.
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

import { worstGround, type BackgroundRecipe } from './slideBackground'
import { contrastRatio, pushUntil, TEXT_FLOOR, GRAPHIC_FLOOR } from './color'

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


// ─── The library (L3) ───────────────────────────────────────────────────────
//
// Eight more, each a different room: measured by the script in the
// CHANGELOG entry, kept honest by themes.test.ts (every pair, both
// recipe roles). Faces are the ones a .pptx can carry without embedding.

// Газета — newsprint and oxblood; graph paper, faint. Measured:
//   ink 1A1A1A on F7F5F0 16.0 · ink2 55524C 7.2 / on panel ECE8DF 6.4
//   accent 8B1E2D 8.3 / on panel 7.4 · white on accent 9.1 · ink3 3.3
//   grid hero E1DFDB: ink2 5.85 · accent 6.80 · quiet ECEAE5: ink2 6.48
export const EDITORIAL_THEME: Theme = {
  id: 'editorial', name: 'Газета',
  palette: { bg: 'F7F5F0', panel: 'ECE8DF', ink: '1A1A1A', ink2: '55524C', ink3: '8A867E', accent: '8B1E2D', accentText: 'FFFFFF', border: 'D9D4C8' },
  fonts: { display: 'Georgia', body: 'Georgia', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6, background: { kind: 'grid', hero: 0.10, quiet: 0.05 },
}

// Монохром — black on white, nothing else; the accent IS the ink, so
// rules and labels read as type. No treatment. Measured:
//   ink 111111 on white 18.9 · ink2 5A5A5A 6.9 / on panel F2F2F2 6.2 · ink3 3.4
export const MONO_THEME: Theme = {
  id: 'mono', name: 'Монохром',
  palette: { bg: 'FFFFFF', panel: 'F2F2F2', ink: '111111', ink2: '5A5A5A', ink3: '8C8C8C', accent: '111111', accentText: 'FFFFFF', border: 'D6D6D6' },
  fonts: { display: 'Arial', body: 'Arial', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6, background: { kind: 'solid', hero: 0, quiet: 0 },
}

// Лес — deep green and lime; soft blobs. Measured:
//   ink F1F4EF on 0F1F17 15.4 · ink2 BFCBC2 10.2 / on panel 19302A 8.4
//   accent A7D46F 10.0 / on panel 8.2 · bg on accent 10.0 · ink3 6.2
//   blob hero 30472A: ink2 6.08 · accent 5.96 · quiet 1E3120: ink2 8.27
export const FOREST_THEME: Theme = {
  id: 'forest', name: 'Лес',
  palette: { bg: '0F1F17', panel: '19302A', ink: 'F1F4EF', ink2: 'BFCBC2', ink3: '8FA097', accent: 'A7D46F', accentText: '0F1F17', border: '2A4438' },
  fonts: { display: 'Georgia', body: 'Arial', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6, background: { kind: 'blob', hero: 0.22, quiet: 0.10 },
}

// Океан — navy and cyan; a wash. Measured:
//   ink F0F6F8 on 0B2233 14.9 · ink2 BCCBD4 9.8 / on panel 143142 8.2
//   accent 5BD1E6 9.1 / on panel 7.6 · bg on accent 9.1 · ink3 6.0
//   wash hero 1B4557: ink2 6.21 · accent 5.75 · quiet 113041: ink2 8.29
export const OCEAN_THEME: Theme = {
  id: 'ocean', name: 'Океан',
  palette: { bg: '0B2233', panel: '143142', ink: 'F0F6F8', ink2: 'BCCBD4', ink3: '8AA0AC', accent: '5BD1E6', accentText: '0B2233', border: '23445A' },
  fonts: { display: 'Arial', body: 'Arial', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6, background: { kind: 'wash', hero: 0.20, quiet: 0.08 },
}

// Песок — sand and terracotta; the wedge. Measured:
//   ink 2B2118 on F2E9D8 13.1 · ink2 5E5044 6.4 / on panel E8DCC5 5.7
//   accent 9A4219 5.5 / on panel 4.89 (A64B22 was 4.24 on the panel) · white on accent 6.6 · ink3 3.3
export const SAND_THEME: Theme = {
  id: 'sand', name: 'Песок',
  palette: { bg: 'F2E9D8', panel: 'E8DCC5', ink: '2B2118', ink2: '5E5044', ink3: '8C7D6E', accent: '9A4219', accentText: 'FFFFFF', border: 'D8C9AE' },
  fonts: { display: 'Georgia', body: 'Arial', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6, background: { kind: 'band', hero: 1, quiet: 0.35 },
}

// Сирень — white and violet; dots. Measured:
//   ink 1B1530 on white 17.6 · ink2 5A546F 7.2 / on panel F1EEFA 6.3
//   accent 5B3FBF 7.2 / on panel 6.3 · white on accent 7.2 · ink3 3.5
//   dots hero DED9F2 (0.20): ink2 5.22 · accent 5.27 — at 0.35 both were 4.0
export const VIOLET_THEME: Theme = {
  id: 'violet', name: 'Сирень',
  palette: { bg: 'FFFFFF', panel: 'F1EEFA', ink: '1B1530', ink2: '5A546F', ink3: '8B879C', accent: '5B3FBF', accentText: 'FFFFFF', border: 'DCD6EE' },
  fonts: { display: 'Arial', body: 'Arial', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6, background: { kind: 'dots', hero: 0.20, quiet: 0.12 },
}

// Графит — charcoal and sky; blobs. Measured:
//   ink ECEEF1 on 1E2126 13.9 · ink2 B9BEC7 8.7 / on panel 2A2E35 7.3
//   accent 7FB3FF 7.5 / on panel 6.4 · bg on accent 7.5 · ink3 5.1
//   blob hero 313E51: ink2 5.81 · accent 5.05 · quiet 262D37: ink2 7.44
export const SLATE_THEME: Theme = {
  id: 'slate', name: 'Графит',
  palette: { bg: '1E2126', panel: '2A2E35', ink: 'ECEEF1', ink2: 'B9BEC7', ink3: '8B919B', accent: '7FB3FF', accentText: '1E2126', border: '3A3F48' },
  fonts: { display: 'Arial', body: 'Arial', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6, background: { kind: 'blob', hero: 0.20, quiet: 0.08 },
}

// Игра — cream and raspberry; the wedge. Measured:
//   ink 222222 on FFFDF7 15.6 · ink2 5C5A55 6.8 / on panel FFF1E8 6.2
//   accent C2185B 5.8 / on panel 5.3 · white on accent 5.9 · ink3 3.3
export const PLAY_THEME: Theme = {
  id: 'play', name: 'Игра',
  palette: { bg: 'FFFDF7', panel: 'FFF1E8', ink: '222222', ink2: '5C5A55', ink3: '8E8B84', accent: 'C2185B', accentText: 'FFFFFF', border: 'EAD9CC' },
  fonts: { display: 'Arial', body: 'Arial', mono: 'Courier New', math: 'Cambria Math' },
  margin: 0.6, background: { kind: 'band', hero: 1, quiet: 0.35 },
}

export const THEMES: Record<string, Theme> = {
  default: DEFAULT_THEME, dark: DARK_THEME, warm: WARM_THEME, bold: BOLD_THEME,
  editorial: EDITORIAL_THEME, mono: MONO_THEME, forest: FOREST_THEME, ocean: OCEAN_THEME,
  sand: SAND_THEME, violet: VIOLET_THEME, slate: SLATE_THEME, play: PLAY_THEME,
}

// ─── Validation (L3) ────────────────────────────────────────────────────────
//
// The one gate every theme goes through, whatever wrote it: the rows
// above (themes.test.ts asserts they pass untouched), a model's answer to
// «финтех, надёжно, тёмная», a palette derived from a brand accent, the
// colours read out of an uploaded .pptx. The model proposes, this
// disposes. A failing pair is CORRECTED, not rejected: the text colour is
// pushed toward the ink (or the ground's opposite) until it clears, and
// the correction is reported so the caller can say what changed.

export interface ThemeIssue { pair: string; ratio: number; floor: number; fixed?: string }
export interface ValidatedTheme { theme: Theme; issues: ThemeIssue[] }

const HEX = /^[0-9A-F]{6}$/
const PALETTE_KEYS: Array<keyof ThemePalette> = ['bg', 'panel', 'ink', 'ink2', 'ink3', 'accent', 'accentText', 'border']

/** True when `raw` has the shape of a Theme with valid hex everywhere. */
export function isThemeShape(raw: unknown): raw is Theme {
  if (!raw || typeof raw !== 'object') return false
  const t = raw as Partial<Theme>
  if (typeof t.id !== 'string' || typeof t.name !== 'string' || !t.palette || !t.fonts || !t.background) return false
  return PALETTE_KEYS.every((k) => typeof t.palette![k] === 'string' && HEX.test(t.palette![k]))
}

/**
 * Measures every text-carrying pair of a theme against its floor and
 * corrects the ones that fail. Body and secondary text (ink, ink2) and the
 * accent as a label: 4.5 on the bg, the panel, and the background's worst
 * ground in both roles; the accent's own text on it: 4.5; ink3 (captions,
 * never body): 3.0. The recipe is refitted last, since the palette may
 * have moved under it.
 */
export function validateTheme(input: Theme): ValidatedTheme {
  const issues: ThemeIssue[] = []
  const p: ThemePalette = { ...input.palette }
  const opposite = (ground: string) => (contrastRatio('FFFFFF', ground) >= contrastRatio('000000', ground) ? 'FFFFFF' : '000000')

  const check = (key: 'ink' | 'ink2' | 'ink3' | 'accent' | 'accentText', ground: string, floor: number, label: string) => {
    const ratio = contrastRatio(p[key], ground)
    if (ratio >= floor) return
    // Text ON the accent is white or black outright — a step-walked E8E9E9
    // is an odd colour for a title band; everything else moves as little
    // as it must.
    const fixed = key === 'accentText' ? opposite(ground) : pushUntil(p[key], ground, opposite(ground), floor)
    issues.push({ pair: label, ratio: +ratio.toFixed(2), floor, fixed })
    p[key] = fixed
  }
  check('ink',  p.bg,    TEXT_FLOOR, 'ink/bg')
  check('ink',  p.panel, TEXT_FLOOR, 'ink/panel')
  check('ink2', p.bg,    TEXT_FLOOR, 'ink2/bg')
  check('ink2', p.panel, TEXT_FLOOR, 'ink2/panel')
  check('ink3', p.bg,    GRAPHIC_FLOOR, 'ink3/bg')
  check('accent', p.bg,    TEXT_FLOOR, 'accent/bg')
  check('accent', p.panel, TEXT_FLOOR, 'accent/panel')
  check('accentText', p.accent, TEXT_FLOOR, 'accentText/accent')

  // The treatment: lower the strength until ink, ink2 and the accent clear
  // on the worst ground — the same fit applyBrand does for a brand accent.
  const background = { ...input.background }
  for (const role of ['hero', 'quiet'] as const) {
    let s = background[role]
    for (; s > 0; s = Math.max(0, +(s - 0.02).toFixed(2))) {
      const ground = worstGround(p, { ...background, [role]: s }, role)
      if (!ground || [p.ink, p.ink2, p.accent].every((c) => contrastRatio(c, ground) >= TEXT_FLOOR)) break
    }
    if (s !== background[role]) {
      issues.push({ pair: `background.${role}`, ratio: background[role], floor: s, fixed: String(s) })
      background[role] = s
    }
  }
  return { theme: { ...input, palette: p, background }, issues }
}

