// Design v3 (TODO L1) — a slide's BACKGROUND as data. A theme names a
// recipe; this module turns the recipe and the theme's palette into one
// SVG, the same drawing wherever a slide is rendered: the React stage and
// the public site's deck inline it, the .pptx and the PDF rasterise it to
// PNG (backend/src/services/slideBackground.ts, via the resvg pipeline the
// formula renderer already vendors — pptxgenjs has no gradient fills and
// pdfkit no patterns, and CLAUDE.md §3.5 wants PNG in decks anyway).
//
// Two ROLES: a `hero` slide (title, question, call to action) gets the
// treatment at full strength; a `quiet` slide — anything with body text —
// gets it faint or not at all. The strength per role is the recipe's, so a
// theme decides how loud it is; the drawing decides where.
//
// Contrast (§3.8): every colour here is PREMIXED — no SVG opacity — so the
// pixel a glyph lands on is a colour this module can name. `worstGround()`
// returns the darkest/lightest colour a text box can sit on for a role;
// themes.test.ts measures ink, ink2 and the label colour against it, and a
// recipe whose hero strength pushes ink2 under 4.5:1 does not ship. The
// `band` kind is the exception that is geometric, not arithmetic: the band
// lives inside the right margin / beyond the title's 80 % width, so text
// never meets it and its ground is the plain bg (see the drawing).

export type BackgroundKind = 'solid' | 'wash' | 'grid' | 'dots' | 'band' | 'blob'
export type BackgroundRole = 'hero' | 'quiet'

export interface BackgroundRecipe {
  kind:  BackgroundKind
  /** Strength 0..1 on hero slides — the share of the accent (or ink, for
   *  `grid`) mixed into the ground. 0 draws nothing. */
  hero:  number
  /** Strength on content slides. Keep it low: body text lives here. */
  quiet: number
}

/** The palette a recipe reads — a subset of the theme's, hex without '#'. */
export interface BackgroundPalette { bg: string; accent: string; ink: string; panel: string }

// The canvas: 16:9 in a unit of 1/1600 of the width, so the numbers below
// read as "pixels at 1600 wide" — the raster the exporters ask for.
export const BG_W = 1600
export const BG_H = 900

export const SOLID: BackgroundRecipe = { kind: 'solid', hero: 0, quiet: 0 }

/** Which role a slide type gets. Body-text slides are quiet by construction. */
export function backgroundRole(slideType: string): BackgroundRole {
  return slideType === 'title' || slideType === 'discussion' || slideType === 'cta' ? 'hero' : 'quiet'
}

// ─── Colour arithmetic ──────────────────────────────────────────────────────

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}
const h2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0').toUpperCase()

/** `t` of `b` over `a`, per channel in sRGB — the blend resvg and a browser
 *  would do for a plain opacity, done here so the result has a name. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b)
  return h2(r1 + (r2 - r1) * t) + h2(g1 + (g2 - g1) * t) + h2(b1 + (b2 - b1) * t)
}

function strength(recipe: BackgroundRecipe, role: BackgroundRole): number {
  const s = role === 'hero' ? recipe.hero : recipe.quiet
  return Math.max(0, Math.min(1, Number.isFinite(s) ? s : 0))
}

/** The colour a text box may find under it, per role — what to measure
 *  text against. `null` when the ground is the plain bg (nothing drawn, or
 *  a `band`, whose geometry keeps it out of the text region). */
export function worstGround(p: BackgroundPalette, recipe: BackgroundRecipe, role: BackgroundRole): string | null {
  const s = strength(recipe, role)
  if (s === 0 || recipe.kind === 'solid' || recipe.kind === 'band') return null
  return mix(p.bg, recipe.kind === 'grid' ? p.ink : p.accent, s)
}

/** True when the role draws anything beyond the flat ground. */
export function hasTreatment(recipe: BackgroundRecipe, role: BackgroundRole): boolean {
  return recipe.kind !== 'solid' && strength(recipe, role) > 0
}

