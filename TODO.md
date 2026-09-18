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
- **Phase 3 — generated pictures.** 🟢 SHIPPED (2026-09-15, YandexART) —
  see CHANGELOG. Left: Kandinsky (Fusion Brain) as a second provider
  behind the same `generateImage` (key + secret; fusionbrain.ai was not
  reachable from the agent sandbox, so its endpoint shape is unverified);
  SVG/Mermaid schematics through resvg for `diagram` — a drawn schematic,
  not a painted one; search (Yandex Images, same folder + key) for the
  slides that want a real thing rather than an illustration.

### C. Deploy pipeline · Effort: M · when there is a first external user
Parent's `deploy.sh` shape (§9): CI gate on exact commit → image guard →
frontend upload → migrate → rolling restart → health + version per replica →
served bundle checked. Hosting decision (§10) made then, not now.

### D. Import `.pptx` · Effort: M · 🟢 SHIPPED (2026-09-14)
§8 step 4, "the adoption lever". Ported with its hand-built fixtures and
verified on two real decks; pictures via B. Follow-ups:
- **Write missing notes for an imported deck** (the parent's
  `writeMissingNotes`): «загрузите свою презентацию — и получите текст
  докладчика» is the import pitch, and today only half of it is true.
  Batches of 5, queued like expansion. Effort S — the prompt exists.
- Slide types are all `bullets` after import (the source has no type
  information and a wrong guess is worse than plain). A per-slide «сделать
  сравнением / формулой» retype would be the cheap upgrade.

### E. Brand kit + themes · Effort: L · 🟢 SHIPPED (2026-09-14)
§5.1–2. Three themes (light, dark, warm) as data; a per-talk picker; a
per-workspace brand kit (accent, logo, name) with measured contrast per
theme and a preview on white and dark. Follow-ups: fonts and palette in
the kit (columns arrive with the UI, expand-only); a logo on every slide
(footer) as an option — today it is the title slide only, by design.

### F. PDF export · partial export · share link · Effort: M · 🟢 SHIPPED (2026-09-14)
§8 step 6. Slides PDF (one 16:9 page per slide, theme + brand, optional
notes pages), selection UI with shift-range remapped through edits, a
read-only share link with notes stripped and token-scoped images.
Follow-ups: a share-link *view count* on `talk_events` (the read side of
§3.9 is not recorded yet); MathJax spaces Cyrillic inside `\text{}` —
cosmetic in both exports, worth a `\mbox` or font-config fix.

### G. Style learning · present mode · deck-level rewrite · Effort: L · 🟢 SHIPPED (2026-09-14)
§8 step 7 — all three. Follow-ups: present mode has no laser/blackout keys
and no touch swipe; the rewrite diff is whole-slide text, not word-level;
style learning picks by type + recency + intent — measure with the eval
harness (`styleExemplars: true` on a workspace with approvals) before
tuning the selector.

### H. Design «Редакция» · Effort: M · 🟢 SHIPPED (2026-09-14)
Tokens, three faces, the rail, editorial library rows, the manuscript
layout, dark theme. Follow-ups: the export themes (`themes.ts`) still carry the
old teal default — decide whether the deck's default theme should follow
the app's pencil blue or stay a deliberately different palette; the
«Посты»/«Реклама» rows become real when the first of them ships, on the
same Тезисы → План → Материал → Экспорт skeleton (`TalkPage` + the gate +
`RewriteReview` are the reusable parts).

