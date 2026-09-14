import { describe, it, expect } from 'vitest'
import { parseSlideSelection, selectSlides, selectionSuffix, SelectionError } from './slideSelection'
import type { Slide } from '../../../shared/types'

const slide = (title: string, citations: number[] = []): Slide =>
  ({ type: 'bullets', title, notes: '', citations, body: { items: [] } } as Slide)

describe('parseSlideSelection', () => {
  it('returns null for "whole deck" (absent or blank)', () => {
    expect(parseSlideSelection(undefined, 5)).toBeNull()
    expect(parseSlideSelection('', 5)).toBeNull()
  })
  it('converts 1-based to 0-based, sorts into deck order, dedupes', () => {
    expect(parseSlideSelection('5,2,2,3', 5)).toEqual([1, 2, 4])
  })
  it('refuses malformed input instead of guessing at it', () => {
    for (const bad of ['0', '6', 'a', '1.5', ['1'], '1,,x']) {
      expect(() => parseSlideSelection(bad, 5)).toThrow(SelectionError)
    }
  })
})

describe('selectSlides', () => {
  const talk = {
    slides: [slide('a', [1]), slide('b'), slide('c', [2])],
    sources: [{ idx: 1, title: 's1', url: null, excerpt: '' }, { idx: 2, title: 's2', url: null, excerpt: '' }],
  }
  it('keeps the chosen slides and narrows sources to what they cite', () => {
    const out = selectSlides(talk, [2])
    expect(out.slides!.map((s) => s.title)).toEqual(['c'])
    expect(out.sources!.map((s) => s.idx)).toEqual([2])
  })
  it('returns the talk untouched for a full selection', () => {
    expect(selectSlides(talk, [0, 1, 2])).toBe(talk)
    expect(selectSlides(talk, null)).toBe(talk)
  })
})

describe('selectionSuffix', () => {
  it('names the slides in the user’s numbering, or nothing for the whole deck', () => {
    expect(selectionSuffix([1, 2, 4], 5)).toBe(' — слайды 2, 3, 5')
    expect(selectionSuffix(null, 5)).toBe('')
  })
})
