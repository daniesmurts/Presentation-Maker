# Changelog

Engineering log — what changed and, above all, *why*. Dated sections are
dated by when they reached production. Format: `docs/WORKFLOW.md` §2.

## [Unreleased]

### Added
- **Rehearsal mode («Репетиция») — the talk, not just the slides.** The
  positioning claims the speaking («от тезисов — к выступлению») and the
  product stopped where slide generators stop; this is the first feature
  that only makes sense for someone who will stand up and say it. Decisions:
  - **The browser recognises, the server reads.** Web Speech API in the
    rehearse page (`lib/speech.ts`, restarted on every `onend` because
    continuous mode gives up after silence); the page logs *visits* (which
    slide, from when to when) and *segments* (each finalised phrase,
    stamped with the slide index) and posts text only. No audio upload, no
    speech vendor, no consent question beyond the mic prompt — and the
    intro card says so. Firefox has no recogniser: the rehearsal still
    records timings, the copy says why the review is unavailable.
  - **Two halves, two costs.** Metrics (`services/rehearsal.ts`
    `computeMetrics`) are arithmetic on save: per-slide time against a
    target that splits the talk's duration by speaker-text length (a
    section divider is not owed a minute), over at 1.5×, wpm over time
    on slides, fillers by whole-word match with multi-word ones first
    («как бы» is not a stray «как»). The review is a model pass
    (`rehearsal_review`), batched six slides per call like expansion,
    aligned by the slide number the model echoes, silent slides never
    sent. Free tier: one review a month (`rehearsalReviewsPerMonth`);
    Pro unlimited — the review is the half worth paying for, the timings
    are the half that makes people come back.
  - **The transcript is user input entering a prompt** (§3.4): sanitised,
    cut at 6 000 chars per slide, and the system prompt says it is data.
  - **«Как вы это сказали» replaces notes, undoably.** The rewritten
    notes are applied per chosen slide through one write that returns the
    previous slides, same shape as the deck rewrite's undo.
  - Measured on the first real run: a 4-phrase rehearsal reviewed for
    $0.001 (two calls, 1 055 output tokens); a full 20-slide rehearsal is
    four batches plus a summary, ~$0.02.
  - **Talk toolbar regrouped** while adding the button: nine controls in
    one wrapping row, three of them bare text (§6: an action without a
    border reads as a caption). Now three groups — the talk (theme,
    «Готово») · «Переделать всё ▾» (rewrite, draw pictures — two
    whole-deck model actions under one chip; «Изменить» was tried and
    collides with the per-slide «Изменить») · use it (show, rehearse,
    share, download, «⋯» with delete — destructive and rare, it does not
    earn a slot next to the CTA). Every action a bordered chip, one solid
    CTA. Measured: first slide still above the fold at 1280×800.
  - Help article `/help/rehearsal` — the microphone question will recur:
    where the audio goes (the browser's recogniser, not us), what the
    numbers mean, how to rehearse so the review has something to compare.
    Linked from the intro card and the review card.
  - **Admin overview tile** «Этот месяц: репетиций» — runs, reviews,
    distinct workspaces, notes replaced. The workspaces number is the one
    to watch: the feature is a bet on a habit, and a habit shows up as
    the same workspaces coming back, not as a run count.
  - **Privacy policy amended** (§1 a new row, §6.1 the transcript named
    among what reaches the model provider, §8 retention) and
    `LEGAL_VERSION` / `TERMS_VERSION` bumped to 2026-09-16. The policy's
    own §11 promises re-consent «при следующем входе» when purposes or
    recipients expand; recipients did not (same provider), the data did.
    There is no re-consent prompt in the app yet — the feature is opt-in
    per use behind the browser's own microphone prompt and an intro that
    says where the words go, which is the honest reading; a re-consent
    banner keyed on `terms_version` is the mechanism to build if a
    lawyer says otherwise.
  - Vitest quirk worth recording: `beforeEach(() => mock.mockReset())`
    returns the mock, which vitest calls as a cleanup — one phantom call
    with no arguments after every test. Braces.
- **Founder alerts — an e-mail to the operator on every signup and every
  Pro payment.** `/admin` shows it all, but only when opened; the founder
  wanted to *hear* about the first paying customers as they arrive.
  `services/founderAlerts.ts`: one short letter (subject «Новая
  регистрация» / «Купили Pro» / «Pro продлён», a table of the facts) to
  `FOUNDER_ALERT_EMAILS`, falling back to `ADMIN_EMAILS` — the person who
  can open the admin panel is the person who wants the ping. Rides the
  existing Unisender transport; fire-and-forget on both call sites, which
  matters most in `applyOutcome`: a mail failure inside the T-Bank webhook
  would return non-200 and make T-Bank retry a payment we had already
  applied. Display names are escaped into the HTML (user input). The
  operator's own registrations are skipped. Not analytics — `talk_events`
  still carries the record; this is only the doorbell.
  Same day, the rest of the doorbell: refunds (the letter states the
  *effect* — full refund of the current period revokes Pro, a partial or
  past-period one doesn't — because that rule lives in `applyOutcome` and
  the T-Bank cabinet doesn't know it), declined renewals (streak and
  whether auto-renew switched off), `/contact` submissions (full text,
  escaped — the inbox stays the record, this closes the «no notification
  yet» note in FEATURES), and free-months promo redemptions (Pro without
  a payment, so the payment alert would never fire). Admin grants are
  deliberately not alerted: the admin is the person who'd receive it.
- **«Как пользоваться» — eight explainers on the site, linked from the
  controls.** Decided against a knowledge base: the §6 rule (explanation
  lives at the control) came out of user testing, there are no external
  users yet to tell us which forty topics matter, and a wiki's screenshots
  rot with every release. So: eight articles on `landing/` (`/help/<slug>`,
  Astro, markdown-free prose in the site's own layout — `Article.astro`
  is `Legal.astro` without the version line), each reachable by a
  «Подробнее» link at the control it explains (`HelpLink`, same origin,
  new tab) and public because the topics are what people search («текст
  докладчика к слайдам»). The list lives once in `landing/src/data/help.ts`;
  `Field`/`Checkbox` hints accept a node now so a link can sit in one.
  The share and «Много текста» pills carry a «?» to their articles. Nine
  onward waits for `support_messages`.
- **Drafts («Наброски») — talk it through with the editor before the
  form.** The new-talk form assumes the user already knows what they want
  to say; the people the product is for often do not. A draft is a
  conversation on one side and a *card* on the other — the same fields
  the form asks for plus the theses in order — that the editor fills in
  with every reply. Decisions worth recording:
  - **The card is the deliverable and the memory.** One `chatJSON` call
    per turn returns `{reply, card}`; only the last 12 messages travel in
    the prompt, the rest is present through what it changed on the card
    (a 40-message Cyrillic history would cost more per turn than the
    outline call, §3.3). The stored history is capped at 80 messages.
  - **Hand-off is one click past the form**: `POST /drafts/:id/talk`
    turns the card into the body `readGenerateParams` reads — the same
    validation, quota and spend-cap checks as the form — and lands on
    `/jobs/:id` at the outline gate. `draftMissing()` is shared, so the
    button is never enabled for a card the server would refuse.
  - **Scope is one system prompt, no classifier.** The editor works only
    on what will be said or shown, declines everything else in character
    and turns the conversation back. A classifier in front would double
    the cost of every turn to catch what the prompt already catches. User
    text is sanitised on every turn (§3.4).
  - **Normaliser keeps `prev` on anything malformed** — a model that
    forgets a field, or returns `theses: "…"` instead of a list, must not
    wipe what the user said three turns ago; an explicit `null` on a
    nullable field does clear it (unpicking the audience is a real edit).
  - **The card's save echo does not overwrite the card being typed** — the
    server drops empty thesis lines, which is exactly the line the cursor
    is on after Enter; found in the first browser check.
  - **Gate: turns per day** (`draftMessagesPerDay`, from `usage_log`
    feature `draft_chat`: 40 free / 400 Pro), because a conversation is
    many small calls and a month's quota burned in one evening is what a
    runaway client does. The spend cap stays the money guard.
  - The noun is «набросок», not «черновик»: the talks list already calls
    an unapproved talk a черновик. The assistant is «редактор» — what it
    does, not what powers it (§1).
  - Migration 024 (`drafts`: messages and card as JSONB, `job_id` set on
    hand-off — the talk exists only after expansion, the job row carries
    its id). Rail item «Наброски», a chip on the talks list, a line under
    the form.
- **Consent to recurring charges, refund contacts, subscription terms —
  T-Bank's conditions for enabling Recurrent/Charge** (their letter,
  2026-09-16: «покупателю нужно указать сумму и периодичность списания
  перед оплатой … чек-бокс согласия, который покупатель заполняет
  самостоятельно», and «форму обратной связи либо контакты для
  обращения по возврату или отмене»). What changed and why it is shaped
  this way:
  - The «save card» box was on by default and doubled as consent. Now
    save-card chooses the mode and a *second*, unticked box carries the
    consent sentence; the button stays disabled until it is ticked. The
    sentence comes from the API (`recurring_consent_text`) and is stored
    on the payment row with the time and `req.ip` (migration 023) —
    the answer to a chargeback is a row, not a claim. `POST /checkout`
    with `save_card` and no `recurring_consent:true` is a 400, so a
    client that skipped the page cannot save a card either.
  - A terms block above the button says «Сегодня: X ₽ · Далее: 2 500 ₽
    каждый месяц …» — with a promo, X differs and the block says the
    discount is for the first month only. One-time mode says «карта не
    сохраняется, списаний больше не будет».
  - «Включить автопродление» became «… — 2 500 ₽ в месяц» with a line
    under it; clicking it stamps `workspaces.recurring_consent_at` and
    the `auto_renew_on` event carries the sentence.
  - Refund rule decided: the latest charge is refunded in full on request
    within 14 days if the paid period was unused; otherwise the period
    runs out. On the billing page, on `/legal/subscription` (new, linked
    from the footer, terms §6.2, the pricing block, the FAQ, the contact
    page), and in every subscription e-mail. `/contact?category=billing`
    preselects the topic.
  - E-mails on subscription start, renewal and failed renewal — each
    restates amount, period, how to cancel, how to ask for a refund.
    Fire-and-forget from the webhook path: a mailer outage still returns
    `OK` to T-Bank (tested).
  - Admin workspace page: a «Согласие» column on payments (time · IP).
  - Verified locally: box unticked → button disabled; ticked → row with
    sentence/time/IP; one-time mode → no consent recorded; server 400
    without consent; signed CONFIRMED replay → Pro + rebill id; landing
    builds, `/legal/subscription` renders, contact preselects billing.
    Still to do before writing back to T-Bank: fill `operator.ts` (the
    reviewer will see highlighted placeholders), deploy.
