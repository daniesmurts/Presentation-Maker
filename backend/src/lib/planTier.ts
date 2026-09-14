import { PlanLimitError } from '../errors/AppError'

// The pricing gate lives here (CLAUDE.md §10): gate the native .pptx
// download and the talk count, not generation. Both tiers currently allow
// everything — there is no billing yet — so this is a WHERE waiting for a
// value, not a migration waiting to happen. Flip a cell when billing lands.
export type PlanTier = 'free' | 'pro'
export type PlanFeature = 'pptxExport'

const FEATURES: Record<PlanTier, Record<PlanFeature, boolean>> = {
  free: { pptxExport: true },
  pro:  { pptxExport: true },
}

function tierOf(raw: string): PlanTier {
  return raw === 'pro' ? 'pro' : 'free'
}

export function assertPlanFeature(planTier: string, feature: PlanFeature): void {
  if (!FEATURES[tierOf(planTier)][feature]) {
    throw new PlanLimitError('Скачивание .pptx доступно на платном тарифе', 'PLAN_FEATURE_LOCKED')
  }
}
