// Provider-agnostic LLM abstraction (CLAUDE.md §2 registry.ts). Callers use
// registry.ts's chat/chatJSON; providers implement this contract.

export type ProviderName = 'deepseek' | 'yandex' | 'qwen'

export interface ChatMessage {
  role:    'system' | 'user' | 'assistant'
  content: string
}

// What the call is for — the first dimension of usage_log. Talk generation
// is two features, not one, because the outline and the expansion have very
// different token profiles and the spend question is asked per pass.
// `draft_chat` is one turn with the editor (services/drafts.ts) — also the
// row the per-day message quota counts (lib/planTier.ts).
export type Feature = 'talk_outline' | 'talk_expand' | 'slide_edit' | 'theme_generate' | 'image_generate' | 'draft_chat' | 'rehearsal_review'

export interface CallContext {
  // Both optional: an offline eval run has no user, and usage_log's columns
  // are nullable for exactly that row. (Found the first time the eval ran —
  // a placeholder 'eval' id failed the UUID cast and every row was lost.)
  userId?:     string
  workspaceId?: string
  feature:     Feature
  // A sub-dimension within a feature (e.g. language 'ru' | 'en'). Flows
  // straight through to usage_log.variant.
  variant?:    string
}

export interface ChatOptions {
  jsonMode?:    boolean       // request strict JSON output where the provider supports it
  context?:     CallContext
  temperature?: number
  maxTokens?:   number
  // Force a specific provider, bypassing workspace preference. The eval
  // harness uses it to compare providers on the same corpus.
  providerOverride?: ProviderName
}

export interface ProviderCapabilities {
  // Strict JSON response_format with guaranteed valid JSON. Providers
  // without it fall back to an instruction-level «respond only with JSON»
  // and the parse-and-retry loop in modelJson.ts's resolveModelJSON.
  strictJsonMode:  boolean
  // Upper bound on generated tokens in any single call. Token budgets in
  // the generator are capped at this (CLAUDE.md §3.3).
  maxOutputTokens: number
}

export interface LLMProvider {
  name:         ProviderName
  capabilities: ProviderCapabilities

  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>

  chatJSON<T>(messages: ChatMessage[], retryLabel?: string, opts?: ChatOptions): Promise<T>
}
