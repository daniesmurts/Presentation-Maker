import type { Slide, TalkSource } from '../../../shared/types'

// «Скачать выбранные слайды» — a selection is a QUERY PARAMETER, not a
// stored thing: `?slides=2,3,5`, 1-based as the user sees the numbers.
// Nothing about a subset is a property of the talk, only of one download.
// Slides have no ids — a selection is indices, and indices shift under
// move/delete/insert; the client remaps (frontend lib/slideSelection.ts).

/**
 * Parse into 0-based indices, in DECK order and deduplicated. Deck order,
 * never the order typed: a selection is "which slides", not "in what order".
 * Returns null for "no selection" (absent/blank) — the whole deck — and
 * throws on anything malformed rather than guessing, since guessing at what
 * was meant is how a user ends up with slides they did not choose.
 */
export function parseSlideSelection(raw: unknown, total: number): number[] | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string') throw new SelectionError()
  const nums = raw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => Number(s))
  if (nums.length === 0) return null
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > total)) throw new SelectionError()
  return [...new Set(nums.map((n) => n - 1))].sort((a, b) => a - b)
}

export class SelectionError extends Error {
  constructor() { super('Invalid slide selection'); this.name = 'SelectionError' }
}

/** The chosen slides, with `sources` narrowed to what they actually cite. */
export function selectSlides<T extends { slides: Slide[] | null; sources: TalkSource[] | null }>(talk: T, indices: number[] | null): T {
  const slides = talk.slides ?? []
  if (!indices || indices.length === slides.length) return talk
  const chosen = indices.map((i) => slides[i]).filter(Boolean) as Slide[]
  const cited = new Set(chosen.flatMap((s) => s.citations))
  return { ...talk, slides: chosen, sources: (talk.sources ?? []).filter((s) => cited.has(s.idx)) }
}

/** ` — слайды 2, 3, 5` for the file name; '' for the whole deck. */
export function selectionSuffix(indices: number[] | null, total: number, language: 'ru' | 'en' = 'ru'): string {
  if (!indices || indices.length === total) return ''
  return ` — ${language === 'ru' ? 'слайды' : 'slides'} ${indices.map((i) => i + 1).join(', ')}`
}
