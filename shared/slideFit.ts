import type { Slide } from './types'

// Does this slide actually fit on a 16:9 slide?
//
// The web viewer renders each slide as a card that grows to fit its content,
// so a slide that looks fine on screen can overflow the projected deck — and
// the user finds out in front of the room. The PPTX exporter lays text into
// fixed regions, so the ceiling is knowable *before* export.
//
// Lives in shared/ because both sides need the same answer: the viewer
// warns, and anything server-side (export, eval) must agree with what the
// user was shown.
//
// A character budget rather than real text measurement: measuring needs the
// font metrics and the exporter's own wrapping, and being approximately
// right is worth more than exactly right — the point is to catch the slide
// with eleven bullets, not to police the one that runs two words over.
// Budgets come from the exporter's font sizes and region heights, rounded
// down so the warning fires before the overflow does. Re-measure when the
// exporter's layout (TODO A.3) or a theme changes them.

export interface SlideFit {
  index:  number
  overBy: number   // 0–1+, how far past the budget this slide's body runs
  reason: string
}

const BUDGETS: Record<Slide['type'], { chars: number; lines: number }> = {
  // ~28pt body over ~4in of usable height, less when an image takes the right column.
  title:      { chars: 200,  lines: 3 },
  bullets:    { chars: 520,  lines: 7 },
  concept:    { chars: 620,  lines: 8 },
  formula:    { chars: 420,  lines: 6 },
  comparison: { chars: 700,  lines: 12 },  // two columns share the width
  diagram:    { chars: 340,  lines: 5 },   // the image takes most of the slide
  discussion: { chars: 520,  lines: 7 },
  cta:        { chars: 360,  lines: 5 },   // one big ask, set large
  summary:    { chars: 620,  lines: 9 },
}

/** The visible text of a slide — speaker notes excluded, they are never
 *  drawn on the slide itself. */
export function slideBodyText(slide: Slide): string[] {
  switch (slide.type) {
    case 'title':      return [slide.body.subtitle, slide.body.presenter].filter(Boolean) as string[]
    case 'bullets':    return slide.body.items
    case 'concept':    return [slide.body.definition, ...slide.body.supporting]
    case 'formula':    return [...slide.body.formulas.map((f) => `${f.latex} ${f.caption}`), slide.body.explanation ?? '']
    case 'comparison': return slide.body.columns.flatMap((c) => [c.header, ...c.items])
    case 'diagram':    return [slide.body.caption, ...slide.body.points]
    case 'discussion': return [slide.body.question, ...slide.body.prompts]
    case 'cta':        return [slide.body.action, ...slide.body.reasons, slide.body.contact ?? '']
    case 'summary':    return [...slide.body.takeaways, ...slide.body.next_steps]
  }
}

/**
 * Slides whose body runs past what a 16:9 slide can hold. Returns only the
 * ones over budget — an empty array means the deck projects cleanly.
 */
export function findOverfullSlides(slides: Slide[]): SlideFit[] {
  const out: SlideFit[] = []

  slides.forEach((slide, index) => {
    const budget = BUDGETS[slide.type]
    const lines  = slideBodyText(slide).map((l) => l.trim()).filter(Boolean)
    const chars  = lines.reduce((n, l) => n + l.length, 0) + slide.title.length

    const byChars = chars / budget.chars
    const byLines = lines.length / budget.lines
    const worst   = Math.max(byChars, byLines)
    if (worst <= 1) return

    out.push({
      index,
      overBy: worst - 1,
      reason: byLines >= byChars
        ? `${lines.length} строк — на слайде поместится примерно ${budget.lines}`
        : `${chars} символов — на слайде поместится примерно ${budget.chars}`,
    })
  })

  return out
}
