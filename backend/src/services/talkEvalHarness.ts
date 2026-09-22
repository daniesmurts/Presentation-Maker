// Offline replay of generation against fixed briefs (CLAUDE.md §2). You will
// change prompts weekly; without this you cannot tell better from different.
// No DB, no queue: fixed inputs, objective computable metrics, run on demand
// via scripts/evalTalks.ts.

import { generateTalk, getSlideImageQuery, hasSlideImage, NOTES_WORD_TARGET, type GenerateParams } from './talks'
import type { Slide, SlideType } from '../../../shared/types'
import { slideBodyText } from '../../../shared/slideFit'
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
  coverage:              CoverageScore
  durationMs:            number
}

// How much of the author's material reached the deck (2026-09-22, when the
// brief's ceiling went 20 000 → 50 000 chars). The question a longer brief
// raises is not cost or context — it is whether the model still carries the
// material or starts skimming, and «страшно» is not a number.
//
// Two measures, both computable and both blunt on purpose:
//  - `terms`: distinctive words of the brief (length ≥ 6, deduped, matched
//    on a 6-character stem so Russian inflection does not count as a miss)
//    that appear anywhere in the deck's text;
//  - `figures`: the numbers in the brief that appear in the deck — a fact
//    with a digit is the kind a listener checks, and dropping it is the
//    clearest form of skimming.
// Neither says the deck is GOOD. They say material went in and did not
// come out, which is what a bigger ceiling risks.
export interface CoverageScore {
  terms:       number   // 0–1
  figures:     number   // 0–1, 1 when the brief has no figures
  charsPerSlide: number // the density the deck was asked to carry
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
export function scoreSlides(slides: Slide[], notesEnabled: boolean, brief = ''): Omit<TalkScore, 'label' | 'durationMs' | 'slideTarget'> {
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
    coverage:              scoreCoverage(slides, brief, slides.length),
  }
}

// Words too common to be evidence of anything. Not a full stop-list: the
// length floor already removes most of them.
const COMMON = new Set([
  'который', 'которые', 'которая', 'каждый', 'может', 'можно', 'нужно', 'после', 'через', 'между', 'больше', 'меньше',
  'потому', 'поэтому', 'только', 'чтобы', 'также', 'однако', 'например', 'должен', 'должны', 'сделать', 'делать',
  'because', 'through', 'between', 'should', 'without', 'another', 'example', 'therefore', 'however',
])

const stem = (w: string) => w.slice(0, 6)

/** The distinctive words of a text: long enough to mean something, deduped
 *  by stem. Lower-cased; punctuation and markup dropped. */
export function distinctiveTerms(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 6 || COMMON.has(raw) || /^\d+$/.test(raw)) continue
    out.add(stem(raw))
  }
  return out
}

/** Numbers as written: «11», «1,2», «38» — the unit is not required to
 *  match, only the figure. */
export function figuresIn(text: string): Set<string> {
  return new Set((text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')))
}

/** What share of the brief's material the deck carries. `slides` is the
 *  written deck; `brief` the author's own text. */
export function scoreCoverage(slides: Slide[], brief: string, slideCount: number): CoverageScore {
  const deckText = slides.map((s) => [s.title, ...slideBodyText(s), s.notes].join(' ')).join('\n')
  const briefTerms = distinctiveTerms(brief)
  const deckTerms = distinctiveTerms(deckText)
  const briefFigures = figuresIn(brief)
  const deckFigures = figuresIn(deckText)
  const share = (want: Set<string>, got: Set<string>) => (want.size === 0 ? 1 : [...want].filter((x) => got.has(x)).length / want.size)
  return {
    terms:   share(briefTerms, deckTerms),
    figures: share(briefFigures, deckFigures),
    charsPerSlide: slideCount > 0 ? Math.round(brief.trim().length / slideCount) : 0,
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
        scored.push({ ...scoreSlides(result.slides, params.notesEnabled, params.brief), label, slideTarget: result.slideTarget, durationMs: Date.now() - started })
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
