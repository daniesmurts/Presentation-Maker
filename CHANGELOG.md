# Changelog

Engineering log — what changed and, above all, *why*. Dated sections are
dated by when they reached production. Format: `docs/WORKFLOW.md` §2.

## [0.1.0] — 2026-09-14

First production deploy: https://tezarium.ru, one Yandex Cloud VM (2 vCPU
50% / 4 GB), Postgres on the VM (compose profile `local-db`), Object
Storage for media, images in Yandex Container Registry, Caddy for TLS.
`0.1.0 (2026-09-14+48c2590)` on both API replicas and the bundle.

### Deploy day
- **Two bugs the first real deploy found.** (1) The CI images job read
  `${{ secrets.REGISTRY_PASSWORD }}` inline in a shell `if`; the value is
  a JSON key full of double quotes, so the test silently failed and every
  run said "not configured" with all four secrets present — secrets now
  go through `env`. (2) `IMAGE_REPO` had a stale registry id ("Registry
  … not found" on push) — fixed by setting the secret to the exact value.
- **SSH from the founding machine is flaky over the home network + VPN**
  (kex closed / SYN timeouts, alternating with VPN on/off; the ИСПУМ host
  showed the same). Off-VPN works. `deploy.sh` lost its step [6/7] to one
  such drop after everything had already succeeded; the checks were
  repeated from the public side. Steps are idempotent, re-running is safe.
- **Yandex specifics recorded**: burstable database classes exist only on
  Broadwell/Cascade Lake (`b2.*`), not Ice Lake; the cluster form
  pre-fills two hosts, doubling the quote; a VM's internal 10.x address
  is not reachable from outside.
- **Verified on production**: migrations 001–007 applied by the one-shot
  container; register → generate (ready in 9 s) → image upload (201 to
  the bucket) → `.pptx` export (200, 70 KB). Certificate issued by Caddy
  on first start.

## [Unreleased]

### Added
- **Design v3, layer 1 — the slide background is data** (TODO L1). A theme
  now names a background recipe (`shared/slideBackground.ts`: `solid ·
  wash · grid · dots · band · blob`, one strength for hero slides — title,
  question, call to action — and a fainter one for content) and there is
  a fourth theme, **Яркая**: deep navy, white type, an amber wedge, for a
  pitch. Why this shape and not the two obvious ones (uploaded `.pptx`
  templates to reflow into; the model emitting colours and shapes per
  slide) is recorded under TODO L — in short, both break the one guarantee
  themes v2 bought, that the .pptx, the PDF, the stage and the site are
  the same drawing.
  - *One drawing, four renderers.* The recipe is ONE SVG. The React stage
    and `Deck.astro` inline it as a CSS background (the site imports the
    shared module at build time, so it no longer carries a copy of the
    drawing, only of the recipe numbers); the .pptx and the PDF rasterise
    it through `@resvg/resvg-js`, the path the formula renderer already
    used — pptxgenjs has no gradient fills, pdfkit no patterns, and §3.5
    wants PNG in decks anyway. Rasters are cached by a hash of the SVG.
  - *Embedded once, not once per slide.* pptxgenjs dedupes media only
    within one slide, so a per-slide `background.data` on 40 slides is 40
    copies. The exporter defines two slide layouts (`TZ_HERO`, `TZ_QUIET`)
    carrying the raster and slides inherit it — a slide must not set its
    own `background` then, or the colour overrides the picture, which is
    why the per-slide `s.background = { color }` lines are gone. Measured
    per deck: grid 74 KB · band 23 KB · wash 127 KB · blob 200 KB. Our own
    importer reads such a deck back with zero pictures (a `<p:bg>` is not
    a `<p:pic>`).
  - *Contrast is measured against the treatment, not the palette* (§3.8).
    Every colour in the SVG is premixed — no opacity except the blob's
    fade to transparent, which stays within the same two colours — so the
    ground under a text box has a name: `worstGround()`. The strengths
    shipped are the ones found by lowering until every pair cleared 4.5:
    the dark blob started at 0.45 (ink2 3.86) and ships at 0.22 (6.56);
    the warm wash at 0.18 put the accent at 4.28, ships at 0.12 (4.64).
    `band` is geometric, not arithmetic: the hero wedge (1300,0 → 1600,0
    → 1600,400) ends above every text zone — a full-height band would have
    run under the footer's «01 / 05», where ink2 on amber fails. All of it
    is in `themes.test.ts`; a brand accent tints the background too, so
    `applyBrand` refits the recipe (`fitRecipe`, 0.02 steps to 0) for the
    new palette.
  - *Seen, not assumed* (§3.10): the eight rasters on a contact sheet
    (which caught the small blob drawing a hard bg-coloured edge over the
    large one — an opaque gradient end, now transparent), the PDF pages
    through pdftoppm, the site's deck in the browser with the bold theme
    selected, the .pptx re-read by `pptxImport.ts`.
- **Pro subscription through Т-Банк — 2 500 ₽ a month** (TODO K). Internet
  acquiring (developer.tbank.ru/eacq): `Init` with `Recurrent=Y` opens the
  hosted form and saves the card; the notification (`POST
  /api/billing/tbank/notify`, answered with a bare `OK`) is the source of
  truth for a paid month; renewals are `Init` + `Charge(RebillId)` from a
  leased job a day before the month ends. Decisions recorded: auto-renew
  (not a manual monthly purchase), receipts on (the terminal has the cloud
  cash register — `Receipt` on every Init with the account's e-mail,
  taxation and VAT from env), free loses `.pptx` only (PDF, share link,
  present mode stay; CLAUDE.md §10). Why the shape:
  - *Signature.* Root-level params + `Password`, sorted by key, values
    concatenated, SHA-256 — `services/tbank/token.ts`, tested against the
    portal's own worked example (`72dd466f…`) so a wrong sort order or a
    nested object leaking into the token fails in CI, not at the bank.
  - *Idempotent webhook.* T-Bank retries hourly for a day and daily for a
    month; the same `CONFIRMED` twice extends the month once (row locked
    `FOR UPDATE`, status compared). A bad token is 403, an unknown order 404
    — both on purpose, so the retry keeps knocking while the bug is fixed.
    A `CONFIRMED` for a different amount is logged and not applied.
  - *The month.* From the later of now and the current expiry, calendar
    month clamped (Jan 31 → Feb 28/29), so an early renewal never eats days.
  - *Expiry is a job, not the webhook.* `plan_tier` drops to free
    `GRACE_DAYS = 3` after the paid month, one attempt a day for the card
    (`MAX_RENEWAL_FAILURES = 3` ≈ the grace), then auto-renew switches off
    and the page says «оплатите заново до …».
  - *Billing is a profile.* `BILLING_ENABLED` unset → the gate stays
    allow-all and `/api/billing` answers `PLAN_BILLING_OFF`; the UI reads
    `user.features.pptxExport`, never the tier name, so a locked `.pptx` is
    a link to the tariff page rather than a `<a download>` that saves a
    403 JSON as a file (that is what a plain link does).
  - Verified locally against the real endpoint with placeholder keys
    (`501 Терминал не найден` mapped to user copy, row `INIT_FAILED`) and
    with hand-signed notification replays (good → `OK`, duplicate →
    `OK`/no second month, tampered amount → 403, unknown order → 404);
    renew and expire jobs run one-off against the dev DB. Not yet run:
    a real payment on a test terminal — needs the merchant cabinet's keys
    and a public `PUBLIC_API_URL` for the webhook.

### Changed
- **Themes v2 — the deck looks like the landing** (TODO J). One geometry
  file, `shared/slideGeometry.ts`, in percent-of-width units (a CSS `cqw`;
  1 = 7.2 pt at 10 in), read by the .pptx exporter, the PDF, the React
  stage and — as a copy, it is a separate workspace — the site's
  `Deck.astro`. The compositions the landing showed: the title low-left
  under a short accent rule with a kicker, the presenter under it, the
  block anchored to the bottom; content titles at 32 pt over a hairline;
  a footer on every slide with the talk's title (the brand name on the
  title slide) and «01 / 05» in mono; the formula in a rounded panel with
  its short form in mono under it; the question slide as a 40 pt italic
  serif with the slide's title as the kicker; the summary as takeaways +
  a «Что дальше» panel; comparison columns under a rule instead of a
  boxed header. The dark theme's title band is gone — one composition,
  three palettes. Faces stay Georgia / Arial / Courier New in the .pptx
  (nothing can be embedded); PT Serif Italic and PT Mono vendored for the
  PDF (google/fonts, OFL).
  - **Verified against the real files** (§3.10): the landing's demo talk
    rendered through both exporters in all three themes, the PDF
    rasterised with pdftoppm, the .pptx exported to PDF by PowerPoint
    itself via AppleScript. Three things only the render showed: (1) the
    PDF's leading was doubled — pdfkit's natural line height for PT is
    already ≈1.3× and a lineGap of 0.35× on top pushed a five-bullet
    summary off the page; the gap is now the difference to the target
    (a point or two), titles take PT's own leading; (2) PowerPoint set
    the demo title in three lines where the estimator said two, and the
    title climbed into the rule — average Cyrillic glyph width is ≈0.55×
    the size, not 0.5; (3) the «Что дальше» panel was sized for one line
    per step — it now estimates lines per step. `slideFit` budgets came
    down ~15% for the larger type; a test asserts the title sits in the
    lower half and every slide carries «NN / NN».
  - **Importer**: a deck's footer, date and slide-number placeholders, and
    any text box parked in the bottom 14% of the slide, are furniture and
    are skipped — importing our own deck read «02 / 03» back as a bullet
    on every slide, and a real PowerPoint deck's footers would have done
    the same. Hand-built fixture with all four shapes.

