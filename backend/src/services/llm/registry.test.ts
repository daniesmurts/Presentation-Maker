import { describe, it, expect, vi, afterEach } from 'vitest'
import type { LLMProvider } from './types'

// The fallback policy: a non-default provider failure silently retries on
// the default in saas/dedicated; onprem throws instead — that silent
// reroute is the undocumented data path an on-prem security audit exists to
// catch.

const { deepseekChatMock } = vi.hoisted(() => ({ deepseekChatMock: vi.fn() }))

vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./deepseek', () => ({
  DeepSeekProvider: class {
    name = 'deepseek'
    capabilities = { strictJsonMode: true, maxOutputTokens: 8192 }
    chat = deepseekChatMock
    chatJSON = deepseekChatMock
  },
}))

const otherChatMock = vi.fn()
const other: LLMProvider = {
  name: 'yandex',
  capabilities: { strictJsonMode: false, maxOutputTokens: 4096 },
  chat: otherChatMock,
  chatJSON: otherChatMock,
}

async function loadRegistry() {
  vi.resetModules()
  const registry = await import('./registry')
  registry.registerProvider(other)
  return registry
}

describe('registry', () => {
  const originalMode = process.env.DEPLOYMENT_MODE
  const originalDefault = process.env.DEFAULT_LLM_PROVIDER

  afterEach(() => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode
    if (originalDefault === undefined) delete process.env.DEFAULT_LLM_PROVIDER; else process.env.DEFAULT_LLM_PROVIDER = originalDefault
    otherChatMock.mockReset()
    deepseekChatMock.mockReset()
  })

  it('saas: primary provider failure falls back to DeepSeek silently', async () => {
    process.env.DEPLOYMENT_MODE = 'saas'
    process.env.DEFAULT_LLM_PROVIDER = 'yandex'
    otherChatMock.mockRejectedValueOnce(new Error('yandex down'))
    deepseekChatMock.mockResolvedValueOnce('recovered via deepseek')
    const { chat } = await loadRegistry()
    await expect(chat([{ role: 'user', content: 'hi' }])).resolves.toBe('recovered via deepseek')
    expect(deepseekChatMock).toHaveBeenCalledOnce()
  })

  it('onprem: primary provider failure throws instead of falling back', async () => {
    process.env.DEPLOYMENT_MODE = 'onprem'
    process.env.DEFAULT_LLM_PROVIDER = 'yandex'
    otherChatMock.mockRejectedValueOnce(new Error('yandex down'))
    const { chat } = await loadRegistry()
    await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('yandex down')
    expect(deepseekChatMock).not.toHaveBeenCalled()
  })

  it('DeepSeek itself failing throws — there is no ladder below the fallback', async () => {
    process.env.DEPLOYMENT_MODE = 'saas'
    process.env.DEFAULT_LLM_PROVIDER = 'deepseek'
    deepseekChatMock.mockRejectedValueOnce(new Error('deepseek down'))
    const { chat } = await loadRegistry()
    await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('deepseek down')
    expect(deepseekChatMock).toHaveBeenCalledOnce()
  })

  it('an unknown DEFAULT_LLM_PROVIDER falls back to deepseek rather than crashing', async () => {
    process.env.DEFAULT_LLM_PROVIDER = 'gigachat'
    deepseekChatMock.mockResolvedValueOnce('ok')
    const { chat } = await loadRegistry()
    await expect(chat([{ role: 'user', content: 'hi' }])).resolves.toBe('ok')
  })

  it('providerOverride routes there directly, with no fallback', async () => {
    process.env.DEPLOYMENT_MODE = 'saas'
    otherChatMock.mockRejectedValueOnce(new Error('yandex down'))
    const { chat } = await loadRegistry()
    await expect(chat([{ role: 'user', content: 'hi' }], { providerOverride: 'yandex' })).rejects.toThrow('yandex down')
    expect(deepseekChatMock).not.toHaveBeenCalled()
  })

  it('runs every registered before-call hook first, and a throwing hook blocks the call', async () => {
    const { chat, registerBeforeCall } = await loadRegistry()
    registerBeforeCall(async () => { throw new Error('spend cap') })
    await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('spend cap')
    expect(deepseekChatMock).not.toHaveBeenCalled()
  })

  it('a workspace resolver picks the provider per workspace', async () => {
    process.env.DEPLOYMENT_MODE = 'saas'
    const { chat, registerWorkspaceResolver } = await loadRegistry()
    registerWorkspaceResolver(async (id) => (id === 'w-yandex' ? 'yandex' : null))
    otherChatMock.mockResolvedValueOnce('from yandex')
    deepseekChatMock.mockResolvedValueOnce('from deepseek')
    const ctx = { feature: 'talk_outline' as const }
    await expect(chat([{ role: 'user', content: 'hi' }], { context: { ...ctx, workspaceId: 'w-yandex' } })).resolves.toBe('from yandex')
    await expect(chat([{ role: 'user', content: 'hi' }], { context: { ...ctx, workspaceId: 'w-other' } })).resolves.toBe('from deepseek')
  })
})
