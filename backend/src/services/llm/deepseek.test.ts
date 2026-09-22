import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Multi-account redundancy (parent incident 2026-07-24: a single account ran
// out of balance and silently degraded every feature) and the truncation
// check (2026-09-09, CLAUDE.md §3.1). Covers: retryable failures fall through
// to the next account, non-retryable ones fail fast, a truncated answer is
// neither retried on another account nor handed to the JSON-repair retry.

const { postMock, createUsageLogMock } = vi.hoisted(() => ({
  postMock:           vi.fn(),
  createUsageLogMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('axios', () => ({
  default: {
    post: postMock,
    isAxiosError: (err: unknown): boolean => !!err && typeof err === 'object' && 'isAxiosError' in err,
  },
}))
vi.mock('../../db/queries/usageLog', () => ({ createUsageLog: createUsageLogMock }))
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { DeepSeekProvider, TruncatedResponseError } from './deepseek'
import { calculateDeepSeekCost } from '../../config/pricing'

function axiosError(status: number | undefined) {
  const err: Record<string, unknown> = { isAxiosError: true, message: `status ${status}` }
  if (status !== undefined) err.response = { status }
  return err
}

function okResponse(content = 'ok') {
  return { data: { choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } } }
}

function truncatedResponse(content = '{"incomplete') {
  return { data: { choices: [{ message: { content }, finish_reason: 'length' }], usage: { prompt_tokens: 10, completion_tokens: 8192 } } }
}

const ENV_KEYS = [
  'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_ACCOUNT_NAME',
  'DEEPSEEK_API_KEY_2', 'DEEPSEEK_BASE_URL_2', 'DEEPSEEK_ACCOUNT_NAME_2',
  'DEEPSEEK_API_KEY_3', 'DEEPSEEK_BASE_URL_3', 'DEEPSEEK_ACCOUNT_NAME_3',
]
const savedEnv: Record<string, string | undefined> = {}
const CTX = { userId: 'u1', workspaceId: 'w1', feature: 'talk_outline' as const }

describe('DeepSeekProvider', () => {
  let uniqueSuffix = 0

  beforeEach(() => {
    for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k] }
    postMock.mockReset()
    createUsageLogMock.mockClear()
    uniqueSuffix++
  })
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k]
      else process.env[k] = savedEnv[k]
    }
  })

  // Fresh account labels per test so the module-level cooldown map never
  // leaks state between tests.
  function setAccounts(n: 1 | 2 | 3) {
    process.env.DEEPSEEK_API_KEY = 'key-primary'
    process.env.DEEPSEEK_ACCOUNT_NAME = `primary-${uniqueSuffix}`
    if (n >= 2) { process.env.DEEPSEEK_API_KEY_2 = 'key-2'; process.env.DEEPSEEK_ACCOUNT_NAME_2 = `secondary-${uniqueSuffix}` }
    if (n >= 3) { process.env.DEEPSEEK_API_KEY_3 = 'key-3'; process.env.DEEPSEEK_ACCOUNT_NAME_3 = `tertiary-${uniqueSuffix}` }
  }

  it('single account, success', async () => {
    setAccounts(1)
    postMock.mockResolvedValueOnce(okResponse('hello'))
    expect(await new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }])).toBe('hello')
    expect(postMock).toHaveBeenCalledOnce()
  })

  it('switches thinking OFF explicitly on every call — it defaults to on', async () => {
    setAccounts(1)
    postMock.mockResolvedValueOnce(okResponse())
    await new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }])
    expect(postMock.mock.calls[0][1].thinking).toEqual({ type: 'disabled' })
  })

  it('throws when no DEEPSEEK_API_KEY is configured at all', async () => {
    await expect(new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('DEEPSEEK_API_KEY is not set')
  })

  it('falls back to account 2 on a 402 (retryable) and returns its result', async () => {
    setAccounts(2)
    postMock.mockRejectedValueOnce(axiosError(402))
    postMock.mockResolvedValueOnce(okResponse('from account 2'))
    expect(await new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }])).toBe('from account 2')
    expect(postMock).toHaveBeenCalledTimes(2)
    expect(postMock.mock.calls[1][2].headers.Authorization).toBe('Bearer key-2')
  })

  it('does not retry a non-retryable error (400) — fails fast without trying account 2', async () => {
    setAccounts(2)
    postMock.mockRejectedValueOnce(axiosError(400))
    await expect(new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }])).rejects.toBeTruthy()
    expect(postMock).toHaveBeenCalledTimes(1)
  })

  it('throws the last error when every account fails', async () => {
    setAccounts(3)
    postMock.mockRejectedValueOnce(axiosError(402)).mockRejectedValueOnce(axiosError(503)).mockRejectedValueOnce(axiosError(429))
    await expect(new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ message: 'status 429' })
    expect(postMock).toHaveBeenCalledTimes(3)
  })

  it('retries on a network error with no response at all', async () => {
    setAccounts(2)
    postMock.mockRejectedValueOnce(axiosError(undefined)).mockResolvedValueOnce(okResponse('ok2'))
    expect(await new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }])).toBe('ok2')
  })

  it('a cooling-down account is tried after healthy ones, not skipped entirely', async () => {
    setAccounts(2)
    // First call: primary fails (enters cooldown), secondary answers.
    postMock.mockRejectedValueOnce(axiosError(402)).mockResolvedValueOnce(okResponse('a'))
    await new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }])
    // Second call: secondary is tried first now; when it fails, primary is still tried.
    postMock.mockRejectedValueOnce(axiosError(503)).mockResolvedValueOnce(okResponse('b'))
    expect(await new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }])).toBe('b')
    expect(postMock.mock.calls[2][2].headers.Authorization).toBe('Bearer key-2')
    expect(postMock.mock.calls[3][2].headers.Authorization).toBe('Bearer key-primary')
  })

  it('records a failed usage log row per failed attempt, tagged with the account that failed', async () => {
    setAccounts(2)
    postMock.mockRejectedValueOnce(axiosError(402)).mockResolvedValueOnce(okResponse())
    await new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }], { context: CTX })
    expect(createUsageLogMock).toHaveBeenCalledTimes(2)
    expect(createUsageLogMock.mock.calls[0][0]).toMatchObject({ success: false, errorCode: 'HTTP_402', account: `primary-${uniqueSuffix}` })
    expect(createUsageLogMock.mock.calls[1][0]).toMatchObject({ success: true, account: `secondary-${uniqueSuffix}`, inputTokens: 10, outputTokens: 5 })
  })

  describe('truncated responses (finish_reason = length)', () => {
    it('chat() throws TruncatedResponseError instead of returning the cut-off content', async () => {
      setAccounts(1)
      postMock.mockResolvedValueOnce(truncatedResponse())
      await expect(new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(TruncatedResponseError)
    })

    it('does not fall back to another account — a truncation is not an account-level problem', async () => {
      setAccounts(2)
      postMock.mockResolvedValueOnce(truncatedResponse())
      await expect(new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }])).rejects.toBeTruthy()
      expect(postMock).toHaveBeenCalledTimes(1)
    })

    it('chatJSON does not attempt its JSON-repair retry on a truncated response', async () => {
      setAccounts(1)
      postMock.mockResolvedValueOnce(truncatedResponse())
      await expect(new DeepSeekProvider().chatJSON([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(TruncatedResponseError)
      expect(postMock).toHaveBeenCalledTimes(1)
    })

    it('writes exactly one usage log row, errorCode TRUNCATED, with the real token counts', async () => {
      setAccounts(1)
      postMock.mockResolvedValueOnce(truncatedResponse())
      await expect(new DeepSeekProvider().chat([{ role: 'user', content: 'hi' }], { context: CTX })).rejects.toBeInstanceOf(TruncatedResponseError)
      expect(createUsageLogMock).toHaveBeenCalledTimes(1)
      expect(createUsageLogMock.mock.calls[0][0]).toMatchObject({ success: false, errorCode: 'TRUNCATED', inputTokens: 10, outputTokens: 8192 })
    })
  })

  describe('chatJSON', () => {
    it('asks once more, with the bad answer appended, when the model wrote malformed-but-complete JSON', async () => {
      setAccounts(1)
      postMock.mockResolvedValueOnce(okResponse('{"a":,}')).mockResolvedValueOnce(okResponse('{"a":1}'))
      expect(await new DeepSeekProvider().chatJSON([{ role: 'user', content: 'hi' }], 'план')).toEqual({ a: 1 })
      expect(postMock).toHaveBeenCalledTimes(2)
      const retryMessages = postMock.mock.calls[1][1].messages
      expect(retryMessages.at(-2)).toEqual({ role: 'assistant', content: '{"a":,}' })
      expect(retryMessages.at(-1).content).toContain('план')
    })

    it('requests strict JSON mode on both the first and the retry call', async () => {
      setAccounts(1)
      postMock.mockResolvedValueOnce(okResponse('nope')).mockResolvedValueOnce(okResponse('{"ok":true}'))
      await new DeepSeekProvider().chatJSON([{ role: 'user', content: 'hi' }])
      expect(postMock.mock.calls[0][1].response_format).toEqual({ type: 'json_object' })
      expect(postMock.mock.calls[1][1].response_format).toEqual({ type: 'json_object' })
    })
  })
})

