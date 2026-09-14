import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Download, Plus, Link2, Check, ChevronDown, Copy } from 'lucide-react'
import { getTalk, deleteTalk, updateSlide, regenerateSlide, deleteSlide, insertSlide, moveSlide, uploadSlideImage, removeSlideImage, setTalkTheme, shareTalk, unshareTalk } from '../api/talks'
import { remapAfterMove, remapAfterDelete, remapAfterInsert, toSlideNumbers, rangeBetween } from '../lib/slideSelection'
import { getBrand } from '../api/brand'
import { inputClass } from '../components/ui/Field'
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
  const { data: brandData } = useQuery({ queryKey: ['brand'], queryFn: getBrand, staleTime: 60_000 })

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
  // Selection for partial download — indices, remapped through every
  // structural edit (lib/slideSelection.ts) so it keeps pointing at the
  // slides it was made on.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)

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
    onMove:   (from, to) => void run(() => moveSlide(id, from, to)).then(() => setSelected((s) => remapAfterMove(s, from, to))),
    onDelete: (idx) => void run(() => deleteSlide(id, idx)).then(() => setSelected((s) => remapAfterDelete(s, idx))),
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
  const insertAfter = (idx: number) => void run(() => insertSlide(id, idx)).then(() => setSelected((s) => remapAfterInsert(s, idx)))

  function toggleSelect(idx: number, opts: { range: boolean }) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (opts.range && anchor !== null) { for (const i of rangeBetween(anchor, idx)) next.add(i) }
      else if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
    setAnchor(idx)
  }
  const selQuery = selected.size > 0 ? `?slides=${toSlideNumbers(selected).join(',')}` : ''

  const share = useMutation({
    mutationFn: async (on: boolean) => (on ? (await shareTalk(id)).talk : unshareTalk(id)),
    onSuccess: (t) => apply(t),
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const shareUrl = talk?.share_token ? `${window.location.origin}/s/${talk.share_token}` : null
  function copyShare() {
    if (!shareUrl) return
    void navigator.clipboard?.writeText(shareUrl).then(() => { setCopied(true); toast(copy.talk.share.copied, 'success'); setTimeout(() => setCopied(false), 2000) })
  }

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
        {brandData && (
          <label className="hidden sm:flex items-center gap-2 text-xs text-ink-secondary">
            {copy.theme.label}
            <select value={talk.theme_id} onChange={(e) => void run(() => setTalkTheme(id, e.target.value), false)} disabled={busy}
                    aria-label={copy.theme.label} className={`${inputClass} h-10 w-auto`}>
              {brandData.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        {/* Plain links, not fetch+blob: the browser streams the file and
            shows its own download UI; the cookie rides along same-origin. */}
        <div className="relative flex-shrink-0">
          <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
                  className="h-10 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-deep">
            <Download className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">{copy.talk.downloadMenu}</span>
            {selected.size > 0 && <span className="text-xs bg-white/20 rounded px-1.5">{selected.size}</span>}
            <ChevronDown className="w-3.5 h-3.5" aria-hidden />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 mt-1 w-72 bg-surface border border-border rounded-md shadow-lg z-30 py-1" onClick={() => setMenuOpen(false)}>
              <a role="menuitem" href={`/api/talks/${id}/export.pptx${selQuery}`} download className="block px-3 py-2 text-sm text-ink hover:bg-surface-soft">
                {selected.size > 0 ? copy.talk.downloadSelected('.pptx', selected.size) : copy.talk.downloadAll('.pptx')}
              </a>
              <a role="menuitem" href={`/api/talks/${id}/export.pdf${selQuery}`} download className="block px-3 py-2 text-sm text-ink hover:bg-surface-soft">
                {selected.size > 0 ? copy.talk.downloadSelected('PDF', selected.size) : copy.talk.downloadAll('PDF')}
              </a>
              {talk.notes_enabled && (
                <a role="menuitem" href={`/api/talks/${id}/export.pdf${selQuery}${selQuery ? '&' : '?'}notes=1`} download className="block px-3 py-2 text-sm text-ink hover:bg-surface-soft">
                  {copy.talk.withNotes}
                </a>
              )}
              {selected.size > 0 && <button role="menuitem" type="button" onClick={() => setSelected(new Set())} className="block w-full text-left px-3 py-2 text-sm text-ink-secondary hover:bg-surface-soft">{copy.talk.clearSelection}</button>}
            </div>
          )}
        </div>
        <div className="relative flex-shrink-0 flex items-center gap-1">
          <Button variant={talk.share_token ? 'secondary' : 'ghost'} size="md" loading={share.isPending} onClick={() => share.mutate(!talk.share_token)}
                  aria-label={copy.talk.share.button} title={copy.talk.share.hint}>
            <Link2 className="w-4 h-4" aria-hidden /> <span className="hidden md:inline">{talk.share_token ? copy.talk.share.off : copy.talk.share.button}</span>
          </Button>
          {shareUrl && (
            <Button variant="ghost" size="md" onClick={copyShare} aria-label={copy.talk.share.copy} title={shareUrl}>
              {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
            </Button>
          )}
        </div>
        <Button variant="ghost" size="md" loading={remove.isPending} aria-label={copy.talk.delete} title={copy.talk.delete}
                onClick={() => { if (window.confirm(copy.talk.deleteConfirm)) remove.mutate() }}>
          <Trash2 className="w-4 h-4" aria-hidden />
        </Button>
      </header>

      <div className="space-y-4">
        {slides.map((s, i) => (
          <div key={i} className="group">
            <SlideCard slide={s} number={i + 1} language={talk.language} notesEnabled={talk.notes_enabled} overfull={overfull.get(i)}
                       edit={{ ...edit, onUndo: previous.has(i) ? edit.onUndo : undefined }} isFirst={i === 0} isLast={i === slides.length - 1}
                       selected={selected.has(i)} onSelect={toggleSelect} />
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
