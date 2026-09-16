import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { config } from './lib/config'
import { logger } from './lib/logger'
import { pool } from './db/connection'
import { AppError } from './errors/AppError'
import { getBuildVersion } from './lib/version'
import { authRouter } from './routes/auth'
import { talksRouter } from './routes/talks'
import { draftsRouter } from './routes/drafts'
import { brandRouter } from './routes/brand'
import { sharedRouter } from './routes/shared'
import { shareCardRouter } from './routes/shareCard'
import { supportRouter } from './routes/support'
import { referralsRouter } from './routes/referrals'
import { billingRouter, billingWebhookRouter } from './routes/billing'
import { startBillingJobs } from './services/billing'
import { startJobQueue, stopJobQueue } from './services/jobQueue'
import { registerTalkJobWorker, startTalkOutlineSweeper } from './services/talkJobWorker'
import { registerBeforeCall } from './services/llm/registry'
import { checkSpendCap } from './services/spendCap'
import { checkGlobalSpendCap } from './services/globalSpendCap'
import { adminRouter } from './routes/admin'
import { syncAdminRole } from './db/queries/users'

// Spend caps run before every model call, whichever route or job made it
// (CLAUDE.md §2: the cap and the fallback are what keep a bad hour from
// becoming a bad bill). Registered here, not imported by the registry.
registerBeforeCall(async (ctx) => {
  await checkGlobalSpendCap()
  if (ctx?.workspaceId) await checkSpendCap(ctx.workspaceId)
})

const app = express()

// Behind Caddy in every deployment — trust its X-Forwarded-For so req.ip is
// the real client, not the proxy. One hop: Caddy is the only thing in front
// (deploy/Caddyfile). Without this, every request looks like it came from
// Caddy's own address — the rate limiters key on it, and so does the
// referral fraud check's same-IP signal (services/referrals.ts), which
// would otherwise flag every single referral pair.
app.set('trust proxy', 1)

app.use(helmet())
app.use(cors({ origin: config.frontendUrl, credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '2mb' }))

// Health: process up AND the database answering. A deploy's per-replica
// check (CLAUDE.md §9) reads this — a 200 from a process that cannot reach
// Postgres would pass a broken replica.
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true, version: getBuildVersion() })
  } catch (err) {
    logger.error({ message: 'Health check: database unreachable', error: (err as Error).message })
    res.status(503).json({ ok: false })
  }
})

app.use('/api/auth',  authRouter)
app.use('/api/talks', talksRouter)
app.use('/api/drafts', draftsRouter)
app.use('/api/brand', brandRouter)
app.use('/api/shared', sharedRouter)
// Not under /api — deploy/Caddyfile proxies /s/:token here verbatim, but
// only for known bot user-agents; a human hitting /s/:token still gets
// the SPA. Same path, same rate limiter, deliberately no cross-import
// with sharedRouter (this one hands out HTML, that one JSON).
app.use('/s', shareCardRouter)
app.use('/api/support', supportRouter)
app.use('/api/referrals', referralsRouter)
app.use('/api/admin',   adminRouter)
// The webhook router first: it must not sit behind the session middleware.
app.use('/api/billing', billingWebhookRouter)
app.use('/api/billing', billingRouter)

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Не найдено' } })
})

// AppError messages are written for users; anything else is a generic line
// and the raw error goes to the log (CLAUDE.md §3.2).
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message, upgrade: err.upgrade ?? false } })
    return
  }
  logger.error({ message: 'Unhandled error', error: err instanceof Error ? err.stack ?? err.message : String(err) })
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Что-то пошло не так. Попробуйте ещё раз.' } })
})

async function main(): Promise<void> {
  // The admin role is env-owned (TODO M): every boot makes the table match.
  const roles = await syncAdminRole(config.adminEmails)
  if (roles.granted || roles.revoked) logger.info({ message: 'Admin role synced', ...roles })

  // The worker runs in the API process for now — one deployable. Split it
  // out when generation load and request load need to scale separately.
  const boss = await startJobQueue()
  await registerTalkJobWorker(boss)
  startTalkOutlineSweeper()
  startBillingJobs()

  if (config.nodeEnv === 'production' && !process.env.UNISENDER_API_KEY) {
    logger.warn({ message: 'UNISENDER_API_KEY not set — verification and password-reset emails will be logged, not sent' })
  }

  const server = app.listen(config.port, () => {
    logger.info({ message: `Tezarium backend listening on :${config.port}`, env: config.nodeEnv, mode: config.deploymentMode })
  })

  const shutdown = async (signal: string) => {
    logger.info({ message: `Shutting down (${signal})` })
    server.close()
    await stopJobQueue().catch(() => null)
    await pool.end().catch(() => null)
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT',  () => void shutdown('SIGINT'))
}

main().catch((err) => {
  logger.error({ message: 'Failed to start', error: (err as Error).stack ?? String(err) })
  process.exit(1)
})
