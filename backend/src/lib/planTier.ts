import { PlanLimitError } from '../errors/AppError'
import { config } from './config'

// The pricing gate lives here (CLAUDE.md §10): gate the native .pptx
// download and the talk count, not generation. The gate bites only where
// billing is switched on (BILLING_ENABLED=1, services/billing.ts —
// 2026-09-14): a dev box or an on-prem install with no acquirer keeps the
// feature cells allow-all. The spend caps are live everywhere because they
// are cost protection, not pricing.
export type PlanTier = 'free' | 'pro'
export type DownloadFormat = 'pptx' | 'pdf'

export interface PlanLimits {
  talksPerMonth:      number    // talks CREATED (expansion completed) this calendar month
  downloadsPerMonth:  Record<DownloadFormat, number>   // exports this calendar month, from talk_events
  monthlySpendCapUsd: number    // model spend this calendar month, from usage_log
  // Turns with the editor («Набросок») per calendar day, from usage_log.
  // A per-day gate, not per-month: a conversation is many small calls and
  // a month's worth burned in one evening is what a runaway client does.
  draftMessagesPerDay: number
  // Rehearsal reviews (the model pass over a rehearsal) per calendar month.
  // Recording and timings are free everywhere — the review is the expensive
  // half and the one worth paying for.
  rehearsalReviewsPerMonth: number
}

/** Pro, per month, in roubles — the one price the product has. Kopecks go to T-Bank. */
export const PRO_PRICE_RUB = 2500

// Free is a trial, not a plan (founder's call, 2026-09-15: «10 is a lot, I
// will never get people to switch»): two talks a month, one .pptx and two
// PDFs — enough to see the whole product once, not enough to live on. The
// download quotas bite only where billing is on, like the old .pptx gate:
// an install with no acquirer has nothing to upgrade to. The talk count
// and the spend caps are live everywhere — the caps are cost protection,
// sized so a runaway client cannot cost more than a coffee, and pro so a
// heavy user with 40-slide decks (~$0.05 each with notes, measured
// 2026-09-14) never meets it in normal use.
const NO_LIMIT = Infinity
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { talksPerMonth: 2, downloadsPerMonth: config.billing.enabled ? { pptx: 1, pdf: 2 } : { pptx: NO_LIMIT, pdf: NO_LIMIT }, monthlySpendCapUsd: 3, draftMessagesPerDay: 40, rehearsalReviewsPerMonth: 1 },
  pro:  { talksPerMonth: NO_LIMIT, downloadsPerMonth: { pptx: NO_LIMIT, pdf: NO_LIMIT }, monthlySpendCapUsd: 30, draftMessagesPerDay: 400, rehearsalReviewsPerMonth: NO_LIMIT },
}

export function tierOf(raw: string | null | undefined): PlanTier {
  return raw === 'pro' ? 'pro' : 'free'
}

const FORMAT_NAME: Record<DownloadFormat, string> = { pptx: '.pptx', pdf: 'PDF' }

/** Throws when this month's downloads of `format` are used up. */
export function assertDownloadQuota(planTier: string, format: DownloadFormat, usedThisMonth: number): void {
  const limit = PLAN_LIMITS[tierOf(planTier)].downloadsPerMonth[format]
  if (usedThisMonth >= limit) {
    throw new PlanLimitError(
      `Лимит скачиваний ${FORMAT_NAME[format]} на этот месяц исчерпан (${limit}). На тарифе Pro — без ограничения.`,
      'PLAN_LIMIT_REACHED',
    )
  }
}

/** What the UI shows and gates on: used / limit per month, `null` = no limit. */
export interface PlanQuota { used: number; limit: number | null }
export function quotaOf(planTier: string, used: { talks: number; pptx: number; pdf: number; reviews: number }): Record<'talks' | 'pptx' | 'pdf' | 'reviews', PlanQuota> {
  const L = PLAN_LIMITS[tierOf(planTier)]
  const q = (u: number, limit: number): PlanQuota => ({ used: u, limit: Number.isFinite(limit) ? limit : null })
  return { talks: q(used.talks, L.talksPerMonth), pptx: q(used.pptx, L.downloadsPerMonth.pptx), pdf: q(used.pdf, L.downloadsPerMonth.pdf), reviews: q(used.reviews, L.rehearsalReviewsPerMonth) }
}

/** Throws when this month's rehearsal reviews are used up. */
export function assertReviewQuota(planTier: string, usedThisMonth: number): void {
  const limit = PLAN_LIMITS[tierOf(planTier)].rehearsalReviewsPerMonth
  if (usedThisMonth >= limit) {
    throw new PlanLimitError(
      `Разбор репетиции на этом тарифе — ${limit === 1 ? 'один раз' : `${limit} раза`} в месяц, и он уже использован. На тарифе Pro — без ограничения; время по слайдам и расшифровка доступны всегда.`,
      'PLAN_LIMIT_REACHED',
    )
  }
}

/** Throws when the workspace has already created its month's worth of talks. */
export function assertTalkQuota(planTier: string, talksThisMonth: number): void {
  const limit = PLAN_LIMITS[tierOf(planTier)].talksPerMonth
  if (talksThisMonth >= limit) {
    throw new PlanLimitError(
      `Лимит на этот месяц исчерпан: ${limit} ${limit === 1 ? 'выступление' : limit < 5 ? 'выступления' : 'выступлений'}. ` +
      'Лимит обновится в начале следующего месяца.',
      'PLAN_LIMIT_REACHED',
    )
  }
}

/** Throws when today's turns with the editor are used up. */
export function assertDraftMessageQuota(planTier: string, usedToday: number): void {
  const limit = PLAN_LIMITS[tierOf(planTier)].draftMessagesPerDay
  if (usedToday >= limit) {
    throw new PlanLimitError(
      `На сегодня сообщения редактору закончились (${limit}). Завтра можно продолжить` +
      (tierOf(planTier) === 'pro' ? '.' : ', на тарифе Pro — в десять раз больше.'),
      'PLAN_LIMIT_REACHED',
    )
  }
}

/** Explicit per-workspace override wins; otherwise the tier's default. */
export function pickEffectiveCap(overrideUsd: number | null, planTier: string): number {
  return overrideUsd != null ? overrideUsd : PLAN_LIMITS[tierOf(planTier)].monthlySpendCapUsd
}
