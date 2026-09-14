import { chatJSON } from './llm/registry'
import { sanitiseForPrompt } from '../lib/promptSanitiser'
import type { CallContext } from './llm/types'
import {
  estimateSlideCount, MAX_SLIDE_COUNT, MIN_SLIDE_COUNT, SLIDE_TYPES,
  type Audience, type Intent, type TalkLanguage, type OutlineSlide, type TalkSource,
  type Slide, type SlideType, type SlideImage,
  type TitleSlide, type BulletsSlide, type ConceptSlide, type FormulaSlide,
  type ComparisonSlide, type DiagramSlide, type DiscussionSlide, type CtaSlide, type SummarySlide,
} from '../../../shared/types'

// Ported from the parent's services/presentations.ts (CLAUDE.md §2) —
// the two-pass shape, the batching numbers and every normaliser rule are
// kept; RAG, web grounding, style exemplars, deep mode and image auto-fill
// are not (each is a later TODO item). Prompts are rewritten for
// intent × audience in the talk's language.

// ─── Params ───────────────────────────────────────────────────────────────────

export interface GenerateParams {
  // Absent only for an offline eval run (talkEvalHarness.ts).
  userId?:          string
  workspaceId?:     string
  title:            string           // the talk's topic / working title
  brief:            string           // тезисы — the user's talking points; '' when only a title was given
  intent:           Intent
  audience:         Audience
  language:         TalkLanguage
  durationMinutes:  number
  slideCountTarget?: number
  notesEnabled:     boolean
  // «Только по моим материалам» — the deck may contain ONLY what the brief
  // says: structure and reformat, never supplement. Meaningless without a
  // brief (isStrictToBrief).
  strictToBrief:    boolean
}

export interface TalkPlan {
  outline:     OutlineSlide[]
  slideTarget: number
}

export interface ExpandResult {
  slides:  Slide[]
  sources: TalkSource[]
}

// Generation runs as outline (cheap, structure-only) + parallel expansion
// batches, each with its own full token budget, rather than one call for the
// whole deck: a single call budgeted ~220 tokens/slide and produced thin
// slides (CLAUDE.md §2). Batching gives each slide the budget of a small
// standalone generation.
export const EXPANSION_BATCH_SIZE  = 5   // outline slides per expansion call
export const EXPANSION_CONCURRENCY = 3   // parallel expansion calls

// Speaker-notes length, in words. ~1 min 30 s of speech at the floor — the
// number the parent's users asked for after "short annotation" notes.
export const NOTES_WORD_TARGET: readonly [number, number] = [180, 220]

// ─── Token budgets (CLAUDE.md §3.3) ──────────────────────────────────────────
//
// Cyrillic runs ~2× the tokens per character of English on this tokenizer,
// and the parent's budgets were calibrated on Russian — so Russian IS the
// worst case and English gets a smaller number rather than the other way
// round. Both are ceilings passed as max_tokens; the thing that actually
// bites is the provider's 8192 output cap, which decides how many slides
// fit in one call.
//
// Outline: ~90 tokens/slide in Russian (type + title + one-line brief) plus
// a fixed buffer for the JSON envelope. The parent's ceiling was once 4000,
// which silently truncated any deck past ~44 slides — the budget ran out
// mid-array, normaliseOutline accepted the short result, and the user got
// fewer slides than asked for with no error anywhere. It is one call for
// the whole deck, so it is the real wall on deck size: ~82 slides at 90
// tokens. Past that the outline has to be chunked, not the number raised.
export const OUTPUT_TOKEN_CEILING = 8192
const OUTLINE_TOKENS_PER_SLIDE: Record<TalkLanguage, number> = { ru: 90, en: 60 }
export function outlineMaxTokens(slideTarget: number, language: TalkLanguage): number {
  return Math.min(OUTPUT_TOKEN_CEILING, 800 + slideTarget * OUTLINE_TOKENS_PER_SLIDE[language])
}

