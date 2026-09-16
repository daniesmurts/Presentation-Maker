import crypto from 'crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler'
import { signToken, REMEMBER_ME_EXPIRY } from '../lib/jwt'
import { setSessionCookie, clearSessionCookie } from '../lib/session'
import {
  createUserWithWorkspace, findUserByEmail, findUserById, findUserByYandexId, linkYandexId, findPublicUserById,
  setEmailVerified, updateUserPassword, type PublicUser, type UserRow,
} from '../db/queries/users'
import { quotaOf } from '../lib/planTier'
import { countReviewsThisMonth } from '../db/queries/rehearsals'
import { countTalksThisMonth } from '../db/queries/talks'
import { countDownloadsThisMonth } from '../db/queries/talkEvents'
import { recordTermsAcceptance } from '../db/queries/consent'
import { passwordIsStrong, PASSWORD_RULES } from '../../../shared/password'
import { config } from '../lib/config'
import { attachReferralOnSignup } from '../services/referrals'
import { sendEmail } from '../services/emailTransport'
import { verifyEmailEmail, passwordResetEmail, passwordChangedEmail } from '../lib/emailTemplates'
import { emailVerifyUrl, extractUserIdFromVerifyToken, verifyEmailVerifyToken } from '../services/emailVerification'
import {
  generateRawToken, hashToken, createResetToken, invalidateExistingTokens, findValidToken, markTokenUsed,
} from '../db/queries/passwordReset'
import { yandexAuthorizeUrl, exchangeYandexCode, fetchYandexUser } from '../services/yandexOAuth'
import { alertSignup } from '../services/founderAlerts'

// The UI reads the gate from here, never from the tier name: what is locked
// depends on the tier AND on billing being on in THIS installation, and
// on what was already used this month (quota). Three counts per /me — cheap
// (indexed by workspace and month), and the menu must know before the
// click, because a plain <a download> saves a 403 JSON as a file.
async function withFeatures(user: PublicUser | null): Promise<PublicUser | null> {
  if (!user) return null
  const [talks, pptx, pdf, reviews] = await Promise.all([
    countTalksThisMonth(user.workspace_id), countDownloadsThisMonth(user.workspace_id, 'pptx'), countDownloadsThisMonth(user.workspace_id, 'pdf'),
    countReviewsThisMonth(user.workspace_id),
  ])
  return { ...user, features: { billing: config.billing.enabled }, quota: quotaOf(user.plan_tier, { talks, pptx, pdf, reviews }) }
}
import { authenticate } from '../middleware/authenticate'
import { DeactivatedError, UnauthorizedError, ValidationError } from '../errors/AppError'

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
  const user = await createUserWithWorkspace(email, await bcrypt.hash(password, 12), displayName, config.adminEmails.includes(email), req.ip ?? null)
  await recordTermsAcceptance(user.id)
  const ref = (req.body as Record<string, unknown> | null)?.ref
  if (typeof ref === 'string' && ref) await attachReferralOnSignup(user.workspace_id, ref, email, req.ip ?? null)
  alertSignup({ email, displayName, via: 'password', referred: typeof ref === 'string' && Boolean(ref) })
  // Soft gate (decided 2026-09-16): verification never blocks signup or
  // login, only a dismissible-by-verifying banner — fire-and-forget so a
  // mail-provider outage never fails registration.
  void sendEmail({ ...verifyEmailEmail(displayName, emailVerifyUrl(user.id, user.email)), to: user.email })
  setSessionCookie(res, signToken({ id: user.id, ws: user.workspace_id }))
  res.status(201).json({ user: await withFeatures(await findPublicUserById(user.id)) })
}))

authRouter.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = readCredentials(req.body)
  const rememberMe = (req.body as Record<string, unknown> | null)?.remember_me === true
  const user = await findUserByEmail(email)
  // Same message for "no such user", "wrong password", and "this account
  // has no password" (Yandex-ID-only) — none of those should be
  // distinguishable from outside.
  if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) throw new UnauthorizedError('Неверный e-mail или пароль')
  if (user.deactivated_at) throw new DeactivatedError()
  setSessionCookie(res, signToken({ id: user.id, ws: user.workspace_id }, rememberMe ? REMEMBER_ME_EXPIRY : undefined), rememberMe)
  res.json({ user: await withFeatures(await findPublicUserById(user.id)) })
}))

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res)
  res.status(204).end()
})