### Added
- **Public site skeleton and hero** (`landing/`, TODO I). Astro, static
  HTML — the SPA is invisible to Yandex, and the first customers search
  in Yandex. Caddy now has two roots: the site at `/srv/site` with real
  404s, the app at `/srv/app` under an explicit `@app` path list
  (`/talks`, `/jobs`, `/brand`, `/login`, `/register`, `/s/*`, `/assets`,
  `/version.txt`) — a new app route is a new line there. The hero is a
  **scripted replay of a real generation**: the brief typed in, the plan
  rising row by row, then the manuscript with the speaker's text and
  ≈-seconds in the margin — `src/data/demo-talk.json` is the stored output
  of 0.1.0 for exactly that brief, nothing invented, nothing fetched (no
  anonymous API path to abuse). Then a **fourth step — the slides**: the same
  talk as 16:9 slides in the three exporter palettes with a thumbnail
  strip and a theme picker, drawn in container-query units so the stage
  and the thumbnails are one drawing, in the faces a .pptx can carry
  (Georgia/Arial). The founder's point: nobody signs up for plain slides.
  These compositions are deliberately BETTER than what `talkExport.ts`
  draws today, so they are the spec for Themes v2 (TODO J) and the site
  is gated on it — the landing must not show a deck the download does
  not match. Server-rendered at its final state; plays once the step bar
  scrolls into view (a threshold on the 1900 px frame never fired);
  reduced-motion gets plain tabs. Same
  tokens as the app (`tokens.css` is a copy of the app's block — re-copy
  when they move). Copy decision: the site says «ИИ для презентаций»
  because that is the query; the app keeps its rule (CLAUDE.md §1). JSON-LD
  `SoftwareApplication` + `FAQPage`, sitemap, robots (app paths
  disallowed). Pricing is Free / Pro — скоро, no fake checkout. Needs
  `npm install` at the root (new workspace) and a `.dockerignore` so local
  `node_modules` stop riding into the web image.

