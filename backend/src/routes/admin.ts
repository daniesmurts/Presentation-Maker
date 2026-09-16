import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticate } from '../middleware/authenticate'
import { requireAdmin } from '../middleware/requireAdmin'
import { NotFoundError } from '../errors/AppError'
import { adminOverview, listAdminWorkspaces, getAdminWorkspace, listAdminSupport, type WorkspaceSort } from '../db/queries/admin'

// The admin panel's API (TODO M). Phase 1 is read-only; every write that
// arrives in phase 2 goes through admin_actions. Reads are not logged.

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
  res.json({ ...(await listAdminSupport(page, PAGE_SIZE)), page, page_size: PAGE_SIZE })
}))
