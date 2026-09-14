import axios from 'axios'
import { createUsageLog } from '../../db/queries/usageLog'
import { calculateDeepSeekCost } from '../../config/pricing'
import { logger } from '../../lib/logger'
import { resolveModelJSON, TruncatedResponseError } from './modelJson'
import type { ChatMessage, ChatOptions, LLMProvider, ProviderCapabilities } from './types'

// Ported from the parent's services/llm/deepseek.ts minus vision, OCR and
// Telegram alerting. What is kept is incident-backed: the multi-account
// fallback (2026-07-24) and the finish_reason check (2026-09-09).

// Configurable so a self-hosted endpoint (vLLM on RU infrastructure, a
// DashScope compatible-mode account) needs no code change.
const DEFAULT_BASE_URL = 'https://api.deepseek.com'

// DeepSeek collapsed its line into one served model on 2026-09-14
// (`deepseek-flash`, V4.1-Flash); V4-era ids are aliases onto it. One env
// var, because there is nothing to choose between on the public API.
const MODEL = () => process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash'

const CAPABILITIES: ProviderCapabilities = {
  strictJsonMode:  true,
  maxOutputTokens: 8192,   // the provider's real output ceiling (CLAUDE.md §3.3)
}

// ─── Multi-account redundancy ──────────────────────────────────────────────
//
// Incident (parent product, 2026-07-24): the single DeepSeek account ran out
// of balance (HTTP 402) and, being the only credential, every generation
// silently degraded until someone topped it up. Accounts are separately
// billed, so trying the next one on a retryable failure is a real
// mitigation. Account 1 is DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL; additional
// ones are DEEPSEEK_API_KEY_2..5 with optional _BASE_URL_N / _ACCOUNT_NAME_N.
const MAX_ACCOUNTS = 5

// Retryable = the same request against a DIFFERENT account could plausibly
// succeed: the account is the problem (401/402/403/429), the call never got
// a response (network/timeout), or the provider blipped (5xx). A 400/404/422
// means the REQUEST is malformed — it fails identically everywhere, so fail
// fast instead of burning every account on a doomed call.
const RETRYABLE_STATUS = new Set([401, 402, 403, 408, 429, 500, 502, 503, 504])

function isRetryable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false
  if (!err.response) return true
  return RETRYABLE_STATUS.has(err.response.status)
}

// A truncated answer is neither an account problem (another account
// truncates identically) nor a "malformed JSON, retry might help" case.
// Not an AxiosError, so isRetryable() already treats it as non-retryable.
export { TruncatedResponseError } from './modelJson'

// How long a failed account is deprioritised (not excluded) after a
// retryable failure. Short enough that one rate-limit spike doesn't sideline
// it for long; long enough that a broken account doesn't cost every call an
// extra failed round-trip.
const COOLDOWN_MS = 5 * 60 * 1000
const downUntil = new Map<string, number>()

interface DeepSeekAccount {
  label:   string
  apiKey:  string
  baseUrl: string
}

function resolveAccounts(): DeepSeekAccount[] {
  const accounts: DeepSeekAccount[] = []

  const primaryKey = process.env.DEEPSEEK_API_KEY
  if (primaryKey) {
    accounts.push({
      label:   process.env.DEEPSEEK_ACCOUNT_NAME?.trim() || 'primary',
      apiKey:  primaryKey,
      baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_BASE_URL,
    })
  }

  for (let i = 2; i <= MAX_ACCOUNTS; i++) {
    const key = process.env[`DEEPSEEK_API_KEY_${i}`]
    if (!key) continue
    accounts.push({
      label:   process.env[`DEEPSEEK_ACCOUNT_NAME_${i}`]?.trim() || `key-${i}`,
      apiKey:  key,
      baseUrl: process.env[`DEEPSEEK_BASE_URL_${i}`]?.trim() || DEFAULT_BASE_URL,
    })
  }

  return accounts
}

// Healthy accounts first, cooling-down ones last — but every account stays
// eligible. A stale cooldown flag must never turn into "no accounts to try".
function orderAccounts(accounts: DeepSeekAccount[]): DeepSeekAccount[] {
  const now = Date.now()
  const healthy = accounts.filter((a) => (downUntil.get(a.label) ?? 0) <= now)
  const cooling = accounts
    .filter((a) => (downUntil.get(a.label) ?? 0) > now)
    .sort((a, b) => (downUntil.get(a.label) ?? 0) - (downUntil.get(b.label) ?? 0))
  return [...healthy, ...cooling]
}

// A fallback is, from the caller's point of view, a successful call — no
// error propagates, so nothing else will notice. Logged at error level so
// the platform cannot quietly run on its last working account for weeks.
// (An alert channel belongs here when there is one — TODO C.)
function notifyFallback(failedLabel: string, usedLabel: string, reason: string): void {
  logger.error({ message: 'DeepSeek account failed, fell back to next account — check its balance/status', failedAccount: failedLabel, usedAccount: usedLabel, reason })
}

