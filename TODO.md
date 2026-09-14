# TODO — Tezarium backlog

Ordered by impact-per-effort. Entries are arguments, not tickets: Why first,
then Effort (S ≤ 1 day · M ≈ 2–4 days · L ≈ 1–2 weeks), then Touches. Big
items are phased; each phase ships on its own and is marked 🟢 SHIPPED (date)
in place. See `docs/WORKFLOW.md` §2.

Parent implementation: `../Teaching-assistant` (ИСПУМ). "Port" below means
copy the module, strip education nouns, keep the tests, rename per CLAUDE.md §4.

---

### A. The spine — talking points → outline gate → slides → `.pptx` · Effort: L · 🟢 SHIPPED (2026-09-14, all six phases in one day against the parent's code)

**Why.** CLAUDE.md §8 step 1. Nothing else in the product is testable,
demoable, or sellable until a user can type тезисы, approve a plan, and
download a native `.pptx`. Every later feature (images, import, brand kit,
themes) attaches to the data shapes fixed here — `Slide` union, `slides`
JSONB, idx-numbered `sources`, the pollable job row. Getting those shapes
right first is the entire point of porting instead of rewriting: the parent
spent four months finding out where they were wrong (CLAUDE.md §3 is the list).

**Decisions this entry assumes** (defaults; change before Phase 0 if wrong):
- **Stack: same as parent** — Node 22 + TypeScript + Express + Postgres +
  pg-boss, React 18 + Vite + Tailwind + TanStack Query, `shared/` for types.
  Reason: ~3 000 lines of proven presentation code and ~15 test files port
  almost verbatim; a different stack turns a port into a rewrite.
- **Provider: DeepSeek first**, via the ported registry (it already has a
  strict JSON mode and the `finish_reason === 'length'` check — CLAUDE.md
  §3.1, §10). Yandex/Qwen adapters are ported later, behind the same interface.
- **Auth: minimal** — email + password, JWT cookie, one workspace per user
  created at signup. No SSO, no invites. Workspaces/plan tiers exist as
  columns from day one (§7) so the pricing gate is a `WHERE`, not a migration.
- **Storage: Postgres only until Phase 3 of item B (images).** No object
  storage in the spine — nothing binary is stored yet.
- **Deploy: not in this entry.** Local dev + CI (tests + tsc) only. Deploy
  script is item C.

**Phases**

- **Phase 0 — Skeleton + ported foundations.** Effort S. 🟢 SHIPPED (2026-09-14)
  Monorepo layout (`backend/`, `frontend/`, `shared/`), tsconfig, vitest,
  ESLint, migrations runner, `.env.example`, CI workflow running tests + tsc.
  Port *as-is with tests*: `services/llm/{types,registry,modelJson,deepseek}.ts`,
  `lib/{promptSanitiser,userFacingFailure,logger,config}.ts`,
  `shared/types.ts` (the `Slide` union + `estimateSlideCount` + `MAX_SLIDE_COUNT`),
  `shared/slideFit.ts`. Rename `discussion` → keep; add `cta` to the union
  now (§4) — the union is cheaper to extend before anything reads it.
  Migrations: `workspaces`, `users`, `talks`, `talk_jobs`, `usage_log`.
  Done when: `npm test` green on the ported suites, `tsc` clean, a
  `/health` route answers.

- **Phase 1 — Generate → outline gate → expand, as a job.** Effort M. 🟢 SHIPPED (2026-09-14)
  Port `presentations.ts` (`planPresentation`, `expandPresentation`,
  the three `normalise*` functions, batch 5 / concurrency 3), the
  `presentationJobWorker.ts` + `jobQueue.ts` (pg-boss, terminal failure only on
  the last retry), and the per-language token budgets (§3.3 — Cyrillic ×2,
  8192 ceiling). Strip RAG, course lookup, Yandex search, figures.
  Prompt rewrite: education nouns → intent × audience (§4), notes optional
  per talk (`notes_enabled`, defaulted per intent as in §10).
  Routes: `POST /talks` (creates job) · `GET /talks/:id/job` (poll) ·
  `PUT /talks/:id/outline` (edit + approve → expansion) · `GET /talks/:id`.
  Every error path goes through `userFacingFailure` (§3.2); every user
  string through `sanitiseForPrompt` (§3.4).
  Done when: the eval harness (`presentationEvalHarness.ts`, ported) replays
  three fixed briefs (RU short, RU 40-slide, EN) and the truncation fixture
  (a JSON answer cut mid-string — *not* our own output) produces a
  user-readable "shorten the request", never a parser message.

- **Phase 2 — Viewer + outline editor (frontend).** Effort M. 🟢 SHIPPED (2026-09-14)
  Vite app with the app shell (`min-h-screen`, sticky toolbar audited — §6),
  RU-first strings with the three nouns from CLAUDE.md §1 enforced by a
  single `copy.ts`; pluralisation helper. Pages: new talk form (тезисы,
  intent, audience, length preset / N slides, notes toggle, «только по моим
  материалам») · outline approval (reorder / retype / add / delete; the
  most-used affordance in the parent) · talk viewer (slide cards per type,
  `slideFit` warnings shown *here*, first slide above the fold — measure it)
  · polling with a status line that never shows "failed" mid-retry.
  Done when: a full run works in the browser end-to-end against a local
  backend; contrast of every text pair measured and written next to the class
  (§3.8) — the palette is new, so *nothing* from §6 is assumed.

