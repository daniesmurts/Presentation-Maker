// Test setup — load .env so import-time env checks pass. Unit tests never
// open a DB connection; the values just need to exist.
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(__dirname, '../.env') })

// Belt-and-braces defaults for CI or fresh checkouts that don't carry .env yet.
process.env.DATABASE_URL     ??= 'postgresql://test:test@localhost:5432/test'
process.env.JWT_SECRET       ??= 'test-secret-for-vitest-only-not-used-in-real-code'
process.env.DEEPSEEK_API_KEY ??= 'test-key'
process.env.FRONTEND_URL     ??= 'http://localhost:5174'
