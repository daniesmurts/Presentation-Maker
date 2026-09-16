import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStageScale } from '../components/talks/useStageScale'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Monitor } from 'lucide-react'
import { getTalk } from '../api/talks'
import { getBrand } from '../api/brand'
import SlideStage from '../components/talks/SlideStage'
import Spinner from '../components/ui/Spinner'
import { copy } from '../lib/copy'

// Present mode (CLAUDE.md §5.8). Two windows of the same page: the STAGE
// (default) shows the current slide full-screen for the projector; the
// SPEAKER view (?speaker=1) shows the current slide, its notes, the next
// slide and a timer for the laptop. They stay in step over a
// BroadcastChannel keyed by talk id — same origin, no server, works with
// the browser's own "move window to the other display".
//
// Keys: → ↓ Space PageDown = next · ← ↑ PageUp = previous · Home/End ·
// F = fullscreen · Esc = leave.

interface Sync { idx: number }

export default function PresentPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const speaker = params.get('speaker') === '1'
  const { data: talk } = useQuery({ queryKey: ['talk', id], queryFn: () => getTalk(id) })
  const { data: brand } = useQuery({ queryKey: ['brand'], queryFn: getBrand, staleTime: 60_000 })
  const [idx, setIdx] = useState(0)
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(Date.now())
  const channel = useMemo(() => ('BroadcastChannel' in window ? new BroadcastChannel(`tezarium-present-${id}`) : null), [id])

  const slides = talk?.slides ?? []
  const theme = brand?.themes.find((t) => t.id === talk?.theme_id) ?? brand?.themes[0]

  const go = useCallback((next: number) => {
    setIdx((cur) => {
      const n = Math.max(0, Math.min(slides.length - 1, typeof next === 'number' ? next : cur))
      channel?.postMessage({ idx: n } satisfies Sync)
      return n
    })
  }, [slides.length, channel])

  // The other window's moves.
  useEffect(() => {
    if (!channel) return
    const onMsg = (e: MessageEvent<Sync>) => setIdx(e.data.idx)
    channel.addEventListener('message', onMsg)
    return () => channel.removeEventListener('message', onMsg)
  }, [channel])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); go(idx + 1) }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(idx - 1) }
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(slides.length - 1)
      else if (e.key.toLowerCase() === 'f' && !speaker) void document.documentElement.requestFullscreen?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idx, go, slides.length, speaker])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const [scale, stageRef] = useStageScale()

  if (!talk || !theme) return <div className="min-h-screen flex items-center justify-center bg-black"><Spinner /></div>
  const slide = slides[idx]
  const next = slides[idx + 1]
  const elapsed = Math.floor((now - startedAt) / 1000)
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`

  if (!speaker) {
    return (
      <div className="fixed inset-0 bg-black text-white" onClick={(e) => go(e.clientX > window.innerWidth / 3 ? idx + 1 : idx - 1)}>
        <div ref={stageRef} className="absolute inset-0 flex items-center justify-center">
          {slide && <SlideStage slide={slide} theme={theme} scale={scale} index={idx} total={slides.length} talkTitle={talk.title} />}
        </div>
        <div className="absolute bottom-3 right-4 text-xs opacity-40 select-none">{idx + 1} / {slides.length}</div>
        <div className="absolute top-3 right-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <a href={`/talks/${id}/present?speaker=1`} target="_blank" rel="noopener" title={copy.present.openSpeaker}
             className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs"><Monitor className="w-4 h-4" aria-hidden /> {copy.present.openSpeaker}</a>
          <Link to={`/talks/${id}`} title={copy.present.exit} className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20"><X className="w-4 h-4" aria-hidden /></Link>
        </div>
      </div>
    )
  }

  // Speaker view: the laptop screen. Notes large, because that is the point.
  return (
    <div className="fixed inset-0 bg-[#111] text-white grid grid-rows-[auto_1fr] p-4 gap-4">
      <div className="flex items-center gap-4 text-sm">
        <span className="font-mono text-2xl tabular-nums">{mmss}</span>
        <span className="opacity-60">{idx + 1} / {slides.length}</span>
        <span className="opacity-60 truncate">{talk.title}</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => go(idx - 1)} className="h-9 px-3 rounded-md bg-white/10 hover:bg-white/20">←</button>
          <button onClick={() => go(idx + 1)} className="h-9 px-3 rounded-md bg-white/10 hover:bg-white/20">→</button>
          <Link to={`/talks/${id}`} className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20"><X className="w-4 h-4" aria-hidden /></Link>
        </div>
      </div>
      {/* min-w-0 on both grid children: SlideStage has a fixed pixel width
          and without it the first column grows to fit, squeezing the notes
          into a sliver (seen in the first browser check). */}
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
    </div>
  )
}
