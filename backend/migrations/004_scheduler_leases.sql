-- Cluster-safe scheduler singleton (CLAUDE.md §3.12). Every instance keeps
-- its timers; each tick races to claim a short lease on the job name, and
-- only the winner does the work. Replaces the parent's original
-- `NODE_APP_INSTANCE !== '0'` gate, which is set by PM2 and therefore unset
-- in a container — every replica believed it was worker 0 and fired every
-- cron twice.
--
-- A lease per tick rather than start-up leader election: exactly one run
-- per interval for any number of instances, and no failover problem — if
-- the holder dies mid-tick the lease simply expires. The lease is NOT
-- released when the work finishes: holding it to expiry is what enforces
-- "don't run again until the interval is up".

CREATE TABLE IF NOT EXISTS scheduler_leases (
  job_name     TEXT PRIMARY KEY,
  -- host:pid:rand — diagnostic only, never a correctness input
  holder       TEXT        NOT NULL,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);