### I. Public site · Effort: M · 🚧 IN PROGRESS
`landing/` — Astro, static HTML at the root; the app moves under its own
paths in Caddy (`@app`). Decisions taken 2026-09-14: lean into «ИИ» on the
site only (CLAUDE.md §1); the hero is a scripted replay of a real
generation, never a live call; RU first, EN when the app's copy table is
bilingual; pricing shown as Free / Pro — скоро. Done: skeleton, hero
replay (four steps: тезисы → план → выступление → слайды, the last a
16:9 stage of the same talk in the three themes with a thumbnail strip),
how-it-works, pricing, FAQ with JSON-LD, sitemap/robots, Caddy two-roots
routing, web image. Ship gate (J) lifted 2026-09-14 — the .pptx matches. Legal section
added 2026-09-14 (`/legal/*`): **fill `landing/src/data/operator.ts`
before launch**, have both documents reviewed, file the Roskomnadzor
notification; pricing section updated with the real Pro price 2026-09-15. Existing accounts (pre-consent) have NULL
`terms_accepted_at` — ask them at next sign-in. `/contact` shipped
2026-09-16: a public contact/tech-support form posting to
`POST /api/support/contact`, stored in `support_messages` — no email
notification yet, an operator has to query the table; add one (or an
admin list view) once there is an operator who isn't watching the DB.
Метрика shipped 2026-09-16 (both the site and the app — SPA route changes
fire a manual `hit`, the site's plain snippet needed nothing extra). OG
cards shipped the same day: `/og.png` exists (1200×630) and every landing
page already carried real og:title/description; the actual gap was the
**app** — `frontend/index.html` had no OG tags at all, and shared talk
links (`/s/:token`) are 100% client-rendered, so a link-preview scraper
(Telegram, WhatsApp, iMessage, Slack — none execute JS) saw nothing. Fixed
with a bot-only route: `deploy/Caddyfile`'s `@sharebot` matcher sends known
crawler user-agents on `/s/*` to `routes/shareCard.ts` (mounted at `/s`,
separate from the JSON `sharedRouter` at `/api/shared`), which renders real
HTML with the talk's actual title, slide count, and first slide's picture
(via the same token-scoped, unauthenticated media proxy shared.ts already
exposes) — everyone else still gets the ordinary SPA. `index.html` also
got a static site-wide fallback card for every other app URL.
Next: `/examples/<intent>/<audience>` from real generated talks (three by
hand first); blog scaffold; Webmaster verification; the 404 page.

### J. Themes v2 — the deck looks like the landing · Effort: L · 🟢 SHIPPED (2026-09-14)
`shared/slideGeometry.ts` is the one source; pptx, PDF, the stage and
the site's deck agree; verified in PowerPoint. The ship gate on I is
lifted. Follow-ups: `Deck.astro` carries a copy of the numbers (the site
is its own workspace) — a build step that generates its CSS from the
shared file would remove the drift risk; the concept, comparison and
diagram slides got the v2 header/footer but their bodies were not
redesigned with the same care; a fourth theme (a bold, high-contrast
one for pitches) is the next thing a designer would ask for; the brand
logo now sits top-left on the title slide — the "logo on every slide"
option is still open.

### K. Billing — Pro through Т-Банк · Effort: M · 🟢 SHIPPED (2026-09-14, code) · 📋 first live payment
- **Why**: the gate in `lib/planTier.ts` was allow-all «until billing
  exists»; a product with a paid tier and no way to pay is a free product.
- **Shipped**: migration 012, `services/tbank/{token,client}.ts`,
  `services/billing.ts` (checkout · notification · verify · renew ·
  expire · cancel/resume), `/api/billing/*`, the «Тариф» page, the locked
  `.pptx` item, the quota hint's link.
- **Left, in order**:
  1. ✅ 2026-09-15 — test terminal live: declined card → REJECTED,
     success card → CONFIRMED, Pro +1 month, RebillId stored. Found and
     fixed on the way: the Russian Trusted CA missing from the image, and a
     late AUTHORIZED overwriting CONFIRMED (see CHANGELOG). The founder's
     own workspace still carries the regressed row from before the fix —
     `update payments set status='CONFIRMED' where order_id='ws-27195d96-i-mu26zozg-c99c6f' and status='AUTHORIZED'`
     on the VM (the agent is not permitted to write production data).
  2. A renewal on the test terminal: set `plan_expires_at` to tomorrow,
     wait for the 6 h tick (or run `renewDue()` one-off).
  3. ✅ 2026-09-15 — refund tested in the cabinet: webhook → `REFUNDED`;
     a full refund of the current period now drops the tier and stops
     auto-renew (decided by the founder after the test).
  4. ✅ 2026-09-16 — e-mails on subscription start, renewal and failed
     renewal (`lib/emailTemplates.ts`), each restating amount, period,
     how to cancel and the refund rule.
  5. ✅ 2026-09-15 — pricing block on the landing (item I).
  6. **T-Bank's conditions for recurring charges** (their letter,
     2026-09-16) — ✅ code shipped the same day: an unticked consent box
     with the amount and period before payment (stored per payment with
     time and IP, migration 023), a refund/cancellation block with the
     contact form and e-mail, `/legal/subscription`. **Left**: fill
     `landing/src/data/operator.ts` (the legal name/ОГРН/ИНН placeholders
     are highlighted on the page the reviewer will open), deploy, then
     send T-Bank: a screenshot of the checkout block on `/billing`,
     `https://tezarium.ru/legal/subscription`, `https://tezarium.ru/contact`.

