// The one-page briefing («Памятка», TODO O4): the talk in five sentences,
// the three numbers, the one ask, the question they will raise — from the
// finished slides, one call. Nothing here is new material: it is the deck
// reordered into what a person needs in the hand before walking in.

import { chatJSON } from './llm/registry'
import { renderSlidesAsText, OUTPUT_TOKEN_CEILING } from './talks'
import { sanitiseForPrompt } from '../lib/promptSanitiser'
import type { Talk, Briefing, TalkLanguage } from '../../../shared/types'

export const GIST_MAX = 5
export const NUMBERS_MAX = 3
const SENTENCE_MAX = 300
// Five sentences + three figures + a Q&A ≈ 400 words; Cyrillic ×2 (§3.3).
export const BRIEFING_MAX_TOKENS = Math.min(OUTPUT_TOKEN_CEILING, 1_800)

const SYSTEM: Record<TalkLanguage, string> = {
  ru: `Вы редактор, который готовит докладчика к выступлению. По готовым слайдам вы составляете памятку на одну страницу — ` +
      `то, что докладчик держит в руке перед выходом. Ничего не добавляйте от себя: только то, что есть на слайдах. ` +
      `Пишите короткими утверждениями, от первого лица докладчика, без вводных слов. Отвечайте строго в формате JSON.`,
  en: `You are an editor preparing a speaker for a talk. From the finished slides you write a one-page briefing — ` +
      `what the speaker holds in their hand before walking in. Add nothing of your own: only what is on the slides. ` +
      `Short statements, in the speaker's first person, no throat-clearing. Respond strictly in JSON.`,
}

export function buildBriefingPrompt(talk: Pick<Talk, 'title' | 'slides' | 'language' | 'intent' | 'audience' | 'duration_minutes'>): string {
  const ru = talk.language === 'ru'
  const material = sanitiseForPrompt(renderSlidesAsText(talk.slides ?? [], talk.language))
  return [
    `${ru ? 'Тема' : 'Topic'}: ${sanitiseForPrompt(talk.title)}`,
    `${ru ? 'Цель' : 'Intent'}: ${talk.intent} · ${ru ? 'аудитория' : 'audience'}: ${talk.audience}` + (talk.duration_minutes ? ` · ${talk.duration_minutes} ${ru ? 'мин' : 'min'}` : ''),
    '',
    ru ? '## Слайды' : '## Slides', material, '',
    ru
      ? `Составьте памятку: {"gist": [до ${GIST_MAX} предложений — всё выступление по порядку, каждое — одна мысль], ` +
        `"numbers": [до ${NUMBERS_MAX} × {"value": "цифра как на слайде", "label": "что это"} — только цифры, которые есть на слайдах; если цифр нет — пустой список], ` +
        `"ask": "одно действие или решение, которого докладчик ждёт от аудитории", ` +
        `"question": {"q": "вопрос, который аудитория скорее всего задаст", "a": "ответ в два-три предложения, по материалу слайдов"}, ` +
        `"opener": "первая фраза, с которой начать — по титульному слайду"}`
      : `Write the briefing: {"gist": [up to ${GIST_MAX} sentences — the whole talk in order, one idea each], ` +
        `"numbers": [up to ${NUMBERS_MAX} × {"value": "the figure as on the slide", "label": "what it is"} — only figures that are on the slides; none → empty list], ` +
        `"ask": "the one action or decision the speaker wants from the audience", ` +
        `"question": {"q": "the question the audience will most likely raise", "a": "the answer in two or three sentences, from the slides"}, ` +
        `"opener": "the first sentence to say — from the title slide"}`,
  ].join('\n')
}

const str = (v: unknown, max = SENTENCE_MAX) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function normaliseBriefing(raw: unknown, now = new Date()): Briefing | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const gist = Array.isArray(o.gist) ? o.gist.map((g) => str(g)).filter(Boolean).slice(0, GIST_MAX) : []
  if (gist.length === 0) return null
  const numbers = Array.isArray(o.numbers)
    ? o.numbers.map((n) => { const x = (n && typeof n === 'object' ? n : {}) as Record<string, unknown>; return { value: str(x.value, 40), label: str(x.label, 120) } })
        .filter((n) => n.value && n.label).slice(0, NUMBERS_MAX)
    : []
  const q = (o.question && typeof o.question === 'object' ? o.question : {}) as Record<string, unknown>
  return {
    gist, numbers,
    ask:      str(o.ask),
    question: { q: str(q.q), a: str(q.a, 600) },
    opener:   str(o.opener),
    generated_at: now.toISOString(),
  }
}

export async function generateBriefing(talk: Talk): Promise<Briefing | null> {
  const raw = await chatJSON<unknown>(
    [{ role: 'system', content: SYSTEM[talk.language] }, { role: 'user', content: buildBriefingPrompt(talk) }],
    'briefing',
    { context: { userId: talk.owner_id, workspaceId: talk.workspace_id, feature: 'briefing', variant: talk.language }, maxTokens: BRIEFING_MAX_TOKENS },
  )
  return normaliseBriefing(raw)
}
