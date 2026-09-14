import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { config } from './lib/config'
import { logger } from './lib/logger'
import { pool } from './db/connection'
import { AppError } from './errors/AppError'

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
    res.json({ ok: true, version: process.env.BUILD_VERSION ?? 'dev' })
  } catch (err) {
    logger.error({ message: 'Health check: database unreachable', error: (err as Error).message })
    res.status(503).json({ ok: false })
  }
})

// Routes mount here (TODO A.1: /api/talks).

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

app.listen(config.port, () => {
  logger.info({ message: `Tezarium backend listening on :${config.port}`, env: config.nodeEnv, mode: config.deploymentMode })
})