### Changed
- **Дизайн «Редакция»** — the UI rebuilt on one idea: Tezarium is an
  editor's desk, not a generator. Paper, ink, one blue pencil; the text
  the speaker says sits in the margin beside its slide, like a note on a
  draft. Chosen over the design skill's literal output (Newsreader +
  Roboto + pink, a newsletter pattern): Newsreader has no Cyrillic, pink
  on white is 3.8:1, the pattern is a landing page. What changed:
  - **Tokens** (`index.css`, `tailwind.config.ts`): cool paper `#F5F6F8`,
    ink `#15171C`, pencil `#2F4FD0`; every text pair re-measured and
    written next to its token (accent on accent-light 5.56 is the pair
    that fails last). **A dark theme** for the first time, as the same
    roles, not an inversion (pencil `#8FA3FF`, 7.18 on surface), through
    `prefers-color-scheme` — every colour goes through a token, so it
    cost 20 lines. Radii tightened (4/6/10/14).
  - **Type**: Literata (display, speaker notes — optical sizes, real
    Cyrillic), Golos Text (UI, designed for Cyrillic), JetBrains Mono
    (slide numbers, counters). Google Fonts with `display=swap`;
    fallbacks are the PT faces the PDF exporter vendors.
  - **The solid button is ink**, never the accent: the pencil marks
    (slide type, links, selection), it does not fill. Hover ink →
    ink-hover stays at 12.7:1; accent text → accent-deep rises to 9.1.
    New `quiet` variant and `icon` size; `buttonClass()` for links and
    file-picker labels that act as buttons.
  - **A left rail** (≥ lg) instead of a top bar: «Работы» lists every
    kind of material the desk will make — talks now, «Посты» and
    «Реклама» shown and marked «скоро» with a hint, not hidden (a
    destination that is unavailable is explained). Under lg: a slim
    wordmark strip and a four-item bottom bar; content reserves 96 px so
    the last row is never under it.
  - **The library**: editorial rows, not cards — serif title, one line
    of metadata, state as a dot with a word («Готово», «по ссылке»,
    «Черновик»). The list row gained `notes_enabled`, `approved_at`,
    `shared` (additive; the token itself stays off the list).
  - **The manuscript** (`SlideCard`, `TalkPage`): `display: contents`
    rows in one page grid — slide column · 280 px margin — so the speaker's
    text lines up with its slide on every row and simply follows it on a
    phone. The slide number is the selection control (a real checkbox in
    a 44 px label; checked → pencil-blue with a tick). Type as a pencil
    eyebrow, title in Literata, quiet chip actions under the body, the
    «не влезает» flag at the slide. The margin shows **≈ N сек** — a
    speaking-time estimate (110 words/min RU, 140 EN, rounded to 5 s).
    First slide above the fold: top 192, bottom 559 of 800.
  - Forms: тезисы and the title in the display face (prose reads as
    prose); mono numbers in the outline gate; the rewrite review as a
    pencil-ruled margin block rather than a boxed card.
  - **Gotcha, recorded**: a `tailwind.config.ts` change is not picked up
    by the running Vite dev server — the served CSS still had the old
    `font-display` stack while `npm run build` had the new one. Restart
    Vite after touching the config; the build was previewed on :4174 to
    verify the faces.
  - **Second pass, after the first dark look** («the page loses structure
    when it's dark»): the cause was one ground with 10% hairlines. Fixed
    with the manuscript's own metaphor — content on a *sheet* (`surface`),
    the rail on the paper (`bg`) — a second plane in both themes; dark
    rules raised to 14% / 32%. **Theme switcher** (`lib/theme.ts`,
    `ThemeToggle`): system → light → dark, stamped as `data-theme` on
    `<html>` so an explicit choice beats the OS in both directions, saved
    in localStorage, applied by an inline script before first paint (no
    flash). **The highlighter**, taken from an editorial reference the
    founder sent (Golf le Fleur — hand marks over a poster): a `marker`
    token `#FFE85A` (ink on it 14.5; dark `#E2C94A`, 11.2) that means one
    thing — SELECTED: the slide number turns marker-yellow with a tick.
    Used once more as a flourish, a stroke under «выступлению» in the
    login tagline (`.marker-under`). Page titles a weight heavier (600,
    30 px) for the poster energy; nothing else from the collage — it is a
    streetwear landing page, this is a tool.
  - Not touched: the exported deck themes (`themes.ts`) and the present
    stage keep their own palettes — a deck's look is the user's theme
    choice, not the app's.

### Added
- **Режим показа, переписать всё, обучение стилю.** TODO G — the last item
  of the CLAUDE.md §8 plan.
  - **Present mode** (`/talks/:id/present`): a 16:9 stage from theme data,
    keys and click, fullscreen; `?speaker=1` in a second window shows the
    slide, its notes large, the next slide and a timer, kept in step over a
    `BroadcastChannel` — no server. Two bugs from the browser check: grid
    columns without `min-w-0` let the fixed-width stage squeeze the notes
    into a sliver; a `RefObject`-keyed resize effect never ran because the
    stage mounts after the talk loads (scale stuck at 1 in a 739 px column)
    — a callback ref. Long formulas sized by length so KaTeX cannot
    overflow the stage.
  - **Deck-level rewrite** (§5.7): the per-slide rewrite looped in batches
    under one instruction, as a `rewrite` job that ends in a PROPOSAL
    (migration 010), not a write. `RewriteReview` shows before/after per
    slide as the export text with accept boxes; apply writes only accepted
    positions and hands back the previous array for a one-step undo
    (`PUT /api/talks/:id/slides`). Live: «не больше двух пунктов» → 3/5
    slides proposed, apply 2 → slide 2 went 3 → 2 bullets, undo → 3.
  - **Style learning** (§2 `selectExemplars`): consent per workspace
    (migration 011, off by default), «Готово» per talk; only approved
    talks feed the pool, the talk being written never sees its own
    slides; one exemplar per slide type, same intent first, newest
    approval first, no slide without notes; rendered as «ОБРАЗЕЦ СТИЛЯ, НЕ
    СОДЕРЖАНИЯ». The eval harness sets `styleExemplars: false`. Verified
    on the real pool: consent off → 0 rows; on → 5; own talk excluded;
    the expansion prompt carried the approved bullets and summary slides.
  - **A vitest trap, recorded**: `beforeEach(() => mock.mockReset())`
    returns the mock, and vitest calls a function returned from a hook as
    a cleanup — the mock was invoked with no arguments after the test.
    Braces.
  - **Header rebuilt**: seven controls beside the title crushed it into a
    one-letter column at 1280 px; title row + wrapping toolbar, first slide
    still above the fold (top 194, bottom 466 of 800).
  - `tsc` clean; backend 204, frontend 17 tests.

### Added
- **PDF, выбор слайдов, ссылка для просмотра.** TODO F.
  - **A slides PDF, not a reading document** (CLAUDE.md §5.5):
    `services/talkPdf.ts` lays one 720×405 pt page per slide from the same
    theme and brand data as the .pptx; `?notes=1` adds a notes page after
    each slide. The parent's handout rules carried over: pictures and
    formulas loaded in one parallel round before the synchronous pdfkit
    pass; PNG/JPEG only via `imageSize` (pdfkit throws mid-document on
    anything else); vendored PT Sans/Serif with DejaVu swapped in per
    PARAGRAPH for Greek/arrows/operators (`faceFor`) — pdfkit renders a
    missing glyph as a box and reports nothing. Fonts ship in the image
    (`backend/assets`, OFL licences included).
  - **Partial download UI**: a 44 px checkbox per card, shift-click for a
    range, one download menu (.pptx / PDF / PDF with notes, all or
    selected). The selection is remapped through move/delete/insert with
    `lib/slideSelection.ts` — verified in the browser: 2–5 selected,
    slide 3 deleted → the same three slides stay selected as 2–4.
  - **Share link** (§5.6): `POST /api/talks/:id/share` mints a 32-byte
    token (idempotent; `DELETE` revokes); `GET /api/shared/:token` is
    unauthenticated and rate-limited, returns `SharedTalk` — title,
    language, theme, slides with notes blanked — and rewrites image URLs
    to a token-scoped proxy so a media id alone opens nothing. `/s/:token`
    renders the same cards as the owner's viewer with no controls.
  - **Two bugs found by looking, not by tests.** (1) The brand-kit reset
    left the old name in place — a `COALESCE` upsert cannot express
    "clear"; seen on page 1 of the PDF, fixed with per-field touched
    flags and three states (leave / clear / set). (2) `setShareToken`
    threw «could not determine data type of parameter $3»: node-pg sends
    untyped parameters and `$3 IS NULL` in a CASE gave Postgres nothing
    to infer from — passes in psql only because PREPARE types it; fixed
    with `::text`.
  - **Verified**: 6 / 12 / 2-page PDFs for all / with notes / `slides=1,4`,
    fonts embedded, pages inspected by eye (title band, side image at
    native size, concept panel, formula picture, two-column summary);
    share created → public GET without a cookie → notes absent → image via
    token 200, via a wrong token 404 → revoked → 404; the public page in
    the browser shows six cards with no notes column, no edit controls,
    no checkboxes. `tsc` clean; backend 197, frontend 17 tests.
  - Not verified: the PDF on a phone or in a non-Preview reader; a share
    link opened from a real second device.

### Added
- **Бренд и темы.** TODO E. A third theme («Тёплая» — Georgia, paper
  ground, measured: accent `8A5C06` 5.48 on the ground and 4.95 on the
  panel, the pair that fails last), a theme picker per talk (`PATCH
  /api/talks/:id`), and a per-workspace brand kit — accent, logo, name —
  in `brand_kits` (migration 008) with its own settings page.
  - **The accent is measured, never assumed** (CLAUDE.md §3.8). On a
    slide the accent is graphics (rules, bands, header fills) and small
    bold labels. `applyBrand` measures the user's colour on the theme's
    ground: ≥ 4.5:1 → labels in the accent; below → labels fall back to
    ink2 and the graphics keep the colour. The settings page shows the
    ratio per theme («Тезариум: 1.6:1 — подписи тёмным»), and the export
    logs the fallback with the number.
  - **The logo is drawn at its own aspect ratio** (`containFit` from the
    bytes) on the title slide only; a test pins a 4:1 logo to a 4:1
    picture — the parent's squashed-logo incident.
  - **One primary per screen**: the first cut had two solid «Сохранить»
    buttons; accent and name now save through one form.
  - **Verified in the browser and in the file**: pale accent `F4C55A`
    saved → 1.6:1 / 10.2:1 / 1.5:1 per theme shown; logo and name on both
    previews; theme switched to «Тёплая»; the exported deck had the warm
    ground, the accent as graphics, the logo picture and name on the
    title slide, and the summary label in `5C554B` (ink2), not the
    accent. `tsc` clean; backend 191, frontend 17 tests.

### Added
- **Контейнеры и сценарий выкладки.** TODO C. Two images (API on
  `node:22-slim` — Debian, not Alpine, because resvg's prebuilds are
  glibc; the bundle behind Caddy), a CI job that builds both on every
  push and pushes from `main` once four registry secrets exist,
  `deploy/docker-compose.yml` (two API replicas, Caddy for TLS and
  `/api` load-balancing, a one-shot `migrate` on the same image), and
  `deploy/deploy.sh` in the parent's proven shape (CLAUDE.md §9).
  - **The parent's deploy incidents are encoded, not just remembered**:
    `docker compose run -T migrate < /dev/null` (the heredoc's remaining
    commands were once silently eaten as the migration container's stdin
    — three deploys lost); version assertion on every replica AND on the
    served bundle (`/version.txt`), because on 2026-09-05 the parent's
    frontend ran four commits ahead of both API replicas with every health
    check green; `if ! cmd` gates rather than `cmd && echo`, which `set -e`
    does not trigger on.
  - **Caddy, not nginx + certbot** — judgement: certificate renewal is the
    ops step most often forgotten on a one-VM deploy; nginx is a drop-in
    if a customer insists. Postgres is deliberately not in the compose
    file: it holds the data and must not share the app containers'
    lifecycle.
  - **Verified**: no Docker on the founding machine, so CI is the build:
    run 34826251477 built both images — the API image's
    `dist/backend/src/index.js` assertion passed and the web image baked
    `0.1.0 (2026-09-14+3ed5071)` into the bundle and `/version.txt`.
    `push: false`, as expected without secrets. `deploy.sh` passes
    `bash -n`; it has not run against a VM. Every CI run since the first
    commit has been green (checked today for the first time).
  - Not verified: an actual deploy — Caddy's certificate issuance, the
    migrate one-shot against a managed Postgres, the rolling restart under
    live traffic. Waits on the hosting decision (§10).
- **Загрузить свою презентацию (.pptx).** TODO D — the adoption lever
  (CLAUDE.md §8 step 4). `POST /api/talks/import` and a «Загрузить .pptx»
  chip on the list. No model call, no quota.
  - **Ported from the parent's `pptxImport.ts` with every shipped-bug rule
    intact**: slide order from `<p:sldIdLst>` (a reordered deck rewrites
    that, not the file names); notes via each slide's own rels (slide3 may
    own notesSlide1); `trimValues:false` and `<a:br/>` → space run (a real
    deck imported as «ВСС на базеЖКВН»); pictures from `<p:pic>` only, not
    fills; PNG/JPEG only, measured from bytes, furniture under 100 px
    skipped; title = the placeholder, else the biggest text.
  - **Format from part layout, not the zip signature** (§3.7,
    `lib/fileType.ts`): a Word file with an embedded deck is Word; a
    `.docx` gets «Это документ Word, а не презентация».
  - **Language detected from the deck's own text** (Cyrillic majority →
    ru), so later rewrites are prompted in the right language and the
    fallback title reads right. Notes column on iff the deck brought notes.
  - **A rule the parent did not have, found on a real file.** A 4.9 MB
    template photo was inserted as a `<p:pic>` on every content slide of a
    22-slide deck: it was stored four times (20 MB of furniture), hit the
    per-deck byte cap, and the deck's actual figures were dropped — 5
    imported, 13 lost. A media part placed on three or more slides is now
    template furniture and skipped (`FURNITURE_SLIDE_COUNT`); three, not
    two, because a figure shown twice is a real case. Re-import: 1 real
    figure, template gone. Fixture added for both sides of the threshold.
  - **Verified on files our exporter did not write**: a 6 MB Russian
    engineering deck → 16/16 slides, 15 pictures, rendered in the viewer
    with all 15 loaded through the proxy, re-exported to a 2.6 MB `.pptx`;
    a 6 MB English deck → 22/22, language `en`. Both then deleted with
    their objects — they are the user's own files, not test data. Round
    trip through our exporter and the hand-built fixtures pass; `tsc`
    clean; backend 182, frontend 17 tests.
  - Not verified: a deck with notes from PowerPoint itself (neither real
    deck carried any; the notes path is covered by the round-trip and the
    rels rule); the chip's file picker in the browser (the route was
    driven with curl).
