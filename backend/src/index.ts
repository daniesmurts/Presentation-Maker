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
import { brandRouter } from './routes/brand'
import { sharedRouter } from './routes/shared'
import { startJobQueue, stopJobQueue } from './services/jobQueue'
import { registerTalkJobWorker, startTalkOutlineSweeper } from './services/talkJobWorker'
import { registerBeforeCall } from './services/llm/registry'
import { checkSpendCap } from './services/spendCap'
import { checkGlobalSpendCap } from './services/globalSpendCap'

// Spend caps run before every model call, whichever route or job made it
// (CLAUDE.md §2: the cap and the fallback are what keep a bad hour from
// becoming a bad bill). Registered here, not imported by the registry.
registerBeforeCall(async (ctx) => {
  await checkGlobalSpendCap()
  if (ctx?.workspaceId) await checkSpendCap(ctx.workspaceId)
})

const app = express()

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
app.use('/api/brand', brandRouter)
app.use('/api/shared', sharedRouter)

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
  // The worker runs in the API process for now — one deployable. Split it
  // out when generation load and request load need to scale separately.
  const boss = await startJobQueue()
  await registerTalkJobWorker(boss)
  startTalkOutlineSweeper()

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