- **Email confirmation, password reset, and "remember me".** Decided
  2026-09-16, ahead of onboarding the first real users: registration
  created and logged a user in with zero proof they own the address, and a
  locked-out user had no self-service recovery at all — not partially
  built, completely absent on both counts.
  - **Verification is a soft gate**, not a hard one: it never blocks signup
    or login, only a dismissible (per-tab) banner with a resend link. A
    stateless HMAC token (`services/emailVerification.ts`) — the MAC covers
    the email address, not just the user id, so a verify link stops
    working if the account's email ever changes; it never otherwise
    expires. `GET /api/auth/verify-email` redirects straight to
    `?verified=1|0` rather than the Teaching-assistant sibling's stricter
    GET→confirm-page→POST dance — there is no pre-registration window here
    for a mail-scanner prefetch to hijack, since the account already
    exists and its owner is already the one logged in.
  - **Password reset** is a random 32-byte token, SHA-256 hashed at rest,
    single-use, 1-hour expiry, with the forgot-password endpoint always
    returning the same response regardless of whether the address is
    registered (no enumeration). `/forgot-password` and `/reset-password`
    are deliberately **not** gated on being logged out — a reset link is
    clicked exactly when a stale session in the same browser (another tab,
    another account) is most likely to be sitting there, and it must not
    stand in the way.
  - **"Remember me"** on login trades the fixed 7-day session cookie for a
    60-day one; both are the same signed JWT, only `expiresIn` and the
    cookie's `maxAge` change together (`lib/jwt.ts`, `lib/session.ts`).
  - **Email provider: Unisender Go**, the same one the ИСПУМ sibling runs
    on in production (`services/emailTransport.ts`, ported pattern, no
    second vendor introduced for one sibling product). No API key
    configured → every send is logged instead of thrown away or crashing
    startup, so local dev and CI read the verify/reset link straight out
    of the log line.
  - Migration `021_email_verification_and_reset.sql`: `users.email_verified_at`
    (NULL for every account created before this, including all of today's —
    expand-only, no backfill implied) and `password_reset_tokens`.
  - Verified end to end locally: registered a throwaway account, confirmed
    the unverified banner, computed the HMAC link the way the backend does
    and hit it — banner cleared, `email_verified_at` set in the DB;
    requested a reset, read the raw link from the dev-fallback log, reset
    the password through the UI, confirmed the old password token can't be
    reused (`VALIDATION_ERROR`) and the new password logs in. Along the
    way, found and fixed two real bugs: local `.env`'s `FRONTEND_URL` was
    stale at port 5173 (collided with the unrelated ИСПУМ dev server also
    running on this machine — Tezarium's frontend is deliberately 5174,
    per the comment in `vite.config.ts`), which sent the verify-email
    redirect to the wrong app entirely; and `/reset-password` was gated
    behind "no active session," which is backwards for exactly the
    scenario the page exists for.
