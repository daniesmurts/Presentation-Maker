import type { SlideType } from './types'

// Design v3 (TODO L2) — what the model may say about how a slide LOOKS.
// An enum, never a colour or a coordinate: the theme decides colours, the
// geometry decides positions, the model chooses among named variants the
// renderers know how to draw. Unknown values are coerced to the type's
// default, exactly as an unknown `type` becomes `bullets` (CLAUDE.md §2).

export interface SlideDesign {
  /** A layout variant of this slide type — from DESIGN_VARIANTS[type]. */
  variant:  string
  /** `accent`: the slide's big element (a number, a quote, the section
   *  title's rule) is drawn in the accent; `plain`: in the ink. */
  emphasis: 'accent' | 'plain'
  /** `pattern`: a content slide takes the theme's HERO background — for
   *  the one slide in a section that should stand out; `none`: the role
   *  its type implies. (An image backdrop is the `image-full` type, not a
   *  flag — it needs its own layout, with a scrim.) */
  backdrop: 'none' | 'pattern'
}

export const EMPHASES = ['accent', 'plain'] as const
export const BACKDROPS = ['none', 'pattern'] as const

/** The first entry is the default. A type with one entry has one layout. */
export const DESIGN_VARIANTS: Record<SlideType, readonly string[]> = {
  title:        ['default'],
  section:      ['default'],
  agenda:       ['default'],
  bullets:      ['plain', 'split'],          // split: two columns, for 5+ short items
  concept:      ['default'],
  formula:      ['default'],
  comparison:   ['default'],
  diagram:      ['default'],
  stats:        ['three-up', 'hero-number'], // hero-number: one figure fills the slide
  quote:        ['default'],
  'image-full': ['default'],
  discussion:   ['default'],
  cta:          ['default'],
  summary:      ['default'],
}

export function defaultDesign(type: SlideType): SlideDesign {
  return { variant: DESIGN_VARIANTS[type][0], emphasis: 'accent', backdrop: 'none' }
}

/** Coerce anything — a model's answer, a user's edit, an older row with
 *  no `design` at all — into a SlideDesign valid for `type`. */
export function normaliseDesign(type: SlideType, raw: unknown): SlideDesign {
  const d = defaultDesign(type)
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Record<string, unknown>
  const variants = DESIGN_VARIANTS[type]
  if (typeof o.variant === 'string' && variants.includes(o.variant)) d.variant = o.variant
  if (o.emphasis === 'accent' || o.emphasis === 'plain') d.emphasis = o.emphasis
  if (o.backdrop === 'none' || o.backdrop === 'pattern') d.backdrop = o.backdrop
  return d
}

/** True when the stored design says nothing a default would not — so the
 *  field can be omitted from JSON and older rows read the same. */
export function isDefaultDesign(type: SlideType, design: SlideDesign | undefined): boolean {
  if (!design) return true
  const d = defaultDesign(type)
  return design.variant === d.variant && design.emphasis === d.emphasis && design.backdrop === d.backdrop
}

// Types whose slide is the treatment: the title, a section break, a
// quote, a question, a call to action, a picture. Everything with body
// text is quiet unless its design asks for the pattern.
export const HERO_TYPES: readonly SlideType[] = ['title', 'section', 'quote', 'image-full', 'discussion', 'cta']
