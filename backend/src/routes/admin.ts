import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticate } from '../middleware/authenticate'
import { requireAdmin } from '../middleware/requireAdmin'
import { NotFoundError } from '../errors/AppError'
import { adminOverview, listAdminWorkspaces, getAdminWorkspace, listAdminSupport, type WorkspaceSort } from '../db/queries/admin'
import { grantPro, revokeGrant, setSpendCap, deactivateUser, reactivateUser, setSupportAnswered, listActions, requireReason } from '../services/adminActions'
import { readCreateInput, createPromoCode, listPromoCodes, setPromoCodeActive, findPromoCodeById } from '../services/promoCodes'
import { listAdminReferrals, referralFunnel } from '../services/referrals'

// The admin panel's API (TODO M). Every write goes through
// services/adminActions.ts and lands in admin_actions; reads are not logged.

export const adminRouter = Router()
adminRouter.use(authenticate, requireAdmin)

const PAGE_SIZE = 50
const SORTS: WorkspaceSort[] = ['created', 'active', 'spend', 'talks']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function readListParams(q: Record<string, unknown>): { q?: string; tier?: 'free' | 'pro'; sort: WorkspaceSort; page: number; pageSize: number } {
  const search = typeof q.q === 'string' ? q.q.trim().slice(0, 100) : ''
  const tier = q.tier === 'free' || q.tier === 'pro' ? q.tier : undefined
  const sort = SORTS.includes(q.sort as WorkspaceSort) ? (q.sort as WorkspaceSort) : 'created'
  const page = Math.max(1, Math.min(10_000, Number(q.page) || 1))
  return { q: search || undefined, tier, sort, page, pageSize: PAGE_SIZE }
}

adminRouter.get('/overview', asyncHandler(async (_req, res) => {
  res.json(await adminOverview())
}))

adminRouter.get('/workspaces', asyncHandler(async (req, res) => {
  const p = readListParams(req.query as Record<string, unknown>)
  res.json({ ...(await listAdminWorkspaces(p)), page: p.page, page_size: p.pageSize })
}))

adminRouter.get('/workspaces/:id', asyncHandler(async (req, res) => {
  if (!UUID.test(req.params.id)) throw new NotFoundError()
  const detail = await getAdminWorkspace(req.params.id)
  if (!detail) throw new NotFoundError()
  res.json(detail)
}))

adminRouter.get('/support', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const open = req.query.open !== '0'
  res.json({ ...(await listAdminSupport(page, PAGE_SIZE, open)), page, page_size: PAGE_SIZE })
}))

adminRouter.get('/actions', asyncHandler(async (req, res) => {
  const workspaceId = typeof req.query.workspace_id === 'string' && UUID.test(req.query.workspace_id) ? req.query.workspace_id : undefined
  res.json({ rows: await listActions({ workspaceId }) })
}))

// ── Writes ──────────────────────────────────────────────────────────────────

const body = (req: { body: unknown }) => (req.body ?? {}) as Record<string, unknown>
const id = (raw: string) => { if (!UUID.test(raw)) throw new NotFoundError(); return raw }

adminRouter.post('/workspaces/:id/grant', asyncHandler(async (req, res) => {
  const b = body(req)
  const plan = await grantPro({ adminId: req.user.id }, id(req.params.id), Number(b.days), requireReason(b.reason))
  res.json({ plan })
}))

adminRouter.post('/workspaces/:id/revoke-grant', asyncHandler(async (req, res) => {
  const plan = await revokeGrant({ adminId: req.user.id }, id(req.params.id), requireReason(body(req).reason))
  res.json({ plan })
}))

adminRouter.post('/workspaces/:id/spend-cap', asyncHandler(async (req, res) => {
  const b = body(req)
  const cap = b.cap_usd == null || b.cap_usd === '' ? null : Number(b.cap_usd)
  await setSpendCap({ adminId: req.user.id }, id(req.params.id), cap, requireReason(b.reason))
  res.json({ ok: true })
}))

adminRouter.post('/users/:id/deactivate', asyncHandler(async (req, res) => {
  await deactivateUser({ adminId: req.user.id }, id(req.params.id), requireReason(body(req).reason))
  res.json({ ok: true })
}))

adminRouter.post('/users/:id/reactivate', asyncHandler(async (req, res) => {
  await reactivateUser({ adminId: req.user.id }, id(req.params.id), requireReason(body(req).reason))
  res.json({ ok: true })
}))

adminRouter.post('/support/:id/answered', asyncHandler(async (req, res) => {
  await setSupportAnswered({ adminId: req.user.id }, id(req.params.id), body(req).answered !== false)
  res.json({ ok: true })
}))

// ── Promo codes ─────────────────────────────────────────────────────────────

adminRouter.get('/promo-codes', asyncHandler(async (_req, res) => {
  res.json({ rows: await listPromoCodes() })
}))

adminRouter.post('/promo-codes', asyncHandler(async (req, res) => {
  const input = readCreateInput(body(req), req.user.id)
  res.status(201).json({ promo: await createPromoCode(input) })
}))

adminRouter.post('/promo-codes/:id/active', asyncHandler(async (req, res) => {
  if (!(await findPromoCodeById(id(req.params.id)))) throw new NotFoundError()
  const promo = await setPromoCodeActive(req.params.id, body(req).active !== false)
  res.json({ promo })
}))

// ── Referrals ────────────────────────────────────────────────────────────────

adminRouter.get('/referrals', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const [{ rows, total }, funnel] = await Promise.all([listAdminReferrals(page, PAGE_SIZE), referralFunnel()])
  res.json({ rows, total, page, page_size: PAGE_SIZE, funnel })
}))
