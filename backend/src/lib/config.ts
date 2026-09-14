import { logger } from './logger'

/** Required — the app cannot run without these. Missing → crash at startup. */
function required(key: string): string {
  const value = process.env[key]
  if (!value) {
    logger.error({ message: `Missing required environment variable: ${key}` })
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

// One codebase, deployment profiles, never a fork. `saas` is the only mode
// in use; `onprem` exists because on-prem was a real deal in the parent
// product (CLAUDE.md §10) and the one behaviour it changes — no silent
// cross-provider LLM fallback (services/llm/registry.ts) — is a data-path
// promise that has to be in the code before the first such customer, not
// bolted on during their audit.
const DEPLOYMENT_MODES = ['saas', 'dedicated', 'onprem'] as const
export type DeploymentMode = typeof DEPLOYMENT_MODES[number]

function deploymentMode(): DeploymentMode {
  const raw = process.env.DEPLOYMENT_MODE?.trim() || 'saas'
  if (!(DEPLOYMENT_MODES as readonly string[]).includes(raw)) {
    throw new Error(`Invalid DEPLOYMENT_MODE "${raw}" — must be one of: ${DEPLOYMENT_MODES.join(', ')}`)
  }
  return raw as DeploymentMode
}

// Billing is a deployment profile of its own: on when the T-Bank terminal
// credentials are set, off otherwise (local dev, on-prem where the customer
// pays by invoice). Off means the pricing gate in lib/planTier.ts stays
// allow-all and /api/billing answers PLAN_BILLING_OFF — never a crash at
// boot on a box that has no reason to know about a Russian acquirer.
function billing() {
  const enabled = process.env.BILLING_ENABLED === '1'
  if (!enabled) return { enabled: false as const }
  return {
    enabled: true as const,
    tbank: {
      terminalKey: required('TBANK_TERMINAL_KEY'),
      password:    required('TBANK_PASSWORD'),
      // Test terminals run against a different host; production is the default.
      apiUrl:      (process.env.TBANK_API_URL ?? 'https://securepay.tinkoff.ru/v2').replace(/\/+$/, ''),
      // Where T-Bank posts notifications: the API's public origin, not FRONTEND_URL
      // (behind Caddy they are the same host, but the code must not assume it).
      publicUrl:   (process.env.PUBLIC_API_URL ?? required('FRONTEND_URL')).replace(/\/+$/, ''),
      // 54-ФЗ receipt facts are merchant facts, not code constants.
      receipt: {
        taxation: process.env.TBANK_TAXATION ?? 'usn_income',   // osn | usn_income | usn_income_outcome | patent | …
        tax:      process.env.TBANK_VAT      ?? 'none',         // none | vat0 | vat5 | vat7 | vat10 | vat20 | …
      },
    },
  }
}

export const config = {
  nodeEnv:        process.env.NODE_ENV ?? 'development',
  isDev:          process.env.NODE_ENV !== 'production',
  deploymentMode: deploymentMode(),
  port:           Number(process.env.PORT) || 3000,
  frontendUrl:    required('FRONTEND_URL'),
  logLevel:       process.env.LOG_LEVEL ?? 'info',

  db:       { url: required('DATABASE_URL') },
  auth:     { jwtSecret: required('JWT_SECRET') },
  deepseek: { apiKey: required('DEEPSEEK_API_KEY') },
  billing:  billing(),
} as const
