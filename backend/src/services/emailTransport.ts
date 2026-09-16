import axios from 'axios'
import { logger } from '../lib/logger'

export interface EmailPayload {
  to:      string
  subject: string
  html:    string
  text:    string
}

// Sender identity — from_email's domain must be a verified sending domain in
// Unisender Go (DKIM/SPF) or sends are rejected. Same provider ИСПУМ runs on
// (backend/src/services/emailTransport.ts in that repo) — proven deliverable,
// no reason to introduce a second vendor for the sibling product.
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'noreply@tezarium.ru'
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? 'Тезариум'
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? 'hello@tezarium.ru'

const UNISENDER_API_KEY = process.env.UNISENDER_API_KEY
const UNISENDER_ENDPOINT =
  process.env.UNISENDER_ENDPOINT ?? 'https://go2.unisender.ru/ru/transactional/api/v1/email/send.json'

interface SendResult { ok: boolean; error?: string }

async function sendViaUnisender(apiKey: string, payload: EmailPayload): Promise<SendResult> {
  const res = await axios.post(
    UNISENDER_ENDPOINT,
    {
      message: {
        recipients: [{ email: payload.to }],
        subject: payload.subject,
        body: { html: payload.html, plaintext: payload.text },
        from_email: FROM_EMAIL,
        from_name: FROM_NAME,
        reply_to: REPLY_TO,
      },
    },
    { headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }, timeout: 15_000, validateStatus: () => true },
  )
  const data = res.data as { status?: string; message?: string; code?: number }
  const ok = res.status >= 200 && res.status < 300 && data?.status === 'success'
  if (!ok) {
    logger.error({ message: 'Unisender send failed', to: payload.to, httpStatus: res.status, apiStatus: data?.status, apiCode: data?.code, apiMessage: data?.message })
    return { ok: false, error: data?.message ? `Unisender ${res.status}: ${data.message}` : `Unisender HTTP ${res.status}` }
  }
  return { ok: true }
}

// No API key configured (local dev, CI, an on-prem box that hasn't set one
// up yet, CLAUDE.md §10 deployment profiles) — log instead of crashing or
// silently dropping. A developer verifying the signup flow reads the link
// straight out of the log line.
function logInsteadOfSend(payload: EmailPayload): SendResult {
  logger.info({ message: 'Email not sent — UNISENDER_API_KEY not set, logging instead', to: payload.to, subject: payload.subject, text: payload.text })
  return { ok: true }
}

/** Fire-and-forget by every caller — a mail provider outage must never fail
 *  the request it was triggered from (registration, password change). */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const result = UNISENDER_API_KEY ? await sendViaUnisender(UNISENDER_API_KEY, payload).catch((err) => {
    logger.error({ message: 'Unisender request threw', to: payload.to, err: err instanceof Error ? err.message : String(err) })
    return { ok: false, error: 'network error' } as SendResult
  }) : logInsteadOfSend(payload)
  if (!result.ok) logger.error({ message: 'Email send failed, giving up (single attempt)', to: payload.to, subject: payload.subject, error: result.error })
}
