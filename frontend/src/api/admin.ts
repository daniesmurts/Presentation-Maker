import { client } from './client'

export interface AdminOverview {
  users:      { total: number; new_7d: number; new_30d: number }
  workspaces: { active_7d: number; pro: number }
  month:      { talks: number; exports_pptx: number; exports_pdf: number; spend_usd: number; revenue_kopecks: number }
  rehearsals: { runs: number; reviews: number; workspaces: number; notes_applied: number }
  try_7d:     { started: number; stopped: number; typed: number; plan: number; cta: number; registered: number }
  support:    { open: number; last_7d: number }
  jobs:       { failed_24h: number; stuck: number }
}

export interface AdminWorkspaceRow {
  id: string; name: string; plan_tier: string; plan_expires_at: string | null; auto_renew: boolean; created_at: string
  owner_email: string | null; owner_name: string | null
  users: number; talks: number; spend_month_usd: number; last_active_at: string | null
}
export type WorkspaceSort = 'created' | 'active' | 'spend' | 'talks'
export interface WorkspaceListParams { q?: string; tier?: 'free' | 'pro'; sort?: WorkspaceSort; page?: number }
export interface Paged<T> { rows: T[]; total: number; page: number; page_size: number }

export interface AdminWorkspaceDetail {
  workspace: { id: string; name: string; plan_tier: string; plan_source: string; plan_expires_at: string | null; auto_renew: boolean; card_last4: string | null; renewal_failures: number; monthly_spend_cap_usd: number | null; style_learning: boolean; created_at: string }
  users:     Array<{ id: string; email: string; display_name: string | null; is_admin: boolean; deactivated_at: string | null; terms_accepted_at: string | null; terms_version: string | null; created_at: string }>
  talks:     Array<{ id: string; title: string; intent: string; audience: string; language: string; slides: number; theme_id: string; approved_at: string | null; shared: boolean; created_at: string }>
  payments:  Array<{ id: string; kind: string; amount_kopecks: number; status: string; error_code: string | null; period_start: string | null; period_end: string | null; recurring_consent_at: string | null; recurring_consent_ip: string | null; created_at: string }>
  spend:     Array<{ month: string; calls: number; cost_usd: number; failed: number }>
  events:    Array<{ id: string; talk_id: string | null; event: string; format: string | null; metadata: unknown; created_at: string }>
  jobs:      Array<{ id: string; kind: string; status: string; error_message: string | null; attempts: number; created_at: string; updated_at: string }>
}

export interface AdminSupportRow { id: string; category: string; name: string; email: string; message: string; created_at: string; workspace_id: string | null; answered_at: string | null; answered_by_email: string | null }
export interface AdminActionRow { id: string; admin_email: string | null; action: string; target_kind: string; target_id: string; before: unknown; after: unknown; reason: string | null; created_at: string }
export interface PlanState { plan_tier: string; plan_expires_at: string | null; plan_source: string }
export const GRANT_DAYS = [7, 14, 30, 90, 365] as const

export const getOverview     = () => client.get<AdminOverview>('/api/admin/overview').then((r) => r.data)
export const listWorkspaces  = (p: WorkspaceListParams) => client.get<Paged<AdminWorkspaceRow>>('/api/admin/workspaces', { params: p }).then((r) => r.data)
export const getWorkspace    = (id: string) => client.get<AdminWorkspaceDetail>(`/api/admin/workspaces/${id}`).then((r) => r.data)
export const listSupport     = (page = 1, open = true) => client.get<Paged<AdminSupportRow>>('/api/admin/support', { params: { page, open: open ? '1' : '0' } }).then((r) => r.data)
export const listActions     = (workspaceId?: string) => client.get<{ rows: AdminActionRow[] }>('/api/admin/actions', { params: { workspace_id: workspaceId } }).then((r) => r.data.rows)

export const grantPro        = (id: string, days: number, reason: string) => client.post<{ plan: PlanState }>(`/api/admin/workspaces/${id}/grant`, { days, reason }).then((r) => r.data.plan)
export const revokeGrant     = (id: string, reason: string) => client.post<{ plan: PlanState }>(`/api/admin/workspaces/${id}/revoke-grant`, { reason }).then((r) => r.data.plan)
export const setSpendCap     = (id: string, cap_usd: number | null, reason: string) => client.post(`/api/admin/workspaces/${id}/spend-cap`, { cap_usd, reason }).then(() => undefined)
export const deactivateUser  = (id: string, reason: string) => client.post(`/api/admin/users/${id}/deactivate`, { reason }).then(() => undefined)
export const reactivateUser  = (id: string, reason: string) => client.post(`/api/admin/users/${id}/reactivate`, { reason }).then(() => undefined)
export const setSupportAnswered = (id: string, answered: boolean) => client.post(`/api/admin/support/${id}/answered`, { answered }).then(() => undefined)

export interface AdminPromoRow {
  id: string; code: string; kind: 'percent' | 'fixed' | 'free_months'; value: number
  max_uses: number | null; valid_until: string | null; active: boolean
  created_by_email: string | null; created_at: string; redemptions: number
}
export const listPromoCodes = () => client.get<{ rows: AdminPromoRow[] }>('/api/admin/promo-codes').then((r) => r.data.rows)
export const createPromoCode = (input: { code: string; kind: string; value: number; max_uses: number | null; valid_until: string | null }) =>
  client.post<{ promo: AdminPromoRow }>('/api/admin/promo-codes', input).then((r) => r.data.promo)
export const setPromoCodeActive = (id: string, active: boolean) => client.post<{ promo: AdminPromoRow }>(`/api/admin/promo-codes/${id}/active`, { active }).then((r) => r.data.promo)

export interface AdminReferralRow {
  id: string; referrer_workspace_id: string; referee_workspace_id: string
  status: 'signed_up' | 'paid' | 'rewarded' | 'capped' | 'clawed_back' | 'blocked'
  reward_days: number | null; flagged: boolean; flag_reason: string | null; created_at: string; paid_at: string | null; rewarded_at: string | null
  referrer_email: string | null; referee_email: string | null
}
export interface ReferralFunnel { invited: number; paid: number; rewarded: number; reward_days_total: number }
export const listReferrals = (page = 1) => client.get<Paged<AdminReferralRow> & { funnel: ReferralFunnel }>('/api/admin/referrals', { params: { page } }).then((r) => r.data)

export interface JobStatusCounts { pending: number; processing: number; outline_ready: number; ready: number; failed: number }
export interface StuckJob { id: string; workspace_id: string; owner_email: string | null; status: string; attempts: number; created_at: string; updated_at: string }
export interface FailedJob { id: string; workspace_id: string; owner_email: string | null; error_message: string | null; attempts: number; updated_at: string }
export interface DailySpend { date: string; cost_usd: number; calls: number; failed: number }
export interface ProviderStat { model: string; account: string | null; calls: number; failed: number; cost_usd: number; last_error_code: string | null }
export interface DailyUsage { date: string; talks: number; exports_pptx: number; exports_pdf: number; images: number }
export interface AdminHealth {
  jobs: { by_status: JobStatusCounts; stuck: StuckJob[]; recent_failed: FailedJob[] }
  spend: { today_usd: number; cap_usd: number | null; by_day: DailySpend[] }
  providers: ProviderStat[]
  usage_by_day: DailyUsage[]
}
export const getHealth = () => client.get<AdminHealth>('/api/admin/health').then((r) => r.data)
