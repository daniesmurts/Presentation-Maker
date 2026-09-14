# Changelog

Engineering log — what changed and, above all, *why*. Dated sections are
dated by when they reached production. Format: `docs/WORKFLOW.md` §2.

## [Unreleased]

### Added
- **Правка одного слайда: изменить, переписать, переставить, удалить,
  добавить.** TODO A Phase 4. Five routes under `/api/talks/:id/slides`,
  each replacing the JSONB array and returning the whole talk; a per-type
  editor form; icon actions on every card; «Добавить слайд ниже» between
  cards. One bad slide no longer means regenerating forty (CLAUDE.md §2).
  - **Rewrite reuses the whole-deck expansion prompt with a batch of one**
    (parent's `regenerateSlide`): the slide's own current text is its brief,
    so «перепиши короче» stays about this slide instead of drifting; the
    talk's strict mode and notes setting apply. Seen live: asked a blank
    slide for «три причины… с числами» on a strict-to-brief talk — it was
    filled from the brief, no numbers invented.
  - **Move is splice-out-then-splice-in, not a swap** (`applySlideMove`),
    and the client's `lib/slideSelection.ts` remaps a selection through
    exactly those semantics — written before selection has a UI (§8 step
    2), because it is the same index arithmetic the editor needs. The bug
    it exists for, in its test: tick 3 and 7, delete 5, get 3 and 6 — not 3
    and 8.
  - **Undo last rewrite** is the previous slide held in memory by index,
    cleared by the next structural edit (§5: no version history).
  - **Verified in the browser** on the live talk: move 2→3, insert after
    1, rewrite the blank (live call, ~8 s), undo (toast, chip gone), delete,
    edit a formula caption and save — the database row matched the screen
    after every step (6 slides, moved order, new caption). Actions are 32px
    labelled chips. `tsc` clean; backend 154, frontend 17 tests.
  - Not verified: the confirm dialog on delete (auto-accepted in the
    harness); Enter-to-submit in the rewrite box (the harness's Return key
    does not fire keydown — clicking works, same as on the login form).
- **Скачивание .pptx.** TODO A Phase 3. `GET /api/talks/:id/export.pptx`
  and a «Скачать .pptx» button — the product (CLAUDE.md §2).
  - **Ported from the parent's `presentationExport.ts` with its incident
    fixes**: the pptxgenjs 4.0.1 dangling-`slideMasterN` Override that
    PowerPoint flags as corruption is stripped from the written zip; every
    computed height goes through `clampH` because a formula-dense slide once
    produced a negative extent (`cy="-3966630"`) and a deck that would not
    open; formulas render MathJax → resvg → PNG with a Unicode fallback;
    images are contain-fitted from their bytes (`lib/imageSize.ts`) because
    pptxgenjs stretches to the frame regardless of `sizing`.
  - **Theme is data** (`services/themes.ts`, CLAUDE.md §5.1): palette,
    fonts, margin, title style. The exporter takes a `Theme` and never
    names a colour; no module state carries between exports (the parent
    held branding in module state). Two themes ship — light «Тезариум» and
    dark — and a test proves the same slides under both yield different
    colours with the same shape count. Ratios recorded per theme in the
    file; the projector floor is a different medium from the web app, but
    the numbers are measured all the same.
  - **`cta` slide layout** added (the ask in the display face, reasons under
    a short rule, contact line in the accent). Every other layout is the
    parent's, with `lecturer` → `presenter`.
  - **Partial download and the usage event** (CLAUDE.md §3.9): `?slides=2,3,5`
    parsed into deck order, malformed input refused rather than guessed;
    every export writes a `talk_events` row with `{ slides, of, theme }` —
    migration 005. `lib/slideSelection.ts` (server side) is the index
    arithmetic Phase 4's editor will remap through.
  - **Pricing gate stub** `lib/planTier.ts` on the download route —
    allow-all for both tiers until billing exists; a WHERE waiting for a
    value, not a migration waiting to happen (§10).
  - **Verified against the real file and an independent parser** (§3.10):
    exported the live six-slide talk (146 KB), read it back with the
    PARENT's `pptxImport.ts` — six slides in order, every title, notes on
    all six (301–563 chars), one picture on the formula slide (the rendered
    PNG). The two-slide partial read back as two. Cyrillic file name via
    RFC 5987 `filename*`; `?slides=99` → «Неверный список слайдов».
    `tsc` clean; backend 144 tests, frontend 10.
  - Not verified: opening in PowerPoint/Keynote by a human (file handed
    over); a slide with a real web image (none exist before TODO B — the
    placeholder path is what ran).
  - One assertion I wrote wrong: I expected a notes part only for slides
    with notes; pptxgenjs emits one for every slide. The test now checks
    content, not count.
- **Веб-приложение: форма, план, просмотр.** TODO A Phase 2. Vite + React
  18 + Tailwind + TanStack Query; pages for sign-in/up, the talk list, the
  new-talk form, the job page (polling, the outline editor at the gate, the
  failure card) and the viewer. All user-facing strings in one `copy.ts`
  with the three nouns and a three-form plural helper.
  - **A new palette, every text pair measured** (CLAUDE.md §3.8). Accent
    teal `#0F6E6E`: 6.04:1 on white in both directions, 5.57 on the page
    ground, 5.21 on accent-light — the pair that fails last. Hover
    `#0B5454` darkens to 8.71. ink-secondary `#57635F` 6.26 on white, 5.59
    on the notes ground. ink-tertiary 3.03 — graphics only. Numbers are in
    `index.css` next to the tokens.
  - **Verified in the browser at 1280×800 and 375×812**, measured from the
    DOM: first slide top 142px, bottom 344px of 800 (above the fold); the
    scrolling element is `HTML` and the header stays at top 0 at scrollY
    1135 — sticky is not captured by a wrapper (CLAUDE.md §6); no
    horizontal overflow on a phone. Full flow driven live: form → plan in
    ~8 s → moved one slide, inserted one, confirmed → six-slide talk with
    notes; KaTeX rendered the formula slide with zero error spans; a failed
    job shows the stored copy and a way back.
  - **Three bugs the browser check found that the unit tests could not.**
    (1) The job poll stopped the moment the tab was hidden — TanStack
    pauses `refetchInterval` in a background tab, and refetch-on-focus was
    off, so a user who switched away would come back to a spinner:
    `refetchIntervalInBackground` is on for the job query. (2) After
    confirming the outline the page never polled again: the cached job
    still said `outline_ready`, so the interval function returned false —
    the confirm response now replaces the cached job. (3) On a phone the
    header CTA wrapped to two lines and pushed sign-out off-screen, and the
    talk title truncated to «Контроль кач…»: icon-only buttons under `sm`
    and a two-line clamp.
  - **Fonts are the system stack for now.** The parent self-hosted DM Sans
    + Playfair after Google Fonts proved unreliable on Russian ISPs; this
    product wants its own pairing, and choosing it is a design decision to
    make with a brand kit (TODO E), not a default to inherit.
  - Not verified: a genuine network failure on the job page (the harness
    keeps the tab hidden, where TanStack pauses retries) — the component
    path is exercised via a failed row instead; Enter-to-submit on the
    login form (clicking works; the harness's Return key did not fire
    submit and it is unclear which side that is).
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
