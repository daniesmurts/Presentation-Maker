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
} as const
