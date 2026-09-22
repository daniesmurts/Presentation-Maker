// USD per 1M tokens. Cost is computed at call time and persisted per row in
// usage_log, so changing a rate here never rewrites history.
//
// DeepSeek consolidated its line into one served model, `deepseek-flash`
// (V4.1-Flash), on 2026-09-14; every V4-era id is an alias onto it. Rates
// confirmed against api-docs.deepseek.com on that date. Off-peak (evenings,
// nights, weekends UTC) is billed at half.

interface Rate { in: number; cachedIn: number; out: number }

// Cache-HIT input is 50× cheaper than a miss ($0.006 vs $0.30 peak). It is
// not a detail: the author's brief sits at the TOP of both the outline and
// every expansion prompt, so after the first call of a deck it is a cache
// prefix — measured 2026-09-22, a repeat call returned 11 776 of 11 962
// prompt tokens as `prompt_cache_hit_tokens`. Billing every repeat at the
// miss rate overstated a long-brief deck roughly threefold, and the
// workspace spend cap bit that much too early.
const FLASH_RATE: Rate = { in: 0.30, cachedIn: 0.006, out: 1.20 }

/** Peak is 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday. */
export function isDeepSeekPeakHour(at: Date): boolean {
  const day = at.getUTCDay()
  if (day === 0 || day === 6) return false
  const h = at.getUTCHours()
  return (h >= 1 && h < 4) || (h >= 6 && h < 10)
}

/** `cachedInputTokens` — the provider's `prompt_cache_hit_tokens`, a SUBSET
 *  of `inputTokens` (the API reports hit + miss = prompt_tokens). Omitted
 *  (or 0) prices everything at the miss rate, which is what every caller
 *  did before caching was accounted for. */
export function calculateDeepSeekCost(
  inputTokens: number,
  outputTokens: number,
  _model = 'deepseek-flash',
  at: Date = new Date(),
  cachedInputTokens = 0,
): number {
  const peakMultiplier = isDeepSeekPeakHour(at) ? 1 : 0.5
  const cached = Math.max(0, Math.min(cachedInputTokens, inputTokens))
  const missed = inputTokens - cached
  return (
    (missed / 1_000_000) * FLASH_RATE.in +
    (cached / 1_000_000) * FLASH_RATE.cachedIn +
    (outputTokens / 1_000_000) * FLASH_RATE.out
  ) * peakMultiplier
}

// YandexART (Yandex AI Studio) — one price per generated image, USD without
// VAT, from the AI Studio pricing page on 2026-09-15 («1 request for image
// generation»). Charged per request whatever the size.
export const YANDEX_ART_COST_USD = 0.0182786856