- **Загрузка изображения на слайд.** TODO B Phase 1 (upload only — search
  waits for a provider). Object storage behind generic `STORAGE_*` vars
  with a local-disk fallback (CLAUDE.md §10), `talk_media` with the
  intrinsic size read at ingest (migration 007), a workspace-scoped proxy
  route, upload/replace/remove in the viewer, and the exporter placing the
  picture by its real dimensions.
  - **Bytes, not headers** (§3.5, §3.7): the multipart Content-Type is
    ignored; PNG/JPEG are identified from the magic bytes and the IHDR/SOF
    dimensions must parse. A text file named `.png` → «Поддерживаются
    только PNG и JPEG».
  - **`slideImageSource.ts` is the one loader** (§2): a root-relative
    `/api/talks/media/:id/image` is read straight from storage, never
    fetched — `fetch()` of a relative URL throws in Node, which is how
    every stored image once exported as a placeholder in the parent.
  - **Two things caught before commit.** (1) Talk deletion cascaded the
    media rows before cleanup listed their paths — the objects would have
    been orphaned forever; paths are now collected first, workspace-scoped
    so a talk id alone cannot reach another tenant's objects. (2) The
    viewer offered an upload slot on title/summary/cta slides, which the
    exporter has no layout for — a picture the deck never shows; the slot
    is now limited to the types that are laid out.
  - **Verified live**: fake PNG refused; real PNG stored on disk, served
    to its owner byte-identical (200), refused to an anonymous request
    (401) and to another workspace (404); the deck exported with the
    picture and read back by the parent's importer showed slide 4 with two
    images — the rendered formula (4000×114) and the upload (200×120);
    upload through the file input and remove both worked in the browser;
    a throwaway talk with an upload deleted cleanly — row and object gone.
    `tsc` clean; backend 163, frontend 17 tests.
  - Not verified: the S3 branch (no credentials on this machine — only the
    local-disk fallback ran).
