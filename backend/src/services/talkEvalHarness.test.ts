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
