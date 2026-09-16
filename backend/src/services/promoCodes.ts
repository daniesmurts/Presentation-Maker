import { pool } from '../db/connection'
import { ValidationError } from '../errors/AppError'
import { getWorkspaceBilling } from '../db/queries/billing'
import { recordTalkEvent } from '../db/queries/talkEvents'
import { planGrant } from './adminActions'
import {
  findActivePromoByCode, countRedemptions, hasWorkspaceRedeemed, recordRedemption,
  createPromoCode, listPromoCodes, setPromoCodeActive, findPromoCodeById,
  type PromoCodeRow, type PromoKind, type CreatePromoInput,
} from '../db/queries/promoCodes'

// Promo codes (TODO M phase 3). percent/fixed discount the initial T-Bank
// charge — validated here, applied in services/billing.ts startCheckout, so
// the amount T-Bank actually charges (and the receipt it prints, 54-ФЗ) is
// always the discounted one, never a client-supplied number. free_months
// bypasses payment entirely — a direct grant (services/adminActions.ts
// planGrant, the same rule an admin's gift uses), so it works even with
// billing off.

const CODE = /^[A-Z0-9][A-Z0-9-]{2,31}$/
export const MIN_CHARGE_KOPECKS = 100   // never let a discount charge less than 1 ₽

export function normaliseCode(raw: string): string {
  const code = raw.trim().toUpperCase()
  if (!CODE.test(code)) throw new ValidationError('Промокод: 3–32 символа, латиница, цифры, дефис')
  return code
}

/** Checked in order so the message tells the user exactly why — not found
 *  is indistinguishable from someone else's private code, on purpose. */
export async function validatePromoCode(rawCode: string, workspaceId: string): Promise<PromoCodeRow> {
  const code = normaliseCode(rawCode)
  const promo = await findActivePromoByCode(code)
  if (!promo) throw new ValidationError('Промокод не найден или больше не действует')
  if (promo.valid_until && new Date(promo.valid_until) < new Date()) throw new ValidationError('Срок действия промокода истёк')
  if (promo.max_uses != null && (await countRedemptions(promo.id)) >= promo.max_uses) throw new ValidationError('Промокод уже исчерпан')
  if (await hasWorkspaceRedeemed(promo.id, workspaceId)) throw new ValidationError('Этот промокод уже использован в вашем пространстве')
  return promo
}

export function discountKopecks(kind: 'percent' | 'fixed', value: number, priceKopecks: number): number {
  const off = kind === 'percent' ? Math.round(priceKopecks * value / 100) : value
  return Math.min(off, priceKopecks - MIN_CHARGE_KOPECKS)
}

export interface PromoPreview { code: string; kind: PromoKind; value: number; price_rub?: number }

/** Read-only — what the tariff page shows before the user commits to checkout or redeem. */
export async function previewPromo(code: string, workspaceId: string, priceKopecks: number): Promise<PromoPreview> {
  const promo = await validatePromoCode(code, workspaceId)
  if (promo.kind === 'free_months') return { code: promo.code, kind: promo.kind, value: promo.value }
  const off = discountKopecks(promo.kind, promo.value, priceKopecks)
  return { code: promo.code, kind: promo.kind, value: promo.value, price_rub: (priceKopecks - off) / 100 }
}

/** For startCheckout: re-validates and returns the exact amount to charge — never trust a client-supplied discount. */
export async function applyPromoToCharge(code: string, workspaceId: string, priceKopecks: number): Promise<{ promo: PromoCodeRow; amountKopecks: number }> {
  const promo = await validatePromoCode(code, workspaceId)
  if (promo.kind === 'free_months') throw new ValidationError('Этот промокод даёт бесплатный период Pro — активируйте его на странице тарифа, оплата не нужна')
  return { promo, amountKopecks: priceKopecks - discountKopecks(promo.kind, promo.value, priceKopecks) }
}

/** Called once a payment carrying a promo is CONFIRMED (services/billing.ts applyOutcome). */
export async function finalisePromoOnPayment(promoCodeId: string, workspaceId: string, paymentId: string, discount: number): Promise<void> {
  await recordRedemption({ promoCodeId, workspaceId, paymentId, discountKopecks: discount, monthsGranted: null })
}

/** free_months: grants Pro directly, no T-Bank involved. Same rule as an admin's gift (planGrant). */
export async function redeemFreeMonthsPromo(code: string, workspaceId: string): Promise<{ plan_tier: string; plan_expires_at: Date | null; plan_source: string }> {
  const promo = await validatePromoCode(code, workspaceId)
  if (promo.kind !== 'free_months') throw new ValidationError('Этот промокод — скидка на оплату, введите его при оформлении Pro')
  const ws = await getWorkspaceBilling(workspaceId)
  if (!ws) throw new ValidationError('Рабочее пространство не найдено')
  const after = planGrant(ws, promo.value * 30)
  await pool.query(`UPDATE workspaces SET plan_tier = $2, plan_expires_at = $3, plan_source = $4, renewal_failures = 0 WHERE id = $1`,
    [workspaceId, after.plan_tier, after.plan_expires_at, after.plan_source])
  const inserted = await recordRedemption({ promoCodeId: promo.id, workspaceId, paymentId: null, discountKopecks: null, monthsGranted: promo.value })
  if (!inserted) throw new ValidationError('Этот промокод уже использован в вашем пространстве')
  recordTalkEvent({ talkId: null, workspaceId, userId: null, event: 'promo_redeemed', metadata: { code: promo.code, months: promo.value } })
  return after
}

// ── Admin CRUD ──────────────────────────────────────────────────────────────

const KINDS: PromoKind[] = ['percent', 'fixed', 'free_months']

export function readCreateInput(body: Record<string, unknown>, createdBy: string): CreatePromoInput {
  const code = normaliseCode(typeof body.code === 'string' ? body.code : '')
  const kind = body.kind as PromoKind
  if (!KINDS.includes(kind)) throw new ValidationError('Тип: percent, fixed или free_months')
  const value = Number(body.value)
  if (!Number.isInteger(value) || value <= 0) throw new ValidationError('Значение должно быть целым и больше нуля')
  if (kind === 'percent' && value >= 100) throw new ValidationError('Процент: 1–99 — для полной бесплатности используйте free_months')
  if (kind === 'fixed' && value >= 250_000) throw new ValidationError('Фиксированная скидка не может быть больше стоимости Pro')
  if (kind === 'free_months' && value > 12) throw new ValidationError('Не больше 12 месяцев за один код')
  const maxUses = body.max_uses == null || body.max_uses === '' ? null : Number(body.max_uses)
  if (maxUses != null && (!Number.isInteger(maxUses) || maxUses <= 0)) throw new ValidationError('Лимит использований должен быть целым и больше нуля')
  const validUntil = typeof body.valid_until === 'string' && body.valid_until ? body.valid_until : null
  if (validUntil && Number.isNaN(Date.parse(validUntil))) throw new ValidationError('Некорректная дата истечения')
  return { code, kind, value, maxUses, validUntil, createdBy }
}

export { createPromoCode, listPromoCodes, setPromoCodeActive, findPromoCodeById }
