import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Download, Plus } from 'lucide-react'
import { getTalk, deleteTalk, updateSlide, regenerateSlide, deleteSlide, insertSlide, moveSlide, uploadSlideImage, removeSlideImage } from '../api/talks'
import { errorMessage } from '../api/client'
import SlideCard, { type SlideEditActions } from '../components/talks/SlideCard'
import Spinner from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import { useToast } from '../lib/toast'
import { copy, INTENT_LABEL, AUDIENCE_LABEL, slidesCount } from '../lib/copy'
import { findOverfullSlides } from '../../../shared/slideFit'
import { MAX_SLIDE_COUNT, type Slide, type Talk } from '../../../shared/types'

// Content first (CLAUDE.md §6): the first slide is above the fold. The
// header is one compact row, measured at 1280×800 in Phase 2's browser check.
export default function TalkPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: talk, isLoading, error } = useQuery({ queryKey: ['talk', id], queryFn: () => getTalk(id) })

  const overfull = useMemo(() => {
    const map = new Map<number, string>()
    if (talk?.slides) findOverfullSlides(talk.slides).forEach((f) => map.set(f.index, f.reason))
    return map
  }, [talk])

  // «Undo last regeneration» (CLAUDE.md §5: no version history) — the
  // previous slide is held in memory, keyed by index, until the next
  // structural edit invalidates the indices.
  const [previous, setPrevious] = useState<Map<number, Slide>>(new Map())
  const [busy, setBusy] = useState(false)

  const apply = (updated: Talk) => qc.setQueryData(['talk', id], updated)
  async function run(fn: () => Promise<Talk>, clearsPrevious = true) {
    setBusy(true)
    try {
      apply(await fn())
      if (clearsPrevious) setPrevious(new Map())
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const edit: SlideEditActions = {
    busy,
    onMove:   (from, to) => void run(() => moveSlide(id, from, to)),
    onDelete: (idx) => void run(() => deleteSlide(id, idx)),
    onSave:   (idx, slide) => void run(() => updateSlide(id, idx, slide)),
    onRegenerate: async (idx, instruction) => {
      const before = talk?.slides?.[idx]
      await run(async () => {
        const updated = await regenerateSlide(id, idx, instruction)
        if (before) setPrevious(new Map([[idx, before]]))
        return updated
      }, false)
    },
    onUndo: previous.size > 0
      ? (idx) => {
          const before = previous.get(idx)
          if (!before) return
          void run(() => updateSlide(id, idx, before)).then(() => toast(copy.talk.edit.undone, 'success'))
        }
      : undefined,
    onUpload:      (idx, file) => void run(() => uploadSlideImage(id, idx, file), false),
    onRemoveImage: (idx) => void run(() => removeSlideImage(id, idx), false),
  }
  const insertAfter = (idx: number) => void run(() => insertSlide(id, idx))

  const remove = useMutation({
    mutationFn: () => deleteTalk(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['talks'] }); navigate('/talks', { replace: true }) },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  if (isLoading) return <Spinner />
  if (error || !talk) return <p role="alert" className="text-sm text-danger">{errorMessage(error)}</p>

  const slides = talk.slides ?? []

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {/* Two lines, not one: a one-line truncate ate the title on a phone. */}
          <h1 className="text-xl font-semibold text-ink leading-tight line-clamp-2">{talk.title}</h1>
          <p className="text-xs text-ink-secondary mt-1">
            {INTENT_LABEL[talk.intent]} · {AUDIENCE_LABEL[talk.audience]} · {slidesCount(slides.length)}
            {overfull.size > 0 && ` · ${copy.talk.overfull}: ${overfull.size}`}
          </p>
        </div>
        {/* A plain link, not fetch+blob: the browser streams the file and
            shows its own download UI; the cookie rides along same-origin. */}
        <a href={`/api/talks/${id}/export.pptx`} download
           className="h-10 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-deep flex-shrink-0">
          <Download className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">{copy.talk.download}</span><span className="sm:hidden">.pptx</span>
        </a>
        <Button variant="ghost" size="md" loading={remove.isPending} aria-label={copy.talk.delete} title={copy.talk.delete}
                onClick={() => { if (window.confirm(copy.talk.deleteConfirm)) remove.mutate() }}>
          <Trash2 className="w-4 h-4" aria-hidden />
        </Button>
      </header>

      <div className="space-y-4">
        {slides.map((s, i) => (
          <div key={i} className="group">
            <SlideCard slide={s} number={i + 1} language={talk.language} notesEnabled={talk.notes_enabled} overfull={overfull.get(i)}
                       edit={{ ...edit, onUndo: previous.has(i) ? edit.onUndo : undefined }} isFirst={i === 0} isLast={i === slides.length - 1} />
            {/* Insert-after sits between cards: a 32px chip that is always
                present (touch has no hover), quiet until pointed at. */}
            <div className="flex justify-center -mb-2 mt-2">
              <button type="button" onClick={() => insertAfter(i)} disabled={busy || slides.length >= MAX_SLIDE_COUNT}
                      className="h-8 px-3 inline-flex items-center gap-1 rounded-md border border-border bg-surface text-xs text-ink-secondary hover:text-accent hover:border-accent disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" aria-hidden /> {copy.talk.edit.insertAfter}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
