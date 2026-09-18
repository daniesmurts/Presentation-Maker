// The browser's own speech recognition (Web Speech API). Chrome, Edge,
// Yandex Browser, Safari have it; Firefox does not. The words never touch
// our server as audio — the page collects finalised phrases and sends text.
//
// Continuous mode stops on its own after silence or ~60 s on some engines,
// so the recogniser is restarted whenever it ends while we still want it
// running. `onPhrase` fires once per finalised result.

import type { TalkLanguage } from './types'

interface RecognitionResultLike { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEventLike { resultIndex: number; results: ArrayLike<RecognitionResultLike> }
interface RecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  onresult: ((e: RecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void; stop(): void; abort(): void
}
type RecognitionCtor = new () => RecognitionLike

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechSupported = (): boolean => recognitionCtor() !== null

const LANG: Record<TalkLanguage, string> = { ru: 'ru-RU', en: 'en-US' }

export type SpeechError = 'not-allowed' | 'no-mic' | 'network' | 'other'

export interface SpeechSession {
  stop(): void
}

/**
 * Starts listening; keeps listening until `stop()`. `onInterim` carries
 * the phrase being formed (for the live line under the slide), `onPhrase`
 * the finalised text. `onError` fires once for a denied microphone.
 */
export function startListening(language: TalkLanguage, handlers: {
  onPhrase: (text: string) => void
  onInterim?: (text: string) => void
  onError?: (kind: SpeechError) => void
}): SpeechSession | null {
  const Ctor = recognitionCtor()
  if (!Ctor) return null
  let wanted = true
  let rec: RecognitionLike | null = null
  let restartTimer: number | undefined

  const make = () => {
    const r = new Ctor()
    r.lang = LANG[language]
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const text = res[0]?.transcript?.trim() ?? ''
        if (!text) continue
        if (res.isFinal) handlers.onPhrase(text)
        else interim += (interim ? ' ' : '') + text
      }
      handlers.onInterim?.(interim)
    }
    r.onerror = (e) => {
      // 'no-speech' and 'aborted' are routine — the engine gave up waiting;
      // onend restarts it. The others mean the mic is not coming.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wanted = false; handlers.onError?.('not-allowed') }
      else if (e.error === 'audio-capture') { wanted = false; handlers.onError?.('no-mic') }
      else if (e.error === 'network') handlers.onError?.('network')
    }
    r.onend = () => {
      handlers.onInterim?.('')
      if (!wanted) return
      // A short pause before restart: an immediate start() right after
      // onend throws "already started" on Chrome now and then.
      restartTimer = window.setTimeout(() => { if (wanted) { rec = make(); try { rec.start() } catch { /* next onend retries */ } } }, 250)
    }
    return r
  }
  rec = make()
  try { rec.start() } catch { return null }

  return {
    stop() {
      wanted = false
      window.clearTimeout(restartTimer)
      try { rec?.stop() } catch { /* already stopped */ }
    },
  }
}