### L. Design v3 — backgrounds, rhythm, a theme library · Effort: L · 🟢 L1–L3 SHIPPED (2026-09-15, code) · generated images left
- **Why**: decks are clean but samey. A theme today is `palette + fonts +
  margin` over one composition (J); there are no backgrounds, no decorative
  treatment, no image-led or big-number slides, and the model has no say in
  how a slide *looks*. Users compare us to design-led tools whose decks are
  not "AI-painted" — they are a tight design system, restraint, and a
  content plan placed into it. That is the shape this codebase already has;
  what is missing is the vocabulary.
- **Decided against** (2026-09-15, before any code):
  - *Uploaded `.pptx` templates the platform reflows into.* Masters +
    placeholders don't map onto our slide types, text overflows, and it is
    a second rendering path — the PDF, the stage and the site would stop
    matching the export, which is the one guarantee J bought. A template
    file carries the designer's *output*, not the rules that made it good.
  - *The model emits colours / positions / shapes per slide.* Slides in
    one deck don't cohere (each is an independent sample), contrast is
    unverified (§3.8 — the amber incident forty times per deck), and
    pptxgenjs cannot draw most of it (no CSS, no gradient fills, no
    filters): a pretty preview and a broken export.
- **Decided for**: the theme is the design system as **data**; the model is
  an **art director inside an enum**; generated design is **theme JSON
  that a validator measures** before it is accepted. Three layers, each
  shippable alone, in this order.

**L1 — Theme v3: background recipes + a decoration vocabulary.** Effort M. 🟢 code 2026-09-15
- Shipped: `shared/slideBackground.ts` (six kinds, two roles, premixed
  colours, `worstGround`), `backend/src/services/slideBackground.ts`
  (resvg raster, hashed cache), the recipe on every theme, `fitRecipe` in
  `applyBrand`, two slide layouts in the .pptx, the PDF page, the stage,
  `Deck.astro` importing the shared module, the Яркая theme, tests for
  every pair and for the once-per-role embedding. See CHANGELOG.
- Left from the L1 list: `scale` (the type-scale multiplier) — not needed
  by the four themes, deferred to the first theme that wants it; the
  `image+scrim` kind — belongs with `image-full` in L2; the concept /
  comparison / diagram body redesign — moved to L2 where the new types
  are drawn anyway. Text over a treatment is measured against the
  computed worst ground, not sampled from the raster: the SVG has no
  opacity, so the arithmetic IS the sample.
- `Theme` gains `background: BackgroundRecipe` and `scale: 'display' | 'quiet' | 'bold'`
  (a type-scale multiplier the geometry reads; slide size stays fixed so
  `slideFit` budgets stay true). A recipe is a small SVG parameterised by
  the palette: `solid · wash (2-stop gradient) · grid · dots · band
  (diagonal accent) · blob · image+scrim`. Per-recipe *placement*: which
  slide types get the full treatment (title, section, image-full) and
  which get the quiet one (everything with body text).
- **Rendering**: the same SVG in four places. Stage and site inline it;
  pptx and PDF get it rasterised **SVG → PNG via `@resvg/resvg-js`** —
  the pipeline `formulaRenderer.ts` already vendors — placed full-bleed
  under the slide. This sidesteps pptxgenjs's missing gradient support and
  honours §3.5 (PNG/JPEG only in decks). Render once per (theme, recipe,
  slide-type-class) and cache by hash, not once per slide; 1920×1080 at
  the most. Measure the PNG bytes per deck and record the number — a
  40-slide deck must not become a 40 MB file.
