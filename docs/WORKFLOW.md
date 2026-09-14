# How this project is worked on

The method behind ИСПУМ, carried into Tezarium so the new project starts
with it instead of re-deriving it. Everything here is descriptive — it is how the
repo actually looks after ~4 months — not aspirational.

The one-sentence version: **four markdown files are the memory of the
project, every commit updates the ones it touches, and the writing in them
explains *why* — including the incident, if there was one — because the
commit diff already shows *what*.**

---

## 1. The four source-of-truth files

They live at the repo root and are read at the start of every session,
before any code. `CLAUDE.md` tells the agent to read them in this order:
`FEATURES.md → CHANGELOG.md → TODO.md`, with `Research.md` as reference.

| File | Holds | Granularity | Lifecycle |
|---|---|---|---|
| **`FEATURES.md`** | What exists, **by user role**, with a legend ✅ shipped · 🚧 in progress · 📋 planned | One bold-led sentence or short paragraph per capability, grouped under the role that uses it | Updated in the **same commit** as any user-facing change. Carries a `Last updated:` line naming the feature that touched it |
| **`CHANGELOG.md`** | The engineering log — what changed and, above all, why | Dated release sections (`## [2026-09-06] — v1.6.1`), newest first; current work under `## [Unreleased]` | Every meaningful commit adds under `[Unreleased]`. A release commit dates the section and bumps the version |
| **`TODO.md`** | The backlog: improvements and features **not yet built**, ordered by impact-per-effort | Numbered improvements (`### 11. …`) and lettered features (`### AO. …`), each with Why / Effort / Touches | Items start here. When one ships, its line moves to CHANGELOG and is deleted (or marked 🟢 SHIPPED with a date inside a phased entry) |
| **`Research.md`** | Design documents, legal constraints, patent claims, the org-model spec | Numbered sections referenced by `§` from code and the other files | Rarely edited; cited constantly |
| **`CLAUDE.md`** | Identity, navigation map, the numbered **non-negotiable rules**, architecture invariants, workflow | Short. Rules are numbered so code comments can cite "invariant 12" | Changes only when a rule is added — and a rule is added only after an incident proved it necessary |

Two supporting files:

- **`docs/CONVENTIONS.md`** — the same non-negotiables as `CLAUDE.md`, plus
  **recipes**: "Adding a route", "Adding a plan-gated feature", "Adding a
  migration", "Adding an LLM call", "Adding a recurring job", "Adding a public
  docs article". A recipe is written the first time something is done twice.
- **`frontend/src/pages/Changelog.tsx`** — the **public** «Обновления
  платформы» page. Curated, user-facing, Russian, by version. It is *promoted
  to* from `CHANGELOG.md` when a batch is worth telling users about; it is
  never the engineering log.

---

## 2. What an entry looks like

### CHANGELOG — the "why" is the entry

A bullet is a **bold Russian headline** in the user's language, then English
engineering prose. Sub-bullets carry the reasoning, the alternatives
rejected, the numbers measured, and the incident if there was one.

```markdown
### Fixed
- **Преподавателю показали `Expected ',' or ']' after array element in JSON at position 3203`.**
  Reported from production 2026-09-09: a teacher pressed «Построить план лекции» and got a
  V8 parser message … Four separate defects lined up behind it.
  - **The model's answer had been cut off, and our own trimming disguised that as bad
    syntax.** `extractJSON` slices to the last `}` so fenced answers still parse. Given a
    severed answer, that rewinds to the last complete element and produces exactly this
    message …
  - **Yandex and Qwen never checked for truncation.** DeepSeek has thrown
    `TruncatedResponseError` on `finish_reason === 'length'` since Improvement #10 …
  - **Why the existing tests could not have caught either.** …
```

Conventions that make these useful a month later:

- **Headline states the user-visible effect**, not the fix. «Логотип вуза
  выгружался сплющенным» — not "fix logo sizing".
- **Numbers are recorded**: contrast ratios, token counts, byte sizes, the
  scroll offset at which something broke. "Measured, not computed" is
  stated when it applies.