// ─── The drawing ────────────────────────────────────────────────────────────

const svgOpen = (p: BackgroundPalette) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${BG_W}" height="${BG_H}" viewBox="0 0 ${BG_W} ${BG_H}"><rect width="${BG_W}" height="${BG_H}" fill="#${p.bg}"/>`

/** The background for one role: a complete SVG document, ground included.
 *  Deterministic — the same inputs give byte-identical output, which is
 *  what lets the exporters cache the raster by a hash of the inputs. */
export function backgroundSvg(p: BackgroundPalette, recipe: BackgroundRecipe, role: BackgroundRole): string {
  const s = strength(recipe, role)
  const head = svgOpen(p)
  if (s === 0 || recipe.kind === 'solid') return `${head}</svg>`

  switch (recipe.kind) {
    case 'wash': {
      // A diagonal wash from the plain ground (top-left, where a content
      // title sits) to the tinted corner (bottom-right).
      const to = mix(p.bg, p.accent, s)
      return `${head}<defs><linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop offset="0.25" stop-color="#${p.bg}"/><stop offset="1" stop-color="#${to}"/></linearGradient></defs><rect width="${BG_W}" height="${BG_H}" fill="url(#w)"/></svg>`
    }
    case 'grid': {
      // Hairlines every 80 units, in the ink faded to the strength — a
      // sheet of graph paper. The lines start at the slide edge, so the
      // 6 % margin (96 units) is crossed by one line, like real paper.
      const line = mix(p.bg, p.ink, s)
      return `${head}<defs><pattern id="g" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#${line}" stroke-width="1.5"/></pattern></defs><rect width="${BG_W}" height="${BG_H}" fill="url(#g)"/></svg>`
    }
    case 'dots': {
      const dot = mix(p.bg, p.accent, s)
      return `${head}<defs><pattern id="d" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="2.5" fill="#${dot}"/></pattern></defs><rect width="${BG_W}" height="${BG_H}" fill="url(#d)"/></svg>`
    }
    case 'band': {
      // Hero: a wedge in the top-right corner — (1300,0) → (1600,0) →
      // (1600,400). Where text can reach, the wedge has ended: the title
      // block is capped at 80 % of the content width (tsMaxW → x ≤ 1216)
      // and anchored low; a question / call to action runs to x ≈ 1335 and
      // starts at y ≈ 134, and the wedge's lower edge at x = 1335 is at
      // y = 47; the footer's «01 / 05» sits at y ≥ 840. A full-height band
      // would have run under that number (ink2 on the accent fails).
      // Quiet: a 24-unit strip inside the right margin (x ≥ 1576; the
      // margin is 96), beside the content, never under it.
      const fill = mix(p.bg, p.accent, s)
      const d = role === 'hero' ? `M1300 0H${BG_W}V400Z` : `M1576 0H${BG_W}V${BG_H}H1576Z`
      return `${head}<path d="${d}" fill="#${fill}"/></svg>`
    }
    case 'blob': {
      // Two soft radial shapes, both on the right: a large one off the
      // top-right corner, a small one low-right. Nothing sits left of
      // centre, where a title block starts. The gradient fades to
      // TRANSPARENT, not to the bg: an opaque edge drew a hard circle where
      // the small blob crossed the large one. Every pixel is still a blend
      // of bg and `c` only, so the worst ground stays `c`.
      const c = mix(p.bg, p.accent, s)
      return `${head}<defs><radialGradient id="b1"><stop offset="0" stop-color="#${c}"/><stop offset="1" stop-color="#${c}" stop-opacity="0"/></radialGradient></defs><circle cx="1420" cy="60" r="720" fill="url(#b1)"/><circle cx="1500" cy="860" r="380" fill="url(#b1)"/></svg>`
    }
  }
}

/** A `background-image` value for CSS — the stage and the site use this. */
export function backgroundCssUrl(svg: string): string {
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}
