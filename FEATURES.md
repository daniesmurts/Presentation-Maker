# Tezarium — what exists

Legend: ✅ shipped · 🚧 in progress · 📋 planned. Grouped by the role that
uses it. A 📋 item is marked, never implied. See `docs/WORKFLOW.md` §1.

Last updated: «Скажите первую минуту» — the landing demo: speak, see how you spoke, see the plan

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
- ✅ **«Скажите первую минуту» — the landing demo, no account.** The
  hero's one solid button is a microphone: say the first minute of a talk
  you actually have to give (or type it — Firefox, a denied mic, an
  unreachable engine). The browser listens and counts (time, words per
  minute with the rehearsal's pace verdict, filler words with the three
  worst); one token-gated call builds the plan of the deck it would make
  — a title and five slides, typed in like the replay. «Сохранить и
  продолжить» → register → the app opens a draft with the plan as the
  card and the minute as the first message, and the editor has already
  pulled out the theses. Bounded four ways (20 s-old single-use token,
  3/h per IP, 500 plans a day platform-wide, the global spend cap); the
  transcript is never stored. Funnel in `talk_events` (`try_*`) and as
  Metrika goals.
- ✅ **Talk it through first («Наброски»).** A conversation with the
  editor — spoken or typed: a microphone in the composer puts what you
  say into the box as text (the browser's own recognition, same as the
  rehearsal) to read and correct before sending, and the editor flags
  likely mis-hearings itself. A new account's first screen leads here
  («Рассказать редактору»), the form one link away. The editor — a speechwriter and copywriter who works only on what you will
  say or show, and declines everything else in character — that fills in
  a card beside it: topic, intent, audience, length, the theses in order,
  the tone, what it still wants to know. Every field on the card is
  editable and the next turn sees the edit; any message of yours can be
  edited too — the conversation re-runs from it, so a transcribed
  «pretty stainless» becomes «predestined» in the theses, not just in
  the bubble. «Собрать выступление» posts
  the card as the talk request and lands on the outline gate — nothing a
  draft can build that the form could not. Three starter chips for a cold
  start; 40 turns a day free, 400 on Pro. Pasting material as a message
  works; uploading a file into a draft does not yet. *(step 1 of the
  draft plan; steps 2–4 in TODO N)*
- ✅ **«Как пользоваться»** — nine short explainers on the public site
  (`/help`), one per thing that is not obvious: the outline gate, the
  editor, «только по моим материалам», the «Много текста» flag, the share
  link, brand vs theme, what stays editable in the `.pptx`, what an
  import brings across. Each is linked «Подробнее» from the control it
  explains; the footer links the index. Not a knowledge base — article
  nine comes from support messages.
- ✅ **Approve the outline before writing.** The plan (type +
  title + brief per slide) comes back first; reorder, retype, add, delete,
  then confirm to expand. A plan left unconfirmed for 24 h expires.
- ✅ **Only from my material.** With a brief supplied, the
  talk contains only what the brief says — fewer slides rather than
  invented content.
- ✅ **Sign up / sign in** with e-mail and password; one workspace per
  account. «Запомнить меня» keeps a session for 60 days instead of 7.
  Forgot-password sends a one-hour reset link. New accounts get an
  e-mail-confirmation link (a dismissible banner, never a block on using
  the product) — 📋 nothing is gated on verification yet.
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
  at its true aspect ratio.
