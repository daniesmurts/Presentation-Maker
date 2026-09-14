# Tezarium — what exists

Legend: ✅ shipped · 🚧 in progress · 📋 planned. Grouped by the role that
uses it. A 📋 item is marked, never implied. See `docs/WORKFLOW.md` §1.

Last updated: TODO F — PDF, partial export, share link

---

## Anyone with an account (free tier)

Free: 10 talks a month, $3 of model spend a month (a cost circuit breaker,
not a price). Pro: unlimited talks, $30. No billing exists yet — the
numbers are the shape of the gate, and the `.pptx` download is open to both.

- ✅ **Create a talk from talking points.** Paste тезисы, pick intent (inform · persuade · teach · pitch · report ·
  workshop) and audience (executives · customers · team · conference ·
  classroom · investors), set length in minutes or an explicit slide count
  (3–60); speaker notes on/off per talk, defaulting per intent. Russian or
  English. Generation is an async job the client polls.
- ✅ **Approve the outline before writing.** The plan (type +
  title + brief per slide) comes back first; reorder, retype, add, delete,
  then confirm to expand. A plan left unconfirmed for 24 h expires.
- ✅ **Only from my material.** With a brief supplied, the
  talk contains only what the brief says — fewer slides rather than
  invented content.
- ✅ **Sign up / sign in** with e-mail and password; one workspace per
  account.
- ✅ **View the talk.** One card per slide by type, formulas rendered,
  speaker notes beside the slide when the talk has them; slides that will
  not fit a 16:9 frame carry a «Много текста» flag. Copy any slide as text.
  Works on a phone.
- ✅ **Edit one slide.** Edit any field in place, rewrite from an
  instruction («короче», «добавь пример с числами»), move, delete, insert
  a blank slide — without touching the rest. One level of undo after a
  rewrite. «Только по моим материалам» holds on rewrites too.
- ✅ **Upload an image onto a slide** (PNG or JPEG up to 8 MB) on any slide
  type the deck lays out — replace or remove it; it goes into the `.pptx`
  at its true aspect ratio. 📋 Image search (needs a provider). *(TODO B)*
- ✅ **Upload an existing `.pptx`** (up to 20 MB) as a talk: slide order,
  titles, text, speaker notes and each slide's main picture come through;
  template pictures repeated across slides are left behind. No model call
  — the deck stays exactly yours, and every slide can then be rewritten.
- ✅ **PDF download** — one 16:9 page per slide in the talk's theme and
  brand, optionally with a page of speaker notes after each slide.
- ✅ **Download only the slides you tick** (shift-click for a range) — for
  both `.pptx` and PDF; the selection follows the slides through moves,
  deletions and insertions.
- ✅ **Share link** — a read-only page with the slides and pictures, no
  account needed; speaker notes and the brief stay private. Revoke any time.
- 📋 **Present mode with notes on a second screen.** *(TODO G)*

## Paid tier

- ✅ **Native editable `.pptx` download** — 16:9, a layout per slide type,
  formulas typeset as images, speaker notes in the notes pane; `?slides=`
  downloads a subset.
- ✅ **Three themes** (Тезариум, Тёмная, Тёплая), chosen per talk.
- ✅ **Brand kit** per workspace — accent colour, logo, name — applied to
  every download, with a preview on light and dark and the measured
  contrast of the accent on each theme (a pale accent keeps the rules and
  bands; labels stay dark). The pricing gate sits on this
  download (`lib/planTier.ts`) — allow-all until billing exists.
- 📋 **Style learning from approved talks.** *(TODO G)*

## Operator

- ✅ **Immutable images built in CI** for the API and the web bundle, each
  carrying its build version (`/health`, `/version.txt`); a pull-based
  `deploy.sh` with a CI gate, image guard, one-shot migration, rolling
  restart and version assertions. 📋 A first deployment — needs a VM, a
  registry and a domain.

- ✅ **Spend cap per workspace** (tier default or a per-workspace override
  column), **a platform-wide daily backstop** (`GLOBAL_DAILY_SPEND_CAP_USD`,
  off until set), **usage log per model call**, and per-user rate limits
  on generation and rewrite (20 per 10 min). Caps fail open on
  infrastructure errors and closed on real overspend.
- ✅ **Offline eval harness** (`npm run eval:talks`) replaying generation
  against three fixed briefs and printing slide-count, notes-length,
  type-mix and image-query metrics; every call it makes lands in the usage
  log like any other.
- ✅ **Model calls go through one registry** with per-call usage logging,
  multi-account fallback, and truncation detection on every answer; an
  `onprem` deployment mode forbids silent cross-provider fallback.
- ✅ **No internal error text reaches a user** — every failure stored on a
  job or returned by the API is mapped to copy that says what happened and
  what to do.