// Expansion writes body + a 180–220-word script per slide: ~700 tokens/slide
// in Russian (1.5–2 tokens/word plus body and JSON overhead). Sized per
// BATCH — EXPANSION_BATCH_SIZE keeps a batch under the ceiling regardless of
// deck size. Notes off roughly halves it.
//
// Measured on the first eval run (2026-09-14, deepseek-flash, 5-slide
// batches with notes): Russian peaked at 3033 output tokens per batch
// (~600/slide), English at 2487 (~500/slide). English was first budgeted at
// 450/slide on the "Cyrillic is 2× per character" rule — but the model
// writes English notes LONGER, so per slide it is ~0.8× of Russian, not
// 0.5×, and 2487 against a 2850 ceiling is one verbose batch from a
// truncation. 600 leaves ~1000 tokens of headroom at batch size 5.
const EXPANSION_TOKENS_PER_SLIDE: Record<TalkLanguage, { notes: number; noNotes: number }> = {
  ru: { notes: 700, noNotes: 350 },
  en: { notes: 600, noNotes: 300 },
}
export function expansionBatchMaxTokens(batchSize: number, language: TalkLanguage, notesEnabled: boolean): number {
  const per = EXPANSION_TOKENS_PER_SLIDE[language][notesEnabled ? 'notes' : 'noNotes']
  return Math.min(OUTPUT_TOKEN_CEILING, 600 + batchSize * per)
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

function callContextFor(params: GenerateParams, feature: CallContext['feature']): CallContext {
  return { userId: params.userId, workspaceId: params.workspaceId, feature, variant: params.language }
}

/**
 * «Только по моим материалам» only means anything when there is material —
 * a checked box with an empty brief must not silently forbid the model from
 * writing anything at all.
 */
export function isStrictToBrief(params: Pick<GenerateParams, 'strictToBrief' | 'brief'>): boolean {
  return Boolean(params.strictToBrief && params.brief.trim())
}

/**
 * Cheap, structure-only half: decides slide count, order, type and a
 * one-line brief per slide. No full-length writing, no DB writes — a plan
 * the user can be shown and can edit before anything expensive happens.
 */
export async function planTalk(params: GenerateParams): Promise<TalkPlan> {
  const slideTarget = clampSlideTarget(params.slideCountTarget ?? estimateSlideCount(params.durationMinutes))
  const L = COPY[params.language]

  const outlineRaw = await chatJSON<{ outline: unknown[] }>(
    [
      { role: 'system', content: L.outlineSystem(params) },
      { role: 'user',   content: buildOutlinePrompt(params, slideTarget) },
    ],
    'outline',
    { context: callContextFor(params, 'talk_outline'), maxTokens: outlineMaxTokens(slideTarget, params.language) },
  )

  return { outline: normaliseOutline(outlineRaw?.outline, slideTarget, params.language), slideTarget }
}

function clampSlideTarget(n: number): number {
  return Math.max(MIN_SLIDE_COUNT, Math.min(MAX_SLIDE_COUNT, Math.round(n)))
}

/**
 * Expensive half: writes every slide from the (possibly user-edited) plan.
 * `plan.outline` is trusted to be normalised — normaliseOutline() at the plan
 * boundary for a model-produced one, normaliseEditedOutline() at the route
 * boundary for a user-edited one. Persisting the result is the caller's job
 * (the worker), so this function stays replayable by the eval harness.
 */
export async function expandTalk(params: GenerateParams, plan: TalkPlan): Promise<ExpandResult> {
  const L = COPY[params.language]
  const context = callContextFor(params, 'talk_expand')
  const batches = chunkArray(plan.outline, EXPANSION_BATCH_SIZE)

  // No citable sources yet (uploads / URLs arrive with TODO B–D): every [N]
  // marker the model invents is stripped by the normaliser.
  const sources: TalkSource[] = []
  const validIdx = new Set<number>()

  const expanded = await mapWithConcurrency(batches, EXPANSION_CONCURRENCY, async (batch) => {
    const raw = await chatJSON<{ slides: unknown[] }>(
      [
        { role: 'system', content: L.expansionSystem(params) },
        { role: 'user',   content: buildExpansionPrompt(batch, params) },
      ],
      'slides',
      { context, maxTokens: expansionBatchMaxTokens(batch.length, params.language, params.notesEnabled) },
    )
    return normaliseSlides(raw?.slides, validIdx, params.language, params.notesEnabled)
  })

  return { slides: expanded.flat(), sources }
}

/** Both halves back-to-back — no approval gate. */
export async function generateTalk(params: GenerateParams): Promise<ExpandResult & TalkPlan> {
  const plan = await planTalk(params)
  return { ...plan, ...(await expandTalk(params, plan)) }
}

// ─── Prompt copy, per language ───────────────────────────────────────────────
//
// The talk's language decides the prompt language too: a Russian system
// prompt asking for English slides produces Russian-flavoured English, and
// vice versa.

const INTENT_LABEL: Record<TalkLanguage, Record<Intent, string>> = {
  ru: {
    inform:   'информировать — донести суть и факты',
    persuade: 'убедить — привести к решению или позиции',
    teach:    'научить — объяснить так, чтобы поняли и смогли применить',
    pitch:    'питч — продать идею, продукт или проект',
    report:   'отчитаться — показать результаты и статус',
    workshop: 'воркшоп — вовлечь и отработать на практике',
  },
  en: {
    inform:   'inform — convey the substance and the facts',
    persuade: 'persuade — bring the room to a decision or a position',
    teach:    'teach — explain so that people understand and can apply it',
    pitch:    'pitch — sell an idea, a product or a project',
    report:   'report — show results and status',
    workshop: 'workshop — engage the room and practise',
  },
}

const AUDIENCE_LABEL: Record<TalkLanguage, Record<Audience, string>> = {
  ru: {
    executives: 'руководители — мало времени, нужны выводы и решения',
    customers:  'клиенты — ценность для них, без внутренней кухни',
    team:       'своя команда — можно в детали и в контекст',
    conference: 'конференция — широкая профессиональная аудитория',
    classroom:  'учебная аудитория — объяснять от основ',
    investors:  'инвесторы — рынок, модель, команда, цифры',
  },
  en: {
    executives: 'executives — short on time, want conclusions and decisions',
    customers:  'customers — value to them, none of the internal kitchen',
    team:       'own team — details and context are welcome',
    conference: 'conference — a broad professional audience',
    classroom:  'classroom — explain from the basics',
    investors:  'investors — market, model, team, numbers',
  },
}

interface LanguageCopy {
  outlineSystem:   (p: GenerateParams) => string
  expansionSystem: (p: GenerateParams) => string
  strictClause:    string
  strictRules:     string
  fallbackTitle:   (n: number) => string
  summaryTitle:    string
}

const COPY: Record<TalkLanguage, LanguageCopy> = {
  ru: {
    outlineSystem: (p) =>
      `Вы опытный спичрайтер и редактор презентаций. Вы строите план выступления: ` +
      `порядок слайдов, их тип и краткое техническое задание по содержанию для каждого — ` +
      `сам текст слайдов напишет другой автор. ` +
      (isStrictToBrief(p) ? COPY.ru.strictClause : '') +
      `Вы выбираете тип слайда под содержание: определение → concept, формула → formula, ` +
      `сравнение → comparison, схема/объект → diagram, вопрос залу → discussion, ` +
      `призыв к действию → cta. Длинные перечни маркеров — последний выбор, не первый. ` +
      `Пишите на русском языке. Отвечайте строго в формате JSON.`,
    expansionSystem: (p) =>
      `Вы опытный спичрайтер, пишущий полный текст слайдов` +
      (p.notesEnabled ? ` и текст докладчика` : '') +
      ` по уже готовому плану выступления — тип и заголовок каждого слайда уже определены, менять их нельзя. ` +
      (isStrictToBrief(p) ? COPY.ru.strictClause : '') +
      `Пишите на русском языке. Отвечайте строго в формате JSON.`,
    strictClause:
      `Автор передал собственные тезисы и просил построить выступление ТОЛЬКО по ним. ` +
      `Вы структурируете чужой материал, а не пишете свой: ничего не добавляйте от себя ` +
      `и не дополняйте материал из своих знаний. `,
    strictRules: `
## РЕЖИМ «ТОЛЬКО ПО МОИМ МАТЕРИАЛАМ» (ОБЯЗАТЕЛЬНО)

Выступление должно содержать ТОЛЬКО то, что уже есть в тезисах выше.
Ваша задача — структурировать и оформить чужой материал, а не дополнять его.

- ЗАПРЕЩЕНО добавлять факты, определения, примеры, цифры, даты, формулы,
  термины и источники, которых нет в тезисах.
- ЗАПРЕЩЕНО дополнять материал из собственных знаний по теме, даже если
  кажется, что чего-то не хватает или что-то неточно.
- Формулировки берите из тезисов, сокращая и разбивая их на слайды.
  Переформулировать для краткости можно, менять смысл — нельзя.
- Текст докладчика — тоже только по тезисам: развёрнутый пересказ
  соответствующего фрагмента, а не дополнительный материал от вас.
- Если материала хватает лишь на меньшее число слайдов, сделайте МЕНЬШЕ
  слайдов. Недобор слайдов — правильный результат, выдуманное содержание — нет.`,
    fallbackTitle: (n) => `Слайд ${n}`,
    summaryTitle:  'Итоги',
  },
  en: {
    outlineSystem: (p) =>
      `You are an experienced speechwriter and presentation editor. You build the plan of a talk: ` +
      `the order of slides, each slide's type and a short technical brief for its content — ` +
      `another writer will write the slides themselves. ` +
      (isStrictToBrief(p) ? COPY.en.strictClause : '') +
      `Pick the slide type from the content: a definition → concept, an equation → formula, ` +
      `a contrast → comparison, a schematic/object → diagram, a question to the room → discussion, ` +
      `a call to action → cta. Long bullet lists are the last choice, not the first. ` +
      `Write in English. Respond strictly in JSON.`,
    expansionSystem: (p) =>
      `You are an experienced speechwriter writing the full text of slides` +
      (p.notesEnabled ? ` and the speaker notes` : '') +
      ` from an already-approved plan — each slide's type and title are fixed and must not change. ` +
      (isStrictToBrief(p) ? COPY.en.strictClause : '') +
      `Write in English. Respond strictly in JSON.`,
    strictClause:
      `The author supplied their own talking points and asked for a talk built ONLY from them. ` +
      `You are structuring someone else's material, not writing your own: add nothing of your ` +
      `own and do not supplement it from your knowledge. `,
    strictRules: `
## "ONLY FROM MY MATERIAL" MODE (MANDATORY)

The talk must contain ONLY what the talking points above already say.
Your job is to structure and present someone else's material, not to extend it.

- DO NOT add facts, definitions, examples, numbers, dates, formulas, terms
  or sources that are not in the talking points.
- DO NOT supplement from your own knowledge of the subject, even where
  something seems missing or inaccurate.
- Take wording from the talking points, shortening and splitting it across
  slides. Rephrasing for brevity is fine; changing the meaning is not.
- Speaker notes too come only from the talking points: an expanded
  retelling of the relevant passage, not extra material from you.
- If the material only covers fewer slides, make FEWER slides. Falling
  short on slides is the right result; invented content is not.`,
    fallbackTitle: (n) => `Slide ${n}`,
    summaryTitle:  'Summary',
  },
}

// ─── Outline prompt ──────────────────────────────────────────────────────────

function buildOutlinePrompt(params: GenerateParams, slideTarget: number): string {
  const ru = params.language === 'ru'
  const L  = COPY[params.language]
  const lines: string[] = []

  if (params.brief.trim()) {
    lines.push(ru
      ? `## Тезисы автора (план должен строго следовать этому материалу, не добавляя фактов от себя)`
      : `## The author's talking points (the plan must follow this material closely, adding no facts of its own)`)
    lines.push(sanitiseForPrompt(params.brief))
    lines.push('')
    if (isStrictToBrief(params)) lines.push(L.strictRules, '')
  }

  lines.push(ru ? `## Параметры выступления` : `## Talk parameters`)
  lines.push(`${ru ? 'Тема' : 'Topic'}: ${sanitiseForPrompt(params.title)}`)
  lines.push(`${ru ? 'Цель' : 'Intent'}: ${INTENT_LABEL[params.language][params.intent]}`)
  lines.push(`${ru ? 'Аудитория' : 'Audience'}: ${AUDIENCE_LABEL[params.language][params.audience]}`)
  lines.push(`${ru ? 'Продолжительность' : 'Duration'}: ${params.durationMinutes} ${ru ? 'минут' : 'minutes'}`)
  lines.push(`${ru ? 'Целевое количество слайдов' : 'Target slide count'}: ${slideTarget}`)

  const fewer = isStrictToBrief(params)
    ? (ru ? ` (или МЕНЬШЕ, если тезисов не хватает на ${slideTarget} слайдов — см. режим выше)`
          : ` (or FEWER, if the talking points do not cover ${slideTarget} slides — see the mode above)`)
    : ''

  lines.push(ru ? `
## Задача

Постройте ПЛАН выступления — порядок и тип каждого слайда с кратким техническим
заданием по содержанию. Полный текст слайдов напишет другой автор по этому
плану, поэтому задание должно быть конкретным: не «рассказать про рынок»,
а «объём рынка 2025 и три драйвера роста, с цифрами».

Верните JSON объект с одним ключом "outline" — массивом из ${slideTarget} элементов${fewer}.
Каждый элемент: { "type", "title", "brief" }.

- "type" — один из: ${SLIDE_TYPES.join(', ')}.
- "title" — заголовок слайда.
- "brief" — 1–2 предложения: какой именно контент, факт, пример или вопрос должен раскрыть этот слайд.

ПРАВИЛА ВЫБОРА ТИПА:
- Первый слайд всегда type="title".
- Последний слайд всегда type="summary"${params.intent === 'pitch' || params.intent === 'persuade' ? ', а предпоследний — type="cta"' : ''}.
- ${params.intent === 'workshop' || params.intent === 'teach' ? 'Минимум один слайд "discussion".' : '"discussion" — только если вопрос залу действительно уместен.'}
- "concept" вместо "bullets", когда вводится новое понятие.
- "formula" для любого слайда с уравнением.
- "comparison", когда содержание естественно делится на 2 (реже 3) колонки.
- "diagram" там, где визуальное представление критично (объект, процесс, схема) — brief должен явно называть, что именно изображено.
- "cta" — один призыв к действию; уместен для питча и убеждения, не для отчёта.
- "bullets" — резервный тип. В выступлении из ${slideTarget} слайдов их не больше трети.

Верните строго JSON без обрамляющего текста.` : `
## Task

Build the PLAN of the talk — the order and type of every slide with a short
technical brief for its content. Another writer will write the full slides
from this plan, so each brief must be concrete: not "talk about the market"
but "2025 market size and the three growth drivers, with numbers".

Return a JSON object with one key "outline" — an array of ${slideTarget} items${fewer}.
Each item: { "type", "title", "brief" }.

- "type" — one of: ${SLIDE_TYPES.join(', ')}.
- "title" — the slide title.
- "brief" — 1–2 sentences: exactly which content, fact, example or question this slide must deliver.

TYPE RULES:
- The first slide is always type="title".
- The last slide is always type="summary"${params.intent === 'pitch' || params.intent === 'persuade' ? ', and the one before it type="cta"' : ''}.
- ${params.intent === 'workshop' || params.intent === 'teach' ? 'At least one "discussion" slide.' : '"discussion" only where a question to the room genuinely fits.'}
- "concept" instead of "bullets" when a new notion is introduced.
- "formula" for any slide with an equation.
- "comparison" when the content naturally splits into 2 (rarely 3) columns.
- "diagram" where a visual is essential (an object, a process, a schematic) — the brief must name what is shown.
- "cta" — one call to action; fits a pitch or persuasion, not a report.
- "bullets" is the fallback type. In a ${slideTarget}-slide talk, no more than a third.

Return strict JSON with no surrounding text.`)

  return lines.join('\n')
}

// ─── Outline normalisation ──────────────────────────────────────────────────

export function normaliseOutline(raw: unknown, slideTarget: number, language: TalkLanguage): OutlineSlide[] {
  const L = COPY[language]
  // Defensive ceiling against a runaway array — each entry becomes a real
  // LLM call downstream, so an unbounded array is a cost risk, not just a
  // quality one.
  const arr = (Array.isArray(raw) ? raw : []).slice(0, Math.max(slideTarget * 2, 10))

  const out: OutlineSlide[] = arr.map((entry, i) => {
    const o = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    const type  = isSlideType(o.type) ? o.type : 'bullets'
    const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : L.fallbackTitle(i + 1)
    const brief = typeof o.brief === 'string' ? o.brief.trim() : ''
    return { type, title, brief }
  })

  // Total outline failure — a minimal shell so expansion still produces a
  // valid (if thin) deck instead of the whole request failing.
  if (out.length === 0) {
    return [
      { type: 'title',   title: L.fallbackTitle(1), brief: '' },
      { type: 'summary', title: L.summaryTitle,     brief: '' },
    ]
  }

  // Structural safety net — the prompt asks for this, but a deck that does
  // not open/close correctly is worse than overriding the model.
  out[0] = { ...out[0], type: 'title' }
  out[out.length - 1] = { ...out[out.length - 1], type: 'summary' }
  return out
}

// Field ceilings for a user-edited outline. Prompt-safety limits, not UI
// hints: every title and brief is interpolated into the expansion prompt.
export const OUTLINE_TITLE_MAX_CHARS = 200
export const OUTLINE_BRIEF_MAX_CHARS = 600

/**
 * Normalises a *user-edited* outline from the approval gate. Deliberately
 * gentler than normaliseOutline(): that one repairs a model's output,
 * including forcing title-first / summary-last. A user who deleted the
 * title slide or ended on a discussion meant it, so structure is left
 * alone — only junk is rejected. Returns null when nothing usable survives,
 * so the route can 400 rather than enqueue an expansion of an empty deck.
 */
export function normaliseEditedOutline(raw: unknown): OutlineSlide[] | null {
  if (!Array.isArray(raw)) return null
  const out: OutlineSlide[] = []
  for (const entry of raw.slice(0, MAX_SLIDE_COUNT)) {
    const o = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    const title = typeof o.title === 'string' ? o.title.trim() : ''
    if (!title) continue   // a row the user blanked out is a row they meant to drop
    out.push({
      type:  isSlideType(o.type) ? o.type : 'bullets',
      title: title.slice(0, OUTLINE_TITLE_MAX_CHARS),
      brief: (typeof o.brief === 'string' ? o.brief.trim() : '').slice(0, OUTLINE_BRIEF_MAX_CHARS),
    })
  }
  return out.length > 0 ? out : null
}

function isSlideType(v: unknown): v is SlideType {
  return typeof v === 'string' && (SLIDE_TYPES as readonly string[]).includes(v)
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// ─── Expansion prompt ───────────────────────────────────────────────────────
//
// Writes the full text for one batch of outline slides. Type and title are
// already decided — the model only writes body + notes, which shrinks the
// instruction surface (and error space) compared to a whole-deck prompt.

export function buildExpansionPrompt(batch: OutlineSlide[], params: GenerateParams, instruction?: string): string {
  const ru = params.language === 'ru'
  const L  = COPY[params.language]
  const lines: string[] = []

  if (params.brief.trim()) {
    lines.push(ru
      ? `## Тезисы автора (пишите строго по этому материалу, не добавляя фактов от себя)`
      : `## The author's talking points (write from this material, adding no facts of your own)`)
    lines.push(sanitiseForPrompt(params.brief))
    lines.push('')
    if (isStrictToBrief(params)) lines.push(L.strictRules, '')
  }

  // The user's free-text steer on a single-slide regenerate («короче»).
  // Sanitised like every other user string entering a prompt, and placed
  // AFTER the material so it reads as a note on the task, not as material.
  if (instruction) {
    lines.push(ru ? `## Замечание автора к этому слайду (обязательно учесть)` : `## The author's note on this slide (must be followed)`)
    lines.push(sanitiseForPrompt(instruction))
    lines.push('')
  }

  lines.push(ru ? `## План слайдов для написания (${batch.length})` : `## Slides to write (${batch.length})`)
  batch.forEach((s, i) => {
    lines.push(`${i + 1}. [${s.type}] ${s.title}`)
    if (s.brief) lines.push(`   ${ru ? 'Содержание' : 'Content'}: ${s.brief}`)
  })
  lines.push('')
  lines.push(`${ru ? 'Тема выступления' : 'Talk topic'}: ${sanitiseForPrompt(params.title)}`)
  lines.push(`${ru ? 'Цель' : 'Intent'}: ${INTENT_LABEL[params.language][params.intent]}`)
  lines.push(`${ru ? 'Аудитория' : 'Audience'}: ${AUDIENCE_LABEL[params.language][params.audience]}`)

  const [wMin, wMax] = NOTES_WORD_TARGET
  const notesSpec = !params.notesEnabled
    ? (ru ? `ТЕКСТ ДОКЛАДЧИКА (поле "notes") для этого выступления НЕ нужен — всегда передавайте пустую строку "".`
          : `SPEAKER NOTES (the "notes" field) are NOT wanted for this talk — always pass an empty string "".`)
    : isStrictToBrief(params)
    ? (ru ? `ТЕКСТ ДОКЛАДЧИКА (поле "notes") — что говорить, пока слайд на экране, ИСКЛЮЧИТЕЛЬНО по
соответствующему фрагменту тезисов: развёрнутый пересказ живой речью. Ориентир — до ${wMax} слов,
но если во фрагменте меньше материала, напишите короче. НЕ добавляйте примеры, числа или
пояснения, которых нет в тезисах. Не дублируйте текст слайда дословно.`
          : `SPEAKER NOTES (the "notes" field) — what to say while the slide is on screen, built EXCLUSIVELY
from the matching passage of the talking points: an expanded retelling in spoken language. Aim for
up to ${wMax} words, shorter if the passage has less. Do NOT add examples, numbers or explanations
that are not in the talking points. Do not repeat the slide text verbatim.`)
    : (ru ? `ТЕКСТ ДОКЛАДЧИКА (поле "notes") — что говорить, пока слайд на экране: ${wMin}–${wMax} слов
(примерно 1.5 минуты речи), а не короткая аннотация. Структура:
1. Почему это важно этой аудитории.
2. Развёрнутое объяснение содержания слайда.
3. Конкретный пример с реальными числами или деталями — не абстрактный.
4. Возражение или вопрос, который здесь обычно возникает, и ответ на него.
5. Переход к следующему слайду.
Не дублируйте текст слайда — notes должны звучать как речь, а не как повтор body.`
          : `SPEAKER NOTES (the "notes" field) — what to say while the slide is on screen: ${wMin}–${wMax} words
(about 1.5 minutes of speech), not a short annotation. Structure:
1. Why this matters to this audience.
2. A full explanation of the slide's content.
3. A concrete example with real numbers or details — not an abstract one.
4. The objection or question that usually comes up here, and the answer.
5. The bridge to the next slide.
Do not repeat the slide text — notes must read as speech, not as a copy of the body.`)

  lines.push(ru ? `
## Формат ответа

Тип и заголовок каждого слайда уже определены планом выше — скопируйте их
без изменений. Ваша задача — написать body (содержание слайда) и notes.

Верните JSON объект с одним ключом "slides" — массивом из ${batch.length} элементов,
в том же порядке, что план. Каждый элемент: { "type", "title", "notes", "citations", "body" }.
Поле "citations" — всегда пустой массив [].

${BODY_SCHEMA.ru}

ИЗОБРАЖЕНИЯ ДЛЯ ДРУГИХ ТИПОВ (кроме title/summary/cta/diagram — у diagram своё поле внутри body):
- Добавляйте необязательное поле верхнего уровня "image_query" (рядом с "type", НЕ внутри body), когда изображение реально усилит слайд: объект, схема, график, продукт.
- НЕ добавляйте его для чисто текстового содержания — большинство слайдов НЕ должны иметь картинку.
- Если поле не нужно — не добавляйте его (не пишите null и не пишите пустую строку).

${notesSpec}

ФОРМУЛЫ В ТЕКСТЕ: в любом текстовом поле можно использовать LaTeX inline: $Q$, $\\\\eta$. Не используйте $$ внутри текстовых полей.

Верните строго JSON без обрамляющего текста. Не добавляйте поля кроме перечисленных.` : `
## Response format

Each slide's type and title are fixed by the plan above — copy them
unchanged. Your job is to write body (the slide content) and notes.

Return a JSON object with one key "slides" — an array of ${batch.length} items in
the plan's order. Each item: { "type", "title", "notes", "citations", "body" }.
"citations" is always an empty array [].

${BODY_SCHEMA.en}

IMAGES FOR OTHER TYPES (except title/summary/cta/diagram — diagram has its own field inside body):
- Add an optional top-level "image_query" (next to "type", NOT inside body) when a picture genuinely strengthens the slide: an object, a schematic, a chart, a product.
- Do NOT add it for purely textual content — most slides should NOT have a picture.
- If not needed, omit the field (no null, no empty string).

${notesSpec}

FORMULAS: any text field may use inline LaTeX: $Q$, $\\\\eta$. Never $$ inside text fields.

Return strict JSON with no surrounding text. Add no fields beyond those listed.`)

  return lines.join('\n')
}

const BODY_SCHEMA: Record<TalkLanguage, string> = {
  ru: `ДОСТУПНЫЕ ТИПЫ СЛАЙДОВ (body по схеме для указанного в плане type):

• title
  body: { "subtitle": "<одна строка под заголовком>", "presenter": "[Имя, роль]" }

• bullets (3–5 кратких тезисов)
  body: { "items": ["...", "...", "..."] }

• concept
  body: { "definition": "1–2 предложения", "supporting": ["уточнение 1", "уточнение 2", "уточнение 3"] }

• formula (LaTeX без обрамляющих $$)
  body: { "formulas": [{ "latex": "E = mc^2", "caption": "короткая подпись" }], "explanation": "1–2 предложения, что означают переменные" }

• comparison
  body: { "columns": [ { "header": "...", "items": ["...", "..."] }, { "header": "...", "items": ["...", "..."] } ] }

• diagram
  body: { "image_query": "поисковый запрос: конкретный объект + слово вида «схема», «разрез», «график» — НЕ общая тема", "caption": "подпись под изображением", "points": ["1–3 уточняющих пункта"], "image": null }

• discussion
  body: { "question": "главный вопрос залу", "prompts": ["подвопрос 1", "подвопрос 2"], "expected_angles": ["направление ответа 1", "направление ответа 2"] }

• cta
  body: { "action": "одно действие, которое должна сделать аудитория", "reasons": ["почему именно это, 1–3"], "contact": "как откликнуться, или null" }

• summary
  body: { "takeaways": ["...", "...", "..."], "next_steps": ["что дальше..."] }`,
  en: `AVAILABLE SLIDE TYPES (body per the schema for the plan's type):

• title
  body: { "subtitle": "<one line under the title>", "presenter": "[Name, role]" }

• bullets (3–5 short points)
  body: { "items": ["...", "...", "..."] }

• concept
  body: { "definition": "1–2 sentences", "supporting": ["point 1", "point 2", "point 3"] }

• formula (LaTeX without surrounding $$)
  body: { "formulas": [{ "latex": "E = mc^2", "caption": "short caption" }], "explanation": "1–2 sentences on what the variables mean" }

• comparison
  body: { "columns": [ { "header": "...", "items": ["...", "..."] }, { "header": "...", "items": ["...", "..."] } ] }

• diagram
  body: { "image_query": "search query: a concrete object + a word like 'schematic', 'cross-section', 'chart' — NOT the general topic", "caption": "caption under the image", "points": ["1–3 supporting points"], "image": null }

• discussion
  body: { "question": "the main question to the room", "prompts": ["follow-up 1", "follow-up 2"], "expected_angles": ["expected answer 1", "expected answer 2"] }

• cta
  body: { "action": "the one thing the audience should do", "reasons": ["why this, 1–3"], "contact": "how to respond, or null" }

• summary
  body: { "takeaways": ["...", "...", "..."], "next_steps": ["what comes next..."] }`,
}

// ─── Citation utilities ─────────────────────────────────────────────────────
//
// Slide text can carry inline [N] markers. This strips markers pointing at
// sources that do not exist and reports which idx values were referenced.

function stripInvalidCitations(text: string, validIdx: Set<number>): { text: string; cited: Set<number> } {
  const cited = new Set<number>()
  const cleaned = text.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_, group: string) => {
    const nums = group.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => validIdx.has(n))
    nums.forEach((n) => cited.add(n))
    return nums.length ? `[${nums.join(', ')}]` : ''
  })
  return { text: cleaned, cited }
}

