// USD per 1M tokens. Cost is computed at call time and persisted per row in
// usage_log, so changing a rate here never rewrites history.
//
// DeepSeek consolidated its line into one served model, `deepseek-flash`
// (V4.1-Flash), on 2026-09-14; every V4-era id is an alias onto it. Rates
// confirmed against api-docs.deepseek.com on that date. Off-peak (evenings,
// nights, weekends UTC) is billed at half.

interface Rate { in: number; out: number }

const FLASH_RATE: Rate = { in: 0.30, out: 1.20 }

/** Peak is 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday. */
export function isDeepSeekPeakHour(at: Date): boolean {
  const day = at.getUTCDay()
  if (day === 0 || day === 6) return false
  const h = at.getUTCHours()
  return (h >= 1 && h < 4) || (h >= 6 && h < 10)
}

export function calculateDeepSeekCost(
  inputTokens: number,
  outputTokens: number,
  _model = 'deepseek-flash',
  at: Date = new Date(),
): number {
  const peakMultiplier = isDeepSeekPeakHour(at) ? 1 : 0.5
  return ((inputTokens / 1_000_000) * FLASH_RATE.in + (outputTokens / 1_000_000) * FLASH_RATE.out) * peakMultiplier
}

// YandexART (Yandex AI Studio) — one price per generated image, USD without
// VAT, from the AI Studio pricing page on 2026-09-15 («1 request for image
// generation»). Charged per request whatever the size.
export const YANDEX_ART_COST_USD = 0.0182786856
