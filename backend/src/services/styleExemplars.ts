import type { Slide, SlideType, Intent } from '../../../shared/types'
import { renderSlidesAsText } from './talks'
import { sanitiseForPrompt } from '../lib/promptSanitiser'

// The flywheel for talks (CLAUDE.md §2 "style learning"). What a user's own
// approved talks add is how their slides READ — how long the notes run, how
// a definition is phrased, how many bullets is too many. So the selector is
// "same slide type, most recently approved, same intent first" — NOT
// semantic similarity: a semantically similar slide is one about the same
// subject, which is precisely what must not be copied into a new talk.
// Consent-gated: workspaces.style_learning, off by default; per-workspace
// only, no cross-tenant pool.

export interface ExemplarSlide {
  slide:       Slide
  talkTitle:   string
  sameIntent:  boolean
  approvedAt:  string
}

const MAX_EXEMPLARS      = 3     // per expansion batch; more crowds out the material
const EXEMPLAR_MAX_CHARS = 900   // a style sample, not a transcript

/** At most one exemplar per slide type the batch is about to write, same
 *  intent preferred, most recently approved first. Exported for testing:
 *  the selection rule is the whole design and easy to get subtly wrong. */
export function selectExemplars(candidates: ExemplarSlide[], neededTypes: SlideType[], limit = MAX_EXEMPLARS): ExemplarSlide[] {
  const wanted = new Set<SlideType>(neededTypes.filter((t) => t !== 'title'))
  const ordered = [...candidates].sort((a, b) => (Number(b.sameIntent) - Number(a.sameIntent)) || b.approvedAt.localeCompare(a.approvedAt))
  const picked: ExemplarSlide[] = []
  const used = new Set<SlideType>()
  for (const c of ordered) {
    if (picked.length >= limit) break
    if (!wanted.has(c.slide.type) || used.has(c.slide.type)) continue
    // A slide with no speaker notes teaches nothing about the thing that
    // was too thin in the first place.
    if (!c.slide.notes?.trim()) continue
    used.add(c.slide.type)
    picked.push(c)
  }
  return picked
}

export function renderExemplarBlock(exemplars: ExemplarSlide[], language: 'ru' | 'en'): string[] {
  if (exemplars.length === 0) return []
  const ru = language === 'ru'
  const lines = [
    ru ? `## Примеры одобренных слайдов этого автора (ОБРАЗЕЦ СТИЛЯ, НЕ СОДЕРЖАНИЯ)` : `## Slides this author has approved (a STYLE sample, NOT content)`,
    ru ? `Автор отметил эти слайды как готовые. Ориентируйтесь на их манеру: глубину текста докладчика, длину формулировок, тон. НЕ переносите их содержание, факты и примеры в новые слайды — темы у вас другие.`
       : `The author marked these as done. Follow their manner — notes depth, sentence length, tone. Do NOT carry their content, facts or examples into the new slides; the subject is different.`,
    '',
  ]
  for (const ex of exemplars) {
    lines.push(`### ${ru ? 'Тип' : 'Type'} «${ex.slide.type}» (${ru ? 'из выступления' : 'from the talk'} «${sanitiseForPrompt(ex.talkTitle)}»)`)
    lines.push(sanitiseForPrompt(renderSlidesAsText([ex.slide], language).slice(0, EXEMPLAR_MAX_CHARS)))
    lines.push('')
  }
  return lines
}

export function intentMatches(a: Intent, b: Intent): boolean { return a === b }
