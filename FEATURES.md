# Tezarium — what exists

Legend: ✅ shipped · 🚧 in progress · 📋 planned. Grouped by the role that
uses it. A 📋 item is marked, never implied. See `docs/WORKFLOW.md` §1.

Last updated: TODO A Phase 2 — web app: form, outline gate, viewer

---

## Anyone with an account (free tier)

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
- 📋 **Edit one slide.** Rewrite from an instruction («короче», «добавь
  числовой пример»), move, delete, insert — without regenerating the rest.
- 📋 **Images** — search, upload. *(TODO B)*
- 📋 **Import an existing `.pptx`.** *(TODO D)*
- 📋 **PDF export, partial export, read-only share link.** *(TODO F)*
- 📋 **Present mode with notes on a second screen.** *(TODO G)*

## Paid tier

- 📋 **Native editable `.pptx` download.** The pricing gate sits on the
  download and the talk count, not on generation. *(TODO A.3 builds it
  behind an allow-all stub; the tier check is TODO A.5)*
- 📋 **Brand kit and themes.** *(TODO E)*
- 📋 **Style learning from approved talks.** *(TODO G)*

## Operator

- 📋 **Spend cap per workspace, usage log per model call.** *(TODO A.5)*
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