- **Split-screen redesign of login/register/password-reset** (2026-09-16):
  the auth pages were a plain stacked form on blank paper. A new
  `AuthShowcase` panel (desktop only) carries the brand, a CSS-drawn
  slide-stack mockup, and three capability callouts each mapped to a
  real shipped feature — not marketing copy. Kept the existing
  «Редакция» tokens rather than the generic glass-morphism/pink-accent
  look a default design-system search suggested; that would have thrown
  out an already-measured, tested system for a trend that doesn't fit.
- **Yandex Metrika, on the app and the landing site** (2026-09-16): two
  different integrations because they're two different navigation
  models. `landing/` (Astro) does real page loads, so the plain snippet's
  auto pageview is correct as-is. `frontend/` (React Router) never
  reloads the page, so `lib/metrika.ts` inits once and fires a manual
  `hit` on every route change instead — otherwise the whole app session
  would count as one pageview. No webvisor (session/DOM recording) in
  the app, since its screens show the user's own тезисы and slide text
  while they type it; landing keeps it, nothing there is user-typed.
  Counter id is a Dockerfile build ARG (`METRIKA_ID`), same shape as the
  existing `BUILD_VERSION` — Vite/Astro env vars are compile-time.
- **Sign in / register with Yandex ID** (2026-09-16): standard OAuth 2.0
  authorization-code flow (`services/yandexOAuth.ts`). An existing
  password account whose email matches gets the Yandex id linked (email
  marked verified — Yandex vouches for it) instead of a second account;
  `password_hash` is now nullable (migration `022_yandex_oauth.sql`) for
  Yandex-only accounts, and the password-login route treats "no password
  hash" the same as "wrong password" so account existence stays
  indistinguishable from outside either way. No checkbox to gate consent
  on before a redirect leaves the app, so the button carries a proximate
  disclosure line instead, recorded server-side the same way
  (`recordTermsAcceptance`) when a new account is actually created. Off
  by default: `GET /api/auth/providers` reports whether
  `YANDEX_OAUTH_CLIENT_ID`/`SECRET` are configured, and the frontend only
  renders the button when true.
- **Social-share cards for shared talk links** (2026-09-16). Audit
  turned up that `/s/:token` — the read-only "share a deck, no account
  needed" link, arguably the single most shareable artefact in the
  product — produced no preview at all when pasted into Telegram,
  WhatsApp, iMessage, or Slack: it's 100% client-rendered React, and none
  of those scrapers execute JS, so the SPA's (nonexistent) client-set
  `<title>` was invisible to them. `frontend/index.html` itself carried
  zero OG tags either, so even a generic site-wide fallback was missing.
  Fixed with a bot-only route: `deploy/Caddyfile`'s new `@sharebot`
  matcher sends known crawler user agents on `/s/*` to
  `routes/shareCard.ts` (mounted at `/s`, deliberately separate from the
  JSON `sharedRouter` at `/api/shared`) — real server-rendered HTML with
  the talk's actual title, pluralised slide count, and first slide's
  picture (through the same token-scoped, unauthenticated media proxy
  `shared.ts` already exposes), falling back to the site's `/og.png`
  when a talk has no pictures. Every other request on `/s/*` — i.e. every
  human — still gets the ordinary SPA, completely unchanged.
  `frontend/index.html` also got a static site-wide fallback card for
  every other app URL. `landing/`'s own OG setup was already correct —
  `og.png` (1200×630) exists and every page already carried real
  og:title/description; `TODO.md` had a stale note claiming otherwise.
  Verified against a real local talk end to end: `GET /s/:token` from a
  bot's vantage point returns the exact title, correct Russian plural
  slide count, and the right fallback image; 8 new unit tests cover the
  image-resolution branches (top-level image, diagram body.image,
  no-image fallback) and HTML escaping.
