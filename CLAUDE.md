# Tezarium (Тезариум) — AI presentation maker · project context for Claude Code

> This file is the successor to ИСПУМ's presentation feature, extracted into a
> standalone product for a general audience. It carries the architecture and
> the hard-won rules; it deliberately does NOT carry the education-specific
> product surface. Where a rule below cites an incident, the incident really
> happened in ИСПУМ production — treat those as load-bearing, not as style.

---

## 1. Identity

**Tezarium · Тезариум** — turns talking points into a finished talk: an
approved outline, structured slides, the text to say over them, images, and
a native editable `.pptx`. The plan is shown for approval *before* the
expensive writing pass, and every slide is individually editable afterwards.

The name is coined from *тезис* — a talking point — with the suffix of
аквариум / океанариум: the place where the theses are kept. Wordmark:
**Тезариум** in Cyrillic, **Tezarium** in Latin — a letter-for-letter
transliteration, so the name is the same in both scripts and matches the
domain. One per script, never mixed.

**Positioning (one line):**
- RU — Тезариум превращает ваши тезисы в готовое выступление: план, слайды, текст для докладчика.
- EN — Tezarium turns your talking points into a finished talk: outline, slides, and what to say.

*Выступление / talk* is deliberate: the product claims the speaking, not
only the slides — that is where the parent implementation is genuinely
stronger than slide-design tools.

Audience: anyone who has to present — sales, consulting, product, internal
comms, training, students, speakers. **Not** tied to a university, a course,
a syllabus, or a teacher/student relationship. Every noun from the education
version that assumed those things is renamed or removed (§4).

Reference implementation: the ИСПУМ repo, `backend/src/services/presentations.ts`
and siblings (see §2). Port the *shape*, rewrite the *copy*.

### Product copy — the three nouns (enforced everywhere)

| Concept | RU | EN | Not |
|---|---|---|---|
| What the product makes | **выступление** | *talk* (or *deck* in export contexts) | «презентация» — that is the `.pptx` file you *export*, not the thing you make |
| What the user gives it | **тезисы** | *talking points* / *brief* | «конспект», «текст», «промпт» |
| The text spoken over a slide | **текст докладчика** | *speaker notes* | «заметки», «комментарии» |

The parent product's copy rule («never ИИ, always ИСПУМ») lived in exactly
this spot and is what kept 45 pages consistent. Tezarium's equivalent:
**say what the product does, never what powers it** — no «ИИ», «нейросеть»,
«AI» in user-facing copy unless a legal or settings context requires it.
Taglines in use: «От тезисов — к выступлению» (landing), «Слайды, которые
знают, что сказать» (ads).

---

## 2. What to carry over (proven in production)

These modules exist in ИСПУМ and are worth porting nearly as-is. Names are the
originals; rename freely.

