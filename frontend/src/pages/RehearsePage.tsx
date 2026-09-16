import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Mic, MicOff, Square } from 'lucide-react'
import { getTalk } from '../api/talks'
import { getBrand } from '../api/brand'
import { saveRehearsal } from '../api/rehearsals'
import SlideStage from '../components/talks/SlideStage'
import { useStageScale, mmss } from '../components/talks/useStageScale'
import Spinner from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import HelpLink from '../components/ui/HelpLink'
import { useToast } from '../lib/toast'
import { errorMessage } from '../api/client'
import { copy } from '../lib/copy'
import { speechSupported, startListening, type SpeechSession, type SpeechError } from '../lib/speech'
import type { RehearsalSegment, RehearsalVisit } from '../../../shared/types'

// Rehearsal («Репетиция»): the speaker view of present mode with a
// microphone. The page keeps two logs — visits (which slide was up, from
// when to when) and segments (each phrase the browser finalised, stamped
// with the slide it was said on) — and hands both to the server at the
// end. Nothing is uploaded while it runs; nothing is audio.
//
// Starting needs a click: browsers only grant the microphone from a user
// gesture, and the intro card is where the «your browser recognises the
// words» sentence lives.

const MIN_DURATION_MS = 10_000

export default function RehearsePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: talk } = useQuery({ queryKey: ['talk', id], queryFn: () => getTalk(id) })
  const { data: brand } = useQuery({ queryKey: ['brand'], queryFn: getBrand, staleTime: 60_000 })
  const slides = talk?.slides ?? []
  const theme = brand?.themes.find((t) => t.id === talk?.theme_id) ?? brand?.themes[0]

  const [phase, setPhase] = useState<'intro' | 'running' | 'saving'>('intro')
  const [idx, setIdx] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [interim, setInterim] = useState('')
  const [lastPhrases, setLastPhrases] = useState<string[]>([])
  const [mic, setMic] = useState<'off' | 'on' | SpeechError>('off')

  // Mutable log — refs, because the recogniser's callbacks outlive renders.
  const startedAt = useRef(0)
  const idxRef = useRef(0)
  const visitFrom = useRef(0)
  const visits = useRef<RehearsalVisit[]>([])
  const segments = useRef<RehearsalSegment[]>([])
  const session = useRef<SpeechSession | null>(null)
  const supported = speechSupported()

  const closeVisit = useCallback(() => {
    const t = Date.now() - startedAt.current
    if (t > visitFrom.current) visits.current.push({ slide: idxRef.current, from_ms: visitFrom.current, to_ms: t })
    visitFrom.current = t
  }, [])

  const go = useCallback((next: number) => {
    const n = Math.max(0, Math.min(slides.length - 1, next))
    if (n === idxRef.current) return
    if (phase === 'running') closeVisit()
    idxRef.current = n
    setIdx(n)
  }, [slides.length, phase, closeVisit])

  const start = () => {
    startedAt.current = Date.now()
    visitFrom.current = 0
    visits.current = []
    segments.current = []
    idxRef.current = 0
    setIdx(0)
    setPhase('running')
    if (!supported) { setMic('off'); return }
    session.current = startListening(talk!.language, {
      onPhrase: (text) => {
        segments.current.push({ slide: idxRef.current, at_ms: Date.now() - startedAt.current, text })
        setLastPhrases((p) => [...p.slice(-2), text])
      },
      onInterim: setInterim,
      onError: (kind) => { if (kind !== 'network') { setMic(kind); session.current = null } },
    })
    setMic(session.current ? 'on' : 'other')
  }

  const stopListening = () => { session.current?.stop(); session.current = null }

  const finish = async () => {
    if (phase !== 'running') return
    const duration = Date.now() - startedAt.current
    if (duration < MIN_DURATION_MS) { toast(copy.rehearsal.tooShort, 'error'); return }
    closeVisit()
    stopListening()
    setPhase('saving')
    try {
      const r = await saveRehearsal(id, {
        started_at: new Date(startedAt.current).toISOString(), duration_ms: duration,
        speech_available: mic === 'on', segments: segments.current, visits: visits.current,
      })
      toast(copy.rehearsal.saved)
      navigate(`/talks/${id}/rehearsals/${r.id}`)
    } catch (err) {
      toast(errorMessage(err), 'error')
      setPhase('running')
      startedAt.current = Date.now() - duration   // keep the clock honest on retry
    }
  }

  const cancel = () => { stopListening(); navigate(`/talks/${id}`) }

  useEffect(() => () => { session.current?.stop() }, [])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'running') return
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); go(idxRef.current + 1) }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(idxRef.current - 1) }
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(slides.length - 1)
      else if (e.key === 'Escape') void finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, go, slides.length])

  const [scale, stageRef] = useStageScale()

  if (!talk || !theme) return <div className="min-h-screen flex items-center justify-center bg-black"><Spinner /></div>
  const slide = slides[idx]
  const next = slides[idx + 1]
  const elapsed = phase === 'intro' ? 0 : now - startedAt.current

  if (phase === 'intro') {
    return (
      <div className="fixed inset-0 bg-[#111] text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-lg bg-white/5 p-8">
          <h1 className="font-display text-2xl mb-2">{copy.rehearsal.heading}</h1>
          <p className="opacity-80 mb-2">{talk.title}</p>
          <p className="text-sm opacity-70 leading-relaxed mb-3">{copy.rehearsal.intro} <HelpLink to="rehearsal" className="!text-[#8FA3FF] hover:!text-[#B3C1FF]" /></p>
          {supported
            ? <p className="text-sm opacity-70 mb-6">{copy.rehearsal.micAsk}</p>
            : <p className="text-sm text-[#FFD166] mb-6">{copy.rehearsal.noSpeech}</p>}
          <p className="text-xs opacity-50 mb-6">{copy.rehearsal.keys}</p>
          <div className="flex gap-3">
            <button onClick={start} className="h-11 px-5 rounded-md bg-white text-black text-sm font-medium hover:bg-white/90 inline-flex items-center gap-2">
              <Mic className="w-4 h-4" aria-hidden /> {copy.rehearsal.start}
            </button>
            <Link to={`/talks/${id}`} className="h-11 px-4 rounded-md bg-white/10 hover:bg-white/20 text-sm inline-flex items-center">{copy.rehearsal.cancel}</Link>
          </div>
        </div>
      </div>
    )
  }

  const micLine = mic === 'on' ? copy.rehearsal.listening
    : mic === 'not-allowed' ? copy.rehearsal.micDenied
    : mic === 'no-mic' ? copy.rehearsal.micMissing
    : supported ? copy.rehearsal.paused : copy.rehearsal.noSpeech

  return (
    <div className="fixed inset-0 bg-[#111] text-white grid grid-rows-[auto_1fr_auto] p-4 gap-4">
      <div className="flex items-center gap-4 text-sm">
        <span className="font-mono text-2xl tabular-nums">{mmss(elapsed)}</span>
        <span className="opacity-60">{idx + 1} / {slides.length}</span>
        <span className={`inline-flex items-center gap-1.5 text-xs ${mic === 'on' ? 'text-[#7EE0A0]' : 'text-[#FFD166]'}`}>
          {mic === 'on' ? <Mic className="w-3.5 h-3.5" aria-hidden /> : <MicOff className="w-3.5 h-3.5" aria-hidden />} {micLine}
        </span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => go(idx - 1)} className="h-9 px-3 rounded-md bg-white/10 hover:bg-white/20">←</button>
          <button onClick={() => go(idx + 1)} className="h-9 px-3 rounded-md bg-white/10 hover:bg-white/20">→</button>
          <Button onClick={() => void finish()} loading={phase === 'saving'} className="!bg-white !text-black hover:!bg-white/90">
            <Square className="w-3.5 h-3.5" aria-hidden /> {phase === 'saving' ? copy.rehearsal.finishing : copy.rehearsal.finish}
          </Button>
          <button onClick={cancel} title={copy.rehearsal.cancel} className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20"><X className="w-4 h-4" aria-hidden /></button>
        </div>
      </div>
      <div className="grid grid-cols-[3fr_2fr] gap-4 min-h-0 min-w-0">
        <div className="flex flex-col gap-4 min-h-0 min-w-0">
          <div ref={stageRef} className="flex-1 min-h-0 min-w-0 overflow-hidden flex items-start justify-center">{slide && <SlideStage slide={slide} theme={theme} scale={scale} index={idx} total={slides.length} talkTitle={talk.title} />}</div>
          <div className="text-xs opacity-60">{copy.present.next}: {next ? next.title : '—'}</div>
        </div>
        <div className="min-h-0 min-w-0 overflow-y-auto rounded-md bg-white/5 p-5">
          <div className="text-xs uppercase tracking-wider opacity-50 mb-3">{copy.talk.notes}</div>
          <p className="text-xl leading-relaxed whitespace-pre-line">{slide?.notes || copy.present.noNotes}</p>
        </div>
      </div>
      {/* The live line: the last phrases the browser heard, so the speaker
          sees that the words are landing without reading a transcript. */}
      <div className="h-12 text-sm opacity-70 truncate" aria-live="polite">
        {lastPhrases.slice(-2).join(' ')} <span className="opacity-60 italic">{interim}</span>
      </div>
    </div>
  )
}