- ✅ **Draw a picture for a slide** («Нарисовать») — from a prompt the app proposes from the slide and the theme (what is shown, then the manner and the theme's colours in words), editable before drawing; and «Нарисовать картинки» for the whole talk — every picture slide and schematic without one, up to eight at a time. About 2 ₽ a picture, counted against the workspace's spend cap. Needs the YandexART credentials in the environment; without them the controls are not shown. 📋 Image search (a real photo of a real thing) is still open. *(TODO B)*
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
  Pasted into Telegram/WhatsApp/iMessage/Slack it shows a real card — the
  talk's title, slide count, and first picture, served to those scrapers
  specifically (they don't run JS, so the app itself can't do this).
- ✅ **Present mode** — full-screen slides with keyboard/click navigation,
  and a speaker window (current slide, notes, next slide, timer) that stays
  in step on a second screen.
- ✅ **Rehearsal («Репетиция»)** — the speaker view with a microphone.
  Talk through the deck; the browser's own speech recognition (Chrome,
  Yandex Browser, Edge, Safari; Russian and English) turns it into words,
  each phrase stamped with the slide it was said on, and nothing but text
  ever reaches the server. The report: time per slide against the plan
  (the talk's duration split by how much speaker text each slide carries),
  slides that ran over 1.5× marked, words per minute, filler words («ну»,
  «вот», «как бы» — um, uh, like), the transcript per slide. A browser
  without recognition still gets the timings. Rehearsals are kept per
  talk; the last one is linked from the talk header.
- ✅ **Rehearsal that compounds.** Each report says which run this is
  («Репетиция 3 из 3») and what changed since the last one, in the units
  a speaker thinks in — time toward the plan, fillers per hundred words,
  pace into the comfortable band, slides over budget — with a one-line
  verdict («лучше по 3 из 4»), never a score; and a table of every run.
  After the real thing the talk page asks once, «Уже выступили? Как
  прошло:» — one tap, stored with how many rehearsals preceded it, which
  is the number the feature is ultimately measured by.
- ✅ **Rehearsal review** — one pass over the rehearsal: per slide, was the
  speaker's text covered / partial / skipped, which points did not get
  said, what was added, one-sentence verdict; an overall summary with
  strengths and «до выступления» to-dos; and «как вы это сказали» — the
  speaker's text rewritten the way it was actually said, applied to any
  chosen slides in one write with a one-step undo. Free: one review a
  month; Pro: unlimited (recording and timings are never metered).
- ✅ **Rewrite the whole talk from one instruction** («формальнее»,
  «короче») — you see old and new side by side per slide and accept only
  what you want; one-step undo after applying.
- ✅ **Mark a talk «Готово».**
- ✅ **Invite a friend, earn free Pro time** — a personal link (20% off
  their first month for them, 30 days of Pro for you once they pay);
  full card with the counts on the tariff page, plus a compact, dismissible
  pitch on the talks list itself (the page people actually keep opening) so
  it isn't buried somewhere most accounts visit once.

## Paid tier

- ✅ **Native editable `.pptx` download** — 16:9, a layout per slide type,
  formulas typeset as images, speaker notes in the notes pane; `?slides=`
  downloads a subset.
- ✅ **Fourteen slide types with a rhythm** — title, agenda, section, bullets, concept, formula, comparison, diagram, stats (one to three big figures), quote, image-full (a picture with the title on it), discussion, call to action, summary. The plan decides the pace (an agenda, a section break every 5–8 slides, a figure or a quote after a heavy slide) and how each slide looks — one or two columns, one big number or three, the figure in the accent or the ink, one slide per part lifted onto the theme's background — and every one of those choices is editable on the slide.
- ✅ **Twelve themes** (Тезариум, Тёмная, Тёплая, Яркая, Газета, Монохром, Лес, Океан, Песок, Сирень, Графит, Игра), chosen per talk — one composition (title low-left under an accent rule, hairline under content titles, «01 / 05» footer, formula and «Что дальше» panels, the question as a large italic), twelve palettes, each with a background treatment (graph-paper grid, soft blobs, a warm wash, an amber wedge) drawn at full strength behind the title, the question and the call to action and faintly behind content; the same drawing in the .pptx, the PDF, present mode and the public site, and every text colour measured against the treatment it sits on.
- ✅ **Your own theme** — one per workspace, from a description («финтех, спокойно, тёмная»), from the brand colour (light or dark), or from your own .pptx (its colours and faces, not its layout). Every proposal is checked for readability, corrected where it fails, and the corrections are shown before you save; then it is one more theme to pick on a talk.
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
  tariff page instead of downloading a 403. Before paying with a saved
  card the page states the amount today and the monthly amount after, and
  the buyer ticks an (unticked) consent box themselves; the ticked
  sentence, time and address are kept per payment. An «Отмена и возврат»
  block: cancellation is the button, refunds within 14 days of an unused
  period via the contact form or e-mail, answered in 2 working days.
  Letters on subscription start, each renewal, and a failed renewal.
  Public «Условия подписки» at `/legal/subscription`.
- ✅ **Style learning** (off by default, one switch on the Brand page): new
  talks are written in the manner of the ones you marked «Готово» — notes
  depth, phrasing, tone — never their content, and never across workspaces.

## Operator

- ✅ **Admin panel** at `/admin` for the e-mails in `ADMIN_EMAILS` (the only
  way to become one). An overview (people, activity, Pro count, this
  month's talks, exports, model spend and payments, open support, failed
  jobs), a searchable workspace list, a workspace page (users and consent,
  talks, payments, spend by month, jobs, event timeline) and the support
  inbox with an open/all filter. Writes, each requiring a reason and
  recorded in an audit journal: grant or revoke Pro (a gift never renews
  the card and never counts against a live subscription), set a
  workspace's spend cap, deactivate or reactivate a user, mark a support
  message answered. A promo-codes tab: create/deactivate percent, fixed,
  or free-months codes and see how many times each was redeemed. A
  referrals tab: who invited whom, paid, was rewarded, or hit the cap.
  A health tab: stuck and failed jobs, model-provider error rate and cost
  over 24 h, spend and product usage by day over two weeks — the page for
  «сломалось». TODO M is complete.
- ✅ **Promo codes**: a code on the tariff page discounts the first month's
  T-Bank charge (percent or a flat amount, never below ₽1) or, for a
  free-months code, grants Pro immediately with no payment at all — works
  even when card billing isn't configured. One redemption per workspace
  per code.
- ✅ **Referrals**: every account has a personal invite link on the tariff
  page. Whoever signs up through it gets 20% off their first month, no
  code to type; once they pay, the referrer gets a month of Pro free.
  Capped at 12 rewards a year per referrer.
- ✅ **Public contact / tech-support form** at `/contact` on the landing
  site, no account needed. Submissions (name, email, category, message)
  land in `support_messages` and show in the admin's support inbox, and
  are mailed to the operator (founder alerts, below).
- ✅ **Founder alerts by e-mail**: a short letter to `FOUNDER_ALERT_EMAILS`
  (default `ADMIN_EMAILS`) on every new account (e-mail, name, password or
  Яндекс ID, referral or not), every confirmed Pro payment (buyer, amount,
  promo, paid-until, order) and renewal, every refund (with what it did to
  Pro), every declined renewal (streak, whether auto-renew went off), every
  support-form message (full text) and every free-months promo redeemed.
  Same transport as the transactional mail, so it needs `UNISENDER_API_KEY`;
  nothing configured → nothing sent. Admin-panel grants are not alerted —
  the admin is the operator.
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
