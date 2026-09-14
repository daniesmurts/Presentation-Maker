import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { getTalk, deleteTalk } from '../api/talks'
import { errorMessage } from '../api/client'
import SlideCard from '../components/talks/SlideCard'
import Spinner from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import { useToast } from '../lib/toast'
import { copy, INTENT_LABEL, AUDIENCE_LABEL, slidesCount } from '../lib/copy'
import { findOverfullSlides } from '../../../shared/slideFit'

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
        <Button variant="danger" size="sm" loading={remove.isPending} aria-label={copy.talk.delete} title={copy.talk.delete}
                onClick={() => { if (window.confirm(copy.talk.deleteConfirm)) remove.mutate() }}>
          <Trash2 className="w-3.5 h-3.5" aria-hidden /> <span className="hidden sm:inline">{copy.talk.delete}</span>
        </Button>
      </header>

      <div className="space-y-4">
        {slides.map((s, i) => (
          <SlideCard key={i} slide={s} number={i + 1} language={talk.language} notesEnabled={talk.notes_enabled} overfull={overfull.get(i)} />
        ))}
      </div>
    </div>
  )
}