| Module | What it does | Why it earned its place |
|---|---|---|
| `presentations.ts` — `planPresentation` / `expandPresentation` | Two-pass generation: a cheap **outline** call (type + title + technical brief per slide), then **parallel expansion** in batches of ~5 slides with concurrency 3, each slide getting its own full writing budget | One monolithic call split one token budget across 40 slides and produced thin slides. Two passes also make the outline gate (below) possible |
| Outline approval gate (`presentation_jobs.status = 'outline_ready'`) | The plan is handed back to the user to reorder / retype / add / delete slides before expansion runs | Fixing the structure costs seconds before generation and a full regeneration after. This is the single most-used editing affordance |
| `normaliseOutline` / `normaliseEditedOutline` / `normaliseEditedSlide` | Every model or user payload is coerced into the typed `Slide` union with defaults; first slide forced `title`, last forced `summary` | The model *will* return a wrong type, a missing title, a runaway array. Coerce, never trust |
| Async jobs (pg-boss) + pollable row | Generation is a queued job with a status row the client polls; retries only surface a terminal failure on the last attempt | Generation outlives HTTP timeouts; the UI must never flash "failed" before a silent retry succeeds |
| `services/llm/modelJson.ts` | `extractJSON`, `looksTruncated`, `repairTruncatedJSON`, `resolveModelJSON` — one module for reading JSON out of a model answer | See rule 3.1. Three providers had three diverging copies; one of them turned a truncated answer into a parser error a user saw on screen |
| `services/llm/registry.ts` | Provider abstraction (`chat` / `chatJSON` / `embed`), per-tenant override, silent fallback to a default provider, spend caps | Keep the abstraction even if you launch on one provider — the cap and the fallback are what keep a bad hour from becoming a bad bill |
| `presentationExport.ts` (pptxgenjs) | Native `.pptx` with a layout per slide type, formulas rendered to PNG via MathJax→resvg, images fitted by intrinsic size, branding (accent colour + logo) threaded in | This is the product. A "copy the text into PowerPoint" fallback is not a product |
| `lib/imageSize.ts` + `containFit` | PNG IHDR / JPEG SOF sniffing for intrinsic dimensions; fit inside a box preserving aspect | pptxgenjs stretches to the frame regardless of `sizing:contain`. Compute exact dimensions yourself or logos come out squashed |
| `presentationHandoutPdf.ts` (pdfkit) | Reading-order PDF: slides + notes as prose, with the pictures, sources narrowed to what's cited | Cheap second artefact from the same data; audience-facing |
| `pptxImport.ts` (jszip + fast-xml-parser) | Import an existing `.pptx`: slide order from `<p:sldIdLst>`, notes via per-slide rels, pictures from `<p:pic>` only, `trimValues:false`, `<a:br/>` rewritten to a space run before parsing | "Upload last week's deck" is the lowest-friction entry point that exists. Every rule in that module is a bug that shipped |
| `presentationMedia.ts` + `slideImageSource.ts` | Stored slide images in object storage behind an auth proxy route; one loader that knows which image URLs are web and which are root-relative storage routes | `fetch()` of a relative URL throws in Node — every stored image exported as a placeholder until this existed |
| `shared/slideFit.ts` | Per-type character/line budgets; flags slides that won't fit a 16:9 frame *in the viewer*, before export | The viewer card grows to fit; the slide does not. The user finds out on the projector otherwise |
| Slide-level editing (`regenerateSlide`, `applySlideMove`, delete, insert) | Rewrite one slide from an instruction ("shorter", "add a numeric example"); reorder with splice semantics | One bad slide must not mean regenerating forty |
| Slide selection for export (`lib/slideSelection.ts` both sides) | `?slides=2,3,5` on every export route; selection remapped through move/delete/insert on the client | Slides have no ids — a selection is indices, and indices shift under edits. Remap or you export the wrong slides silently |
| Style learning from approved decks (`selectExemplars`) | User marks a deck "this is how I like it"; later outlines are prompted with its *style* (notes depth, phrasing), never its content | Consent-gated, per-user, no cross-user leakage. The right shape for personalisation |
| `presentationEvalHarness.ts` | Offline replay of generation against fixed inputs | You will change prompts weekly. Without this you cannot tell better from different |

**Slide types** (`shared/types.ts`): `title · bullets · concept · formula · comparison · diagram · discussion · summary`. Keep the union pattern — one discriminated type per layout, each with its own `body` shape, `notes`, `citations`, and an optional top-level `image`. Add types (§5); never make one type carry two layouts.

**Storage**: Postgres, `slides` as JSONB on the deck row. This is fine at this scale and it is why edits are "replace the array". Don't normalise slides into rows until you have a reason.

---

## 3. Non-negotiable rules (each one is an incident)