- **Referral pitch on the talks list, not just the tariff page** (2026-09-16).
  The full card (link, copy button, invited/paid/rewarded counts —
  `ReferralCard.tsx`) has lived on `/billing` since TODO M phase 4, but
  that's a page most accounts open once. `ReferralBanner.tsx` puts the
  same numbers, one line, on `/talks` instead — the page people actually
  keep coming back to. Every reward is immediate per converted friend
  (no "invite N people" threshold to count toward), so the line states
  what's true rather than faking a progress bar: nothing invited yet →
  the pitch; someone invited but not yet paid → the count and what
  happens next; at least one reward → how many free days already
  earned. Dismissible and persisted (`localStorage`), same as the
  onboarding cards (CLAUDE.md §6) — the point is surfacing it where
  people actually look, not nagging once they've seen it. Off entirely
  when billing is off in this installation (`user.features.billing`),
  same gate the rest of the app already uses.
  Considered and rejected: a permanent sidebar section with levels/badges.
  A persistent panel competes with the page's actual job — open or start
  a talk — every single time; levels imply an ongoing meta-game (names,
  thresholds, badges) that clashes with the calm, editorial tone the rest
  of the product works to keep.
  Verified in the browser against real referral rows in all three states
  (0 invited, 1 invited pending, 1 rewarded) — each renders the right
  copy; dismissal persists across a reload; tsc clean, 27 frontend tests
  pass.

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
- **«Как пользоваться» — eight explainers on the site, linked from the
  controls.** Decided against a knowledge base: the §6 rule (explanation
  lives at the control) came out of user testing, there are no external
  users yet to tell us which forty topics matter, and a wiki's screenshots
  rot with every release. So: eight articles on `landing/` (`/help/<slug>`,
  Astro, markdown-free prose in the site's own layout — `Article.astro`
  is `Legal.astro` without the version line), each reachable by a
  «Подробнее» link at the control it explains (`HelpLink`, same origin,
  new tab) and public because the topics are what people search («текст
  докладчика к слайдам»). The list lives once in `landing/src/data/help.ts`;
  `Field`/`Checkbox` hints accept a node now so a link can sit in one.
  The share and «Много текста» pills carry a «?» to their articles. Nine
  onward waits for `support_messages`.
- **Drafts («Наброски») — talk it through with the editor before the
  form.** The new-talk form assumes the user already knows what they want
  to say; the people the product is for often do not. A draft is a
  conversation on one side and a *card* on the other — the same fields
  the form asks for plus the theses in order — that the editor fills in
  with every reply. Decisions worth recording:
  - **The card is the deliverable and the memory.** One `chatJSON` call
    per turn returns `{reply, card}`; only the last 12 messages travel in
    the prompt, the rest is present through what it changed on the card
    (a 40-message Cyrillic history would cost more per turn than the
    outline call, §3.3). The stored history is capped at 80 messages.
  - **Hand-off is one click past the form**: `POST /drafts/:id/talk`
    turns the card into the body `readGenerateParams` reads — the same
    validation, quota and spend-cap checks as the form — and lands on
    `/jobs/:id` at the outline gate. `draftMissing()` is shared, so the
    button is never enabled for a card the server would refuse.
  - **Scope is one system prompt, no classifier.** The editor works only
    on what will be said or shown, declines everything else in character
    and turns the conversation back. A classifier in front would double
    the cost of every turn to catch what the prompt already catches. User
    text is sanitised on every turn (§3.4).
  - **Normaliser keeps `prev` on anything malformed** — a model that
    forgets a field, or returns `theses: "…"` instead of a list, must not
    wipe what the user said three turns ago; an explicit `null` on a
    nullable field does clear it (unpicking the audience is a real edit).
  - **The card's save echo does not overwrite the card being typed** — the
    server drops empty thesis lines, which is exactly the line the cursor
    is on after Enter; found in the first browser check.
  - **Gate: turns per day** (`draftMessagesPerDay`, from `usage_log`
    feature `draft_chat`: 40 free / 400 Pro), because a conversation is
    many small calls and a month's quota burned in one evening is what a
    runaway client does. The spend cap stays the money guard.
  - The noun is «набросок», not «черновик»: the talks list already calls
    an unapproved talk a черновик. The assistant is «редактор» — what it
    does, not what powers it (§1).
  - Migration 024 (`drafts`: messages and card as JSONB, `job_id` set on
    hand-off — the talk exists only after expansion, the job row carries
    its id). Rail item «Наброски», a chip on the talks list, a line under
    the form.
