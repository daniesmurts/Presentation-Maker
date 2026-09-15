// Types shared between backend and frontend. Ported from the ИСПУМ
// presentation feature (CLAUDE.md §2); education nouns replaced per §4.

// ─── Talk request ─────────────────────────────────────────────────────────────

// What the talk is for. Drives the prompt's voice and the default slide mix.
export type Intent = 'inform' | 'persuade' | 'teach' | 'pitch' | 'report' | 'workshop'
export const INTENTS: readonly Intent[] = ['inform', 'persuade', 'teach', 'pitch', 'report', 'workshop']

export type Audience = 'executives' | 'customers' | 'team' | 'conference' | 'classroom' | 'investors'
export const AUDIENCES: readonly Audience[] = ['executives', 'customers', 'team', 'conference', 'classroom', 'investors']

// Generation language. UI language is a separate per-user setting.
export type TalkLanguage = 'ru' | 'en'

// Speaker notes default per intent (CLAUDE.md §10): on where the deck is
// spoken over, off where it is read on screen. The user can flip it per talk.
export function notesDefaultFor(intent: Intent): boolean {
  return intent === 'teach' || intent === 'workshop' || intent === 'inform'
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

// Async generation (talk_jobs table) — enqueue and poll. 'outline_ready' is
// the approval gate: the job pauses after the cheap outline pass and waits
// for the user to confirm or edit the plan before the expensive expansion.
export type TalkJobStatus = 'pending' | 'processing' | 'outline_ready' | 'ready' | 'failed'

// ─── Sources ──────────────────────────────────────────────────────────────────

// One source surfaced next to a slide. Slide text carries inline [N]
// markers; this list resolves N → what it came from. Kept on the talk row,
// idx-numbered — never renumber without rewriting slide text.
export interface TalkSource {
  idx:     number               // matches the [N] marker in the slide text
  title:   string               // file name, page title, or «Тезисы»
  url:     string | null        // for a pasted URL; null for uploads / brief
  excerpt: string               // ~280 chars, for the popover
}

// ─── Typed slides ─────────────────────────────────────────────────────────────
//
// One discriminated type per layout, each with its own `body`. The model
// picks `type` per slide from what the content wants. Any text field may
// contain inline $...$ / $$...$$ LaTeX and [N] source markers. Add types
// here (CLAUDE.md §5.3); never make one type carry two layouts.

export type SlideType =
  | 'title'
  | 'section'
  | 'agenda'
  | 'bullets'
  | 'concept'
  | 'formula'
  | 'comparison'
  | 'diagram'
  | 'stats'
  | 'quote'
  | 'image-full'
  | 'discussion'
  | 'cta'
  | 'summary'

export const SLIDE_TYPES: readonly SlideType[] =
  ['title', 'section', 'agenda', 'bullets', 'concept', 'formula', 'comparison', 'diagram', 'stats', 'quote', 'image-full', 'discussion', 'cta', 'summary']

// Design v3 (TODO L2): how a slide looks, as an enum the renderers know —
// see shared/slideDesign.ts. Optional on the wire: absent means the type's
// default, so rows written before it exist read the same.
export type { SlideDesign } from './slideDesign'
import type { SlideDesign as _SlideDesign } from './slideDesign'

// One slide's worth of plan — produced by the outline pass, edited by the
// user at the approval gate, consumed by the expansion pass. `brief` is a
// technical brief for expansion, not prose: «виды насосов: объёмные vs
// динамические, критерий выбора», not «рассказать про насосы».
export interface OutlineSlide {
  type:    SlideType
  title:   string
  brief:   string
  design?: _SlideDesign
}

// An image on a slide. Never auto-selected in the parent — search returned
// candidates, the user picked. `source_url` is the hosting page (attribution;
// a link to click, not an element to load — CLAUDE.md §3.6).
export interface SlideImage {
  url:         string
  source_url:  string
  thumbnail:   string
  width:       number | null
  height:      number | null
  query:       string
  source_host: string | null
}

interface SlideBase {
  type:      SlideType
  title:     string
  // Speaker notes («текст докладчика»). Always a string: '' when the talk
  // has notes disabled, so every consumer can read it without a null check
  // and the export decides whether to write a notes page.
  notes:     string
  citations: number[]           // TalkSource.idx values referenced on the slide
  // Optional visual. DiagramSlide keeps its own body.image (it is the anchor
  // case and pre-dates this field in the parent's stored JSON); for
  // type: 'diagram' these two are unused.
  image_query?: string | null
  image?:       SlideImage | null
  design?:      _SlideDesign
}

export interface TitleSlide extends SlideBase {
  type: 'title'
  body: {
    subtitle:  string | null    // one line under the title
    presenter: string | null    // name / role line; a placeholder is fine
  }
}

export interface BulletsSlide extends SlideBase {
  type: 'bullets'
  body: { items: string[] }
}

// A section break: «Часть 2 · Рынок» — the kicker is the part, the title
// is the section, the lead is one sentence on what it will show. Rhythm,
// not content: one every 5–8 slides.
export interface SectionSlide extends SlideBase {
  type: 'section'
  body: {
    kicker: string | null       // «Часть 2», «02», a short label
    lead:   string | null       // one sentence
  }
}

// The plan of the talk, numbered — 3–7 items, one line each.
export interface AgendaSlide extends SlideBase {
  type: 'agenda'
  body: { items: string[] }
}

// One to three figures, each with a label — the number is the slide.
export interface StatsSlide extends SlideBase {
  type: 'stats'
  body: {
    stats: Array<{ value: string; label: string; note: string | null }>   // value: «42 %», «×3», «1,2 млрд ₽»
  }
}

// A quotation set large, attributed. Only when the material has one.
export interface QuoteSlide extends SlideBase {
  type: 'quote'
  body: {
    quote:       string
    attribution: string | null  // who, and where, if known
  }
}

// Picture-led: the image (the slide's top-level `image`) fills the slide,
// the title and a caption sit on a scrim at the bottom. Never two in a row.
export interface ImageFullSlide extends SlideBase {
  type: 'image-full'
  body: { caption: string }
}

// One concept, defined and unpacked. Better than five bullets for a definition.
export interface ConceptSlide extends SlideBase {
  type: 'concept'
  body: {
    definition: string          // one or two sentences
    supporting: string[]        // 2–4 short points
  }
}

export interface FormulaSlide extends SlideBase {
  type: 'formula'
  body: {
    formulas:    Array<{ latex: string; caption: string }>   // latex without surrounding $$
    explanation: string | null
  }
}

// Two (sometimes three) columns of comparable items.
export interface ComparisonSlide extends SlideBase {
  type: 'comparison'
  body: { columns: Array<{ header: string; items: string[] }> }
}

export interface DiagramSlide extends SlideBase {
  type: 'diagram'
  body: {
    image_query: string         // what to search for, in the talk's language
    caption:     string
    points:      string[]       // 0–3 supporting points
    image:       SlideImage | null
  }
}

// A question to the room plus facilitation prompts. Workshops, classrooms.
export interface DiscussionSlide extends SlideBase {
  type: 'discussion'
  body: {
    question:        string
    prompts:         string[]   // 2–4 follow-ups for the speaker
    expected_angles: string[]   // what answers to expect — notes-style
  }
}

// Call to action — pitches, sales, internal asks (CLAUDE.md §4). One ask,
// the reasons it is the right ask, how to respond.
export interface CtaSlide extends SlideBase {
  type: 'cta'
  body: {
    action:  string             // the one thing the audience should do
    reasons: string[]           // 1–3
    contact: string | null      // how to respond — a placeholder is fine
  }
}

export interface SummarySlide extends SlideBase {
  type: 'summary'
  body: {
    takeaways:  string[]
    next_steps: string[]
  }
}

export type Slide =
  | TitleSlide
  | SectionSlide
  | AgendaSlide
  | StatsSlide
  | QuoteSlide
  | ImageFullSlide
  | BulletsSlide
  | ConceptSlide
  | FormulaSlide
  | ComparisonSlide
  | DiagramSlide
  | DiscussionSlide
  | CtaSlide
  | SummarySlide

// ─── Talk ─────────────────────────────────────────────────────────────────────

export interface Talk {
  id:                 string
  workspace_id:       string
  owner_id:           string
  title:              string
  brief:              string
  intent:             Intent
  audience:           Audience
  language:           TalkLanguage
  slide_count_target: number | null
  duration_minutes:   number | null
  notes_enabled:      boolean
  strict_to_brief:    boolean
  theme_id:           string
  slides:             Slide[] | null
  sources:            TalkSource[] | null
  // The user stands behind this talk. Only approved talks are ever used as
  // style references for a later generation (TODO G).
  approved_at:        string | null
  // Read-only share link (§5.6); null when not shared.
  share_token:        string | null
  shared_at:          string | null
  created_at:         string
  updated_at:         string
}

/** What a share link exposes: the slides and what is needed to render them —
 *  never the speaker notes, the brief, or who made it. */
export interface SharedTalk {
  title:    string
  language: TalkLanguage
  theme_id: string
  slides:   Slide[]
}

export interface TalkJob {
  id:            string
  talk_id:       string | null
  status:        TalkJobStatus
  kind:          'generate' | 'rewrite'
  outline:       OutlineSlide[] | null
  proposal:      Slide[] | null
  error_message: string | null
  created_at:    string
  updated_at:    string
}

// ─── Slide-count sizing ──────────────────────────────────────────────────────
//
// Shared rather than duplicated per side: the form's max, the server's
// validation cap and the generator's own clamp all have to agree, or a user
// silently gets fewer slides than asked for — which is what happened while
// the ceiling lived in three places in the parent.

// Minutes of talking per slide. The parent's users reported 1–1.5 min/slide
// for lectures; a sales pitch runs faster. Conservative end kept; THE knob
// to tune as feedback arrives.
export const MINUTES_PER_SLIDE = 1.5

// Ceiling on both the estimate and the manual target. Not a token wall —
// the outline call covers ~80 slides — but past this the single outline call
// is the real constraint, and so is anyone's attention.
export const MAX_SLIDE_COUNT = 60
export const MIN_SLIDE_COUNT = 3

export function estimateSlideCount(minutes: number): number {
  return Math.max(MIN_SLIDE_COUNT, Math.min(MAX_SLIDE_COUNT, Math.round(minutes / MINUTES_PER_SLIDE)))
}

// Talk-length presets (CLAUDE.md §4). Minutes → slides via the same estimate.
export const LENGTH_PRESETS = [
  { id: 'lightning', minutes: 5  },
  { id: 'short',     minutes: 15 },
  { id: 'standard',  minutes: 30 },
  { id: 'long',      minutes: 60 },
] as const
export type LengthPresetId = typeof LENGTH_PRESETS[number]['id']
