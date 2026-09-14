import { PlanLimitError } from '../errors/AppError'
import { config } from './config'

// The pricing gate lives here (CLAUDE.md §10): gate the native .pptx
// download and the talk count, not generation. The gate bites only where
// billing is switched on (BILLING_ENABLED=1, services/billing.ts —
// 2026-09-14): a dev box or an on-prem install with no acquirer keeps the
// feature cells allow-all. The spend caps are live everywhere because they
// are cost protection, not pricing.
export type PlanTier = 'free' | 'pro'
export type PlanFeature = 'pptxExport'

export interface PlanLimits {
  features:           Record<PlanFeature, boolean>
  talksPerMonth:      number    // talks CREATED (expansion completed) this calendar month
  monthlySpendCapUsd: number    // model spend this calendar month, from usage_log
}

/** Pro, per month, in roubles — the one price the product has. Kopecks go to T-Bank. */
export const PRO_PRICE_RUB = 2500

// Judgement, not evidence (§10): the free cap is sized so that a runaway
// client cannot cost more than a coffee, and pro so that a heavy user with
// 40-slide decks (~$0.05 each with notes, measured 2026-09-14) never meets
// it in normal use. Revisit with usage_log, not with more design.
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { features: { pptxExport: !config.billing.enabled }, talksPerMonth: 10, monthlySpendCapUsd: 3 },
  pro:  { features: { pptxExport: true }, talksPerMonth: Infinity, monthlySpendCapUsd: 30 },
}

export function tierOf(raw: string | null | undefined): PlanTier {
  return raw === 'pro' ? 'pro' : 'free'
}

export function assertPlanFeature(planTier: string, feature: PlanFeature): void {
  if (!PLAN_LIMITS[tierOf(planTier)].features[feature]) {
    throw new PlanLimitError('Скачивание .pptx доступно на тарифе Pro', 'PLAN_FEATURE_LOCKED')
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

/** Explicit per-workspace override wins; otherwise the tier's default. */
export function pickEffectiveCap(overrideUsd: number | null, planTier: string): number {
  return overrideUsd != null ? overrideUsd : PLAN_LIMITS[tierOf(planTier)].monthlySpendCapUsd
}