function cleanInline(text: string, validIdx: Set<number>, citedAcc: Set<number>): string {
  const { text: out, cited } = stripInvalidCitations(text, validIdx)
  cited.forEach((c) => citedAcc.add(c))
  return out.trim()
}

// ─── Validation / coercion ───────────────────────────────────────────────────
//
// The model invents fields, misspells types, returns numbers where strings
// are expected. Normalise once at the boundary so the rest of the system can
// trust the Slide union. Coerce, never trust (CLAUDE.md §2).

export function normaliseSlides(raw: unknown, validIdx: Set<number>, language: TalkLanguage, notesEnabled: boolean): Slide[] {
  if (!Array.isArray(raw)) return []
  const out: Slide[] = []
  for (let i = 0; i < raw.length; i++) {
    const slide = coerceSlide(raw[i], validIdx, i + 1, language, notesEnabled)
    if (slide) out.push(slide)
  }
  return out
}

/**
 * Coerces one user-edited slide through the same boundary the model's output
 * goes through, so hand-edited content can't put a shape into `slides` the
 * renderers and the exporter don't expect. Citations are validated against
 * the talk's sources, exactly as at generation.
 */
export function normaliseEditedSlide(raw: unknown, sources: TalkSource[], language: TalkLanguage): Slide | null {
  const validIdx = new Set(sources.map((s) => s.idx))
  const [slide] = normaliseSlides([raw], validIdx, language, true)
  return slide ?? null
}

