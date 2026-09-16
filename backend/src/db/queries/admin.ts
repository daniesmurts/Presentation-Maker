import type { QueryResultRow } from 'pg'
import { pool } from '../connection'

// Read side of the admin panel (TODO M phase 1). Everything here is a
// plain aggregate over tables the product already writes; nothing is
// tracked for the panel's sake. Money is what usage_log / payments hold —
// model spend in USD, payments in kopecks — and is shown as such.

export interface AdminOverview {
  users:            { total: number; new_7d: number; new_30d: number }
  workspaces:       { active_7d: number; pro: number }
  month:            { talks: number; exports_pptx: number; exports_pdf: number; spend_usd: number; revenue_kopecks: number }
  support:          { open: number; last_7d: number }
  jobs:             { failed_24h: number; stuck: number }
}

export async function adminOverview(): Promise<AdminOverview> {
  const one = async <T extends QueryResultRow>(sql: string): Promise<T> => (await pool.query<T>(sql)).rows[0]
  const [users, ws, month, support, jobs] = await Promise.all([
    one<{ total: string; new_7d: string; new_30d: string }>(`
      SELECT COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text  AS new_7d,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS new_30d
        FROM users`),
    one<{ active_7d: string; pro: string }>(`
      SELECT (SELECT COUNT(DISTINCT workspace_id) FROM talk_events WHERE created_at >= NOW() - INTERVAL '7 days')::text AS active_7d,
             (SELECT COUNT(*) FROM workspaces WHERE plan_tier = 'pro')::text AS pro`),
    one<{ talks: string; exports_pptx: string; exports_pdf: string; spend_usd: string; revenue_kopecks: string }>(`
      SELECT (SELECT COUNT(*) FROM talks WHERE created_at >= date_trunc('month', NOW()))::text AS talks,
             (SELECT COUNT(*) FROM talk_events WHERE event = 'exported' AND format = 'pptx' AND created_at >= date_trunc('month', NOW()))::text AS exports_pptx,
             (SELECT COUNT(*) FROM talk_events WHERE event = 'exported' AND format = 'pdf'  AND created_at >= date_trunc('month', NOW()))::text AS exports_pdf,
             COALESCE((SELECT SUM(cost_usd) FROM usage_log WHERE created_at >= date_trunc('month', NOW())), 0)::text AS spend_usd,
             COALESCE((SELECT SUM(amount_kopecks) FROM payments WHERE status = 'CONFIRMED' AND created_at >= date_trunc('month', NOW())), 0)::text AS revenue_kopecks`),
    one<{ open: string; last_7d: string }>(`
      SELECT COUNT(*) FILTER (WHERE answered_at IS NULL)::text AS open, COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS last_7d FROM support_messages`),
    // «stuck»: still processing after 15 min — the worker's own timeout is shorter.
    one<{ failed_24h: string; stuck: string }>(`
      SELECT COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '24 hours')::text AS failed_24h,
             COUNT(*) FILTER (WHERE status IN ('pending','processing') AND updated_at < NOW() - INTERVAL '15 minutes')::text AS stuck
        FROM talk_jobs`),
  ])
  return {
    users:      { total: +users.total, new_7d: +users.new_7d, new_30d: +users.new_30d },
    workspaces: { active_7d: +ws.active_7d, pro: +ws.pro },
    month:      { talks: +month.talks, exports_pptx: +month.exports_pptx, exports_pdf: +month.exports_pdf, spend_usd: +month.spend_usd, revenue_kopecks: +month.revenue_kopecks },
    support:    { open: +support.open, last_7d: +support.last_7d },
    jobs:       { failed_24h: +jobs.failed_24h, stuck: +jobs.stuck },
  }
}

export interface AdminWorkspaceRow {
  id:               string
  name:             string
  plan_tier:        string
  plan_expires_at:  string | null
  auto_renew:       boolean
  created_at:       string
  owner_email:      string | null
  owner_name:       string | null
  users:            number
  talks:            number
  spend_month_usd:  number
  last_active_at:   string | null
}

export type WorkspaceSort = 'created' | 'active' | 'spend' | 'talks'
export interface ListWorkspacesParams { q?: string; tier?: 'free' | 'pro'; sort: WorkspaceSort; page: number; pageSize: number }

const SORT_SQL: Record<WorkspaceSort, string> = {
  created: 'w.created_at DESC',
  active:  'last_active_at DESC NULLS LAST',
  spend:   'spend_month_usd DESC',
  talks:   'talks DESC',
}

