import { pool } from '../connection'

export type SupportCategory = 'general' | 'support' | 'billing'

export interface CreateSupportMessageInput {
  category:   SupportCategory
  name:       string
  email:      string
  message:    string
  user_agent: string | null
  ip:         string | null
}

export async function createSupportMessage(m: CreateSupportMessageInput): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO support_messages (category, name, email, message, user_agent, ip)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [m.category, m.name, m.email, m.message, m.user_agent, m.ip],
  )
  return rows[0]
}