authRouter.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({ user: await withFeatures(req.user) })
}))

// Unauthenticated — read before login/register render, to decide whether
// the Yandex ID button is worth showing at all (off is the safe default:
// a dev box or an on-prem install with no OAuth app configured gets a
// login page with one fewer button, not a dead link into a 404).
authRouter.get('/providers', (_req, res) => {
  res.json({ yandex: config.yandexOAuth.enabled })
})

// ─── Email verification ──────────────────────────────────────────────────────
// GET, not POST: it's a link clicked from an email client. Unlike the
// Teaching-assistant sibling's stricter GET→confirm-page→POST dance, a bare
// GET is safe here — verifying only proves address ownership after the
// account already exists and the owner is already logged in; there is no
// pre-registration window for a mail scanner's prefetch to hijack.
authRouter.get('/verify-email', asyncHandler(async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : ''
  const userId = extractUserIdFromVerifyToken(token)
  const user = userId ? await findUserById(userId) : null
  if (user && verifyEmailVerifyToken(token, user.email)) {
    await setEmailVerified(user.id)
    res.redirect(`${config.frontendUrl}/talks?verified=1`)
  } else {
    res.redirect(`${config.frontendUrl}/talks?verified=0`)
  }
}))

authRouter.post('/resend-verification', authenticate, authLimiter, asyncHandler(async (req, res) => {
  const user = await findUserById(req.user.id)
  if (user && !user.email_verified_at) {
    void sendEmail({ ...verifyEmailEmail(user.display_name, emailVerifyUrl(user.id, user.email)), to: user.email })
  }
  res.json({ ok: true })
}))

// ─── Password reset ──────────────────────────────────────────────────────────

authRouter.post('/forgot-password', authLimiter, asyncHandler(async (req, res) => {
  const email = typeof (req.body as Record<string, unknown> | null)?.email === 'string'
    ? ((req.body as Record<string, unknown>).email as string).trim().toLowerCase() : ''
  const user = email ? await findUserByEmail(email) : null
  if (user && !user.deactivated_at) {
    const rawToken = generateRawToken()
    await invalidateExistingTokens(user.id)
    await createResetToken(user.id, hashToken(rawToken), new Date(Date.now() + 60 * 60 * 1000))
    const resetUrl = `${config.frontendUrl}/reset-password?token=${rawToken}`
    void sendEmail({ ...passwordResetEmail(user.display_name, resetUrl), to: user.email })
  }
  // Always the same response — never reveal whether the address is registered.
  res.json({ message: 'Если этот адрес зарегистрирован, письмо со ссылкой отправлено.' })
}))

authRouter.post('/reset-password', authLimiter, asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown> | null
  const rawToken = typeof body?.token === 'string' ? body.token : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!rawToken) throw new ValidationError('Ссылка для сброса пароля недействительна или устарела')
  if (!passwordIsStrong(password)) throw new ValidationError('Пароль: не менее 8 символов, заглавная буква и цифра')
  const record = await findValidToken(hashToken(rawToken))
  if (!record) throw new ValidationError('Ссылка для сброса пароля недействительна или устарела')
  await updateUserPassword(record.user_id, await bcrypt.hash(password, 12))
  await markTokenUsed(record.id)
  const user = await findUserById(record.user_id)
  if (user) void sendEmail({ ...passwordChangedEmail(user.display_name), to: user.email })
  res.json({ message: 'Пароль изменён. Теперь вы можете войти.' })
}))

// ─── Sign in with Yandex ID ───────────────────────────────────────────────────
// Both routes 404 (via the same "not found" the router falls through to)
// when the feature isn't configured — nothing in the frontend should ever
// be able to reach a route that then has to explain it's turned off.
const OAUTH_STATE_COOKIE = 'tezarium_oauth_state'

