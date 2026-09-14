#!/usr/bin/env node
/**
 * Migration runner — applies pending SQL files from backend/migrations/ in
 * filename order and records each in `migrations`. Reads DATABASE_URL from
 * process.env (npm run migrate loads ../.env via --env-file).
 *
 * Migrations are expand/contract (CLAUDE.md §3.11): never rename or drop in
 * the release that stops using a column. There is no "down" — rollback is
 * repointing to the previous image.
 */
const { Pool } = require('pg')
const fs       = require('fs')
const path     = require('path')

// Exported so a test harness can migrate a fresh test DB with the same code
// path production uses, instead of a second copy drifting apart.
async function migrate(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const pool = new Pool({ connectionString })

  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  const applied = new Set(
    (await pool.query('SELECT filename FROM migrations ORDER BY filename')).rows.map((r) => r.filename),
  )

  const dir   = path.join(__dirname, '../migrations')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  let ran = 0
  for (const file of files) {
    if (applied.has(file)) { console.log(`  ✓ skip    ${file}`); continue }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    // One transaction per file: a half-applied migration is worse than a
    // failed one, because the runner would skip it next time.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    console.log(`  ✓ applied ${file}`)
    ran++
  }

  if (ran === 0) console.log('  All migrations already applied.')
  await pool.end()
}

module.exports = { migrate }

if (require.main === module) {
  migrate().catch((err) => { console.error('Migration failed:', err.message); process.exit(1) })
}
