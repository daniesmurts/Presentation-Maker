import { pool } from '../connection'

/**
 * Atomically claim `jobName` for `leaseMs`. True iff THIS caller now holds
 * the lease. One statement on purpose: two instances ticking at the same
 * moment both run this INSERT — exactly one wins the primary-key insert,
 * the loser's ON CONFLICT finds `expires_at` in the future and its DO UPDATE
 * … WHERE is skipped, so it gets no RETURNING row. Read-then-write races.
 */
export async function tryAcquireSchedulerLease(jobName: string, holder: string, leaseMs: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO scheduler_leases AS l (job_name, holder, acquired_at, expires_at)
     VALUES ($1, $2, NOW(), NOW() + make_interval(secs => $3))
     ON CONFLICT (job_name) DO UPDATE
        SET holder = EXCLUDED.holder, acquired_at = EXCLUDED.acquired_at, expires_at = EXCLUDED.expires_at
      WHERE l.expires_at <= NOW()
     RETURNING l.job_name`,
    [jobName, holder, leaseMs / 1000],
  )
  return rowCount === 1
}
