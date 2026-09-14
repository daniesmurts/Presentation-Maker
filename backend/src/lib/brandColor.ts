// Colour arithmetic for the brand kit. Contrast is measured, never assumed
// (CLAUDE.md §3.8): the user picks any accent; the exporter and the settings
// page ask this module whether it can carry text.

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