- **Rejected alternatives are named**, briefly, with the reason. ("A warm
  tint was tried and reverted — against the page's own warm ground it stopped
  reading as a card.")
- **Own mistakes are recorded plainly.** "The comment I wrote next to the
  .pptx entry asserted the opposite — which is precisely the assumption that
  went untested." "My earlier verification of this was wrong — the element I
  measured was the sidebar." These are the most valuable lines in the file.
- **Deliberate non-changes are recorded**: "The .pptx export palette keeps
  the original amber, deliberately: …" — so nobody "fixes" it later.
- Grouped **Added / Changed / Fixed / Removed** inside each section.

### TODO — an entry is an argument, not a ticket

```markdown
### AO. Презентации — from vending machine to workspace · Effort: Phase 0 S–M, 🟢 SHIPPED (2026-09-04) · Phase 1 M, …

Presentations are one of the features teachers actually use daily … What it
did not fix is that a deck is **write-once and then it leaves** …

Two consequences follow from that single fact, and they're the actual
subject of this entry:
1. **No edit loop** → …
2. **No usage signal** → …

- **Phase 0 (shipped, 2026-09-04) — outline approval gate. Highest leverage
  per line of code in this entry.** …
- **Phase 1 …**
```

- **Why** first — what the item protects or unlocks, argued from evidence
  (user feedback, a metric, a code path). An item without a why gets cut.
- **Effort**: S ≤ 1 day, M ≈ 2–4 days, L ≈ 1–2 weeks.
- **Touches**: the files and surfaces that will move.
- Big features are **phased, each phase independently shippable**, and the
  phase line is updated in place with 🟢 SHIPPED (date) as it lands — so the
  entry remains the plan *and* the record until the whole thing is done.
- Deferred items say **why** they're deferred and what would un-defer them.
- Ordering is by impact-per-effort, not by date and not by who asked.

### FEATURES — what a new team member reads first

Grouped by role (public visitor → free teacher → Pro → institution member →
institution admin → platform admin). Each capability is a bold lead followed
by what it does in one breath, including the *limits* ("Free: 3/month").
It is the file a salesperson or a new engineer reads to learn what the
product is, so it is kept honest — a 📋 planned item is marked, never
implied.

---

## 3. The commit

- **One unit of work per commit**, in the sense of "one thing you could
  revert". A feature commit carries its migration, its tests, its
  FEATURES/CHANGELOG/TODO updates and its docs article together.
- **Subject line in the user's language when the change is user-visible**,
  with a conventional prefix: `feat(presentations): …`, `fix(import): …`,
  `fix(ui): …`, `fix(a11y): …`, `chore(deploy): …`, `docs(changelog): …`,
  `chore(release): v1.6.1 …`.
- **Body explains why in prose**, mirrors the CHANGELOG entry, and ends with
  how it was verified: "Verified end to end on the reported deck: 10 slides,
  9 pictures stored, 9 media parts embedded in the exported .pptx."
- Commit and push **only when asked**. Deploy **only when asked**. The
  operator says "push it and redeploy"; the agent never decides that.

---

## 4. Code comments as the durable record

Comments in this codebase are unusually long on purpose. They record:

- **The incident**: `// Found in production 2026-09-08 on a genuine deck.`
- **The number**: `// ink-tertiary on white is 2.84:1, under the 4.5:1 floor;
  secondary is 5.74:1.`
- **The rejected alternative**: `// NOT bg-amber text-white, the house primary:
  white on amber measures 3.06:1 …`
- **The load-bearing invariant**, citing its number: `// (CLAUDE.md
  invariant 12)`.
- **The trap for the next person**: `// Registered before '/:id' so the
  literal segment isn't read as a presentation id.`

The test for a comment is: *would someone deleting this line six months from
now understand what will break?* Comments that restate the code are removed.

---

## 5. Tests

- **Alongside the code, same commit.** `foo.ts` has `foo.test.ts`; feature
  facets get their own file (`presentationExport.branding.test.ts`,
  `presentationExport.selection.test.ts`).
- **Each test names the failure it prevents**, in the `it()` string or a
  comment above it: `it('does NOT leak one institution's brand into the next
  export')`, `it('refuses malformed input instead of guessing at it')`.
- **Fixtures differ from our own output.** Round-tripping the app's own
  export through its own importer proved the parser matched our idea of the
  format and nothing else — the two `.pptx` bugs that reached production
  lived exactly in the gap between "our output" and "a real teacher's file".
  Hand-built fixtures for that gap are the tests that matter.
- Integration tests are suffixed `.integration.test.ts` and excluded from the
  default run.
- Run the relevant suite before every commit; run the full suite before every
  push. Report the numbers ("backend 1259, frontend 106, tsc clean").

---

## 6. Verification before "done"

The rule is **verify, then report what was verified and what wasn't**.

- Produce the real artefact and inspect it: read the `.pptx` back with the
  importer; render the PDF and look at the pages; download the deployed JS
  bundle and grep it for the change.
- Use a browser for UI, in a **faithful replica of the app shell** — an
  invented harness passes while production fails. Measure from the DOM
  (`getBoundingClientRect`, `getComputedStyle`), not from a screenshot alone,
  and confirm the selector targets the element you think it does.
- When the failing case can be reproduced, **reproduce it too** — restore the
  old wrapper, watch it break, then fix — rather than only confirming the fix.
- Say plainly what could not be verified: "I could not click through the
  running app because `/presentations` needs a login I don't have."

---

## 7. Release and deploy

- **`[Unreleased]` → dated section** happens in a `chore(release): vX.Y.Z`
  commit that also bumps the version and creates the git tag. Releases are
  dated by when they **reached production**, not when the code was written.
- **Deploy** is a script (`deploy.sh`): CI gate on the exact commit → image
  guard (pull before shipping anything) → frontend upload → compose sync →
  migrate + rolling restart → health per replica → **version assertion per
  replica** → public check. Steps are numbered `[n/8]`; a step that always
  warns is removed rather than tolerated.
- After a deploy, the agent reports: migrations applied, both replicas'
  image tag, both replicas' served version, the public health line — and for
  frontend-only batches, **the served bundle checked for the change**, because
  a green backend proves nothing about the bundle.
- **Migrations are expand/contract** (invariant 12). No rename or drop in the
  release that stops using the column.

---

## 8. The public changelog

`frontend/src/pages/Changelog.tsx` is edited by hand, in Russian, by version
(«Версия 1.6», dated by month). Entries are **bold headline + one paragraph
that says what it does for the user and why it matters** — the reasoning
survives the translation from engineering to product copy («титульный лист
стал светлым: он дольше всех висит на проекторе, часто в освещённой
аудитории, где чёрный фон читается хуже всего»). Bug fixes are generally
*not* announced there unless they were user-visible for a long time.

Product copy rules are enforced everywhere, including here (ИСПУМ's was
"never «ИИ», always «ИСПУМ»"). A new product decides its own and writes them
into `CLAUDE.md`.

---

## 9. Memory across sessions

The agent keeps a small per-project memory directory (one fact per file,
indexed in `MEMORY.md`): who the user is, feedback on how to work
("never use the question-mark icon", "npm installs run by the operator"),
project constraints not derivable from code ("the on-prem prospect", "IT
owns provisioning"), and pointers. Nothing that the repo already records
goes there. Recalled memories are context, not instructions.

---

## 10. The habits that make it work

1. **Read the four files before touching code.** Context first, every session.
2. **Why before what**, in every artefact: TODO entry, CHANGELOG line, commit
   body, code comment.
3. **Record the incident.** A rule without its incident becomes a style
   opinion and gets argued away.
4. **Measure; write the number down; never assume it.** Contrast, tokens,
   bytes, scroll offsets.
5. **Name the alternative you rejected.**
6. **Record your own mistakes in the log**, plainly, without ceremony.
7. **Same commit**: feature + tests + FEATURES + CHANGELOG + TODO + docs.
8. **Ship in independently usable phases**, and mark them shipped in place.
9. **Verify against real artefacts and the real shell**, and say what wasn't verified.
10. **Commit, push, deploy only when told.**
