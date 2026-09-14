import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// `{semver} ({date}+{git short SHA})`, e.g. `0.1.0 (2026-09-14+7bc2a1d)`.
// Baked into the image at CI build time (backend/Dockerfile) and reported by
// /health, so the deploy's version assertion can ask the one question that
// matters: is the thing serving traffic the thing we just shipped? (The
// parent once ran the frontend four commits ahead of both API replicas with
// every health check green.) Absent in dev → 'dev'.
//
// process.cwd() rather than __dirname: both `npm run dev` (tsx) and the
// container CMD run with cwd = backend/, so `../VERSION` is the repo root in
// both — unlike __dirname, which differs between the flat dev source layout
// and tsc's rootDir="../" nested dist output.
let cached: string | null = null

export function getBuildVersion(): string {
  if (cached !== null) return cached
  try {
    cached = readFileSync(join(process.cwd(), '../VERSION'), 'utf8').trim()
  } catch {
    cached = process.env.BUILD_VERSION ?? 'dev'
  }
  return cached
}
