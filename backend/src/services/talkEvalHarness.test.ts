import { describe, it, expect, vi } from 'vitest'
vi.mock('./llm/registry', () => ({ chatJSON: vi.fn() }))
vi.mock('../lib/logger', () => ({ logger: { warn: vi.fn() } }))
import { scoreSlides } from './talkEvalHarness'
import type { Slide } from '../../../shared/types'

const bullets = (notes: string, image_query?: string): Slide =>
  ({ type: 'bullets', title: 't', notes, citations: [], body: { items: [] }, ...(image_query ? { image_query } : {}) } as Slide)
const title: Slide = { type: 'title', title: 'T', notes: 'intro', citations: [], body: { subtitle: null, presenter: null } }

describe('scoreSlides', () => {
  it('excludes the title slide from notes stats — its notes are an intro line, not a script', () => {
    const s = scoreSlides([title, bullets('слово '.repeat(200))], true)
    expect(s.minNotesWordCount).toBe(200)
    expect(s.notesBelowTargetShare).toBe(0)
  })
  it('flags slides under the word floor', () => {
    expect(scoreSlides([bullets('короткие заметки')], true).notesBelowTargetShare).toBe(1)
  })
  it('reports bullets share and image-query share', () => {
    const s = scoreSlides([title, bullets('n', 'график'), bullets('n')], true)
    expect(s.bulletsShare).toBeCloseTo(2 / 3)
    expect(s.imageQueryShare).toBe(0.5)
  })
  it('does not score notes when the talk has them off', () => {
    expect(scoreSlides([bullets('')], false).notesBelowTargetShare).toBe(0)
  })
})

// Design v3 (L2): the rhythm the outline prompt asks for, as a score.
import { scoreRhythm } from './talkEvalHarness'
const t = (type: Slide['type'], extra: Record<string, unknown> = {}): Slide => ({ type, title: 't', notes: '', citations: [], body: {}, ...extra } as unknown as Slide)

describe('scoreRhythm', () => {
  it('a well-paced 12-slide talk has no violations', () => {
    const deck = [t('title'), t('agenda'), t('section'), t('bullets'), t('stats'), t('concept'), t('section'), t('bullets'), t('quote'), t('image-full'), t('cta'), t('summary')]
    const r = scoreRhythm(deck)
    expect(r.violations).toEqual([])
    expect(r.sections).toBe(2)
    expect(r.heroShare).toBeCloseTo(6 / 12)   // title, 2 sections, quote, image-full, cta — exactly half; only above half is flagged
  })
  it('names each broken rule', () => {
    const deck = [t('title'), t('bullets'), t('agenda'), ...Array(8).fill(0).map(() => t('bullets')), t('image-full'), t('image-full'), t('quote'), t('quote'), t('summary')]
    const v = scoreRhythm(deck).violations
    expect(v).toContain('no-section-in-long-talk')
    expect(v).toContain('agenda-not-second')
    expect(v).toContain('two-image-full-in-a-row')
    expect(v).toContain('more-than-one-quote')
  })
  it('a short talk must not carry sections; two stats in one part is one too many', () => {
    expect(scoreRhythm([t('title'), t('section'), t('bullets'), t('summary')]).violations).toContain('section-in-short-talk')
    const deck = [t('title'), t('agenda'), t('section'), t('stats'), t('bullets'), t('stats'), t('bullets'), t('bullets'), t('bullets'), t('summary')]
    expect(scoreRhythm(deck).violations).toContain('two-stats-in-a-part')
  })
  it('a content slide with backdrop=pattern counts as a hero', () => {
    expect(scoreRhythm([t('bullets', { design: { variant: 'plain', emphasis: 'accent', backdrop: 'pattern' } })]).heroShare).toBe(1)
  })
})

// Coverage (2026-09-22, with the 50 000-character brief): did the material
// reach the deck, or did the model skim it?
import { scoreCoverage, distinctiveTerms, figuresIn } from './talkEvalHarness'

describe('scoreCoverage', () => {
  const deck = (text: string): Slide[] => [{ type: 'bullets', title: 'т', notes: text, citations: [], body: { items: [] } } as Slide]

  it('counts a term carried into the deck, matching across Russian inflection', () => {
    const brief = 'Конверсия выросла на 11% после внедрения расшифровки звонков.'
    // «конверсии», «расшифровке» — the same words in other cases
    const c = scoreCoverage(deck('Конверсии и расшифровке звонков, рост 11%'), brief, 1)
    expect(c.terms).toBeGreaterThanOrEqual(0.6)   // «внедрения» is the one the deck did not carry
    expect(c.figures).toBe(1)
  })

  it('catches a deck that dropped the figures — the clearest skimming', () => {
    const brief = 'Пилот: 3 компании, 14000 звонков, конверсия +11%, выручка 1,2 млрд.'
    const c = scoreCoverage(deck('Пилот прошёл успешно, результаты обнадёживают.'), brief, 1)
    expect(c.figures).toBe(0)
    expect(c.terms).toBeLessThan(0.5)
  })

  it('an empty brief is fully covered by definition, and density is reported per slide', () => {
    const c = scoreCoverage(deck('что угодно'), '', 0)
    expect(c).toEqual({ terms: 1, figures: 1, charsPerSlide: 0 })
    expect(scoreCoverage(deck('x'), 'y'.repeat(2400), 2).charsPerSlide).toBe(1200)
  })

  it('distinctiveTerms drops short and common words; figuresIn normalises the decimal comma', () => {
    expect([...distinctiveTerms('Этот который может расшифровка звонков')]).toEqual(['расшиф', 'звонко'])
    expect([...figuresIn('1,2 млрд и 11% за 2025')]).toEqual(['1.2', '11', '2025'])
  })
})