export async function listAdminWorkspaces(p: ListWorkspacesParams): Promise<{ rows: AdminWorkspaceRow[]; total: number }> {
  const where: string[] = []
  const args: unknown[] = []
  if (p.q) { args.push(`%${p.q}%`); where.push(`(w.name ILIKE $${args.length} OR EXISTS (SELECT 1 FROM users u2 WHERE u2.workspace_id = w.id AND u2.email ILIKE $${args.length}))`) }
  if (p.tier) { args.push(p.tier); where.push(`w.plan_tier = $${args.length}`) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = (await pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM workspaces w ${whereSql}`, args)).rows[0].n
  args.push(p.pageSize, (p.page - 1) * p.pageSize)
  const { rows } = await pool.query<AdminWorkspaceRow & { users: string; talks: string; spend_month_usd: string }>(`
    SELECT w.id, w.name, w.plan_tier, w.plan_expires_at, w.auto_renew, w.created_at,
           o.email AS owner_email, o.display_name AS owner_name,
           (SELECT COUNT(*) FROM users u WHERE u.workspace_id = w.id)::text AS users,
           (SELECT COUNT(*) FROM talks t WHERE t.workspace_id = w.id)::text AS talks,
           COALESCE((SELECT SUM(cost_usd) FROM usage_log l WHERE l.workspace_id = w.id AND l.created_at >= date_trunc('month', NOW())), 0)::text AS spend_month_usd,
           (SELECT MAX(created_at) FROM talk_events e WHERE e.workspace_id = w.id) AS last_active_at
      FROM workspaces w
      LEFT JOIN LATERAL (SELECT email, display_name FROM users WHERE workspace_id = w.id ORDER BY created_at LIMIT 1) o ON TRUE
      ${whereSql}
     ORDER BY ${SORT_SQL[p.sort]}
     LIMIT $${args.length - 1} OFFSET $${args.length}`, args)
  return { total: +total, rows: rows.map((r) => ({ ...r, users: +r.users, talks: +r.talks, spend_month_usd: +r.spend_month_usd })) }
}

export interface AdminWorkspaceDetail {
  workspace: { id: string; name: string; plan_tier: string; plan_source: string; plan_expires_at: string | null; auto_renew: boolean; card_last4: string | null; renewal_failures: number; monthly_spend_cap_usd: number | null; style_learning: boolean; created_at: string }
  users:     Array<{ id: string; email: string; display_name: string | null; is_admin: boolean; deactivated_at: string | null; terms_accepted_at: string | null; terms_version: string | null; created_at: string }>
  talks:     Array<{ id: string; title: string; intent: string; audience: string; language: string; slides: number; theme_id: string; approved_at: string | null; shared: boolean; created_at: string }>
  payments:  Array<{ id: string; kind: string; amount_kopecks: number; status: string; error_code: string | null; period_start: string | null; period_end: string | null; recurring_consent_at: string | null; recurring_consent_ip: string | null; created_at: string }>
  spend:     Array<{ month: string; calls: number; cost_usd: number; failed: number }>
  events:    Array<{ id: string; talk_id: string | null; event: string; format: string | null; metadata: unknown; created_at: string }>
  jobs:      Array<{ id: string; kind: string; status: string; error_message: string | null; attempts: number; created_at: string; updated_at: string }>
}

export async function getAdminWorkspace(id: string): Promise<AdminWorkspaceDetail | null> {
  const ws = (await pool.query<AdminWorkspaceDetail['workspace']>(
    `SELECT id, name, plan_tier, plan_source, plan_expires_at, auto_renew, card_last4, renewal_failures, monthly_spend_cap_usd, style_learning, created_at FROM workspaces WHERE id = $1`, [id])).rows[0]
  if (!ws) return null
  const [users, talks, payments, spend, events, jobs] = await Promise.all([
    pool.query<AdminWorkspaceDetail['users'][number]>(`SELECT id, email, display_name, is_admin, deactivated_at, terms_accepted_at, terms_version, created_at FROM users WHERE workspace_id = $1 ORDER BY created_at`, [id]),
    pool.query<AdminWorkspaceDetail['talks'][number] & { slides: string }>(
      `SELECT id, title, intent, audience, language, COALESCE(jsonb_array_length(slides), 0)::text AS slides, theme_id, approved_at, share_token IS NOT NULL AS shared, created_at
         FROM talks WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 200`, [id]),
    pool.query<AdminWorkspaceDetail['payments'][number]>(`SELECT id, kind, amount_kopecks, status, error_code, period_start, period_end, recurring_consent_at, recurring_consent_ip, created_at FROM payments WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 100`, [id]),
    pool.query<{ month: string; calls: string; cost_usd: string; failed: string }>(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::text AS calls, COALESCE(SUM(cost_usd), 0)::text AS cost_usd, COUNT(*) FILTER (WHERE NOT success)::text AS failed
         FROM usage_log WHERE workspace_id = $1 GROUP BY 1 ORDER BY 1 DESC LIMIT 12`, [id]),
    pool.query<AdminWorkspaceDetail['events'][number]>(`SELECT id, talk_id, event, format, metadata, created_at FROM talk_events WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 100`, [id]),
    pool.query<AdminWorkspaceDetail['jobs'][number]>(`SELECT id, kind, status, error_message, attempts, created_at, updated_at FROM talk_jobs WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 50`, [id]),
  ])
  return {
    workspace: { ...ws, monthly_spend_cap_usd: ws.monthly_spend_cap_usd == null ? null : +ws.monthly_spend_cap_usd },
    users:     users.rows,
    talks:     talks.rows.map((t) => ({ ...t, slides: +t.slides })),
    payments:  payments.rows,
    spend:     spend.rows.map((s) => ({ month: s.month, calls: +s.calls, cost_usd: +s.cost_usd, failed: +s.failed })),
    events:    events.rows,
    jobs:      jobs.rows,
  }
}

export interface AdminSupportRow {
  id: string; category: string; name: string; email: string; message: string; created_at: string
  answered_at: string | null; answered_by_email: string | null
  /** The sender's workspace, when the e-mail belongs to a registered user. */
  workspace_id: string | null
}

export async function listAdminSupport(page: number, pageSize: number, open: boolean): Promise<{ rows: AdminSupportRow[]; total: number }> {
  const where = open ? 'WHERE s.answered_at IS NULL' : ''
  const total = (await pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM support_messages s ${where}`)).rows[0].n
  const { rows } = await pool.query<AdminSupportRow>(`
    SELECT s.id, s.category, s.name, s.email, s.message, s.created_at, s.answered_at,
           (SELECT email FROM users u WHERE u.id = s.answered_by) AS answered_by_email,
           (SELECT workspace_id FROM users u WHERE u.email = LOWER(s.email) LIMIT 1) AS workspace_id
      FROM support_messages s ${where} ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`, [pageSize, (page - 1) * pageSize])
  return { rows, total: +total }
}