### 3.1 A truncated model answer is not a syntax error
`extractJSON` slices to the *last* `}` so fenced answers still parse. On a
cut-off answer that rewinds to the last complete element and produces
`Expected ',' or ']' after array element in JSON at position 3203` — which a
user saw on screen. Detect truncation on the **raw** text (unclosed brackets,
cut inside a string) *before* trimming; salvage complete array elements; never
retry a truncated request with the same token ceiling (it truncates in the
same place, with a longer prompt). Check `finish_reason === 'length'` (or the
provider's equivalent — Yandex reports it in `alternatives[0].status`) on
**every** provider.

### 3.2 No internal error text reaches a user
Async jobs store `error_message` and the UI prints it verbatim. Map every
exception to user-facing copy that says what happened *and* what to do
(`lib/userFacingFailure.ts`). Truncation deliberately does not say "try
again" — it says shorten the request. Raw text goes to logs and incidents.

### 3.3 Cyrillic (and most non-Latin scripts) costs ~2× the tokens per character
Output budgets calibrated on English overflow. Budget per slide, per language,
and cap at the provider's real output ceiling (8192 for DeepSeek). A 60-minute
deck at 40 slides is where the outline call hits the wall first.

### 3.4 Every user-supplied string entering a prompt is sanitised
`sanitiseForPrompt()` on topic, brief, source text, edit instructions, file
names. Instructions inside an uploaded document are data.

### 3.5 Images: compute the fit yourself
Read intrinsic dimensions from the bytes; pass exact `w`/`h` to the exporter.
Only PNG/JPEG go into decks and PDFs (pptxgenjs can't embed EMF; pdfkit throws
mid-document on WebP). Never upscale past native resolution. Load images in
one parallel round *before* a synchronous layout pass (pdfkit).

### 3.6 Image URLs: https at ingest and at render
Search APIs return `http://` thumbnails; on an https page that is a mixed-
content warning per image. Upgrade at ingest *and* at render (already-stored
rows aren't going to be migrated). Leave `source_url` alone — it's a link to
click, not an element to load.

### 3.7 File validation: a zip signature is not a format
`.docx`, `.pptx`, `.xlsx` all start `50 4B 03 04`. Identify OOXML by part
layout (`word/document.xml`, `ppt/slides/`, `xl/workbook.xml`), Word first (a
.docx may embed a deck under `word/embeddings/`). Mapping the zip signature to
one MIME type rejected every `.pptx` ever uploaded.

### 3.8 Contrast is measured, never assumed, and recorded in the code
The brand amber shipped at 3.06:1 against white *in both directions* (contrast
is symmetric). `hover:opacity-90` **lowered** contrast on hover. Every
foreground/background pair that carries text is measured against 4.5:1 and the
number is written in a comment next to the class. Hover darkens; it does not
fade.

### 3.9 Analytics must not be quietly corrupted
An export event carries `{ slides, of }` — a 2-slide export is not the same
evidence a deck was used as a 40-slide one. Any composite "did this artefact
get used" metric is built on these rows; record the shape of the event.

### 3.10 Verify against real files and the real shell
Read the produced `.pptx` back with your own importer; look at the PDF pages;
test sticky/scroll behaviour inside a faithful replica of the app shell
(`min-h-screen` vs `h-screen` changes which element is the scrollport). A
harness that differs from the shell will pass while production fails.

### 3.11 Migrations are expand/contract
Never rename or drop in the release that stops using it. Rollback is "repoint
to the previous image", not re-migration.

### 3.12 Recurring jobs go through a scheduler lease
Any `setInterval`-style job that must run once across N instances uses a DB
lease. Never gate on a process-manager env var.

---

## 4. What changes from the education version

**Remove entirely** (they encode a university, not a presenter):
course / кафедра / institution org tree · syllabus-derived lecture topics ·
«Проверить усвоение» (quiz from deck) · «Письменная работа» (assignment from
discussion slides) · student invite links / attestation · the department deck
bank and its `umu` permission domain · РПД / УМК anything · plan-limit names
like `presentationsPerMonth` (keep the *mechanism*, rename the tiers).

**Rename / generalise:**

| ИСПУМ concept | New concept |
|---|---|
| Лекция / lecture | **Выступление** / talk (the artefact); «презентация» only for the exported `.pptx` |
| Teacher | User / workspace member |
| Course | Project (optional grouping; brand kit lives here) |
| Конспект (source text) | **Тезисы** / talking points — paste, upload PDF/DOCX/PPTX, or paste a URL |
| Audience level (бакалавриат…) | Audience (executives · customers · team · conference · classroom · investors) |
| Style (`theory_heavy` / `case_study` / `discussion_based`) | Intent (inform · persuade · teach · pitch · report · workshop) |
| Duration in minutes → slide count | Keep minutes → slides, plus explicit "N slides"; add "talk length" presets |
| «Строго по конспекту» | "Only from my material" — keep, it's a trust feature |
| Speaker notes (always) | **Текст докладчика** / speaker notes — **optional per talk**; a sales deck read on screen wants none |
| `discussion` slide type | `question` / `cta` — keep a discussion type for workshops, add a call-to-action type for pitches |
| Institution branding (one accent + logo) | **Brand kit** per workspace/project: palette, logo, fonts, template — first-class, not a settings afterthought |
| RAG over course documents | RAG over the user's uploaded material for *this* deck / project only — no cross-tenant pool at launch |

**Copy rules:** the three nouns and the «say what it does, never what
powers it» rule are set in §1 and enforced on every user-facing string. The
rule that transfers unchanged from the parent: explanatory copy says what
happened and what to do, and never exposes a component name, an offset, or
a stack.

---

## 5. What to add (in the order it will be asked for)

1. **Themes / templates** — several typographic + colour systems per deck, not
   one branded layout. This is the first thing a non-education user asks for
   and the education version never needed it. Build the exporter so a theme is
   data (palette, fonts, spacing, layout variants), not a fork of the code.
2. **Brand kit** (§4) with logo placement rules and a preview on white and on
   dark. The logo-fit code exists; the *positioning* choices don't.
3. **Slide types**: `agenda`, `section`, `quote`, `stats` (big-number),
   `timeline`, `team`, `cta`, `image-full` (picture-led with a caption).
   Multi-image slides need a real design decision — the current model is one
   image per slide by construction, and everything downstream assumes it.
4. **Image sources**: keep search; add upload; add generated (SVG/Mermaid
   schematics were on the ИСПУМ backlog and blocked on rendering, not on the
   idea). Every image path must land in `slideImageSource.ts`.
5. **Export formats**: `.pptx` first, then PDF (already have the handout
   renderer — restyle it as a *slides* PDF, not a reading document), then
   Google Slides / Keynote via `.pptx` fidelity rather than separate exporters.
6. **Sharing**: a view link per deck (read-only, no account), the same shape as
   ИСПУМ's department-bank viewer minus the org scoping.
7. **Regenerate-with-instruction at deck level** ("make the whole thing more
   formal") — the per-slide version exists; the deck-level one is a loop with a
   diff view.
8. **Live present mode** in the browser with notes on a second screen — cheap
   once the slide renderer exists in React, and it's where the *notes*
   investment pays off for a general audience.

**Do not add at launch**: real-time collaboration, comments, version history
beyond "undo last regeneration", a public template marketplace. Each is a
product, not a feature.

---

## 6. Design system baseline

The palette is «Редакция» (2026-09-14): paper, ink, one blue pencil. The
tokens and every measured pair live in `frontend/src/index.css`; this is
the summary. **Re-measure every pair** if any token moves.

| Pair | Ratio | Rule |
|---|---|---|
| Ink `#15171C` on the sheet `#FFFFFF` / on paper `#F5F6F8` | 17.9 / 16.6 | also the solid-button ground; paper text on it 16.6 |
| `ink-secondary` `#5B6170` on sheet / paper / accent-light | 6.2 / 5.7 / 5.2 | minimum for secondary text |
| `ink-tertiary` `#8B909C` on sheet | 3.2 | **captions/graphics only, never text a user must read** |
| Pencil `#2F4FD0` on sheet / paper / accent-light `#E6EAFA` | 6.7 / 6.2 / 5.6 | the pair on accent-light fails *last* — check it for any new accent |
| `accent-deep` `#24409F` (hover of pencil text) | 9.1 | hover darkens; contrast rises |
| Marker `#FFE85A` (highlighter) with `marker-ink` on it | 14.5 | means one thing: *selected*; once more as a flourish, never as decoration |
| Dark: ink `#ECEDF0` on `#121317`; pencil `#8FA3FF` on surface `#1A1C22` | 15.9 / 7.2 | same roles, not an inversion; rules 14% / 32% (10% vanishes on dark) |

The solid primary button is **ink**, never the pencil: the pencil marks
(slide type, links, selection), it does not fill. Faces: Literata
(display, speaker notes), Golos Text (UI), JetBrains Mono (numbers) — all
with full Cyrillic; fallbacks are the PT faces the PDF exporter vendors.
Structure: content on a *sheet* (`surface`), the rail on the paper (`bg`)
— two planes, which is what keeps the page legible in dark; a left rail of
material kinds (talks · posts · ads · brand) that becomes a bottom bar
under `lg`; the talk page is a manuscript — slide column plus a 280 px
margin for the speaker's text. Theme: system / light / dark, `data-theme`
on `<html>`, `lib/theme.ts`.

Rules that survived user testing:
- **One solid primary CTA per screen.** A second emphasis is tinted
  (`accent-light` ground + ink text), not filled.
- **Actions look like actions**: bare text with only a hover colour reads as a
  caption — and on touch there is no hover. Bordered chip, ≥32px; primary
  actions ≥40px; touch targets 44px with real `<label>` wrappers.
- **Explanation lives at the control** (a disclosure under the buttons it
  explains), not in a permanent side column. A column beside a long scroll is
  read once and then in the way. Onboarding cards are dismissible and
  persisted; artefact explainers (a chart legend) are not dismissible because
  the question recurs.
- **Content first**: on a deck page the first slide is above the fold.
  Measure it.
- **Sticky toolbars need a scrollport audit**: `overflow-y: auto` on a wrapper
  that never scrolls silently captures `position: sticky`.
- Vector icons only (Lucide-style), one stroke width; no emoji as icons.
- Russian pluralisation has three forms (1 слайд / 2 слайда / 5 слайдов);
  any count in copy goes through a helper.

Typography in ИСПУМ: a serif display face for titles (PT Serif / Georgia),
a humanist sans for UI (PT Sans), DejaVu as the Greek/maths fallback in PDFs.
A general product will want its own pairing — keep the *fallback* discipline
(a font must exist before the first `text()` that names it; a paragraph with
glyphs the main face lacks swaps face per paragraph, never per glyph).

---

## 7. Data model sketch

```
workspaces(id, name, plan_tier, brand_kit_id)
users(id, workspace_id, email, …)
projects(id, workspace_id, name, brand_kit_id?)          -- optional grouping
brand_kits(id, workspace_id, accent, palette jsonb, logo_path, logo_mime, fonts jsonb)
talks(id, workspace_id, project_id?, owner_id, title, intent, audience,      -- «выступление»
      slide_count_target, notes_enabled, theme_id, slides jsonb, sources jsonb,
      approved_at, share_token?, created_at)
talk_jobs(id, talk_id?, status pending|processing|outline_ready|ready|failed,
          outline jsonb, error_message, …)               -- pollable
talk_media(id, talk_id, slide_index, storage_path, mime, w, h, bytes)
talk_events(kind, event, talk_id, user_id, format, metadata jsonb)  -- exports etc.
usage_log(…)                                             -- per-call cost, provider, tokens, success, error_code
```

Keep `slides` as JSONB. Keep `sources` on the talk (idx-numbered; slide text
carries `[N]` markers, so never renumber sources without rewriting slides).

---

## 8. Build order

Ship in this sequence; each step is usable on its own.

1. **Generate → outline gate → expand → view → `.pptx`** with one theme and no
   images. This is the spine. Port `modelJson.ts`, the job worker, the
   normalisers, the exporter, the eval harness on day one.
2. **Slide editing**: edit / regenerate-one / move / delete / insert, with the
   selection remap logic even before selection exists (it's the same index
   arithmetic the editor needs).
3. **Images**: search + upload, `imageSize`, `slideImageSource`, stored media
   behind an auth proxy, https normalisation.
4. **Import `.pptx`** — the adoption lever.
5. **Brand kit + themes.**
6. **PDF export, partial export, share link.**
7. **Style learning from approved decks**, present mode, deck-level rewrite.

---

## 9. Working conventions (same as the parent repo)

The full method — the four source-of-truth files, what an entry looks like
with real examples, commits, comments, tests, verification, release — is in
[`docs/WORKFLOW.md`](docs/WORKFLOW.md). Read it once at the start of the
project and again whenever an entry in one of the files feels like a chore
rather than a record. The short form:

- `FEATURES.md` / `CHANGELOG.md` / `TODO.md` are the source of truth; update in
  the same commit. CHANGELOG entries explain *why*, with the incident where
  there is one, and record measured numbers.
- Tests alongside code. The tests that mattered most were against **hand-built
  fixtures that differ from our own output** (a `.pptx` from PowerPoint, not
  from our exporter; a JSON answer cut mid-string) — round-tripping our own
  output proves the parser matches our idea of the format, nothing more.
- Contrast ratios, token budgets, and timing constants are written into
  comments next to the code that depends on them.
- Deploy is pull-based from a CI-built image, gated on CI for the exact commit,
  with a pre-pull image guard and a post-deploy version assertion per replica.
  Frontend and backend are deployed in the same run; a green backend proves
  nothing about the bundle — check the served asset.
- No CDN in front unless you actually configure one; a purge step for a CDN
  that doesn't exist is a misleading warning on every deploy.
- Don't install new dependencies from the agent environment; hand the command
  to the operator.

---

## 10. Decisions this product still has to make (defaults suggested)

| Decision | Suggested default | Why |
|---|---|---|
| Language | Russian-first UI, English generation from day one, prompts language-aware; the brand is already bilingual (Тезариум / Tezarium) | The founding users are Russian-speaking; a "for anyone" product cannot be Russian-only for long |
| Provider | Keep the registry; launch on the provider with a strict JSON mode | Providers without one (Yandex) produce the failures in §3.1 more often |
| Hosting | Same Yandex Cloud posture if the first customers are in Russia (152-ФЗ); the code must not assume it | On-prem was a real deal in the parent product |
| Pricing gate | Gate the **native `.pptx` download** and deck count, not generation | That was the parent's differentiator and it held |
| Storage | Object storage from day one, local-disk fallback for dev | Two replicas on one VM already broke the "just use disk" assumption once |
| Notes by default | On for `teach`/`workshop`/`conference`, off for `pitch`/`report` | Notes are the parent's strength and a general user's noise |

---

*Everything above that cites a number or an incident is real. Everything in
§5 and §10 is judgement; revisit it with users, not with more design.*
