// Postgres-backed durable job queue — pg-boss on the existing database, no
// new infra. A job is persisted as a row BEFORE the HTTP response is sent;
// a worker crash mid-job means pg-boss's own expiration + retry policy picks
// it up, with a dead-letter queue after retries are exhausted, instead of
// losing it silently (the parent once ran generation fire-and-forget inside
// the Express process, and a restart mid-run orphaned the job forever).
//
// pg-boss manages its own schema (`pgboss`) via internal migrations inside
// start() — no migration file of ours.
//
// v10 pinned: v12 is ESM-only and this backend compiles to CommonJS.
//
// Workers run in every instance independently — pg-boss's SKIP LOCKED
// polling is safe from multiple processes; whichever polls first claims the
// job. The scheduler lease is for cron-style jobs, not for this.

import PgBoss from 'pg-boss'
import { logger } from '../lib/logger'
import { config } from '../lib/config'

let boss: PgBoss | null = null

export async function startJobQueue(): Promise<PgBoss> {
  if (boss) return boss
  const instance = new PgBoss({
    connectionString: config.db.url,
    // Small pool — it polls; it must not eat into DB_POOL_MAX's budget.
    max: 4,
  })
  instance.on('error', (err) => logger.error({ message: 'pg-boss error', error: err.message }))
  await instance.start()
  boss = instance
  logger.info({ message: 'Job queue started' })
  return boss
}

export function getJobQueue(): PgBoss {
  if (!boss) throw new Error('Job queue not started — call startJobQueue() at boot before use')
  return boss
}

export async function stopJobQueue(): Promise<void> {
  if (!boss) return
  await boss.stop({ graceful: true, timeout: 30_000 })
  boss = null
}
