# Changelog

Engineering log — what changed and, above all, *why*. Dated sections are
dated by when they reached production. Format: `docs/WORKFLOW.md` §2.

## [Unreleased]

### Added
- **Тезисы → план → слайды: генерация работает через API.** TODO A Phase 1.
  `POST /api/talks/jobs` starts a job; the worker runs the outline pass and
  parks the job at `outline_ready`; `POST /api/talks/jobs/:id/outline`
  takes the user's edited plan and runs the expansion; `GET /api/talks/:id`
  returns the talk with `slides` JSONB. Minimal auth (e-mail + password,
  JWT cookie, one workspace per account) because every talk needs an owner.
  - **Ported from the parent's `presentations.ts`**: the two-pass shape,
    batch 5 / concurrency 3, every normaliser rule (unknown type → bullets,
    first slide forced `title`, last forced `summary`, runaway arrays
    bounded, a comparison with one column demoted, inline image URLs never
    trusted, `[N]` markers validated against sources), the gentler
    user-edited-outline normaliser, the job worker's idempotency guard and
    "fail only on the last attempt" policy, the 24 h stale-outline sweep on
    a scheduler lease (migration 004, CLAUDE.md §3.12). Dropped: RAG, web
    grounding, style exemplars, deep mode, image auto-fill — each a later
    TODO item.
  - **Prompts rewritten for intent × audience, in the talk's language.**
    Russian and English system/user prompts; the intent decides the closing
    (a pitch or persuasion gets a `cta` before the `summary`; teach and
    workshop require a `discussion`). Notes off is enforced twice: the
    prompt says so, and the normaliser blanks `notes` regardless of what
    the model wrote.
  - **Token budgets are per language and measured, not assumed** (CLAUDE.md
    §3.3). First eval run, deepseek-flash, 5-slide batches with notes:
    Russian peaked at 3033 output tokens/batch (~600/slide, budget 700),
    English at 2487 (~500/slide). English had been budgeted at 450/slide on
    the "Cyrillic is 2× per character" rule; the model writes English notes
    *longer*, so per slide it is ~0.8× of Russian and 2487 against a 2850
    ceiling was one verbose batch from a truncation. Raised to 600. The
    40-slide Russian outline used 3118 tokens for 43 slides (~73/slide,
    budget 90) — no truncation across the supported range.
  - **The eval run had lost every one of its usage rows.** The harness
    passed a placeholder `'eval'` as user id; the UUID cast failed and the
    fire-and-forget insert swallowed it. `CallContext` ids are now optional
    (the columns were already nullable) and an eval run logs like any other
    call — which is the run you most want costed. Found by reading the
    table after the first run, not by a test; a test now exists for the
    optional-id path.
  - **Baseline numbers, for the next prompt change to beat** (three fixed
    briefs, `npm run eval:talks`): RU pitch 15 min strict-to-brief → 9/10
    slides, 5 s; EN report 30 min → 20/20 slides, 27 s, notes avg 158
    words, 79% under the 180 floor; RU teach 60 min / 40 slides → 43/40
    slides, 52 s, notes avg 145, 88% under. Bullets share 11–25% (the
    prompt asks for ≤ 33%). Notes run short — recorded in TODO A as the
    next lever, deliberately after a human has read a deck.
  - **Verified live**: registered a user, started a strict-to-brief pitch
    from an 8-line brief, got a 7-slide plan in 8 s, edited it to 8 slides
    (split one, retyped one), confirmed — a second confirm was refused with
    «Этот план уже подтверждён» — and read back an 8-slide talk 6 s later
    with no invented facts and empty notes as requested. Three usage_log
    rows, $0.0016. CSRF header and validation rejections checked by hand.
    `tsc` clean; 111 tests in 10 files.
  - Not verified: pg-boss retry after a mid-job crash (only the guard's
    unit tests); the sweep firing on a real timer.
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
