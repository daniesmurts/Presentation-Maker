import { client } from './client'

export interface User {
  id:           string
  workspace_id: string
  email:        string
  display_name: string | null
  locale:       string
  is_admin:     boolean
  plan_tier:    string
  plan_expires_at: string | null
  /** The gate as it stands in this installation (billing off → everything open). */
  features:     { billing: boolean }
  // used / limit this calendar month; limit null = no limit (backend/src/lib/planTier.ts quotaOf)
  quota:        Record<'talks' | 'pptx' | 'pdf', { used: number; limit: number | null }>
}

export const me       = () => client.get<{ user: User }>('/api/auth/me').then((r) => r.data.user)
export const login    = (email: string, password: string) => client.post<{ user: User }>('/api/auth/login', { email, password }).then((r) => r.data.user)
export const register = (email: string, password: string, display_name: string, accept_terms: boolean) => client.post<{ user: User }>('/api/auth/register', { email, password, display_name, accept_terms }).then((r) => r.data.user)
export const logout   = () => client.post('/api/auth/logout').then(() => undefined)