function coerceSlide(input: unknown, validIdx: Set<number>, slideNumber: number, language: TalkLanguage, notesEnabled: boolean): Slide | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>

  const type: SlideType = isSlideType(o.type) ? o.type : 'bullets'

  const citedAcc = new Set<number>()
  if (Array.isArray(o.citations)) {
    o.citations.map((c) => Number(c)).filter((n) => Number.isInteger(n) && validIdx.has(n)).forEach((n) => citedAcc.add(n))
  }

  const rawTitle = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : COPY[language].fallbackTitle(slideNumber)
  const title = cleanInline(rawTitle, validIdx, citedAcc)
  // Notes off for this talk → '' regardless of what the model wrote, so a
  // model that ignored the instruction cannot leak notes into a deck that
  // must not have them.
  const notes = notesEnabled && typeof o.notes === 'string' ? cleanInline(o.notes, validIdx, citedAcc) : ''

  const body = (o.body && typeof o.body === 'object' ? o.body : {}) as Record<string, unknown>
  const str  = (v: unknown) => cleanInline(typeof v === 'string' ? v : '', validIdx, citedAcc)
  const strOrNull = (v: unknown) => { const t = str(v); return t.length ? t : null }
  const arr  = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').map(str).filter(Boolean)

  let result: Omit<Slide, 'citations'>
  switch (type) {
    case 'title': {
      const s: Omit<TitleSlide, 'citations'> = { type, title, notes, body: { subtitle: strOrNull(body.subtitle), presenter: strOrNull(body.presenter) } }
      result = s; break
    }
    case 'bullets': {
      const s: Omit<BulletsSlide, 'citations'> = { type, title, notes, body: { items: arr(body.items) } }
      result = s; break
    }
    case 'concept': {
      const s: Omit<ConceptSlide, 'citations'> = { type, title, notes, body: { definition: str(body.definition), supporting: arr(body.supporting) } }
      result = s; break
    }
    case 'formula': {
      const formulas = (Array.isArray(body.formulas) ? body.formulas : [])
        .map((f) => {
          if (!f || typeof f !== 'object') return null
          const fo = f as Record<string, unknown>
          const latex = typeof fo.latex === 'string' ? fo.latex.trim() : ''
          return latex ? { latex, caption: str(fo.caption) } : null
        })
        .filter((f): f is { latex: string; caption: string } => f !== null)
      const s: Omit<FormulaSlide, 'citations'> = { type, title, notes, body: { formulas, explanation: strOrNull(body.explanation) } }
      result = s; break
    }
    case 'comparison': {
      const columns = (Array.isArray(body.columns) ? body.columns : [])
        .map((c) => {
          if (!c || typeof c !== 'object') return null
          const co = c as Record<string, unknown>
          const header = str(co.header)
          const items  = arr(co.items)
          return header || items.length ? { header, items } : null
        })
        .filter((c): c is { header: string; items: string[] } => c !== null)
      // Fewer than 2 columns is not a comparison — demote to bullets.
      if (columns.length < 2) {
        const s: Omit<BulletsSlide, 'citations'> = { type: 'bullets', title, notes, body: { items: columns[0]?.items ?? [] } }
        result = s; break
      }
      const s: Omit<ComparisonSlide, 'citations'> = { type, title, notes, body: { columns } }
      result = s; break
    }
    case 'diagram': {
      const s: Omit<DiagramSlide, 'citations'> = {
        type, title, notes,
        body: {
          image_query: typeof body.image_query === 'string' && body.image_query.trim() ? body.image_query.trim() : title,
          caption:     str(body.caption),
          points:      arr(body.points),
          image:       null,   // never trust an inline URL — images come from a real search or an upload
        },
      }
      result = s; break
    }
    case 'discussion': {
      const s: Omit<DiscussionSlide, 'citations'> = {
        type, title, notes,
        body: { question: str(body.question), prompts: arr(body.prompts), expected_angles: arr(body.expected_angles) },
      }
      result = s; break
    }
    case 'cta': {
      const s: Omit<CtaSlide, 'citations'> = {
        type, title, notes,
        body: { action: str(body.action), reasons: arr(body.reasons), contact: strOrNull(body.contact) },
      }
      result = s; break
    }
    case 'summary': {
      const s: Omit<SummarySlide, 'citations'> = { type, title, notes, body: { takeaways: arr(body.takeaways), next_steps: arr(body.next_steps) } }
      result = s; break
    }
  }

  // Top-level image_query for any type except diagram (which keeps its own).
  // `image` itself is never trusted from raw JSON.
  const topLevelImageQuery = result.type !== 'diagram' && typeof o.image_query === 'string' ? o.image_query.trim() : ''

  return {
    ...result,
    ...(topLevelImageQuery ? { image_query: topLevelImageQuery } : {}),
    citations: Array.from(citedAcc).sort((a, b) => a - b),
  } as Slide
}

