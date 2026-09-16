import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler'
import { ValidationError } from '../errors/AppError'
import { createSupportMessage, type SupportCategory } from '../db/queries/supportMessages'
import { alertSupportMessage } from '../services/founderAlerts'

// Public contact / tech-support form (landing page, no account). No LLM
// prompt ever reads this text, so this isn't the CLAUDE.md §3.4 sanitiser —
// just plain bounds-checking before it lands in Postgres.

export const supportRouter = Router()

// Unauthenticated and DB-backed, same posture as sharedRouter: bound it per IP.
supportRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }))

const CATEGORIES: SupportCategory[] = ['general', 'support', 'billing']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MESSAGE_MAX_CHARS = 5000

export interface ContactParams { category: SupportCategory; name: string; email: string; message: string }

export function readContactParams(body: Record<string, unknown>): ContactParams {
  const category = typeof body.category === 'string' ? body.category : 'general'
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''

  if (!CATEGORIES.includes(category as SupportCategory)) throw new ValidationError('Некорректная тема обращения')
  if (!name || name.length > 200) throw new ValidationError('Укажите имя')
  if (!EMAIL.test(email) || email.length > 320) throw new ValidationError('Укажите корректный email')
  if (!message || message.length > MESSAGE_MAX_CHARS) throw new ValidationError('Сообщение не должно быть пустым или длиннее 5000 символов')

  return { category: category as SupportCategory, name, email, message }
}

supportRouter.post('/contact', asyncHandler(async (req, res) => {
  const params = readContactParams(req.body as Record<string, unknown>)

  await createSupportMessage({
    ...params,
    user_agent: req.get('user-agent')?.slice(0, 500) ?? null,
    ip: req.ip ?? null,
  })
  // Stored first, alerted second: the inbox is the record, the letter is the doorbell.
  alertSupportMessage(params)

  res.status(201).json({ ok: true })
}))
