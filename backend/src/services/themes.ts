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
  math:    string   // the Unicode fallback for formulas
}

export interface Theme {
  id:      string
  name:    string
  palette: ThemePalette
  fonts:   ThemeFonts
  // Inches, 16:9. The one geometry a theme may vary is the margin; slide
  // size is fixed so slideFit's budgets stay true across themes.
  margin:  number
  // Title slide: 'light' keeps a white field with an accent rule (the
  // parent's users disliked a dark slab — it is the slide projected longest,
  // often in a lit room). 'band' draws a full accent band behind the title.
  titleStyle: 'light' | 'band'
}

// Default — the web app's palette carried to the slide. Measured (WCAG):
//   ink 16201F on white 16.7 · ink2 57635F on white 6.3 / on panel EEF3F3 5.6
//   accent 0F6E6E on white 6.0 (used for labels ≤ 12pt bold and rules)
//   ink3 8A9793 on white 3.0 — captions at ≥ 12pt italic only
export const DEFAULT_THEME: Theme = {
  id: 'default',
  name: 'Тезариум',
  palette: {
    bg: 'FFFFFF', panel: 'EEF3F3', ink: '16201F', ink2: '57635F', ink3: '8A9793',
    accent: '0F6E6E', accentText: 'FFFFFF', border: 'D9E0E0',
  },
  fonts: { display: 'Georgia', body: 'Arial', math: 'Cambria Math' },
  margin: 0.6,
  titleStyle: 'light',
}

// Dark — for a dim room. Measured:
//   ink F4F6F7 on 15211F 15.3 · ink2 C5CFCC on 15211F 10.4 · accent 5FC4BE on 15211F 8.0
//   panel 20302D: ink on it 12.7
export const DARK_THEME: Theme = {
  id: 'dark',
  name: 'Тёмная',
  palette: {
    bg: '15211F', panel: '20302D', ink: 'F4F6F7', ink2: 'C5CFCC', ink3: '9AA8A4',
    accent: '5FC4BE', accentText: '15211F', border: '2E3F3B',
  },
  fonts: { display: 'Georgia', body: 'Arial', math: 'Cambria Math' },
  margin: 0.6,
  titleStyle: 'band',
}

export const THEMES: Record<string, Theme> = { default: DEFAULT_THEME, dark: DARK_THEME }

/** Unknown id → default, never a throw: a talk row written by an older
 *  build may name a theme that has since been renamed. */
export function getTheme(id: string | null | undefined): Theme {
  return (id && THEMES[id]) || DEFAULT_THEME
}
