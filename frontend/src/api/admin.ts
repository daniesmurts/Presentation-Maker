import { client } from './client'

export interface AdminOverview {
  users:      { total: number; new_7d: number; new_30d: number }
  workspaces: { active_7d: number; pro: number }
  month:      { talks: number; exports_pptx: number; exports_pdf: number; spend_usd: number; revenue_kopecks: number }
  support:    { total: number; last_7d: number }
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
  workspace: { id: string; name: string; plan_tier: string; plan_expires_at: string | null; auto_renew: boolean; card_last4: string | null; renewal_failures: number; monthly_spend_cap_usd: number | null; style_learning: boolean; created_at: string }
  users:     Array<{ id: string; email: string; display_name: string | null; is_admin: boolean; terms_accepted_at: string | null; terms_version: string | null; created_at: string }>
  talks:     Array<{ id: string; title: string; intent: string; audience: string; language: string; slides: number; theme_id: string; approved_at: string | null; shared: boolean; created_at: string }>
  payments:  Array<{ id: string; kind: string; amount_kopecks: number; status: string; error_code: string | null; period_start: string | null; period_end: string | null; created_at: string }>
  spend:     Array<{ month: string; calls: number; cost_usd: number; failed: number }>
  events:    Array<{ id: string; talk_id: string | null; event: string; format: string | null; metadata: unknown; created_at: string }>
  jobs:      Array<{ id: string; kind: string; status: string; error_message: string | null; attempts: number; created_at: string; updated_at: string }>
}

export interface AdminSupportRow { id: string; category: string; name: string; email: string; message: string; created_at: string; workspace_id: string | null }

export const getOverview     = () => client.get<AdminOverview>('/api/admin/overview').then((r) => r.data)
export const listWorkspaces  = (p: WorkspaceListParams) => client.get<Paged<AdminWorkspaceRow>>('/api/admin/workspaces', { params: p }).then((r) => r.data)
export const getWorkspace    = (id: string) => client.get<AdminWorkspaceDetail>(`/api/admin/workspaces/${id}`).then((r) => r.data)
export const listSupport     = (page = 1) => client.get<Paged<AdminSupportRow>>('/api/admin/support', { params: { page } }).then((r) => r.data)