- **Text over a treatment is measured against the *treatment*, not the
  palette ground**: sample the recipe's darkest/lightest region under the
  text box (the same `contrastRatio` helper, run against the sampled
  colour) and apply a scrim (`panel` at the theme's alpha) when it fails.
  Write the measured ratio per theme × recipe into `themes.ts` like every
  other pair.
- The 4th theme — bold, high-contrast, for pitches (open follow-up from J)
  — ships here as the first theme that *needs* a background to look right.
- Redo the concept / comparison / diagram bodies with the same care as the
  v2 header/footer (the open follow-up from J) — L2 will expose them, so
  do it here, not after.

**L2 — the model chooses design from an enum; slide types for rhythm.** Effort M. 🟢 code 2026-09-15
- Shipped: `shared/slideDesign.ts`, the five types in `shared/types.ts`
  and every renderer / editor / normaliser / prompt, `applyOutlineDesign`
  on expand · regenerate · rewrite, `scoreRhythm` in the harness, budgets
  in `slideFit`. See CHANGELOG. Not yet: the outline editor shows the
  type but not the design (edit it on the slide after generation); the
  concept / comparison / diagram bodies were not redesigned here after
  all — they still read fine next to the new types, so that stays a
  follow-up; Cyrillic budgets for the new types are the layouts'
  arithmetic, not yet a measured overflow — watch the first real decks.
- Original plan, for the record:
- `OutlineSlide` and `SlideBase` gain
  `design?: { variant, emphasis, backdrop, image_brief? }` where
  `variant` is per-type (`stats: 'hero-number' | 'three-up' · bullets:
  'plain' | 'split' | 'image-led' · quote: 'large' | 'attributed' …`),
  `emphasis: 'accent' | 'plain'`, `backdrop: 'none' | 'pattern' | 'image'`.
  The model **never emits a colour or a coordinate**. `normaliseOutline` /
  `normaliseEditedSlide` coerce unknown values to the type's default,
  exactly as they coerce `type` (§2). The `regenerateSlide` instruction
  path accepts design words ("make this a big number").
- New slide types (§5.3): `section`, `stats`, `quote`, `image-full`,
  `agenda` — one discriminated type per layout, own `body`, own `slideFit`
  budget, own layout in pptx / PDF / stage / site / handout. `image-full`
  is the first slide where the picture is the layout, not a decoration;
  `stats` is where JetBrains Mono / the theme's `mono` face earns its place.
- Prompt the outline pass with the *rhythm* rule, not with taste: a
  section break every 5–8 slides, at most one `stats` per section, a
  `quote` only when the material contains one, never two `image-full` in a
  row. The eval harness (`talkEvalHarness.ts`) gets a rhythm check so a
  prompt change that makes every slide a hero is caught as a regression.
- Cyrillic budgets (§3.3) for the new types are calibrated before the
  types are enabled in the prompt, not after the first overflow on a
  projector.

**L3 — a curated theme library, then generated themes as validated data.** Effort M. 🚧
- Shipped 2026-09-15: `shared/themes.ts` (twelve themes, `validateTheme`),
  `shared/color.ts`, `scripts/themeGallery.ts`, the landing on the shared
  data; `services/themeGenerator.ts` (description · accent · .pptx),
  `brand_kits.custom_theme`, the brand page's «Своя тема». See CHANGELOG.
- Left: a theme
  gallery page inside the app (the script exists); more than one custom
  theme per workspace (needs a themes table — expand when asked).
- Hand-design 8–12 themes as rows in `themes.ts` (bold pitch · editorial ·
  dark tech · warm consulting · playful · mono minimal · …), each with its
  recipe and measured pairs. The eval harness renders **one fixed talk in
  every theme** to a gallery page (the thumbnail strip already noted under
  I) — that gallery is how a theme is reviewed before it ships and is
  also the landing's «примеры».
- **Generated themes**: from a description («финтех, надёжно, тёмная») or
  from a brand kit, the model emits **theme JSON** against the `Theme`
  schema; `validateTheme()` measures every text-carrying pair against the
  floors (body 4.5, labels 4.5 at ≤ 12 pt bold, graphics 3.0) and either
  auto-corrects (darken toward ink, the `labelColor` fallback generalised)
  or rejects with a reason the user can read (§3.2). The model proposes,
  the contrast code disposes. Brand kit (E) becomes a *derivation* — accent
  in, a full validated palette out — instead of an accent override.
- Uploaded `.pptx` as a **brand source, not a layout source**: run it
  through `pptxImport.ts`, extract theme colours / fonts / the logo from
  the master, seed the generator above. "Make it look like our decks"
  without reflowing into their placeholders.
- Generated *images* belong here and nowhere else: abstract on-`mood`
  backdrops for `image-full` / `section`, SVG schematics for `diagram`
  (the old ИСПУМ backlog item, unblocked by the same resvg path). Every
  one of them lands in `slideImageSource.ts` like every other image (§5.4).

- **Not in L**: per-slide free-form styling, a template marketplace,
  user-editable layouts on a canvas. Each is a product (CLAUDE.md §5).
- **Gate to ship each layer**: the produced `.pptx` re-read by our own
  importer, the PDF pages looked at, and the same talk screenshotted on the
  stage — the four renderers still agree (J's guarantee is the thing L
  must not spend).

### M. Admin panel · plan grants · promo codes · referrals · Effort: L · 🟢 SHIPPED (2026-09-16, code, all five phases)
- **Why**: there are paying users and a support form, and the only way to
  see who they are, what they do, what they cost and whether a payment went
  through is `psql` on the VM — which the agent is not permitted to touch
  and the founder should not need to. Every question of the kind «is it
  working, is it growing, who is stuck» has its answer in tables that
  already exist (`talk_events`, `usage_log`, `payments`, `workspaces`,
  `support_messages`); what is missing is a role that may read them and a
  page that does. The writes — a free month for a friend, a promo code for
  a partner, a deactivated abuser — all touch billing/auth invariants (the
  renew and expire jobs, the spend cap, the 54-ФЗ receipt), so they belong
  in the app next to those services, not in a SQL console or an
  off-the-shelf admin tool writing raw rows. In-app is also the only shape
  that survives on-prem (CLAUDE.md §10).
- **Decisions**:
  - `users.is_admin`, bootstrapped from `ADMIN_EMAILS` (env, comma-separated)
    at boot and at registration — no UI to make an admin, so an admin can
    never be locked out or created by another admin's mistake.
  - `/api/admin/*` behind `authenticate` + `requireAdmin`; `/admin/*` pages
    in the same SPA, same rail (a link that exists only for admins), one
    more line in Caddy's `@app`.
  - Every admin **write** goes through `admin_actions` (admin, action,
    target, before/after JSON, reason) — the audit is what makes «I gave X
    free Pro» defensible. Reads are not logged.
  - Lists and one detail page; no charts until the numbers on the tables
    have been looked at for a month and we know which ones matter.
  - A grant is `plan_tier='pro'` + `plan_expires_at` + `plan_source =
    'granted'` — the expire job drops it like a paid month, the renew job
    skips it (no rebill on a grant), and a later payment turns it back into
    `'paid'`. Not a parallel «overrides» table: two sources of truth for
    the tier is how a user gets charged for a month they were given.
  - Referral reward = a grant with `reason='referral'`; a referral link = a
    promo code generated per user. Both reuse the machinery above, so they
    are phases, not systems.
  - **Referral economics** (decided 2026-09-16, revisit with data): reward on
    the invitee's *first confirmed payment*, never on signup. Double-sided
    and asymmetric — the invitee gets 20% off the first month (the reason
    to use *this* link), the referrer gets one month of Pro (an extension
    for a Pro user, a trial for a free one — the same reward converts
    both). Capped at 12 rewarded referrals per referrer per year; granted
    only after the T-Bank webhook confirms, clawed back on a refund inside
    the period. Fraud gates: same card (`card_last4` + rebill), same signup
    IP within an hour, invitee created within minutes of the referrer, same
    normalised e-mail. No cash payouts (tax and accounting at this size).
    **Shipped in phase 4**: the referrer/referee-are-the-same-workspace
    check and the yearly cap. **Shipped 2026-09-16, before first deploy**
    (migration 020): normalised-e-mail match (`+tag` stripped everywhere,
    dots stripped only for Gmail-family domains) and same-signup-IP within
    `FRAUD_IP_WINDOW_MINUTES` (60) **block** the attach outright — no
    referral row, no discount, silent to the user; the same IP *outside*
    that window **flags** the referral instead of blocking it (a shared
    household or office is not proof of abuse) — `referrals.flagged` /
    `flag_reason`, shown in the admin tab. Same saved card (`tbank_rebill_id`
    or `card_last4` match) **blocks only the reward**, checked at payment
    time since the referee's card is not known any earlier — the referee's
    own discount is not reversed. Required `app.set('trust proxy', 1)` in
    `index.ts` (found while building this: `req.ip` was never configured
    to read Caddy's `X-Forwarded-For`, so every request behind Caddy would
    have looked like it came from the same address — silently breaking
    both this IP check and the existing per-IP rate limiters). Verified
    locally end-to-end: same-IP-fast-follow blocked (no row at all),
    genuinely different IP (via `X-Forwarded-For`) attached clean, same IP
    outside the window attached flagged — all visible correctly in the
    admin referrals tab. **Still open**: per-user rate limiting on how
    many *different* referral codes one IP can redeem in a day (catches a
    farm working through a list of stolen/synthetic e-mails one at a
    time) — add if the flagged-rate in the admin tab ever looks organised
    rather than incidental.
    The alternative on record — 500 ₽ credit per paid referral, stackable,
    applied to the next renewal — is cheaper (20% of a month, not 100%) and
    gives free users a balance to spend on upgrading; switch to it if
    referrals turn into a real channel and the month-per-referral cost
    shows in the admin's «reward cost» number.
- **Phases**:
  1. ✅ 2026-09-16 **Role, overview, workspace list + detail, support inbox**
     (read only). Migration 016 (`is_admin`), `requireAdmin`, `/api/admin`
     overview (users, new 7/30 d, active 7 d, Pro count, spend this month,
     talks and exports this month, new support messages, failed jobs),
     workspaces list (search, tier filter, sort by created/last active/
     spend), workspace detail (users, talks, payments, spend by month, the
     event timeline), support list. Pages `/admin`, `/admin/workspaces`,
     `/admin/workspaces/:id`, `/admin/support`.
  2. ✅ 2026-09-16 **Writes**: migration 017 — `admin_actions` (who, what,
     before/after, reason — required, ≥3 chars); `workspaces.plan_source`
     ('paid' | 'granted' — `listDueForRenewal` skips a grant, a confirmed
     payment resets it to 'paid'); `users.deactivated_at` (`authenticate`
     and `/login` both refuse the session with a new `DeactivatedError`,
     403 `ACCOUNT_DEACTIVATED`; data kept — 152-ФЗ deletion is its own
     flow); `support_messages.answered_at/by`. `services/adminActions.ts`:
     `grantPro` (extends a live paid Pro and keeps it paid — the card
     still renews at the new date; anything else becomes a grant from
     today, capped to 7/14/30/90/365 days), `revokeGrant` (a granted Pro
     only — a paid month is refunded in the T-Bank cabinet, never revoked
     here), `setSpendCap`, `de/reactivateUser` (refuses self and admins),
     `setSupportAnswered`. Admin cannot deactivate an admin or themselves.
     Frontend: a reason field gates every button; the workspace page grew
     an actions block and a journal table; the support inbox got an
     open/all filter and an answered toggle with attribution. Verified
     end-to-end against a local DB and API: grant → revoke → spend cap →
     deactivate → login refused (403) → reactivate → login OK; support
     answered/reopened with the admin's e-mail recorded.
  3. ✅ 2026-09-16 **Promo codes**: migration 018 — `promo_codes` (code,
     kind `percent | fixed | free_months`, value, max_uses, valid_until,
     active) and `promo_redemptions`, one redemption per (code, workspace)
     — the simplest rule that covers every campaign this product runs, DB
     unique constraint backs it against races. `services/promoCodes.ts`:
     `validatePromoCode` (active, not expired, uses left, not already
     redeemed — checked server-side, never trusted from the client) and
     `discountKopecks` (a 1 ₽ floor — no code, however generous, charges
     ₽0 through T-Bank). `percent`/`fixed` flow through
     `startCheckout` → the discounted amount is what T-Bank actually
     charges and what the 54-ФЗ receipt prints; `applyOutcome` records the
     redemption only once the payment is CONFIRMED, so an abandoned
     checkout never burns a use. `free_months` never touches T-Bank — it
     calls `adminActions.planGrant` directly (the identical rule an
     admin's gift uses: extends a live paid Pro and keeps it paid, else
     grants from today with `plan_source='granted'`), so it works even
     with `BILLING_ENABLED=0`. Routes: `GET /api/billing/promo/:code`
     (read-only preview — price after discount, or the free months),
     `POST /api/billing/promo/:code/redeem` (free_months only),
     `POST /api/billing/checkout` takes an optional `promo_code`; admin
     CRUD at `/api/admin/promo-codes` (create, list with redemption
     counts, deactivate — codes are soft-disabled, never deleted, so
     history stays intact). Frontend: a disclosed promo field on the
     tariff page (preview → pay with the discount, or a direct «Активировать»
     for a free-months code) and an admin tab to create and manage codes.
     Verified end-to-end locally: created a 20%-off and a 1-free-month
     code in the admin UI, previewed 2500→2000 ₽ on the tariff page,
     redeemed the free-months code (Pro granted, `plan_source='granted'`,
     no payment row), a second redemption attempt refused, admin list
     showed the activation count, deactivating a code took it out of
     circulation immediately.
  4. ✅ 2026-09-16 **Referrals**: migration 019 — `workspaces.referral_code`
     (unique, generated lazily on first `GET /api/referrals/me`) and
     `referred_by_workspace_id` (set once, at registration, never
     changes); `referrals` (referrer, referee — `UNIQUE`, one row ever —
     status `signed_up → paid → rewarded | capped | clawed_back`, flags).
     A referral code **is** a `promo_codes` row (`owner_workspace_id` set,
     percent, unlimited, no expiry) — the invitee's 20% discount runs
     through the identical `validatePromoCode` / `startCheckout` /
     `promo_redemptions` path a marketing code does (`owner_workspace_id
     IS NULL` keeps referral codes out of the admin campaign list); the
     referrer's 30-day reward is a direct `planGrant` call, the same rule
     an admin's gift uses — on the referee's first **CONFIRMED** `initial`
     payment, decoupled from whether the discount was actually used (a
     referee who paid full price still earns it). Capped at 12 rewards
     per referrer per rolling year (`capped`, not `rewarded`, past the
     cap); a full refund of the rewarding payment claws the grant back
     only if it is still standing (`plan_source='granted'`) — a referrer
     who has since paid for real keeps their subscription untouched.
     `?ref=CODE` on `/register`, kept in `localStorage` so a code from an
     earlier visit survives to a later signup; attaching it never fails
     registration (bad code → silently ignored, logged). Card on the
     tariff page: link, copy, invited · paid · rewarded — reused the
     promo-preview affordance for nothing extra to build. Admin: a
     referrals tab (funnel — invited/paid/rewarded/reward-days-total —
     and the row list with referrer/referee e-mails and status).
     Verified end-to-end locally with two throwaway accounts and a
     hand-signed T-Bank notification (the real terminal is unreachable
     from this environment): signup via `?ref=` attached correctly
     case-insensitively; checkout auto-applied the referrer's 20% code
     with no code typed (`payments.amount_kopecks` = 2000 ₽ of 2500 ₽,
     `promo_code_id` set); the simulated CONFIRMED notification rewarded
     the referrer (`plan_source='granted'`, `referrals.status='rewarded'`,
     `reward_days=30`) and finalised the promo redemption; the admin
     referrals tab showed the funnel and the row; the promo-codes tab
     did not show the referral code.
  5. ✅ 2026-09-16 **Usage and health** — `db/queries/health.ts`, a new
     admin tab «Здоровье»: `talk_jobs` by status, stuck jobs (pending/
     processing untouched 15+ minutes — the worker's own timeout is
     shorter, so this means stuck, not slow) and the last 20 failed with
     their `error_message`; `usage_log` grouped by model + account over
     24 h (calls, error rate, last `error_code`, cost) and by day over 14
     (a `generate_series` join so a quiet day is a zero row, not a gap);
     today's global spend against `GLOBAL_DAILY_SPEND_CAP_USD`
     (`parseDailyCapUsd`, reused from `globalSpendCap.ts` — one rule, not
     two); `talk_events` (`exported` split pptx/pdf, `image_generated`)
     plus `talks` (creation isn't itself an event) pivoted per day over
     14. No `shares`/`present` row — neither is ever recorded as a
     `talk_event` today, so the page reports what actually happens
     instead of a column that would read zero forever; add it when share/
     present events are wired up. Refreshes every 60 s. Verified against
     the real local DB via `curl` and the browser: job-status counts,
     provider stats and the 14-day tables all matched `psql` by hand.
  6. Later, only if asked: read-only «view as user» (audited), a bulk
     announcement, model cost per workspace for pricing decisions.
- **Not in M**: roles beyond admin/user, a second workspace member, refunds
  from the panel (the T-Bank cabinet does it; the webhook records it),
  e-mail of any kind (there is still no sender — K.4).

### N. Drafts — the editor before the form · Effort: M · 🟢 step 1 SHIPPED (2026-09-16, code)

**Why.** The form is fine for someone who knows what they want to say.
Most people who have to present do not, and a blank «Тезисы» field is
where they leave. A conversation that ends in a filled card — and one
click past the form — is the entry point for them.

**Step 1 (shipped)**: `drafts` table, the editor's turn (`services/drafts.ts`),
the card, hand-off into the outline gate, the page, the rail item.

**Step 2 — material into a draft.** Paste is a message; a PDF/DOCX/PPTX
upload should go through the existing upload path and land on the talk as
`sources` with `[N]` markers intact. Touches: `routes/drafts.ts`, the
upload pipeline, `cardToTalkBody` (sources travel with the card).

**Step 3 — the outline in the chat.** The editor proposes the plan
(`normaliseOutline` on its answer); the user argues with it in words
(«объедини 3 и 4, перед призывом — цифры»); hand-off creates the job
directly in `outline_ready`, skipping `planTalk`. This is where talking
beats dragging. Touches: `services/drafts.ts`, `db/queries/talkJobs.ts`
(create in `outline_ready`), the card gains an `outline` field.

**Step 4 — streaming in the registry.** The first surface where latency is
felt per message. `chat` gains a streaming variant; `draftTurn` streams
the reply and parses the card from the tail.

**Step 5 — the same editor for posts and ads** once those material kinds
exist on the rail.

Not planned: a general assistant, cross-draft memory, web search, editing
finished slides from the chat (the talk page owns that), conversations
kept forever (the history is capped; the card is what is kept).

### O. Lead with the speaking · Effort: M · 🟢 O1–O4 SHIPPED (2026-09-18, code)

**Why.** Every feature is on the producing side; what holds people is the
performing side (rehearsal), and it was hidden behind the producing side.

**O1 (shipped)** — the landing demo: speak a minute, see the report and
the plan, register into a draft made from it.

**O2 (shipped)** — the mic in the draft composer; the talks empty state
leads with «Рассказать редактору».

**O3 (shipped)** — N vs N−1 on the report, a table of runs, «как прошло?»
on the talk page. Next on this thread, when there's data: the admin
overview showing delivered-well against rehearsals-before.

**O4 (shipped)** — the briefing card above the slides and the A4 PDF.

**O5 — hero copy without the category word.** Keep «ИИ для презентаций»
in the eyebrow for search; the H1 and lede claim the rehearsal.

### The plan is built. What is next is not more building.
Every item in CLAUDE.md §8 is shipped and deployed. The next TODO entries
should come from users, usage_log and talk_events — not from this file.
L is the exception on record: it came from comparing our decks with
design-led tools, and its first layer is small enough to ship before the
first user data arrives.

### O. Rehearsal mode («Репетиция») · Effort: M · 🟢 SHIPPED (2026-09-16, code)
The speaker view with a microphone; browser-side recognition, server-side
metrics and a batched review; «как вы это сказали» applied to notes with
undo. Picked over «living decks» (templates refilled with new inputs) as
the first of the two 10× bets because it is the positioning made tangible
and a habit (the night before every talk), not a one-off. See CHANGELOG.
Left, in order:
- **Recognition quality is the browser's.** Chrome's Russian model drops
  most «э-э»; filler counts are a floor. If it matters, a server-side
  pass (Yandex SpeechKit) over uploaded audio is the next step — that is
  a consent question and a storage question, not a code one.
- **Per-slide targets assume notes ≈ speaking time.** For decks without
  notes the split is even; a weight on body text length would be fairer.
- **Compare two rehearsals** («стало лучше?»): the rows exist, the diff
  view does not.
- **Mobile**: the rehearse page is the speaker grid — it needs the
  notes-only stack under `lg` that present mode also lacks.
- Second bet, still open: **living decks** — a talk as a template
  (frozen outline + slot list), «новое выступление из этого» with new
  inputs; the wedge into seats.
