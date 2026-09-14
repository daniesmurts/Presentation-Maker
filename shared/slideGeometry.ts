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

/** Rough line count for a text box the .pptx exporter cannot measure. An
 *  average Cyrillic glyph in Georgia bold / Arial is ≈0.55 × the font size
 *  wide — 0.5 estimated two lines for a title PowerPoint set in three, and
 *  the title climbed into the rule above it (first PowerPoint check of
 *  themes v2). `size` and `widthPct` in percent of the slide width. */
export function titleLines(text: string, widthPct: number = 100 - G.marginX * 2, size: number = G.titleSize): number {
  const perLine = Math.max(6, Math.floor(widthPct / (size * 0.55)))
  return Math.max(1, Math.ceil(text.length / perLine))
}
