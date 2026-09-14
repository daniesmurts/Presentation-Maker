import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler'
import { signToken } from '../lib/jwt'
import { setSessionCookie, clearSessionCookie } from '../lib/session'
import { createUserWithWorkspace, findUserByEmail, findPublicUserById, type PublicUser } from '../db/queries/users'
import { PLAN_LIMITS, tierOf } from '../lib/planTier'
import { recordTermsAcceptance } from '../db/queries/consent'
import { config } from '../lib/config'

// The UI reads the gate from here, never from the tier name: whether .pptx
// is locked depends on billing being on in THIS installation.
function withFeatures(user: PublicUser | null): PublicUser | null {
  if (!user) return null
  return { ...user, features: { pptxExport: PLAN_LIMITS[tierOf(user.plan_tier)].features.pptxExport, billing: config.billing.enabled } }
}
import { authenticate } from '../middleware/authenticate'
import { UnauthorizedError, ValidationError } from '../errors/AppError'

export const authRouter = Router()

// Login/register are the only unauthenticated write routes — the one place
// a credential can be brute-forced.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN = 8

function readCredentials(body: unknown): { email: string; password: string; displayName: string | null } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
  const password = typeof b.password === 'string' ? b.password : ''
  const displayName = typeof b.display_name === 'string' && b.display_name.trim() ? b.display_name.trim().slice(0, 120) : null
  if (!EMAIL_RE.test(email)) throw new ValidationError('Укажите корректный e-mail')
  if (password.length < PASSWORD_MIN) throw new ValidationError(`Пароль — не короче ${PASSWORD_MIN} символов`)
  return { email, password, displayName }
}

authRouter.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const { email, password, displayName } = readCredentials(req.body)
  // Consent is a condition of the account, not a preference: the checkbox
  // text on the form names the terms, the policy and 152-ФЗ, and the
  // acceptance is written to the user row with the documents' version.
  const acceptTerms = (req.body as Record<string, unknown> | null)?.accept_terms === true
  if (!acceptTerms) throw new ValidationError('Чтобы создать аккаунт, примите условия использования и политику конфиденциальности')
  if (await findUserByEmail(email)) throw new ValidationError('Этот e-mail уже зарегистрирован — войдите')
  const user = await createUserWithWorkspace(email, await bcrypt.hash(password, 12), displayName)
  await recordTermsAcceptance(user.id)
  setSessionCookie(res, signToken({ id: user.id, ws: user.workspace_id }))
  res.status(201).json({ user: withFeatures(await findPublicUserById(user.id)) })
}))

authRouter.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = readCredentials(req.body)
  const user = await findUserByEmail(email)
  // Same message for "no such user" and "wrong password".
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new UnauthorizedError('Неверный e-mail или пароль')
  setSessionCookie(res, signToken({ id: user.id, ws: user.workspace_id }))
  res.json({ user: withFeatures(await findPublicUserById(user.id)) })
}))

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res)
  res.status(204).end()
})

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: withFeatures(req.user) })
})
