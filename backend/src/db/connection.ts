import { Pool, types } from 'pg'
import { readFileSync } from 'node:fs'
import { logger } from '../lib/logger'

// Managed Postgres (Yandex Managed Service for PostgreSQL among others)
// requires TLS and signs its servers with its own CA, which node-postgres
// will not trust from a `?sslmode=` in the URL alone. DATABASE_SSL_CA is the
// CA file's path; set → TLS with that CA and full verification; unset →
// whatever the URL says (a local dev database, plain). Shared with pg-boss
// (services/jobQueue.ts) so both connections are configured the same way.
export function databaseSsl(): { ca: string; rejectUnauthorized: true } | undefined {
  const path = process.env.DATABASE_SSL_CA
  if (!path) return undefined
  return { ca: readFileSync(path, 'utf8'), rejectUnauthorized: true }
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

// pg returns NUMERIC (OID 1700) as strings to avoid silent float precision
// loss. Every NUMERIC column here (usage_log.cost_usd) is consumed as a JS
// number, so parse once here rather than at every call site.
types.setTypeParser(1700, (value: string) => parseFloat(value))

export const pool = new Pool({
  connectionString:        process.env.DATABASE_URL,
  ssl:                     databaseSsl(),
  max:                     Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis: 5_000,
  // Client-side kill switch. Generation is async (job + poll), so no request
  // handler needs a query longer than this.
  query_timeout:           90_000,
})

pool.on('error', (err) => {
  logger.error({ message: 'Unexpected PostgreSQL pool error', error: err.message })
})