// ─── Image helpers (shared by the later image work) ──────────────────────────

export function getSlideImageQuery(slide: Slide): string {
  return slide.type === 'diagram' ? slide.body.image_query : (slide.image_query ?? '')
}

export function hasSlideImage(slide: Slide): boolean {
  return Boolean(slide.type === 'diagram' ? slide.body.image : slide.image)
}

export function withSlideImage(slide: Slide, image: SlideImage): Slide {
  return slide.type === 'diagram' ? { ...slide, body: { ...slide.body, image } } : { ...slide, image }
}

// ─── Text rendering ─────────────────────────────────────────────────────────
//
// A plain-text rendering for «copy all» and for feeding a slide back into a
// prompt as its own brief (regenerate). Not parsed back — for humans and
// models, not code.

export function renderSlidesAsText(slides: Slide[], language: TalkLanguage = 'ru'): string {
  return slides.map((s, i) => renderSlideAsText(s, i + 1, language)).join('\n---\n')
}

function renderSlideAsText(s: Slide, n: number, language: TalkLanguage): string {
  const ru = language === 'ru'
  const out: string[] = [`${ru ? 'СЛАЙД' : 'SLIDE'} ${n}: ${s.title}`]

  switch (s.type) {
    case 'title':
      if (s.body.subtitle)  out.push(s.body.subtitle)
      if (s.body.presenter) out.push(s.body.presenter)
      break
    case 'bullets':
      s.body.items.forEach((b) => out.push(`• ${b}`))
      break
    case 'concept':
      out.push(s.body.definition)
      s.body.supporting.forEach((b) => out.push(`• ${b}`))
      break
    case 'formula':
      s.body.formulas.forEach((f) => { out.push(`  ${f.latex}`); if (f.caption) out.push(`  — ${f.caption}`) })
      if (s.body.explanation) out.push(s.body.explanation)
      break
    case 'comparison':
      s.body.columns.forEach((c) => { out.push(c.header.toUpperCase()); c.items.forEach((it) => out.push(`  • ${it}`)) })
      break
    case 'diagram':
      if (s.body.caption) out.push(s.body.caption)
      s.body.points.forEach((p) => out.push(`• ${p}`))
      out.push(s.body.image ? `[${ru ? 'Изображение' : 'Image'}: ${s.body.image.source_url}]`
                            : `[${ru ? 'Подобрать изображение' : 'Find an image'}: «${s.body.image_query}»]`)
      break
    case 'discussion':
      out.push(`? ${s.body.question}`)
      s.body.prompts.forEach((p) => out.push(`  • ${p}`))
      break
    case 'cta':
      out.push(`→ ${s.body.action}`)
      s.body.reasons.forEach((r) => out.push(`• ${r}`))
      if (s.body.contact) out.push(s.body.contact)
      break
    case 'summary':
      out.push(ru ? 'Главное:' : 'Key points:')
      s.body.takeaways.forEach((t) => out.push(`• ${t}`))
      if (s.body.next_steps.length) {
        out.push(ru ? 'Что дальше:' : 'Next:')
        s.body.next_steps.forEach((t) => out.push(`• ${t}`))
      }
      break
  }
  if (s.type !== 'diagram' && s.image_query) {
    out.push(s.image ? `[${ru ? 'Изображение' : 'Image'}: ${s.image.source_url}]`
                     : `[${ru ? 'Подобрать изображение' : 'Find an image'}: «${s.image_query}»]`)
  }
  if (s.notes) {
    out.push('', ru ? 'ТЕКСТ ДОКЛАДЧИКА:' : 'SPEAKER NOTES:', s.notes)
  }
  return out.join('\n')
}
