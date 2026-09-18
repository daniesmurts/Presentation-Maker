// Rehearsal N against N−1: the arithmetic behind «minus 4 minutes and 60 %
// of the fillers». Pure; both the report page and a test run it. Deltas
// are read as improvements where the metric has a direction: time is
// better when closer to the target (or shorter, without one), fillers per
// hundred words lower, slides over budget fewer, pace inside the band.

import { PACE } from './rehearsalText'

export interface RehearsalSnapshot {
  duration_ms:   number
  target_ms:     number | null
  words:         number
  words_per_min: number | null
  fillers:       number
  over_slides:   number
}

export interface Delta { from: number; to: number; better: boolean | null }   // null = no direction to judge

export interface RehearsalProgress {
  time:     Delta                      // ms
  fillers:  Delta                      // per 100 words; `from`/`to` rounded to one decimal
  wpm:      Delta | null               // null when either run had no recognition
  over:     Delta                      // slides over their budget
  improved: number                     // how many of the judged metrics got better
  judged:   number
}

export const fillersPer100 = (fillers: number, words: number): number => (words > 0 ? Math.round((fillers / words) * 1000) / 10 : 0)

export function rehearsalProgress(cur: RehearsalSnapshot, prev: RehearsalSnapshot): RehearsalProgress {
  // Time: distance to the target if there is one (the same target for both
  // — it is the talk's), otherwise shorter is better only past a minute.
  const target = cur.target_ms ?? prev.target_ms
  const time: Delta = target
    ? { from: prev.duration_ms, to: cur.duration_ms, better: Math.abs(cur.duration_ms - target) < Math.abs(prev.duration_ms - target) - 5_000 ? true : Math.abs(cur.duration_ms - target) > Math.abs(prev.duration_ms - target) + 5_000 ? false : null }
    : { from: prev.duration_ms, to: cur.duration_ms, better: null }

  const f0 = fillersPer100(prev.fillers, prev.words), f1 = fillersPer100(cur.fillers, cur.words)
  const fillers: Delta = { from: f0, to: f1, better: cur.words === 0 || prev.words === 0 ? null : f1 < f0 - 0.2 ? true : f1 > f0 + 0.2 ? false : null }

  const wpm: Delta | null = cur.words_per_min != null && prev.words_per_min != null
    ? { from: prev.words_per_min, to: cur.words_per_min, better: inBand(cur.words_per_min) && !inBand(prev.words_per_min) ? true : !inBand(cur.words_per_min) && inBand(prev.words_per_min) ? false : null }
    : null

  const over: Delta = { from: prev.over_slides, to: cur.over_slides, better: cur.over_slides < prev.over_slides ? true : cur.over_slides > prev.over_slides ? false : null }

  const judged = [time, fillers, wpm, over].filter((d): d is Delta => d != null && d.better != null)
  return { time, fillers, wpm, over, improved: judged.filter((d) => d.better).length, judged: judged.length }
}

const inBand = (wpm: number) => wpm >= PACE.slow && wpm <= PACE.fast
