import { client } from './client'

export interface Payment {
  id:             string
  kind:           'initial' | 'renewal'
  amount_kopecks: number
  status:         string
  created_at:     string
  period_start:   string | null
  period_end:     string | null
}

export interface Billing {
  enabled:          boolean
  tier:             'free' | 'pro'
  price_rub:        number
  expires_at:       string | null
  auto_renew:       boolean
  card_last4:       string | null
  renewal_failures: number
  payments:         Payment[]
}

export const getBilling = () => client.get<Billing>('/api/billing').then((r) => r.data)
export const checkout   = (saveCard = true) => client.post<{ url: string; order_id: string }>('/api/billing/checkout', { save_card: saveCard }).then((r) => r.data)
export const verifyOrder = (order: string) => client.get<{ status: string; paid: boolean }>('/api/billing/verify', { params: { order } }).then((r) => r.data)
export const cancelRenewal = () => client.post<Billing>('/api/billing/cancel').then((r) => r.data)
export const resumeRenewal = () => client.post<Billing>('/api/billing/resume').then((r) => r.data)