- **Phase 3 — `.pptx` export, one theme, no images.** Effort M. 🟢 SHIPPED (2026-09-14) — two themes, in fact, to prove the theme-as-data shape
  Port `presentationExport.ts` (pptxgenjs, a layout per slide type, formula
  → PNG via MathJax→resvg), `lib/imageSize.ts` + `containFit` (needed now for
  formula PNGs, later for everything). Restructure so the theme is **data**
  (palette, fonts, spacing) passed in — not because we ship themes now, but
  because §5.1 says it's the first thing asked for and forking the exporter
  later is the expensive path. Pricing gate stub on the download route
  (§10) — a plan-tier check, allow-all in dev. `talk_events` row per export
  with `{ slides, of }` (§3.9) even though partial export doesn't exist yet.
  Done when: the produced file is read back with the parent's `pptxImport.ts`
  (ported into `__fixtures__`-style test use only for now) **and** opened in
  PowerPoint/Keynote by a human; slide count, order, notes and title all match.

- **Phase 4 — Slide-level editing.** Effort M. 🟢 SHIPPED (2026-09-14)
  Port `regenerateSlide` (instruction-driven rewrite of one slide),
  `applySlideMove`, delete, insert, `normaliseEditedSlide`, and
  `lib/slideSelection.ts` on both sides — the index-remap arithmetic even
  though nothing selects yet (§8 step 2 says why: it's the editor's math).
  "Undo last regeneration" = keep the previous slide in memory client-side;
  no version history (§5 "do not add").
  Done when: parent's `presentationSlideEdit.test.ts` passes ported; a
  40-slide talk survives move/delete/insert/regenerate without touching the
  other 39 (assert by JSON equality on untouched indices).

- **Phase 5 — Hardening pass before anyone outside sees it.** Effort S. 🟢 SHIPPED (2026-09-14)
  Spend cap per workspace in the registry; rate limit on `POST /talks`;
  `usage_log` written per LLM call; the full suite + tsc green in CI; the
  four source-of-truth files honest (FEATURES marks 🚧/📋 correctly).

- **Follow-up from the first eval run (2026-09-14) — notes run short.**
  The prompt asks for 180–220 words; the model writes 145–158 on average
  and 79–88% of slides fall under the floor (see CHANGELOG). The parent hit
  the same wall and fixed it with per-batch expansion — which we already
  have — so the next lever is the prompt itself (a worked example of the
  length, or a per-slide word count in the plan). Not urgent: nobody has
  read a deck yet. Do it after Phase 2, when a human can judge whether
  150 words is actually too short for a talk (it was for a lecture).

**Explicitly not in A** (each is its own entry below): images (B), deploy
(C), `.pptx` import (D), brand kit + themes (E), PDF / share link / partial
export (F), style learning / present mode / deck-level rewrite (G).

**Touches:** everything — this is the repo.

---

### B. Images — search + upload + stored media · Effort: L · after A
CLAUDE.md §8 step 3.
- **Phase 1 — upload + stored media + auth proxy.** 🟢 SHIPPED (2026-09-14).
  `objectStorage.ts` (any S3, local-disk fallback), `talk_media`
  (migration 007), `talkMedia.ts`, the `/api/talks/media/:id/image`
  proxy, `slideImageSource.ts` reading storage directly, upload/remove in
  the viewer, exporter placing the picture by intrinsic size.
- **Phase 2 — search.** Needs a provider decision: the parent used Yandex
  Images (`YANDEX_FOLDER_ID` + API key); no credentials exist for this
  project yet. When one does: port `yandexImages.ts`, the picker UI, and
  `autoFillImages` at generation (best-effort, capped at 20 per deck);
  https at ingest AND at render (§3.6) for web results.
- **Phase 3 — generated schematics** (SVG/Mermaid → PNG via resvg, which
  is already installed for formulas). On the parent's backlog, blocked
  on rendering, not on the idea.

### C. Deploy pipeline · Effort: M · when there is a first external user
Parent's `deploy.sh` shape (§9): CI gate on exact commit → image guard →
frontend upload → migrate → rolling restart → health + version per replica →
served bundle checked. Hosting decision (§10) made then, not now.

### D. Import `.pptx` · Effort: M · after B
§8 step 4, "the adoption lever". Port `pptxImport.ts` with its hand-built
fixtures (a real PowerPoint file, not our output — §9). Needs B for pictures.

### E. Brand kit + themes · Effort: L · after D
§5.1–2. Exporter already theme-as-data from A.3; this adds the UI, the
`brand_kits` table, logo placement rules, preview on white and dark.

### F. PDF export · partial export · share link · Effort: M · after E
§8 step 6. Port `presentationHandoutPdf.ts` restyled as slides PDF;
`?slides=` selection is already remapped from A.4.

### G. Style learning · present mode · deck-level rewrite · Effort: L · last
§8 step 7.