if (config.yandexOAuth.enabled) {
  // GET, not POST: this is a real navigation (the browser leaves the app
  // for oauth.yandex.ru), not an XHR — a <button> can't drive that, only
  // an <a href>. state is CSRF protection, round-tripped through Yandex;
  // ref (referral code) and consent travel in the same short-lived cookie
  // since the URL that comes back from Yandex is entirely theirs to shape.
  authRouter.get('/yandex', authLimiter, (req, res) => {
    const state = crypto.randomBytes(16).toString('hex')
    const ref = typeof req.query.ref === 'string' ? req.query.ref.slice(0, 64) : ''
    // Every entry point to this route shows the consent disclosure right
    // under the button (AuthPage.tsx) — there's no separate checkbox to
    // gate on for a redirect-initiated flow, so accept_terms=1 is sent
    // unconditionally by the frontend and is the account's consent record
    // if a new account ends up being created below.
    const acceptTerms = req.query.accept_terms === '1' ? '1' : '0'
    const cookieValue = new URLSearchParams({ state, ref, terms: acceptTerms }).toString()
    res.cookie(OAUTH_STATE_COOKIE, cookieValue, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/yandex', maxAge: 5 * 60 * 1000,
    })
    res.redirect(yandexAuthorizeUrl(state))
  })

  authRouter.get('/yandex/callback', asyncHandler(async (req, res) => {
    const saved = req.cookies?.[OAUTH_STATE_COOKIE] ? new URLSearchParams(req.cookies[OAUTH_STATE_COOKIE] as string) : null
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth/yandex' })

    const queryState = typeof req.query.state === 'string' ? req.query.state : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const savedState = saved?.get('state') ?? ''
    // req.query.error present, no saved cookie (expired/blocked cookies),
    // or a state mismatch (CSRF / stale link) — all the same bounce.
    if (req.query.error || !code || !savedState || queryState !== savedState) {
      res.redirect(`${config.frontendUrl}/login?error=yandex`)
      return
    }

    let yandexUser: Awaited<ReturnType<typeof fetchYandexUser>>
    try {
      const accessToken = await exchangeYandexCode(code)
      yandexUser = await fetchYandexUser(accessToken)
    } catch {
      res.redirect(`${config.frontendUrl}/login?error=yandex`)
      return
    }
    if (!yandexUser.defaultEmail) {
      // No email on the Yandex account to build an account around — rare
      // (a phone-only Yandex ID), but real.
      res.redirect(`${config.frontendUrl}/login?error=yandex_no_email`)
      return
    }
    const email = yandexUser.defaultEmail.toLowerCase()

    let user: UserRow | null = await findUserByYandexId(yandexUser.id)
    if (!user) {
      const existing = await findUserByEmail(email)
      if (existing) {
        // Same person, already has a password account — attach the Yandex
        // id rather than creating a second account for one email.
        await linkYandexId(existing.id, yandexUser.id)
        user = existing
      } else {
        if (saved?.get('terms') !== '1') {
          res.redirect(`${config.frontendUrl}/register?error=yandex_consent`)
          return
        }
        const displayName = yandexUser.displayName?.trim().slice(0, 120) || null
        const created = await createUserWithWorkspace(email, null, displayName, config.adminEmails.includes(email), req.ip ?? null, yandexUser.id)
        await recordTermsAcceptance(created.id)
        const ref = saved?.get('ref')
        if (ref) await attachReferralOnSignup(created.workspace_id, ref, email, req.ip ?? null)
        alertSignup({ email, displayName, via: 'yandex', referred: Boolean(ref) })
        user = created
      }
    }
    if (user.deactivated_at) {
      res.redirect(`${config.frontendUrl}/login?error=deactivated`)
      return
    }
    // Treated like "remember me" checked — re-doing the Yandex redirect
    // dance every week is real friction a password login doesn't have.
    setSessionCookie(res, signToken({ id: user.id, ws: user.workspace_id }, REMEMBER_ME_EXPIRY), true)
    res.redirect(`${config.frontendUrl}/talks`)
  }))
}
