import axios from 'axios'
import { config } from '../lib/config'
import { logger } from '../lib/logger'

// Sign in with Yandex ID — standard OAuth 2.0 authorization-code grant.
// Endpoints confirmed against yandex.ru/dev/id (2026-09-16):
//   authorize: GET  https://oauth.yandex.ru/authorize
//   token:     POST https://oauth.yandex.ru/token
//   userinfo:  GET  https://login.yandex.ru/info
const AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize'
const TOKEN_URL = 'https://oauth.yandex.ru/token'
const USERINFO_URL = 'https://login.yandex.ru/info'

export function yandexRedirectUri(): string {
  return `${config.frontendUrl}/api/auth/yandex/callback`
}

/** `state` is the CSRF token (verified against the cookie set alongside
 *  this redirect) — not app-level referral or consent flags, which travel
 *  in that same cookie instead of the URL (routes/auth.ts). */
export function yandexAuthorizeUrl(state: string): string {
  if (!config.yandexOAuth.enabled) throw new Error('Yandex OAuth is not configured')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.yandexOAuth.clientId,
    redirect_uri: yandexRedirectUri(),
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeYandexCode(code: string): Promise<string> {
  if (!config.yandexOAuth.enabled) throw new Error('Yandex OAuth is not configured')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.yandexOAuth.clientId,
    client_secret: config.yandexOAuth.clientSecret,
  })
  const res = await axios.post<{ access_token?: string; error?: string; error_description?: string }>(
    TOKEN_URL, body.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000, validateStatus: () => true },
  )
  if (res.status !== 200 || !res.data.access_token) {
    logger.error({ message: 'Yandex OAuth token exchange failed', status: res.status, error: res.data.error, description: res.data.error_description })
    throw new Error('Yandex OAuth token exchange failed')
  }
  return res.data.access_token
}

export interface YandexUser {
  id: string
  login: string
  defaultEmail: string | null
  displayName: string | null
}

export async function fetchYandexUser(accessToken: string): Promise<YandexUser> {
  const res = await axios.get<{ id: string; login: string; default_email?: string; display_name?: string; real_name?: string }>(
    USERINFO_URL, { params: { format: 'json' }, headers: { Authorization: `OAuth ${accessToken}` }, timeout: 10_000 },
  )
  return {
    id: res.data.id,
    login: res.data.login,
    defaultEmail: res.data.default_email ?? null,
    displayName: res.data.real_name || res.data.display_name || null,
  }
}
