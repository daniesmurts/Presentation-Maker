// Colour arithmetic — contrast is measured, never assumed (CLAUDE.md §3.8).
// Shared (Design v3, L3): the backend measures a brand accent and validates
// a theme; the browser previews the same numbers; the landing builds with
// them. Pure functions, hex without '#'.

/** '#abc', '#AABBCC', 'aabbcc' → 'AABBCC'; anything else → null. */
export function normaliseHex(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const s = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(s)) return s.split('').map((c) => c + c).join('').toUpperCase()
  if (/^[0-9a-f]{6}$/i.test(s)) return s.toUpperCase()
  return null
}

function channel(c: number): number {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a 6-digit hex (no '#'). */
export function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, symmetric. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export const TEXT_FLOOR = 4.5   // AA for body/small text
export const GRAPHIC_FLOOR = 3  // AA for large text and graphics

/** Can this colour carry small text on this ground? */
export function isTextSafe(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= TEXT_FLOOR
}

/** Which of black/white text reads better ON the colour — for a band. */
export function textOn(hex: string): 'FFFFFF' | '16201F' {
  return contrastRatio('FFFFFF', hex) >= contrastRatio('16201F', hex) ? 'FFFFFF' : '16201F'
}

/** `t` of `b` over `a`, per channel in sRGB. */
export function mixHex(a: string, b: string, t: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  const ch = (i: number) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * t).toString(16).padStart(2, '0').toUpperCase()
  return ch(0) + ch(2) + ch(4)
}

/** Move `fg` toward `toward` in steps until it clears `floor` on `bg` —
 *  the correction a validator applies to a pair that fails. Returns the
 *  first colour that clears, or `toward` itself when nothing short of it
 *  does. */
export function pushUntil(fg: string, bg: string, toward: string, floor: number, step = 0.05): string {
  let t = 0
  let c = fg
  while (contrastRatio(c, bg) < floor && t < 1) { t = Math.min(1, t + step); c = mixHex(fg, toward, t) }
  return c
}