- **Consent to recurring charges, refund contacts, subscription terms —
  T-Bank's conditions for enabling Recurrent/Charge** (their letter,
  2026-09-16: «покупателю нужно указать сумму и периодичность списания
  перед оплатой … чек-бокс согласия, который покупатель заполняет
  самостоятельно», and «форму обратной связи либо контакты для
  обращения по возврату или отмене»). What changed and why it is shaped
  this way:
  - The «save card» box was on by default and doubled as consent. Now
    save-card chooses the mode and a *second*, unticked box carries the
    consent sentence; the button stays disabled until it is ticked. The
    sentence comes from the API (`recurring_consent_text`) and is stored
    on the payment row with the time and `req.ip` (migration 023) —
    the answer to a chargeback is a row, not a claim. `POST /checkout`
    with `save_card` and no `recurring_consent:true` is a 400, so a
    client that skipped the page cannot save a card either.
  - A terms block above the button says «Сегодня: X ₽ · Далее: 2 500 ₽
    каждый месяц …» — with a promo, X differs and the block says the
    discount is for the first month only. One-time mode says «карта не
    сохраняется, списаний больше не будет».
  - «Включить автопродление» became «… — 2 500 ₽ в месяц» with a line
    under it; clicking it stamps `workspaces.recurring_consent_at` and
    the `auto_renew_on` event carries the sentence.
  - Refund rule decided: the latest charge is refunded in full on request
    within 14 days if the paid period was unused; otherwise the period
    runs out. On the billing page, on `/legal/subscription` (new, linked
    from the footer, terms §6.2, the pricing block, the FAQ, the contact
    page), and in every subscription e-mail. `/contact?category=billing`
    preselects the topic.
  - E-mails on subscription start, renewal and failed renewal — each
    restates amount, period, how to cancel, how to ask for a refund.
    Fire-and-forget from the webhook path: a mailer outage still returns
    `OK` to T-Bank (tested).
  - Admin workspace page: a «Согласие» column on payments (time · IP).
  - Verified locally: box unticked → button disabled; ticked → row with
    sentence/time/IP; one-time mode → no consent recorded; server 400
    without consent; signed CONFIRMED replay → Pro + rebill id; landing
    builds, `/legal/subscription` renders, contact preselects billing.
    Still to do before writing back to T-Bank: fill `operator.ts` (the
    reviewer will see highlighted placeholders), deploy.
- **Referral fraud gates**, before the first deploy (TODO M follow-up).
  Migration 020: `users.signup_ip` and a `referrals.status` value
  `'blocked'`. Normalised-e-mail match (`+tag` stripped on any provider;
  dots stripped only for Gmail-family domains — everywhere else a dot is
  a different inbox) and the same signup IP inside a 60-minute window
  **block** the attach outright — no referral row is created, so there is
  nothing to discount and nothing to ever reward; the user sees nothing
  different. The same IP *outside* that window only **flags** it
  (`referrals.flagged`/`flag_reason`, visible in the admin tab) — a
  shared household or office isn't proof of abuse on its own. A shared
  saved card (`tbank_rebill_id` or `card_last4`) blocks only the
  *reward*, checked at payment time since a card is unknowable any
  earlier; the referee's own discount already used is not reversed.
  Fixed on the way: `index.ts` never called `app.set('trust proxy', 1)`,
  so `req.ip` read Caddy's own address for every request in production —
  silently defeating both this IP check and the pre-existing per-IP rate
  limiters on checkout and login. Verified locally: a same-IP signup
  moments after the referrer's was refused with no `referrals` row at
  all; a genuinely different IP (via `X-Forwarded-For`) attached clean; a
  same-IP signup made two hours later attached flagged — all three
  states rendered correctly in the admin referrals tab.
- **Usage and health, phase 5 — TODO M complete** (2026-09-16). A fifth
  admin tab, «Здоровье», the page for «сломалось»: `talk_jobs` by status
  with stuck jobs (untouched 15+ min — the worker's own timeout is
  shorter) and the last 20 failures with their message; `usage_log`
  grouped by model + account over 24 h (calls, error rate, last
  `error_code`, cost) and by day over 14 via a `generate_series` join, so
  a quiet day is a zero row rather than a gap; today's spend against
  `GLOBAL_DAILY_SPEND_CAP_USD` (`parseDailyCapUsd` reused from
  `globalSpendCap.ts`, not reimplemented); `talk_events`
  (`exported`/pptx,pdf, `image_generated`) plus `talks` (creation is not
  itself an event) pivoted per day over 14. No share/present row — neither
  is recorded as a `talk_event` yet, so the page shows what actually
  happens rather than a column that reads zero forever. Refreshes every
  60 s. Verified against the real local DB: job counts, provider stats and
  both 14-day tables matched `psql` by hand and the browser rendering
  matched the raw `GET /api/admin/health` response.
- **Referrals, phase 4** (TODO M). Migration 019: `workspaces.referral_code`
  (generated lazily, on first `GET /api/referrals/me`) and
  `referred_by_workspace_id` (set once, at registration); `referrals`
  (referrer, referee — `UNIQUE`, so one referral per referee ever —
  status `signed_up → paid → rewarded | capped | clawed_back`). A
  referral link **is** a `promo_codes` row (`owner_workspace_id` set,
  percent, unlimited uses, no expiry): the invitee's 20% discount runs
  through the exact same `validatePromoCode` → `startCheckout` →
  `promo_redemptions` path a marketing code does — auto-applied at
  checkout with no code to type (`owner_workspace_id IS NULL` keeps
  referral codes out of the campaign-codes admin list). The referrer's
  30-day reward is `planGrant` — the identical rule an admin's gift uses —
  fired on the referee's first **CONFIRMED** `initial` payment,
  independent of whether the discount was used (a referee who paid full
  price still earns it). Capped at 12 rewards per referrer per rolling
  year (`referrals.status='capped'` past the cap, not silently dropped);
  a full refund of the rewarding payment claws the grant back only while
  it's still standing (`plan_source='granted'`) — a referrer who has
  since paid for real is untouched. `?ref=CODE` on `/register`, kept in
  `localStorage` so a code from an earlier visit survives to a later
  signup; a bad or missing code never fails registration. A card on the
  tariff page (link, copy button, invited/paid/rewarded counts) and an
  admin referrals tab (funnel + row list). Verified end-to-end locally
  with two throwaway accounts and a hand-signed T-Bank notification (the
  real terminal is unreachable from this dev environment): case-
  insensitive attach on signup, an auto-applied 20% at checkout with zero
  code entry (2000 ₽ of 2500 ₽, `promo_code_id` set), the simulated
  webhook rewarding the referrer and finalising the promo redemption in
  one pass, and the admin tabs showing exactly that — the referral in
  `referrals`, absent from `promo-codes`.
