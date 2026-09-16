import { pool } from '../connection'

// Reads for the admin "Здоровье" page (TODO M phase 5) — the page to open
// when someone says «сломалось». Every number here is an aggregate over
// tables the product already writes (talk_jobs, usage_log, talk_events);
// nothing new is tracked for this page's sake.

export interface JobStatusCounts { pending: number; processing: number; outline_ready: number; ready: number; failed: number }

export async function jobStatusCounts(): Promise<JobStatusCounts> {
  const { rows } = await pool.query<{ status: string; n: string }>(`SELECT status, COUNT(*)::text AS n FROM talk_jobs GROUP BY status`)
  const base: JobStatusCounts = { pending: 0, processing: 0, outline_ready: 0, ready: 0, failed: 0 }
  for (const r of rows) if (r.status in base) base[r.status as keyof JobStatusCounts] = +r.n
  return base
}

export interface StuckJob { id: string; workspace_id: string; owner_email: string | null; status: string; attempts: number; created_at: string; updated_at: string }

/** Still pending/processing after 15 minutes — the worker's own timeout is shorter, so this means stuck, not slow. */
export async function stuckJobs(limit = 20): Promise<StuckJob[]> {
  const { rows } = await pool.query<StuckJob>(`
    SELECT j.id, j.workspace_id, u.email AS owner_email, j.status, j.attempts, j.created_at, j.updated_at
      FROM talk_jobs j LEFT JOIN users u ON u.id = j.user_id
     WHERE j.status IN ('pending', 'processing') AND j.updated_at < NOW() - INTERVAL '15 minutes'
     ORDER BY j.updated_at ASC LIMIT $1`, [limit])
  return rows
}

export interface FailedJob { id: string; workspace_id: string; owner_email: string | null; error_message: string | null; attempts: number; updated_at: string }

export async function recentFailedJobs(limit = 20): Promise<FailedJob[]> {
  const { rows } = await pool.query<FailedJob>(`
    SELECT j.id, j.workspace_id, u.email AS owner_email, j.error_message, j.attempts, j.updated_at
      FROM talk_jobs j LEFT JOIN users u ON u.id = j.user_id
     WHERE j.status = 'failed'
     ORDER BY j.updated_at DESC LIMIT $1`, [limit])
  return rows
}

export interface DailySpend { date: string; cost_usd: number; calls: number; failed: number }

export async function dailySpend(days = 14): Promise<DailySpend[]> {
  const { rows } = await pool.query<{ date: string; cost_usd: string; calls: string; failed: string }>(`
    SELECT to_char(d.date, 'YYYY-MM-DD') AS date,
           COALESCE(SUM(l.cost_usd), 0)::text AS cost_usd,
           COUNT(l.id)::text AS calls,
           COUNT(l.id) FILTER (WHERE NOT l.success)::text AS failed
      FROM generate_series(date_trunc('day', NOW()) - make_interval(days => $1 - 1), date_trunc('day', NOW()), '1 day') d(date)
      LEFT JOIN usage_log l ON date_trunc('day', l.created_at) = d.date
     GROUP BY d.date ORDER BY d.date`, [days])
  return rows.map((r) => ({ date: r.date, cost_usd: +r.cost_usd, calls: +r.calls, failed: +r.failed }))
}

export async function todaySpendUsd(): Promise<number> {
  const { rows } = await pool.query<{ cost: string }>(`SELECT COALESCE(SUM(cost_usd), 0)::text AS cost FROM usage_log WHERE created_at >= date_trunc('day', NOW())`)
  return +rows[0].cost
}

export interface ProviderStat { model: string; account: string | null; calls: number; failed: number; cost_usd: number; last_error_code: string | null }

export async function providerStats(hours = 24): Promise<ProviderStat[]> {
  const { rows } = await pool.query<ProviderStat & { calls: string; failed: string; cost_usd: string }>(`
    SELECT model, account,
           COUNT(*)::text AS calls,
           COUNT(*) FILTER (WHERE NOT success)::text AS failed,
           COALESCE(SUM(cost_usd), 0)::text AS cost_usd,
           (SELECT error_code FROM usage_log l2 WHERE l2.model = l1.model AND l2.account IS NOT DISTINCT FROM l1.account
              AND NOT l2.success AND l2.created_at >= NOW() - make_interval(hours => $1)
            ORDER BY l2.created_at DESC LIMIT 1) AS last_error_code
      FROM usage_log l1
     WHERE created_at >= NOW() - make_interval(hours => $1)
     GROUP BY model, account ORDER BY calls DESC`, [hours])
  return rows.map((r) => ({ ...r, calls: +r.calls, failed: +r.failed, cost_usd: +r.cost_usd }))
}

export interface DailyUsage { date: string; talks: number; exports_pptx: number; exports_pdf: number; images: number }

export async function dailyUsage(days = 14): Promise<DailyUsage[]> {
  const { rows } = await pool.query<{ date: string; talks: string; exports_pptx: string; exports_pdf: string; images: string }>(`
    SELECT to_char(d.date, 'YYYY-MM-DD') AS date,
           (SELECT COUNT(*) FROM talks t WHERE date_trunc('day', t.created_at) = d.date)::text AS talks,
           (SELECT COUNT(*) FROM talk_events e WHERE date_trunc('day', e.created_at) = d.date AND e.event = 'exported' AND e.format = 'pptx')::text AS exports_pptx,
           (SELECT COUNT(*) FROM talk_events e WHERE date_trunc('day', e.created_at) = d.date AND e.event = 'exported' AND e.format = 'pdf')::text AS exports_pdf,
           (SELECT COUNT(*) FROM talk_events e WHERE date_trunc('day', e.created_at) = d.date AND e.event = 'image_generated')::text AS images
      FROM generate_series(date_trunc('day', NOW()) - make_interval(days => $1 - 1), date_trunc('day', NOW()), '1 day') d(date)
     ORDER BY d.date`, [days])
  return rows.map((r) => ({ date: r.date, talks: +r.talks, exports_pptx: +r.exports_pptx, exports_pdf: +r.exports_pdf, images: +r.images }))
}
