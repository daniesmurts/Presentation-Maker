import { useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Download, Plus, Link2, Check, ChevronDown, Copy, Play, Mic, Wand2, CheckCircle2, MoreHorizontal } from 'lucide-react'
import { getTalk, deleteTalk, updateSlide, regenerateSlide, deleteSlide, insertSlide, moveSlide, uploadSlideImage, removeSlideImage, setTalkTheme, shareTalk, unshareTalk, startRewrite, applyRewrite, dismissRewrite, replaceTalkSlides, getJob, approveTalk, getImagePrompt, generateSlideImage, generateDeckImages } from '../api/talks'
import RewriteReview from '../components/talks/RewriteReview'
import { remapAfterMove, remapAfterDelete, remapAfterInsert, toSlideNumbers, rangeBetween } from '../lib/slideSelection'
import { getBrand } from '../api/brand'
import { listRehearsals } from '../api/rehearsals'
import { inputClass, Pill } from '../components/ui/Field'
import { errorMessage } from '../api/client'
import SlideCard, { type SlideEditActions } from '../components/talks/SlideCard'
import Spinner from '../components/ui/Spinner'
import Button, { buttonClass } from '../components/ui/Button'
import HelpLink from '../components/ui/HelpLink'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
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
  const { user, refresh } = useAuth()
  // Downloads are metered per month on free (quota from /me). The menu must
  // know before the click: a plain <a download> saves a 403 JSON as a file.
  // After a click the count moves on the server, so /me is re-read a moment
  // later and the next open of the menu shows the new state.
  const left = (f: 'pptx' | 'pdf') => { const q = user?.quota?.[f]; return q && q.limit != null ? Math.max(0, q.limit - q.used) : Infinity }
  const pptxOpen = left('pptx') > 0
  const pdfOpen = left('pdf') > 0
  const afterDownload = () => { setTimeout(() => void refresh(), 1500) }
  const { data: talk, isLoading, error } = useQuery({ queryKey: ['talk', id], queryFn: () => getTalk(id) })
  const { data: brandData } = useQuery({ queryKey: ['brand'], queryFn: getBrand, staleTime: 60_000 })
  const { data: rehearsals } = useQuery({ queryKey: ['rehearsals', id], queryFn: () => listRehearsals(id), staleTime: 30_000 })
  const lastRehearsal = rehearsals?.[0]

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
  const [changeOpen, setChangeOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  // Deck-level rewrite: an instruction box → a job → a proposal to review.
  const [rewriteOpen, setRewriteOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [rewriteJob, setRewriteJob] = useState<string | null>(null)
  const [beforeRewrite, setBeforeRewrite] = useState<Slide[] | null>(null)
  const { data: rewrite } = useQuery({
    queryKey: ['job', rewriteJob], queryFn: () => getJob(rewriteJob!), enabled: Boolean(rewriteJob),
    refetchInterval: (q) => (q.state.data?.status === 'pending' || q.state.data?.status === 'processing' ? 2000 : false),
    refetchIntervalInBackground: true,
  })

  const apply = (updated: Talk) => qc.setQueryData(['talk', id], updated)
  async function run(fn: () => Promise<Talk>, clearsPrevious = true) {
    setBusy(true)
    try {
      apply(await fn())
      if (clearsPrevious) { setPrevious(new Map()); setBeforeRewrite(null) }
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
    // Generated pictures (Design v3, L3) — only when the server has a provider.
    ...(brandData?.image_generation ? {
      getPrompt:  (idx: number) => getImagePrompt(id, idx).then((r) => r.prompt),
      onGenerate: (idx: number, prompt: string) => run(() => generateSlideImage(id, idx, prompt || undefined), false).then(() => {}),
    } : {}),
  }
  async function drawDeck() {
    setBusy(true)
    try {
      const r = await generateDeckImages(id)
      qc.setQueryData(['talk', id], r.talk)
      toast(copy.talk.image.deckDone(r.done, r.failed), r.done > 0 ? 'success' : 'error')
    } catch (err) { toast(errorMessage(err), 'error') } finally { setBusy(false) }
  }
  async function beginRewrite() {
    if (!instruction.trim()) return
    setBusy(true)
    try { const job = await startRewrite(id, instruction.trim()); setRewriteJob(job.id); setRewriteOpen(false) }
    catch (err) { toast(errorMessage(err), 'error') } finally { setBusy(false) }
  }
  async function acceptRewrite(accept: number[]) {
    if (!rewriteJob) return
    // clearsPrevious=false: `run` would otherwise wipe the undo snapshot it just set.
    await run(async () => { const r = await applyRewrite(id, rewriteJob, accept); setBeforeRewrite(r.before); return r.talk }, false)
    toast(copy.rewrite.applied(accept.length), 'success'); setRewriteJob(null); setInstruction('')
  }
  function dismiss() { if (rewriteJob) void dismissRewrite(id, rewriteJob).catch(() => null); setRewriteJob(null) }
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
  const sub = [slidesCount(slides.length), brandData?.themes.find((t) => t.id === talk.theme_id)?.name].filter(Boolean).join(' · ')

  return (
    <div className="space-y-5">
      {/* Title first, toolbar under it: seven controls beside a title crushed
          it into a one-letter column at 1280px (Phase G browser check). The
          toolbar wraps; the first slide still sits above the fold — measured. */}
      <header className="space-y-4">
        <div className="min-w-0">
          <div className="eyebrow text-accent mb-1.5">{copy.talk.kind} · {INTENT_LABEL[talk.intent]} · {AUDIENCE_LABEL[talk.audience]}</div>
          {/* Two lines, not one: a one-line truncate ate the title on a phone. */}
          <h1 className="display font-semibold text-[30px] leading-tight text-ink line-clamp-2">{talk.title}</h1>
          <p className="text-sm text-ink-secondary mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{sub}</span>
            {talk.approved_at && <Pill tone="ok">{copy.list.status.approved}</Pill>}
            {talk.share_token && <Pill tone="accent">{copy.list.status.shared} <HelpLink to="share" label="?" className="no-underline" /></Pill>}
            {overfull.size > 0 && <Pill tone="warn">{copy.talk.overfull}: {overfull.size} <HelpLink to="overfull" label="?" className="no-underline" /></Pill>}
            {lastRehearsal && (
              <Link to={`/talks/${id}/rehearsals/${lastRehearsal.id}`} className="text-accent hover:text-accent-deep underline">
                {copy.rehearsal.lastOne(rehearsals!.length)}
              </Link>
            )}
          </p>
        </div>
        {/* The toolbar reads in three groups, left to right: the talk as a
            thing (theme, «Готово») · change all of it (one menu — two
            whole-deck model actions were two bare text links, which read
            as captions, §6) · use it (show, rehearse, share, download).
            Delete is in an overflow: destructive and rare, it does not
            earn a slot next to «Скачать». Every action is a bordered
            chip; the one solid CTA is the download. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            {brandData && (
              <select value={talk.theme_id} onChange={(e) => void run(() => setTalkTheme(id, e.target.value), false)} disabled={busy}
                      aria-label={copy.theme.label} title={copy.theme.label} className={`${inputClass} !w-auto h-10 py-0 text-sm`}>
                {brandData.themes.map((t) => <option key={t.id} value={t.id}>{copy.theme.label}: {t.name}</option>)}
              </select>
            )}
            <Button variant={talk.approved_at ? 'secondary' : 'ghost'} onClick={() => void run(() => approveTalk(id, !talk.approved_at), false)} disabled={busy} title={copy.approve.hint} aria-label={copy.approve.button}>
              <CheckCircle2 className="w-4 h-4" aria-hidden /> <span className="hidden lg:inline">{talk.approved_at ? copy.approve.on : copy.approve.button}</span>
            </Button>
          </div>
          <span className="hidden sm:block w-px h-6 bg-border-strong" aria-hidden />
          <div className="relative">
            <Button variant="ghost" onClick={() => setChangeOpen((o) => !o)} disabled={busy} aria-haspopup="menu" aria-expanded={changeOpen} title={copy.talk.changeHint}>
              <Wand2 className="w-4 h-4" aria-hidden /> <span className="hidden md:inline">{copy.talk.changeMenu}</span> <ChevronDown className="w-3.5 h-3.5" aria-hidden />
            </Button>
            {changeOpen && (
              <div role="menu" className="absolute left-0 mt-1 w-72 bg-surface border border-border rounded-md shadow-lg z-30 py-1" onClick={() => setChangeOpen(false)}>
                <button role="menuitem" type="button" disabled={Boolean(rewriteJob)} onClick={() => setRewriteOpen((o) => !o)} className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-soft disabled:opacity-50">
                  {copy.rewrite.button}
                  <span className="block text-xs text-ink-tertiary">{copy.rewrite.short}</span>
                </button>
                {brandData?.image_generation && (
                  <button role="menuitem" type="button" onClick={() => void drawDeck()} className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-soft">
                    {copy.talk.image.deck}
                    <span className="block text-xs text-ink-tertiary">{copy.talk.image.deckHint}</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <span className="flex-1" />
          <div className="flex items-center gap-2">
            <Link to={`/talks/${id}/present`} title={copy.present.hint} className={buttonClass('ghost')}>
              <Play className="w-4 h-4" aria-hidden /> <span className="hidden md:inline">{copy.present.button}</span>
            </Link>
            <Link to={`/talks/${id}/rehearse`} title={copy.rehearsal.hint} className={buttonClass('ghost')}>
              <Mic className="w-4 h-4" aria-hidden /> <span className="hidden md:inline">{copy.rehearsal.button}</span>
            </Link>
            <div className="flex items-center gap-1">
              <Button variant={talk.share_token ? 'secondary' : 'ghost'} loading={share.isPending} onClick={() => share.mutate(!talk.share_token)}
                      aria-label={copy.talk.share.button} title={copy.talk.share.hint}>
                <Link2 className="w-4 h-4" aria-hidden /> <span className="hidden md:inline">{talk.share_token ? copy.talk.share.off : copy.talk.share.button}</span>
              </Button>
              {shareUrl && (
                <Button variant="ghost" size="icon" onClick={copyShare} aria-label={copy.talk.share.copy} title={shareUrl}>
                  {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
                </Button>
              )}
            </div>
            {/* Plain links, not fetch+blob: the browser streams the file and
                shows its own download UI; the cookie rides along same-origin. */}
            <div className="relative flex-shrink-0">
              <Button onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
                <Download className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">{copy.talk.downloadMenu}</span>
                {selected.size > 0 && <span className="text-xs bg-bg/20 rounded px-1.5 tabular-nums">{selected.size}</span>}
                <ChevronDown className="w-3.5 h-3.5" aria-hidden />
              </Button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-1 w-72 bg-surface border border-border rounded-md shadow-lg z-30 py-1" onClick={() => setMenuOpen(false)}>
                  {/* The gate (lib/planTier.ts) answers a plain <a download> with a
                      403 JSON the browser would save as a file — so a locked .pptx
                      is a link to the tariff page, not a download that fails. */}
                  {pptxOpen ? (
                    <a role="menuitem" href={`/api/talks/${id}/export.pptx${selQuery}`} download onClick={afterDownload} className="block px-3 py-2 text-sm text-ink hover:bg-surface-soft">
                      {selected.size > 0 ? copy.talk.downloadSelected('.pptx', selected.size) : copy.talk.downloadAll('.pptx')}
                      {Number.isFinite(left('pptx')) && <span className="block text-xs text-ink-tertiary">{copy.billing.quotaLeft('.pptx', left('pptx'), user!.quota.pptx.limit!)}</span>}
                    </a>
                  ) : (
                    <Link role="menuitem" to="/billing" className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-surface-soft">
                      {copy.billing.quotaUsed('.pptx', user?.quota?.pptx.limit ?? 0)} <span className="text-accent text-xs font-medium">{copy.billing.upgradeLink} →</span>
                    </Link>
                  )}
                  {pdfOpen ? (
                    <>
                      <a role="menuitem" href={`/api/talks/${id}/export.pdf${selQuery}`} download onClick={afterDownload} className="block px-3 py-2 text-sm text-ink hover:bg-surface-soft">
                        {selected.size > 0 ? copy.talk.downloadSelected('PDF', selected.size) : copy.talk.downloadAll('PDF')}
                        {Number.isFinite(left('pdf')) && <span className="block text-xs text-ink-tertiary">{copy.billing.quotaLeft('PDF', left('pdf'), user!.quota.pdf.limit!)}</span>}
                      </a>
                      {talk.notes_enabled && (
                        <a role="menuitem" href={`/api/talks/${id}/export.pdf${selQuery}${selQuery ? '&' : '?'}notes=1`} download onClick={afterDownload} className="block px-3 py-2 text-sm text-ink hover:bg-surface-soft">
                          {copy.talk.withNotes}
                        </a>
                      )}
                    </>
                  ) : (
                    <Link role="menuitem" to="/billing" className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-surface-soft">
                      {copy.billing.quotaUsed('PDF', user?.quota?.pdf.limit ?? 0)} <span className="text-accent text-xs font-medium">{copy.billing.upgradeLink} →</span>
                    </Link>
                  )}
                  {selected.size > 0 && <button role="menuitem" type="button" onClick={() => setSelected(new Set())} className="block w-full text-left px-3 py-2 text-sm text-ink-secondary hover:bg-surface-soft">{copy.talk.clearSelection}</button>}
                </div>
              )}
            </div>
            <div className="relative">
              <Button variant="ghost" size="icon" onClick={() => setMoreOpen((o) => !o)} aria-haspopup="menu" aria-expanded={moreOpen} aria-label={copy.talk.more} title={copy.talk.more}>
                <MoreHorizontal className="w-4 h-4" aria-hidden />
              </Button>
              {moreOpen && (
                <div role="menu" className="absolute right-0 mt-1 w-56 bg-surface border border-border rounded-md shadow-lg z-30 py-1" onClick={() => setMoreOpen(false)}>
                  <button role="menuitem" type="button" disabled={remove.isPending} onClick={() => { if (window.confirm(copy.talk.deleteConfirm)) remove.mutate() }}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-danger hover:bg-danger-bg">
                    <Trash2 className="w-4 h-4" aria-hidden /> {copy.talk.delete}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {rewriteOpen && !rewriteJob && (
        <form className="bg-surface border border-border rounded-lg p-4 space-y-2" onSubmit={(e) => { e.preventDefault(); void beginRewrite() }}>
          <label htmlFor="rw" className="block text-sm font-medium text-ink">{copy.rewrite.title}</label>
          <p className="text-xs text-ink-secondary max-w-[70ch]">{copy.rewrite.lead}</p>
          <div className="flex gap-2">
            <input id="rw" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={copy.rewrite.placeholder} maxLength={500} className={inputClass} autoFocus />
            <Button type="submit" loading={busy} disabled={!instruction.trim()}>{copy.rewrite.start}</Button>
          </div>
        </form>
      )}
      {rewriteJob && rewrite && (rewrite.status === 'pending' || rewrite.status === 'processing') && (
        <div className="bg-surface border border-border rounded-lg p-4 flex items-center gap-3"><Spinner /><span className="text-sm text-ink-secondary">{copy.rewrite.working}</span></div>
      )}
      {rewriteJob && rewrite?.status === 'failed' && (
        <div className="bg-surface border border-border rounded-lg p-4 flex items-center gap-3"><p role="alert" className="text-sm text-danger">{rewrite.error_message}</p><Button size="sm" variant="ghost" onClick={dismiss}>{copy.rewrite.dismiss}</Button></div>
      )}
      {rewriteJob && rewrite?.status === 'ready' && rewrite.proposal && (
        <RewriteReview current={slides} proposal={rewrite.proposal} language={talk.language} busy={busy} onApply={(a) => void acceptRewrite(a)} onDismiss={dismiss} />
      )}
      {beforeRewrite && !rewriteJob && (
        // One-step undo of the applied rewrite: the previous array, held in
        // memory, written back through the same boundary (§5: no history).
        <div className="flex items-center gap-3 text-sm text-ink-secondary">
          <Button size="sm" variant="ghost" onClick={() => { const b = beforeRewrite; setBeforeRewrite(null); void run(() => replaceTalkSlides(id, b)).then(() => toast(copy.rewrite.undone, 'success')) }}>{copy.rewrite.undo}</Button>
        </div>
      )}

      {/* The manuscript: slide column + 280px margin for the speaker's text
          at lg; one column below. SlideCard is `display: contents`, so its
          two cells land here and align row by row. The insert chip is a
          full-width row sitting on the rule between two slides. */}
      <div className={`border-t border-border-strong grid ${talk.notes_enabled ? 'lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-x-8' : ''}`}>
        {slides.map((s, i) => (
          <SlideCard key={i} slide={s} number={i + 1} total={slides.length} language={talk.language} notesEnabled={talk.notes_enabled} overfull={overfull.get(i)}
                     edit={{ ...edit, onUndo: previous.has(i) ? edit.onUndo : undefined }} isFirst={i === 0} isLast={i === slides.length - 1}
                     selected={selected.has(i)} onSelect={toggleSelect} />
        )).flatMap((card, i) => [card,
          <div key={`ins-${i}`} className="col-span-full flex justify-center -my-4 relative z-10">
            <button type="button" onClick={() => insertAfter(i)} disabled={busy || slides.length >= MAX_SLIDE_COUNT}
                    className="h-8 px-3 inline-flex items-center gap-1 rounded-full bg-bg text-xs text-ink-tertiary hover:text-accent transition-colors disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" aria-hidden /> {copy.talk.edit.insertAfter}
            </button>
          </div>,
        ])}
      </div>
    </div>
  )
}
