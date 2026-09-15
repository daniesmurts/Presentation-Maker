// Offline replay of generation against fixed briefs (CLAUDE.md §2). You will
// change prompts weekly; without this you cannot tell better from different.
// No DB, no queue: fixed inputs, objective computable metrics, run on demand
// via scripts/evalTalks.ts.

import { generateTalk, getSlideImageQuery, hasSlideImage, NOTES_WORD_TARGET, type GenerateParams } from './talks'
import type { Slide, SlideType } from '../../../shared/types'
import { logger } from '../lib/logger'

export type EvalBrief = Omit<GenerateParams, 'userId' | 'workspaceId'> & { label: string }

export interface TalkScore {
  label:                 string
  slideCount:            number
  slideTarget:           number
  avgNotesWordCount:     number   // across non-title slides — a title's notes are an intro line, not a script
  minNotesWordCount:     number   // the weakest slide matters more than the average
  notesBelowTargetShare: number   // fraction of non-title slides under the word-count floor
  bulletsShare:          number   // the prompt asks for ≤ 1/3 — did the model comply
  typeDistribution:      Partial<Record<SlideType, number>>
  imageQueryShare:       number   // share of non-title/summary/cta slides carrying an image query
  rhythm:                RhythmScore
  durationMs:            number
}

// Design v3 (L2): the rhythm the outline prompt asks for, as numbers, so a
// prompt change that makes every slide a hero — or none — is a regression
// the harness sees. `violations` lists the rules broken, by name.
export interface RhythmScore {
  heroShare:   number     // share of slides drawn on the hero background (title, section, quote, image-full, discussion, cta, or backdrop=pattern)
  sections:    number
  violations:  string[]
}

const HERO_ROLE = new Set<SlideType>(['title', 'section', 'quote', 'image-full', 'discussion', 'cta'])

/** Rhythm rules from buildOutlinePrompt, checked on the written deck. */
export function scoreRhythm(slides: Slide[]): RhythmScore {
  const v: string[] = []
  const n = slides.length
  const isHero = (s: Slide) => HERO_ROLE.has(s.type) || s.design?.backdrop === 'pattern'
  const heroShare = n ? slides.filter(isHero).length / n : 0
  const sections = slides.filter((s) => s.type === 'section').length
  const quotes = slides.filter((s) => s.type === 'quote').length
  const agendaAt = slides.findIndex((s) => s.type === 'agenda')

  if (n >= 10 && sections === 0) v.push('no-section-in-long-talk')
  if (n < 10 && sections > 0) v.push('section-in-short-talk')
  if (n >= 8 && agendaAt === -1) v.push('no-agenda')
  if (agendaAt > 1) v.push('agenda-not-second')
  if (quotes > 1) v.push('more-than-one-quote')
  if (heroShare > 0.5) v.push('hero-share-over-half')
  for (let i = 1; i < n; i++) {
    if (slides[i].type === 'image-full' && slides[i - 1].type === 'image-full') { v.push('two-image-full-in-a-row'); break }
  }
  for (let i = 1; i < n; i++) {
    if (slides[i].type === 'section' && slides[i - 1].type === 'section') { v.push('two-sections-in-a-row'); break }
  }
  // At most one stats per part (a part = the run between sections).
  let statsInPart = 0
  for (const s of slides) {
    if (s.type === 'section') statsInPart = 0
    else if (s.type === 'stats' && ++statsInPart > 1) { v.push('two-stats-in-a-part'); break }
  }
  // A section every 5–8 slides: no part longer than 10 once there are sections.
  if (sections > 0) {
    let run = 0
    for (const s of slides) {
      if (s.type === 'section') run = 0
      else if (++run > 10) { v.push('part-longer-than-10'); break }
    }
  }
  return { heroShare, sections, violations: v }
}

export interface TalkEvalReport {
  scored:  TalkScore[]
  failed:  Array<{ label: string; error: string }>
  summary: { avgNotesWordCount: number; avgMinNotesWordCount: number; avgBulletsShare: number; avgImageQueryShare: number }
}

function countWords(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}
function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

/** Pure metric computation over an already-generated deck — unit-testable. */
export function scoreSlides(slides: Slide[], notesEnabled: boolean): Omit<TalkScore, 'label' | 'durationMs' | 'slideTarget'> {
  const [wMin] = NOTES_WORD_TARGET
  const notesEligible = notesEnabled ? slides.filter((s) => s.type !== 'title') : []
  const wordCounts = notesEligible.map((s) => countWords(s.notes))

  const imageEligible = slides.filter((s) => !['title', 'section', 'agenda', 'stats', 'quote', 'summary', 'cta'].includes(s.type))
  const withQuery = imageEligible.filter((s) => hasSlideImage(s) || getSlideImageQuery(s).length > 0)

  const typeDistribution: Partial<Record<SlideType, number>> = {}
  slides.forEach((s) => { typeDistribution[s.type] = (typeDistribution[s.type] ?? 0) + 1 })

  return {
    slideCount:            slides.length,
    avgNotesWordCount:     avg(wordCounts),
    minNotesWordCount:     wordCounts.length ? Math.min(...wordCounts) : 0,
    notesBelowTargetShare: wordCounts.length ? wordCounts.filter((w) => w < wMin).length / wordCounts.length : 0,
    bulletsShare:          slides.length ? (typeDistribution.bullets ?? 0) / slides.length : 0,
    typeDistribution,
    imageQueryShare:       imageEligible.length ? withQuery.length / imageEligible.length : 0,
    rhythm:                scoreRhythm(slides),
  }
}

const EVAL_CONCURRENCY = 2   // gentle on rate limits — real calls, not a load test

export async function runTalkEval(briefs: EvalBrief[], onProgress?: (done: number, total: number) => void): Promise<TalkEvalReport> {
  const scored: TalkScore[] = []
  const failed: TalkEvalReport['failed'] = []
  let done = 0
  let next = 0

  async function worker(): Promise<void> {
    while (next < briefs.length) {
      const b = briefs[next++]
      const started = Date.now()
      try {
        const { label, ...rest } = b
        const params: GenerateParams = { ...rest, userId: undefined, workspaceId: undefined, styleExemplars: false }
        const result = await generateTalk(params)
        scored.push({ ...scoreSlides(result.slides, params.notesEnabled), label, slideTarget: result.slideTarget, durationMs: Date.now() - started })
      } catch (err) {
        logger.warn({ message: '[talk eval] generation failed', label: b.label, error: (err as Error).message })
        failed.push({ label: b.label, error: (err as Error).message })
      } finally {
        onProgress?.(++done, briefs.length)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(EVAL_CONCURRENCY, briefs.length) }, worker))

  return {
    scored, failed,
    summary: {
      avgNotesWordCount:    avg(scored.map((s) => s.avgNotesWordCount)),
      avgMinNotesWordCount: avg(scored.map((s) => s.minNotesWordCount)),
      avgBulletsShare:      avg(scored.map((s) => s.bulletsShare)),
      avgImageQueryShare:   avg(scored.map((s) => s.imageQueryShare)),
    },
  }
}
