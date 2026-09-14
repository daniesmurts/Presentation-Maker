# Changelog

Engineering log — what changed and, above all, *why*. Dated sections are
dated by when they reached production. Format: `docs/WORKFLOW.md` §2.

## [Unreleased]

### Added
- **Каркас проекта: миграции, слой модели, health-check.** TODO A Phase 0.
  Monorepo (`backend/`, `shared/`; `frontend/` arrives in Phase 2), CI with
  a typecheck+test job and a job that applies every migration to a fresh
  Postgres and asserts a second run is a no-op. Migrations 001–003:
  `workspaces`, `users`, `talks`, `talk_jobs`, `usage_log` (CLAUDE.md §7).
  - **Ported from the parent with their tests** — `modelJson.ts` verbatim
    (the 2026-09-09 truncation incident lives there), `deepseek.ts` minus
    vision/OCR/Telegram, `promptSanitiser` (+ two Russian patterns),
    `userFacingFailure` with copy rewritten to the three nouns — a test now
    asserts no «конспект / презентация / лекция» leaks through —
    `shared/slideFit.ts`.
  - **Registry is provider-agnostic by registration, not import.** The
    parent's registry imported Yandex and Qwen and stubbed GigaChat; here
    providers call `registerProvider()` and spend caps will use
    `registerBeforeCall()` (A.5), so adding a provider does not touch the
    file. Fallback policy unchanged: silent retry on DeepSeek except under
    `DEPLOYMENT_MODE=onprem`, which fails loud.
  - **`Slide` union gains `cta`** (CLAUDE.md §4) now, while nothing reads it;
    `lecturer` → `presenter` on the title slide. `MIN_SLIDE_COUNT` 5 → 3: a
    five-minute lightning talk is a real case and the parent's floor came
    from lectures. Speaker notes stay a required string (`''` when a talk
    has them off) so no consumer needs a null check — the export decides
    whether to write a notes page.
  - **DeepSeek `thinking` is switched off explicitly on every call** — it
    defaults to on for `deepseek-flash`, and nothing in talk generation
    wants chain-of-thought billed as output tokens. A test pins the request
    body.
  - **Verified**: `tsc` clean; 58 unit tests in 6 files green; migrations
    applied to a local Postgres 16 and re-run as a no-op; server booted,
    `/health` returned `{ok:true}` after a real `SELECT 1`, unknown route
    returned the Russian 404 body.
  - Not verified: no real DeepSeek call has been made yet — the provider is
    exercised only through mocked axios. First live call is Phase 1's job.
- **Проект заведён.** Repo initialised with `CLAUDE.md` (identity, rules,
  build order — carried from the ИСПУМ presentation feature), `docs/WORKFLOW.md`
  (the working method), and the three source-of-truth files seeded empty but
  honest: every capability in `FEATURES.md` is 📋, the backlog in `TODO.md`
  is the phased plan for the spine (item A) and what follows it.
  - Parent implementation lives at `../Teaching-assistant`; "port" in this
    log means copied from there with its tests, education nouns removed.
