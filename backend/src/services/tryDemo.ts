// The landing demo («Скажите первую минуту», routes/try.ts): the one open
// endpoint that calls a model. The browser did the listening and the
// arithmetic; what arrives is a minute of transcript, and what goes back
// is the plan of the deck it would build. Everything here is the boundary
// around that call.
//
// The gate is a signed, single-use token rather than a CAPTCHA: a real
// recording takes at least MIN_AGE_MS from page load to submit, so a token
// younger than that is a script. The jti set is per process — with two
// replicas the budget is ~2×, which is fine for a feature that costs about
// a dollar a day at its ceiling (usage_log feature `try_outline`).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { config } from '../lib/config'
import { sanitiseForPrompt } from '../lib/promptSanitiser'
import { planTalk } from './talks'
import { wordCount } from '../../../shared/rehearsalText'
import type { OutlineSlide, TalkLanguage } from '../../../shared/types'

export const MIN_WORDS            = 15      // less is not a minute of anything
export const MAX_CHARS            = 1_500   // a minute of speech is ~150 words; this is generous
export const MIN_AGE_MS           = 20_000  // a real recording takes at least this long
export const MAX_AGE_MS           = 15 * 60_000
export const DAILY_CEILING        = 500     // plans a day, platform-wide (≈ $1)
export const DEMO_SLIDES          = 5
export const TITLE_MAX_CHARS      = 80

// ─── Token ──────────────────────────────────────────────────────────────────

const used = new Map<string, number>()   // jti → expires at
function sweep(now: number) { for (const [k, exp] of used) if (exp < now) used.delete(k) }

const secret = () => config.auth.jwtSecret
const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url')

export function issueToken(now = Date.now()): string {
  const body = `${now}.${randomBytes(12).toString('base64url')}`
  return `${body}.${sign(body)}`
}

export type TokenVerdict = 'ok' | 'malformed' | 'too_young' | 'expired' | 'used'

/** Checks and CONSUMES the token: a valid one is good exactly once. */
export function consumeToken(token: unknown, now = Date.now()): TokenVerdict {
  if (typeof token !== 'string') return 'malformed'
  const parts = token.split('.')
  if (parts.length !== 3) return 'malformed'
  const [ts, jti, sig] = parts
  const expected = sign(`${ts}.${jti}`)
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return 'malformed'
  const issued = Number(ts)
  if (!Number.isFinite(issued)) return 'malformed'
  if (now - issued < MIN_AGE_MS) return 'too_young'
  if (now - issued > MAX_AGE_MS) return 'expired'
  sweep(now)
  if (used.has(jti)) return 'used'
  used.set(jti, issued + MAX_AGE_MS)
  return 'ok'
}

// ─── The plan ───────────────────────────────────────────────────────────────

export interface TryInput { transcript: string; language: TalkLanguage }
export type TryInputVerdict = 'ok' | 'too_short' | 'too_long'

export function readTryInput(body: unknown): { verdict: TryInputVerdict; input: TryInput } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const transcript = (typeof b.transcript === 'string' ? b.transcript : '').replace(/\s+/g, ' ').trim()
  const language: TalkLanguage = b.language === 'en' ? 'en' : 'ru'
  const input = { transcript, language }
  if (transcript.length > MAX_CHARS) return { verdict: 'too_long', input }
  if (wordCount(transcript) < MIN_WORDS) return { verdict: 'too_short', input }
  return { verdict: 'ok', input }
}

/** A fallback title from the first sentence, used only if the plan comes
 *  back without a title slide. The request itself asks the planner to
 *  name the talk — a first sentence («Ну, добрый день») is not a title,
 *  and passed as the topic the model keeps it (first browser check). */
export function titleFromTranscript(transcript: string): string {
  const first = transcript.split(/(?<=[.!?…])\s+/)[0] ?? transcript
  const words = first.split(' ')
  let out = ''
  for (const w of words) { if ((out + ' ' + w).trim().length > TITLE_MAX_CHARS) break; out = (out + ' ' + w).trim() }
  return out.replace(/[.!?…,;:]+$/, '') || transcript.slice(0, TITLE_MAX_CHARS)
}

export interface TryPlan { title: string; outline: OutlineSlide[] }

export async function planFromTranscript(input: TryInput): Promise<TryPlan> {
  const transcript = sanitiseForPrompt(input.transcript)
  const title = input.language === 'ru'
    ? 'не задана — сформулируйте по сказанному, это первая минута выступления, записанная с голоса'
    : 'not given — name it from what was said; this is the first minute of a talk, transcribed from speech'
  const plan = await planTalk({
    title, brief: transcript, intent: 'inform', audience: 'team', language: input.language,
    durationMinutes: 5, slideCountTarget: DEMO_SLIDES, notesEnabled: false, strictToBrief: false,
    styleExemplars: false,   // no workspace anyway; explicit so the eval-harness reasoning holds here too
  }, 'try_outline')
  // The plan's title slide names the talk better than the first sentence did.
  const titleSlide = plan.outline.find((s) => s.type === 'title')
  return { title: titleSlide?.title || titleFromTranscript(transcript), outline: plan.outline }
}
