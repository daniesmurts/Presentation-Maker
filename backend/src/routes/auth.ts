import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler'
import { signToken } from '../lib/jwt'
import { setSessionCookie, clearSessionCookie } from '../lib/session'
import { createUserWithWorkspace, findUserByEmail, findPublicUserById, type PublicUser } from '../db/queries/users'
import { quotaOf } from '../lib/planTier'
import { countTalksThisMonth } from '../db/queries/talks'
import { countDownloadsThisMonth } from '../db/queries/talkEvents'
import { recordTermsAcceptance } from '../db/queries/consent'
import { passwordIsStrong, PASSWORD_RULES } from '../../../shared/password'
import { config } from '../lib/config'

// The UI reads the gate from here, never from the tier name: what is locked
// depends on the tier AND on billing being on in THIS installation, and
// on what was already used this month (quota). Three counts per /me — cheap
// (indexed by workspace and month), and the menu must know before the
// click, because a plain <a download> saves a 403 JSON as a file.
async function withFeatures(user: PublicUser | null): Promise<PublicUser | null> {
  if (!user) return null
  const [talks, pptx, pdf] = await Promise.all([
    countTalksThisMonth(user.workspace_id), countDownloadsThisMonth(user.workspace_id, 'pptx'), countDownloadsThisMonth(user.workspace_id, 'pdf'),
  ])
  return { ...user, features: { billing: config.billing.enabled }, quota: quotaOf(user.plan_tier, { talks, pptx, pdf }) }
}
import { authenticate } from '../middleware/authenticate'
import { UnauthorizedError, ValidationError } from '../errors/AppError'

export const authRouter = Router()

// Login/register are the only unauthenticated write routes — the one place
// a credential can be brute-forced.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN = PASSWORD_RULES.minLength

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
  // The rules the form shows as a checklist (shared/password.ts); login is
  // not held to them — older accounts must still sign in.
  if (!passwordIsStrong(password)) throw new ValidationError('Пароль: не менее 8 символов, заглавная буква и цифра')
  const acceptTerms = (req.body as Record<string, unknown> | null)?.accept_terms === true
  if (!acceptTerms) throw new ValidationError('Чтобы создать аккаунт, примите условия использования и политику конфиденциальности')
  if (await findUserByEmail(email)) throw new ValidationError('Этот e-mail уже зарегистрирован — войдите')
  const user = await createUserWithWorkspace(email, await bcrypt.hash(password, 12), displayName, config.adminEmails.includes(email))
  await recordTermsAcceptance(user.id)
  setSessionCookie(res, signToken({ id: user.id, ws: user.workspace_id }))
  res.status(201).json({ user: await withFeatures(await findPublicUserById(user.id)) })
}))

authRouter.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = readCredentials(req.body)
  const user = await findUserByEmail(email)
  // Same message for "no such user" and "wrong password".
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new UnauthorizedError('Неверный e-mail или пароль')
  setSessionCookie(res, signToken({ id: user.id, ws: user.workspace_id }))
  res.json({ user: await withFeatures(await findPublicUserById(user.id)) })
}))

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res)
  res.status(204).end()
})

authRouter.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({ user: await withFeatures(req.user) })
}))
