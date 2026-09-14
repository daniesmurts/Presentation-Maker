import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include:     ['src/**/*.test.ts'],
    // `*.integration.test.ts` also matches `*.test.ts` (suffix match, not an
    // exact-name match) — exclude explicitly. Those tests open a real DB
    // connection and belong to their own config; the parent project once ran
    // them against the dev database by accident because of this.
    exclude:     ['**/node_modules/**', 'src/**/*.integration.test.ts'],
    // Pure-function tests still transitively import modules that read
    // process.env at import time (db/connection.ts throws without
    // DATABASE_URL). Load .env before any test file runs.
    setupFiles:  ['./vitest.setup.ts'],
    globals:     false,
    reporters:   ['default'],
  },
})
