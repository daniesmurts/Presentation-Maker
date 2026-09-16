import { useEffect, useState } from 'react'
import { STAGE_W, STAGE_H } from './SlideStage'

// A callback ref, not useRef: the stage box mounts only after the talk
// loads, and an effect keyed on a RefObject never re-runs when the element
// appears — the first cut rendered at scale 1 inside a 739px column.
export function useStageScale(): [number, (el: HTMLDivElement | null) => void] {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    if (!el) return
    const measure = () => setScale(Math.min(el.clientWidth / STAGE_W, el.clientHeight / STAGE_H))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [scale, setEl]
}

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