- **Лимиты расходов и квота выступлений.** TODO A Phase 5 — item A is
  complete. Per-workspace monthly spend cap (tier default, or the new
  `workspaces.monthly_spend_cap_usd` override — migration 006) and a
  platform-wide daily backstop, both enforced as a registry before-call
  hook so every model call is covered whichever route or job made it; a
  monthly talk quota checked at enqueue and counted at completion; the
  generation limiter keyed by user, not IP.
  - **Fail open on infra, closed on overspend** (parent's rule): a cap
    check must never be the reason generation breaks, and it must always
    be the reason a runaway bill stops.
  - **Checked twice on purpose.** The registry hook is the guarantee; the
    route also checks at enqueue because the first live test showed the
    user only learning of the cap after the worker's retry cycle (~20 s).
    Now `POST /api/talks/jobs` answers 429 with the copy immediately.
  - **Numbers are judgement** (CLAUDE.md §10): free 10 talks / $3, pro
    unlimited / $30 — a runaway client on free cannot cost more than a
    coffee; a heavy pro user with 40-slide decks (~$0.05 each, measured)
    never meets the cap in normal use. Revisit with usage_log.
  - **Verified live**: cap override set to $0.001 on a workspace that had
    spent $0.0037 → job failed with «Достигнут месячный лимит…» and ZERO
    usage_log rows were written (the hook blocked before DeepSeek); after
    the enqueue check, the same request returned 429 at once. 21st
    generation request in ten minutes → 429 `RATE_LIMITED` in the API's
    error shape. `tsc` clean; backend 163, frontend 17 tests.
  - Known and accepted: the rate limiter is in-memory, so N replicas give
    ~N× the ceiling — fine for a guard whose real ceiling is the shared-DB
    spend cap (the parent moved only the auth limiter to Postgres, for the
    brute-force case). A cap failure still goes through pg-boss's one
    retry before the job is marked failed; harmless (the hook blocks
    again) and not worth a special case.
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