- **Promo codes, phase 3** (TODO M). Migration 018: `promo_codes`
  (kind `percent | fixed | free_months`, value, max_uses, valid_until,
  active) and `promo_redemptions`, one redemption per (code, workspace) —
  a DB unique constraint, not just an app-level check. `percent`/`fixed`
  discount the initial T-Bank charge: `startCheckout` re-derives the
  amount from the code server-side (never trusts a client-supplied
  discount), so it's the number T-Bank actually charges and the 54-ФЗ
  receipt prints; the redemption is only recorded once `applyOutcome`
  sees the payment CONFIRMED, so an abandoned checkout never burns a use.
  A 1 ₽ floor (`MIN_CHARGE_KOPECKS`) means no code can charge ₽0.
  `free_months` skips T-Bank entirely — it calls the same `planGrant` rule
  an admin's gift uses (extend-if-paid, else grant-from-today), so it
  works even with billing off. New routes: `GET /api/billing/promo/:code`
  (read-only preview), `POST /api/billing/promo/:code/redeem`
  (free_months), `POST /api/billing/checkout` gained an optional
  `promo_code`; admin CRUD at `/api/admin/promo-codes` (codes are
  deactivated, never deleted — redemption history stays intact). Frontend:
  a disclosed promo field on the tariff page and an admin tab to create
  and manage codes. Verified end-to-end locally: 20%-off previewed
  2500→2000 ₽; a 1-free-month code granted Pro with no payment row and no
  T-Bank call, a second redemption was refused, the admin list showed the
  activation, deactivating pulled the code out of circulation immediately.
- **Admin panel, phase 2 — writes** (TODO M). Migration 017:
  `admin_actions` (admin, action, target, before/after JSON, a required
  reason — the panel's audit trail); `workspaces.plan_source` ('paid' |
  'granted') so a gift and a subscription are distinguishable — the renew
  job (`listDueForRenewal`) now skips a granted Pro (a gift is not a
  charge) and a confirmed payment resets the source back to 'paid';
  `users.deactivated_at`, refused by both `authenticate` and `/login`
  with a new `DeactivatedError` (403 `ACCOUNT_DEACTIVATED`) — data kept,
  152-ФЗ deletion is its own flow; `support_messages.answered_at/by`.
  `services/adminActions.ts` holds the rules: `grantPro` extends a live
  *paid* Pro and keeps it paid (the card still renews at the new date);
  anything else — free, lapsed, or already a grant — becomes a granted
  Pro counted from today, capped to 7/14/30/90/365 days. `revokeGrant`
  only ends a grant; a paid month is refunded in the T-Bank cabinet, never
  revoked from the panel. An admin cannot deactivate themselves or another
  admin — that role is `ADMIN_EMAILS`'s alone. Every write requires a
  reason (≥3 characters) client-side and server-side. Frontend: the
  workspace page grew an actions block (grant/revoke, spend cap,
  deactivate/reactivate per user) and a journal table reading
  `/api/admin/actions`; the support inbox got an open/all filter and an
  answered toggle that records and shows who answered. Verified end-to-end
  locally against a real DB and API: grant → revoke → spend cap →
  deactivate → login refused (403, confirmed by curl) → reactivate →
  login OK; support message answered then reopened with the admin's
  e-mail attached in the UI.
- **Admin panel, phase 1 — read only** (TODO M). Migration 016 adds
  `users.is_admin`; the role is owned by `ADMIN_EMAILS` (env): synced on
  every boot (granted to those, revoked from everyone else) and applied at
  registration, never set from a UI — so an admin cannot be locked out or
  created by another admin's mistake. `/api/admin/*` sits behind
  `authenticate` + `requireAdmin`, which answers **404, not 403**, to a
  signed-in non-admin: the panel's existence is not something a user should
  learn from an error code. Four reads over tables the product already
  writes (`db/queries/admin.ts`): an overview (users and new 7/30 d, active
  workspaces 7 d, Pro count, this month's talks / exports / model spend /
  confirmed payments, support messages, failed and stuck jobs), a
  workspace list (search by name or e-mail, tier filter, sort by created /
  last active / spend / talks, 50 a page), a workspace detail (users with
  their 152-ФЗ acceptance, talks, payments, spend by month, jobs, the
  last 100 events) and the support inbox with a `mailto:` reply. Pages
  `/admin`, `/admin/workspaces`, `/admin/workspaces/:id`, `/admin/support`
  in the same SPA behind a `RequireAdmin` route; a rail item that exists
  only for admins (desktop rail only — the bottom bar keeps its five); one
  more line in Caddy's `@app`. Nothing is tracked for the panel's sake and
  reads are not logged; `admin_actions` arrives with the first write in
  phase 2. Verified locally: boot sync granted the role, registration with
  a listed e-mail granted it, all four pages rendered real rows, a
  non-admin session got 404 and an anonymous one 401.
