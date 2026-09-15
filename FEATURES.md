# Tezarium — what exists

Legend: ✅ shipped · 🚧 in progress · 📋 planned. Grouped by the role that
uses it. A 📋 item is marked, never implied. See `docs/WORKFLOW.md` §1.

Last updated: design v3, layer 2 — five rhythm types and a design vocabulary the model chooses from

---

## Anyone with an account (free tier)

Free: 10 talks a month, PDF, share link, present mode; $3 of model spend a
month (a cost circuit breaker, not a price). Pro — **2 500 ₽ a month** —
unlimited talks and the native `.pptx`; $30 of spend. The gate bites only
where billing is switched on (`BILLING_ENABLED=1`); a dev box or an
on-prem install keeps `.pptx` open to everyone.

- ✅ **The desk.** A left rail with every kind of material the product
  will make (talks now; posts and ads listed as «скоро»), the brand kit,
  and one solid «Новое выступление»; a bottom bar on phones. Light and
  dark themes: as in the system, or chosen with the switcher (remembered). The library is a list of editorial rows
  with the state of each talk (черновик · готово · по ссылке) visible
  before it is opened.
- ✅ **The manuscript view.** Each slide with the speaker's text in the
  margin beside it, a speaking-time estimate per slide (≈ N сек), the
  slide number as the selection control for partial download, and the
  «не влезает» flag at the slide it concerns.
- ✅ **Account with recorded consent.** Registration requires accepting the terms and the privacy policy (152-ФЗ); the acceptance and the documents' version are stored on the user. Public `/legal/terms` and `/legal/privacy`.
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
- ✅ **Present mode** — full-screen slides with keyboard/click navigation,
  and a speaker window (current slide, notes, next slide, timer) that stays
  in step on a second screen.
- ✅ **Rewrite the whole talk from one instruction** («формальнее»,
  «короче») — you see old and new side by side per slide and accept only
  what you want; one-step undo after applying.
- ✅ **Mark a talk «Готово».**

## Paid tier

- ✅ **Native editable `.pptx` download** — 16:9, a layout per slide type,
  formulas typeset as images, speaker notes in the notes pane; `?slides=`
  downloads a subset.
- ✅ **Fourteen slide types with a rhythm** — title, agenda, section, bullets, concept, formula, comparison, diagram, stats (one to three big figures), quote, image-full (a picture with the title on it), discussion, call to action, summary. The plan decides the pace (an agenda, a section break every 5–8 slides, a figure or a quote after a heavy slide) and how each slide looks — one or two columns, one big number or three, the figure in the accent or the ink, one slide per part lifted onto the theme's background — and every one of those choices is editable on the slide.
- ✅ **Twelve themes** (Тезариум, Тёмная, Тёплая, Яркая, Газета, Монохром, Лес, Океан, Песок, Сирень, Графит, Игра), chosen per talk — one composition (title low-left under an accent rule, hairline under content titles, «01 / 05» footer, formula and «Что дальше» panels, the question as a large italic), twelve palettes, each with a background treatment (graph-paper grid, soft blobs, a warm wash, an amber wedge) drawn at full strength behind the title, the question and the call to action and faintly behind content; the same drawing in the .pptx, the PDF, present mode and the public site, and every text colour measured against the treatment it sits on.
- ✅ **Brand kit** per workspace — accent colour, logo, name — applied to
  every download, with a preview on light and dark and the measured
  contrast of the accent on each theme (a pale accent keeps the rules and
  bands; labels stay dark).
- ✅ **Pro subscription, 2 500 ₽ a month, paid by card through Т-Банк**
  (`/billing`, «Тариф»): the hosted payment form, a 54-ФЗ receipt to the
  account's e-mail, the card saved and charged again a day before the
  paid month ends; auto-renewal switched off (and back on) in one click,
  the paid month runs to its end; three days of grace after a declined
  renewal before the tier drops, with the page saying what to do. Payment
  history on the page. A locked `.pptx` in the download menu links to the
  tariff page instead of downloading a 403.
- ✅ **Style learning** (off by default, one switch on the Brand page): new
  talks are written in the manner of the ones you marked «Готово» — notes
  depth, phrasing, tone — never their content, and never across workspaces.

## Operator

- ✅ **Immutable images built in CI** for the API and the web bundle, each
  carrying its build version (`/health`, `/version.txt`); a pull-based
  `deploy.sh` with a CI gate, image guard, one-shot migration, rolling
  restart and version assertions. 📋 A first deployment — needs a VM, a
  registry and a domain.

- ✅ **Billing as a deployment profile**: `BILLING_ENABLED`, terminal key
  and password, `PUBLIC_API_URL` for the webhook, `TBANK_TAXATION` /
  `TBANK_VAT` for receipts. Two leased jobs (renew, expire) every 6 h;
  every payment row and the last webhook body kept for incidents;
  `talk_events` rows `subscribed · renewed · payment_failed ·
  renewal_failed · auto_renew_on/off` with the amount and the order.
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
