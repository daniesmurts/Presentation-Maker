// Themes v2 — the geometry of a slide, in ONE unit: percent of the slide's
// width (a CSS `cqw`). The .pptx exporter (10 in), the PDF (720 pt), the
// React stage (960 px) and the public site's Deck.astro all draw from these
// numbers, so a slide looks the same wherever it is rendered and a change
// here moves all four. Font sizes are in the same unit (1 = 7.2 pt at
// 10 in); `pt()` and `inch()` convert. The compositions: the title low-left
// under a short accent rule with a kicker; content titles over a hairline;
// a footer with the talk's title and «01 / 05»; the formula in a panel with
// its short form in mono; the question as a large italic serif with quieter
// prompts; the summary as takeaways + a «Что дальше» panel.

export const SLIDE_ASPECT = 16 / 9

export const G = {
  marginX:     6,      // left and right margin
  top:         6,      // where a content slide's title starts
  bottom:      9,      // content must end this far above the bottom edge
  footerY:     3.2,    // footer baseline area, from the bottom edge
  footerSize:  1.45,

  // Content slides
  titleSize:   4.4,    // display, bold
  titleLine:   1.12,   // line height multiple
  titlePad:    2,      // below the title, before the rule
  rule:        0.25,   // the hairline under the title
  titleGap:    3.2,    // below the rule, before the body
  bodySize:    2.55,   // bullets, 1.35 line height
  bodyLine:    1.35,
  bodyGap:     1.5,    // between bullets
  bullet:      1.1,    // the dot
  bulletIndent: 3,
  subSize:     2.2,    // secondary lists (prompts, next steps, explanations)
  kickSize:    1.5,    // uppercase label, +0.14em tracking

  // Title slide — the block is anchored to the bottom
  tsBottom:    11,     // block's bottom edge, from the slide's bottom edge
  tsRuleW:     9,
  tsRuleH:     0.6,
  tsRuleGap:   3,
  tsKickGap:   1.6,
  tsTitleSize: 6.4,
  tsTitleGap:  2.4,
  tsWhoSize:   2.0,
  tsMaxW:      80,     // percent of the content width the title may take

  // Formula
  fPadY:       3.2, fPadX: 3.6, fRadius: 0.8,
  fSize:       3.2,    // serif, when drawn as text (the PDF/PPTX use the MathJax picture at the same height)
  fCapSize:    1.9,    // mono, ink2
  fCapGap:     1,
  fExGap:      2.6,

  // Question slide
  qSize:       5.6,    // italic serif, regular weight
  qMaxW:       88,

  // Summary
  sCols:       [1.4, 1] as const,
  sGap:        4,
  sPanelPadY:  2.4, sPanelPadX: 2.8,
} as const

/** Percent of width → points, for a slide `widthPt` wide (720 for 10 in). */
export const pt   = (v: number, widthPt = 720) => (v / 100) * widthPt
/** Percent of width → inches, for a 10 in slide. */
export const inch = (v: number, widthIn = 10) => (v / 100) * widthIn

// ─── Fitting text the .pptx exporter cannot measure ─────────────────────────
//
// PowerPoint applies `normAutofit` only when a box is EDITED; on open a box
// with more text than its height holds simply overflows — upward for a
// bottom-anchored title (into the kicker and the rule), downward for a
// list (through the footer, off the slide). Both shipped in the first real
// deck of Design v3 (2026-09-15, «Аутентичность как конкурентное
// преимущество» in four lines over «ЧАСТЬ 2»; a bullets slide running
// through «10 / 10»). So the exporter ESTIMATES lines from glyph widths
// and, when the estimate does not fit, shrinks the size until it does —
// the same arithmetic on the stage, so the preview shows the shrink too.
//
// Average advance per Cyrillic glyph, as a fraction of the size: Georgia
// bold ≈ 0.62 (0.55 estimated «Мультисенсорный опыт: печать + цифра» as one
// line; PowerPoint set it in two, and the title touched the top edge),
// Arial regular ≈ 0.56. Both are deliberately on the wide side: an extra
// estimated line moves a rule down a little; a missing one is an overlap.
export const DISPLAY_EM = 0.62
/** Georgia REGULAR / italic — the definition, the quote, the question —
 *  is narrower than the bold: 0.62 on a four-line definition left the
 *  concept slide's list at the shrink floor for no reason. */
export const DISPLAY_REGULAR_EM = 0.55
export const BODY_EM    = 0.56

/** Lines a text takes in a box `widthPct` wide at `size` (percent of the
 *  slide width), for the display face. */
export function titleLines(text: string, widthPct: number = 100 - G.marginX * 2, size: number = G.titleSize, em: number = DISPLAY_EM): number {
  const perLine = Math.max(6, Math.floor(widthPct / (size * em)))
  return Math.max(1, Math.ceil(text.length / perLine))
}

/** The largest size ≤ `size` at which `text` fits in `maxLines`, stepping
 *  down 6 % at a time to a floor of `minScale` × size. Past the floor the
 *  text still overflows and the fit-warning (slideFit) is the user's cue. */
export function fitTitle(text: string, widthPct: number, size: number, maxLines: number, em: number = DISPLAY_EM, minScale = 0.6): { size: number; lines: number } {
  let s = size
  while (s > size * minScale && titleLines(text, widthPct, s, em) > maxLines) s *= 0.94
  return { size: s, lines: Math.min(maxLines, titleLines(text, widthPct, s, em)) }
}

/** Lines a bulleted list takes: each item wrapped in the width less the
 *  bullet indent, in the body face. */
export function listLines(items: string[], widthPct: number, size: number, indentPct: number = G.bulletIndent): number {
  return items.reduce((n, t) => n + titleLines(t, widthPct - indentPct, size, BODY_EM), 0)
}

/** Height of a list in percent of the slide width: lines × leading + a gap per item. */
export function listHeight(items: string[], widthPct: number, size: number, line: number = G.bodyLine, gap: number = G.bodyGap, indentPct: number = G.bulletIndent): number {
  return listLines(items, widthPct, size, indentPct) * size * line + items.length * gap
}

/** The largest size ≤ `size` at which the list fits `availPct` of height
 *  (percent of the slide width, like everything here). Floor 0.7: below
 *  that a list is unreadable from the back row, and slideFit has already
 *  told the user the slide is over budget. */
export function fitList(items: string[], widthPct: number, size: number, availPct: number, line: number = G.bodyLine, gap: number = G.bodyGap, indentPct: number = G.bulletIndent, minScale = 0.7): number {
  let s = size
  while (s > size * minScale && listHeight(items, widthPct, s, line, gap, indentPct) > availPct) s *= 0.94
  return s
}
