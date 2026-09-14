import { hostname } from 'node:os'
import { randomBytes } from 'node:crypto'
import { tryAcquireSchedulerLease } from '../db/queries/schedulerLeases'
import { logger } from '../lib/logger'

// Cluster-safe recurring jobs (CLAUDE.md §3.12; migration 004 for the model).

/** Opaque per-process identity. Diagnostic only. */
export const INSTANCE_ID = `${hostname()}:${process.pid}:${randomBytes(3).toString('hex')}`

/**
 * Run `fn` iff this instance wins the lease for `jobName`. Fail-open on
 * lease errors: a scheduler must never take the process down, and the next
 * tick retries anyway.
 */
export async function runWithLease(jobName: string, leaseMs: number, fn: () => Promise<void>): Promise<boolean> {
  let acquired: boolean
  try {
    acquired = await tryAcquireSchedulerLease(jobName, INSTANCE_ID, leaseMs)
  } catch (err) {
    logger.warn({ message: 'Scheduler lease acquisition failed — skipping tick', jobName, error: (err as Error).message })
    return false
  }
  if (!acquired) return false
  try {
    await fn()
  } catch (err) {
    // The lease is intentionally NOT expired here: a job that throws every
    // run would otherwise be retried by another instance immediately — one
    // broken job becoming a hot loop across the cluster.
    logger.warn({ message: 'Scheduled job failed', jobName, error: (err as Error).message })
  }
  return true
}

export interface LeaseScheduleOptions {
  intervalMs:       number
  /** MUST be shorter than intervalMs or ticks get skipped; long enough to
   *  outlast a slow run. Defaults to 80% of the interval. */
  leaseMs?:         number
  /** An extra early tick this many ms after boot. */
  firstRunDelayMs?: number
}

export function scheduleWithLease(jobName: string, opts: LeaseScheduleOptions, fn: () => Promise<void>): void {
  const { intervalMs, leaseMs = Math.floor(intervalMs * 0.8), firstRunDelayMs } = opts
  if (leaseMs >= intervalMs) {
    logger.warn({ message: 'Scheduler lease is not shorter than its interval — some ticks will be skipped', jobName, intervalMs, leaseMs })
  }
  const tick = () => { void runWithLease(jobName, leaseMs, fn) }
  if (firstRunDelayMs != null) setTimeout(tick, firstRunDelayMs).unref()
  setInterval(tick, intervalMs).unref()
}