- **Public contact / tech-support form.** `landing/src/pages/contact.astro`
  (linked from the footer) posts to a new unauthenticated
  `POST /api/support/contact` (`routes/support.ts`, `supportRouter`), same
  posture as `sharedRouter`: rate-limited per IP (10 / 15 min), validated
  (`readContactParams`, tested), stored in a new `support_messages` table
  (migration 015) — no email sending or notification path yet, this is
  durable capture only. Works with no CORS wiring because the site and the
  API share one origin behind Caddy (`deploy/Caddyfile`); local dev across
  the two Vite/Astro ports needs `FRONTEND_URL` to include the site's
  origin to test the round trip in a browser.
- **Generated pictures — YandexART** (TODO B phase 3 / L3's last item;
  CLAUDE.md §5.4). `services/imageGen.ts`: one picture per call through
  Yandex AI Studio's OpenAI-compatible endpoint, model
  `aliceai-image-art-3.0`, JPEG back in ~3 s (1344 × 768 for 16:9); stored
  through the same `storeSlideImage` path as an upload, so the .pptx, the
  PDF, the stage and the share page need nothing new. Routes: the
  proposed prompt for a slide, generate for one slide (prompt editable),
  generate for the deck (image-full and diagram always, anything with a
  query, capped at 8, one failure does not stop the rest). Cost
  ($0.0183 per picture, `config/pricing.ts`) lands in `usage_log` as
  feature `image_generate`, and both spend caps run before the call.
  `talk_events` gains `image_generated` with `{slide, type}` /
  `{done, failed, of}` (§3.9). The controls appear only when
  `YANDEX_FOLDER_ID` + `YANDEX_API_KEY` are set.
  - *What the live setup taught (2026-09-15), in the module's header so
    nobody repeats it:* the URI alias `yandex-art/latest` answers «Access
    to model denied» with every role and scope in place (retired); the
    async `imageGenerationAsync` accepts `yandex-art-2.0` and then stays
    `done: false` for minutes; the key needs the scope
    `yc.ai.imageGeneration.execute` AND the account the role on the
    folder — a key scoped to language models passes YandexGPT and fails
    ART, which is how the first hour went.
  - *The prompt comes from the slide, not from the model — and was
    tuned on pictures, not on prose.* The first builder («calm, clean
    shapes, colours #0F6E6E and #FFFFFF, no text, no logos, no faces, no
    watermarks») produced two flat colour blocks: mood words and hex
    codes crowded out the subject. The one shipped: subject first, «flat
    vector illustration for a presentation slide», one manner clause per
    theme, the palette as colour NAMES (`colourName()` — twelve hue
    buckets, «кремовый» for tinted paper), one short negative. Three
    variants generated and looked at before it was written.
