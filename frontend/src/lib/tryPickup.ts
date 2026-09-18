import { createDraft, sendMessage } from '../api/drafts'
import { client } from '../api/client'
import type { DraftCard, OutlineSlide, TalkLanguage } from '../../../shared/types'
import { EMPTY_DRAFT_CARD } from '../../../shared/types'

// The landing demo («Скажите первую минуту», landing/src/components/Try.astro)
// stashes what the visitor said and the plan it got under this key before
// sending them to register. The first authenticated page load picks it up:
// a draft is created with the plan as the card and the transcript as the
// first message, and the user lands there — «Сохранить и продолжить» kept.
// Runs once per stash; a stash older than a day is dropped (a different
// person on a shared machine must not inherit someone's minute).

export const TRY_KEY = 'tezarium.try'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

interface Stash { v: 1; at: number; transcript: string; title: string; outline: OutlineSlide[]; language: TalkLanguage }

function readStash(): Stash | null {
  try {
    const raw = localStorage.getItem(TRY_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<Stash>
    if (s.v !== 1 || typeof s.at !== 'number' || Date.now() - s.at > MAX_AGE_MS) return null
    if (typeof s.transcript !== 'string' || !Array.isArray(s.outline)) return null
    return s as Stash
  } catch { return null }
}
const clearStash = () => { try { localStorage.removeItem(TRY_KEY) } catch { /* nothing to clear */ } }

export function cardFromStash(s: Stash): DraftCard {
  return {
    ...EMPTY_DRAFT_CARD,
    title:    (s.title || '').slice(0, 200),
    language: s.language === 'en' ? 'en' : 'ru',
    intent:   'inform',
    // The plan's per-slide briefs are the talking points; the title slide's
    // brief is about the talk, not a point in it.
    theses:   s.outline.filter((o) => o.type !== 'title').map((o) => (o.brief || o.title).trim()).filter(Boolean).slice(0, 40),
  }
}

let ran = false
/** Returns the draft id to open, or null when there is nothing to pick up. */
export async function pickUpTryStash(): Promise<string | null> {
  if (ran) return null
  ran = true
  const s = readStash()
  if (!s) return null
  clearStash()
  const draft = await createDraft(cardFromStash(s))
  void client.post('/api/try/event', { event: 'try_registered', metadata: { language: s.language } }).catch(() => {})
  // The minute itself as the first message — the editor answers it and
  // refines the card; if that call fails the draft is still there.
  const first = s.language === 'en'
    ? `Here is what I said in the first minute of my talk:\n\n${s.transcript}`
    : `Вот что я сказал в первую минуту выступления:\n\n${s.transcript}`
  try { await sendMessage(draft.id, first.slice(0, 4000)) } catch { /* the draft opens without a reply */ }
  return draft.id
}