export class DeepSeekProvider implements LLMProvider {
  name: 'deepseek' = 'deepseek'
  capabilities = CAPABILITIES

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const accounts = resolveAccounts()
    if (accounts.length === 0) throw new Error('DEEPSEEK_API_KEY is not set')

    const ordered = orderAccounts(accounts)
    let lastErr: unknown

    for (let i = 0; i < ordered.length; i++) {
      const account = ordered[i]
      try {
        const content = await this.attemptChat(account, messages, opts)
        if (i > 0) notifyFallback(ordered[i - 1].label, account.label, describeError(lastErr))
        downUntil.delete(account.label) // recovered — clear any stale cooldown
        return content
      } catch (err) {
        lastErr = err
        if (!isRetryable(err)) throw err
        downUntil.set(account.label, Date.now() + COOLDOWN_MS)
        logger.warn({ message: 'DeepSeek account attempt failed, trying next account', account: account.label, error: describeError(err), remaining: ordered.length - i - 1 })
      }
    }
    throw lastErr
  }

  /** One HTTP attempt against one account. Throws on failure — chat() above
   *  decides whether to retry on a different account. */
  private async attemptChat(account: DeepSeekAccount, messages: ChatMessage[], opts: ChatOptions): Promise<string> {
    const start = Date.now()
    const model = MODEL()

    try {
      const response = await axios.post(
        `${account.baseUrl}/chat/completions`,
        {
          model,
          messages,
          // Thinking defaults to ENABLED on this model and must be switched
          // off explicitly, or every call silently becomes slow, expensive
          // reasoning. Nothing in talk generation wants chain-of-thought.
          thinking: { type: 'disabled' },
          ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
          ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
        },
        {
          headers: { Authorization: `Bearer ${account.apiKey}`, 'Content-Type': 'application/json' },
          timeout: 60_000,
        },
      )

      const usage        = response.data.usage as { prompt_tokens: number; completion_tokens: number } | undefined
      const inputTokens  = usage?.prompt_tokens     ?? 0
      const outputTokens = usage?.completion_tokens ?? 0
      const choice       = response.data.choices[0]

      // CLAUDE.md §3.1: a truncated answer hit the token ceiling, not a
      // transient failure. Returning it would let chatJSON's parse-retry burn
      // a second identical (identically doomed) call. Log it as its own row
      // with the REAL token counts, then fail fast.
      if (choice.finish_reason === 'length') {
        if (opts.context) {
          const costUsd = calculateDeepSeekCost(inputTokens, outputTokens, model)
          createUsageLog({
            ...opts.context, model: `deepseek:${model}`, account: account.label,
            inputTokens, outputTokens, costUsd, durationMs: Date.now() - start,
            success: false, errorCode: 'TRUNCATED',
          }).catch((e) => logger.warn({ message: 'Failed to write usage log', error: e.message }))
        }
        logger.warn({
          message: 'DeepSeek response truncated at token ceiling — not retrying (identical request would truncate again)',
          feature: opts.context?.feature, model, account: account.label, outputTokens, maxTokens: opts.maxTokens,
        })
        throw new TruncatedResponseError(model, opts.maxTokens, 'DeepSeek')
      }

      if (opts.context) {
        const costUsd = calculateDeepSeekCost(inputTokens, outputTokens, model)
        createUsageLog({
          ...opts.context, model: `deepseek:${model}`, account: account.label,
          inputTokens, outputTokens, costUsd, durationMs: Date.now() - start, success: true,
        }).catch((e) => logger.warn({ message: 'Failed to write usage log', error: e.message }))
      }

      return choice.message.content as string

    } catch (err) {
      // Already logged with accurate token counts above.
      if (err instanceof TruncatedResponseError) throw err

      const errorCode = axios.isAxiosError(err) ? `HTTP_${err.response?.status ?? 0}` : 'UNKNOWN'

      if (opts.context) {
        createUsageLog({
          ...opts.context, model: `deepseek:${model}`, account: account.label,
          inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: Date.now() - start,
          success: false, errorCode,
        }).catch(() => null)
      }
      logger.warn({ message: 'DeepSeek call failed', feature: opts.context?.feature, model, account: account.label, errorCode })
      throw err
    }
  }

  async chatJSON<T>(messages: ChatMessage[], retryLabel = 'response', opts: ChatOptions = {}): Promise<T> {
    const raw = await this.chat(messages, { ...opts, jsonMode: true })
    return resolveModelJSON<T>(raw, retryLabel, () => this.chat(
      [
        ...messages,
        { role: 'assistant', content: raw },
        {
          role:    'user',
          content: `Ваш ${retryLabel} не был валидным JSON. Ответьте ТОЛЬКО валидным JSON-объектом, без markdown и пояснений.`,
        },
      ],
      { ...opts, jsonMode: true },
    ))
  }
}

function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) return err.response ? `HTTP ${err.response.status}` : (err.code ?? 'network error')
  return err instanceof Error ? err.message : 'unknown error'
}