- **Design v3, layer 3 (first half) — twelve themes, one shared data file,
  a validator, a gallery** (TODO L3). Theme data moved to
  `shared/themes.ts`: the backend exports with it, the browser previews
  with it, the landing builds its deck from it — `Deck.astro` no longer
  carries a hand copy («keep in step» is gone). Eight new themes: Газета,
  Монохром, Лес, Океан, Песок, Сирень, Графит, Игра — each a different
  room on the same composition, each with its recipe, every pair measured
  by a script before it became code and re-measured by `themes.test.ts`
  (the Песок accent went A64B22 → 9A4219 for 4.24 on the panel; the Сирень
  dots 0.35 → 0.20 for ink2 at 4.0 on the hero ground). `validateTheme()`
  is the one gate every theme goes through, whatever wrote it — a row,
  a model, a brand kit, an uploaded deck: a failing pair is CORRECTED
  toward the ground's opposite (`pushUntil`) and reported, the recipe
  refitted last; the twelve rows pass it untouched, and the test says so.
  `npm run gallery:themes` renders one fixed 12-slide talk (every layout)
  in every theme to PDF + .pptx with an index — the page a theme is
  reviewed on before it ships. Colour arithmetic moved to
  `shared/color.ts` (the backend's `lib/brandColor` re-exports it).
  - *Sizes.* A blob raster was 263 KB at 1600 wide — a smooth ramp is
    high entropy for PNG — so gradients render at 1200 (≤ 184 KB; a blob
    deck carries ~350 KB of background, one photo's worth) and resvg
    paints the ground so there is no alpha to compress. The PDF embedded
    the raster on every page (12 pages of Графит: 763 KB); `openImage`
    once per role, 212 KB.
  - The site's theme row wraps at twelve chips instead of scrolling
    sideways.
- **Design v3, layer 3 (second half) — a theme from anywhere, one gate.**
  A workspace may keep ONE custom theme (`brand_kits.custom_theme`,
  migration 014, expand-only), picked on a talk as `theme_id = 'custom'`
  and carried to the exporters through the brand kit (a shared talk
  carries it too — the viewer has no account). Three ways to propose it,
  all on the brand page («Своя тема»), each returning a candidate with the
  validator's corrections by name, saved only on «Сохранить»:
  - *By description* — `generateThemeFromDescription`: the model answers
    with theme JSON (palette, two faces from an allow-list of what a .pptx
    carries unembedded, a recipe); `coerceTheme` fills what is missing
    from the light or dark base by the ground's luminance (a dark answer
    with no `panel` got the dark base's, not a white panel on black), then
    `validateTheme`. Feature `theme_generate` in usage_log, 600 tokens.
  - *From the brand accent* — `deriveThemeFromAccent`: the whole palette
    from one colour (ground tinted 3 % / 12 % toward it, ink pulled 15 %,
    a wash), light or dark, then validated — the brand kit as a derivation
    instead of an accent override; a pale accent comes back darker and
    says so.
  - *From an uploaded .pptx* — `extractPptxColorScheme` reads
    `ppt/theme/theme1.xml` (dk1/lt1 as `sysClr lastClr`, the rest
    `srgbClr`, the major/minor faces) → lt1 ground, dk1 ink, lt2 panel,
    accent1 (accent2 when accent1 is the ink). A brand SOURCE, never a
    layout source (TODO L). Checked against four real PowerPoint decks
    from ~/Downloads, not our own output (§9): Office blue 4472C4 clears
    white at 4.9 and fails the E7E6E6 panel at 3.9 — corrected to 3A61A7.
  - `accentText` corrections snap to white or black outright — the
    step-walk produced E8E9E9 on a darkened Office blue.

### Fixed
- **Text that does not fit now shrinks; it used to overflow** — the first
  real deck of Design v3 (2026-09-15, «Understanding Editorial Design»,
  opened in PowerPoint): a four-line section title over its kicker and
  rule, a header title touching the top edge, bullets running through
  «10 / 10» and off the slide, «04» in the agenda folded into «0 / 4». One
  cause: PowerPoint applies `normAutofit` only when a box is edited — on
  open, a box with more text than its height simply overflows, so
  `fit: 'shrink'` was doing nothing. The exporter now ESTIMATES lines
  (`shared/slideGeometry.ts` — `fitTitle`, `fitList`) and steps the size
  down until the estimate fits; the PDF does the same against pdfkit's
  real metrics (`shrinkToLines`, a `bullets()` that no longer drops the
  items past `maxY`); the stage runs the shared estimate, so the preview
  shrinks where the deck will. Glyph widths measured in the browser on
  the deck's own text: Georgia bold 0.59 em, regular 0.51, italic 0.53,
  Arial 0.505 — shipped as 0.62 / 0.55 / 0.56 with the wrap loss, on the
  wide side because an extra estimated line moves a rule down a little
  and a missing one is an overlap (0.55 for bold said «Мультисенсорный
  опыт: печать + цифра» was one line; it was two). Text boxes get
  `margin: 0` — pptxgenjs's 0.1 in inset was the «0 / 4», and no other
  renderer had it. Agenda rows are as tall as their text. A concept's
  definition is capped at three lines and its panel follows; the floor
  for a list is 0.7 × the size, past which slideFit's warning is the cue.
  And the model says the part twice — «Часть 2: …» with kicker «Часть 2»
  — so the normaliser moves the label into the kicker and `sectionTitle()`
  hides it on rows written before that.

### Added
- **Design v3, layer 2 — the model is an art director inside an enum;
  five slide types for rhythm** (TODO L2). A slide (and an outline row)
  may carry `design: { variant, emphasis, backdrop }` from a vocabulary
  the renderers own (`shared/slideDesign.ts`): `variant` per type
  (`bullets: plain | split`, `stats: three-up | hero-number`), `emphasis:
  accent | plain` for the slide's big element, `backdrop: none | pattern`
  to lift one content slide per part onto the hero background. Never a
  colour or a coordinate. Unknown values coerce to the type's default,
  and a default is not stored — rows written before L2 read the same.
  New types: `section` (a break: kicker · title · lead, the title slide's
  composition), `agenda` (numbered, two columns from five), `stats` (one
  to three figures, set in the DISPLAY face — Courier New at 68 pt reads
  as a typewriter), `quote` (the question slide's composition, the marks
  drawn by the layout and stripped from the model's text), `image-full`
  (the picture covers the slide, title and caption on a 65 % black scrim
  in white — its picture is the slide's top-level `image`, so no second
  `body.image` case spreads through the code). Drawn in all four places:
  .pptx, PDF, the stage, the card; editable in `SlideEditor` (a «Вид»
  row shows only the controls that change anything for the type).
  - *Rhythm is a property of the sequence, so the OUTLINE pass decides
    it.* The outline prompt gained the rules (`agenda` second from 8
    slides, a `section` every 5–8 from 10, one `stats` per part, one
    `quote` per talk, never two `image-full` in a row, a light slide
    after a heavy one) and asks for `design` per row; the expansion
    prompt asks the writer to copy it, and `applyOutlineDesign` makes the
    outline win when a batch came back slide-for-slide. Single-slide
    regenerate and the deck-level rewrite carry the design through the
    same path. The eval harness scores the rhythm (`scoreRhythm`:
    hero share, sections, named violations) so a prompt change that
    makes every slide a hero is a number, not an impression. Outline
    budget 90 → 120 tokens/slide (ru), 60 → 85 (en): the design object
    is ~25 ASCII tokens; 60 slides now sit at 8000 of the 8192 ceiling —
    the next field chunks the outline.
  - *Seen, not assumed* (§3.10) — three things the renders caught:
    pptxgenjs's `cover` reads the picture's proportions from `w`/`h` and
    the frame from `sizing` — passing the frame in both gave an srcRect
    of zeros, a stretch, so `w`/`h` now come from the bytes (§3.5); the
    PDF cut a two-line stat label to one (`maxLines` without the 2 pt
    lineGap the text is drawn with); and the bold `band` wedge met the
    header layout on a content slide lifted by `backdrop: pattern` and on
    a picture-less `image-full` — white on amber fails — so
    `backgroundRole` now takes the recipe: under a band `pattern` changes
    nothing, and an image-full with no picture is quiet. The agenda's
    numbering ran row-wise on the stage and column-wise in the exporters;
    the stage now chunks into columns like the others.
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
