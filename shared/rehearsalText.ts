// Arithmetic over spoken text that both the rehearsal report (server) and
// the landing demo (browser, no call) need: word count, filler words, the
// pace band. Pure; no imports beyond the language type.

import type { TalkLanguage } from './types'

export const FILLERS: Record<TalkLanguage, string[]> = {
  ru: ['как бы', 'в общем-то', 'так сказать', 'на самом деле', 'ну', 'вот', 'э-э', 'ээ', 'м-м', 'мм', 'значит', 'типа', 'короче', 'собственно', 'в общем', 'это самое', 'скажем так'],
  en: ['you know', 'i mean', 'sort of', 'kind of', 'um', 'uh', 'umm', 'uhh', 'er', 'like', 'basically', 'actually', 'literally', 'right', 'okay so'],
}

export const wordCount = (text: string): number => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

export function countFillers(text: string, language: TalkLanguage): { count: number; examples: string[] } {
  const lower = ` ${text.toLowerCase().replace(/[.,!?;:…()«»"]/g, ' ').replace(/\s+/g, ' ')} `
  const found = new Map<string, number>()
  for (const f of FILLERS[language]) {
    const re = new RegExp(`(?<![\\p{L}-])${f}(?![\\p{L}-])`, 'gu')
    const n = (lower.match(re) ?? []).length
    if (n) found.set(f, n)
  }
  const examples = [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f)
  return { count: [...found.values()].reduce((a, b) => a + b, 0), examples }
}

// Comfortable speaking pace in Russian is ~100–140 wpm; English ~130–160.
// One band for both — «fast» only past where audiences of either language
// stop keeping up, «slow» only below where either starts to drift.
export const PACE = { slow: 90, fast: 160 } as const
export type PaceBand = 'slow' | 'ok' | 'fast'
export const paceBand = (wpm: number): PaceBand => (wpm < PACE.slow ? 'slow' : wpm > PACE.fast ? 'fast' : 'ok')