// The cached share of the input is priced at the hit rate (pricing.ts). It
// reaches usage_log only if the adapter reads `prompt_cache_hit_tokens` —
// it did not until 2026-09-22, and a long brief (the prompt's prefix in
// every expansion call) was billed roughly threefold.
describe('DeepSeekProvider — cache-hit accounting', () => {
  const ENV = 'DEEPSEEK_API_KEY'
  let saved: string | undefined
  beforeEach(() => { saved = process.env[ENV]; process.env[ENV] = 'key-cache'; postMock.mockReset(); createUsageLogMock.mockClear() })
  afterEach(() => { if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved })

  const row = () => createUsageLogMock.mock.calls.at(-1)![0]
  const respond = (usage: Record<string, number>) =>
    postMock.mockResolvedValueOnce({ data: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage } })

  it('passes prompt_cache_hit_tokens into the cost', async () => {
    respond({ prompt_tokens: 12_000, completion_tokens: 10, prompt_cache_hit_tokens: 11_800 })
    await new DeepSeekProvider().chat([{ role: 'user', content: 'x' }], { context: CTX })
    expect(row().inputTokens).toBe(12_000)
    expect(row().costUsd).toBeLessThan(calculateDeepSeekCost(12_000, 10) / 3)
  })

  it('a response without the field is priced as a full miss — an older build, not free tokens', async () => {
    respond({ prompt_tokens: 1_000, completion_tokens: 10 })
    await new DeepSeekProvider().chat([{ role: 'user', content: 'x' }], { context: CTX })
    expect(row().costUsd).toBeCloseTo(calculateDeepSeekCost(1_000, 10), 9)
  })
})
