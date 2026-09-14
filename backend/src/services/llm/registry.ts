// The one surface callers use for model calls: chat / chatJSON. Routes to a
// provider and applies the policies that keep a bad hour from becoming a bad
// bill (CLAUDE.md §2 registry.ts):
//
//   1. Provider resolution: an explicit providerOverride (eval harness), else
//      the workspace's preferred provider via a resolver registered by the
//      workspace module (none yet — every call uses the default), else
//      DEFAULT_LLM_PROVIDER, else 'deepseek'.
//   2. Silent fallback: if the chosen provider throws and it isn't already
//      the default, retry once on the default and log a warning.
//   3. onprem denies that fallback and fails loud: a silent cross-provider
//      retry is exactly the undocumented data path an on-prem customer's
//      security audit exists to catch — one cloud-pointed key left in the
//      env and a local inference outage ships their text outside the
//      perimeter.
//   4. Spend caps run here before any call — TODO A.5 wires them in; the
//      hook is `beforeCall` below so the providers never have to know.
//
// Providers register themselves (registerProvider) rather than being
// imported here, so this file does not change when Yandex or Qwen land.

import { config } from '../../lib/config'
import { logger } from '../../lib/logger'
import { DeepSeekProvider } from './deepseek'
import type { CallContext, ChatMessage, ChatOptions, LLMProvider, ProviderName } from './types'

const PROVIDERS = new Map<ProviderName, LLMProvider>()

export function registerProvider(provider: LLMProvider): void {
  PROVIDERS.set(provider.name, provider)
}

registerProvider(new DeepSeekProvider())

const FALLBACK_PROVIDER: ProviderName = 'deepseek'

function defaultProviderName(): ProviderName {
  const env = process.env.DEFAULT_LLM_PROVIDER as ProviderName | undefined
  if (env && PROVIDERS.has(env)) return env
  return FALLBACK_PROVIDER
}

function providerOrThrow(name: ProviderName): LLMProvider {
  const p = PROVIDERS.get(name)
  if (!p) throw new Error(`LLM provider "${name}" is not registered`)
  return p
}

// Per-workspace preferred provider. Registered by the workspace module when
// there is one; until then every call uses the default.
type Resolver = (workspaceId: string) => Promise<ProviderName | null>
let workspaceResolver: Resolver | null = null
export function registerWorkspaceResolver(fn: Resolver | null): void {
  workspaceResolver = fn
}

// Spend-cap / rate hooks run before every call (TODO A.5). Registered, not
// imported, for the same reason providers are.
type BeforeCall = (ctx: CallContext | undefined) => Promise<void>
const beforeCallHooks: BeforeCall[] = []
export function registerBeforeCall(fn: BeforeCall): void {
  beforeCallHooks.push(fn)
}

async function resolveProvider(ctx?: CallContext): Promise<LLMProvider> {
  if (ctx?.workspaceId && workspaceResolver) {
    try {
      const name = await workspaceResolver(ctx.workspaceId)
      if (name && PROVIDERS.has(name)) return PROVIDERS.get(name)!
    } catch (err) {
      logger.warn({ message: 'Workspace provider lookup failed', err: (err as Error).message })
    }
  }
  return providerOrThrow(defaultProviderName())
}

/** Which provider would handle a call for this context — so a caller can
 *  record the *intended* provider without duplicating the routing. */
export async function getActiveProviderName(ctx?: CallContext): Promise<ProviderName> {
  return (await resolveProvider(ctx)).name
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  for (const hook of beforeCallHooks) await hook(opts.context)
  if (opts.providerOverride) return providerOrThrow(opts.providerOverride).chat(messages, opts)
  const primary = await resolveProvider(opts.context)
  try {
    return await primary.chat(messages, opts)
  } catch (err) {
    return fallbackOrThrow(primary, err, () => providerOrThrow(FALLBACK_PROVIDER).chat(messages, opts), 'chat')
  }
}

export async function chatJSON<T>(messages: ChatMessage[], retryLabel = 'response', opts: ChatOptions = {}): Promise<T> {
  for (const hook of beforeCallHooks) await hook(opts.context)
  if (opts.providerOverride) return providerOrThrow(opts.providerOverride).chatJSON<T>(messages, retryLabel, opts)
  const primary = await resolveProvider(opts.context)
  try {
    return await primary.chatJSON<T>(messages, retryLabel, opts)
  } catch (err) {
    return fallbackOrThrow(primary, err, () => providerOrThrow(FALLBACK_PROVIDER).chatJSON<T>(messages, retryLabel, opts), 'chatJSON')
  }
}

async function fallbackOrThrow<T>(primary: LLMProvider, err: unknown, retryFn: () => Promise<T>, surface: string): Promise<T> {
  if (primary.name === FALLBACK_PROVIDER) throw err   // already on the fallback provider
  if (config.deploymentMode === 'onprem') {
    logger.error({
      message: 'LLM provider failed; NOT falling back — onprem denies cross-provider fallback',
      surface, primary: primary.name, error: (err as Error).message,
    })
    throw err
  }
  logger.warn({ message: `LLM provider failed; falling back to ${FALLBACK_PROVIDER}`, surface, primary: primary.name, error: (err as Error).message })
  return retryFn()
}
