import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, X } from 'lucide-react'
import { getBrand, updateBrand, uploadLogo, removeLogo, setStyleLearning, type Brand, type ThemeSwatch } from '../api/brand'
import { backgroundSvg, backgroundCssUrl, hasTreatment, SOLID } from '../../../shared/slideBackground'
import { Checkbox } from '../components/ui/Field'
import { errorMessage } from '../api/client'
import Button from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import Spinner from '../components/ui/Spinner'
import { useToast } from '../lib/toast'
import { copy } from '../lib/copy'

// The brand kit (CLAUDE.md §5.2): accent, logo, name — with a preview on
// white AND on dark, because a logo drawn for one is usually wrong on the
// other, and the measured contrast of the accent on each theme ground, so
// the page says where labels will stay dark instead of letting the user
// find out on the projector.

export default function BrandPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['brand'], queryFn: getBrand })
  const [accent, setAccent] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  // A cache-buster: the logo URL is constant, so a replaced logo would show stale.
  const [logoStamp, setLogoStamp] = useState(0)

  useEffect(() => {
    if (data) { setAccent(data.brand.accent ? `#${data.brand.accent}` : ''); setName(data.brand.name ?? '') }
  }, [data])

  const apply = (brand: Brand) => { qc.setQueryData(['brand'], (old: typeof data) => (old ? { ...old, brand } : old)); setLogoStamp(Date.now()) }
  async function run(fn: () => Promise<Brand>, ok = copy.brandKit.saved) {
    setBusy(true)
    try { apply(await fn()); toast(ok, 'success') } catch (err) { toast(errorMessage(err), 'error') } finally { setBusy(false) }
  }

  if (isLoading || !data) return <Spinner />
  const { brand, themes } = data
  const light = themes.find((t) => t.id === 'default')!, dark = themes.find((t) => t.id === 'dark')!
  const hexOk = /^#?[0-9a-f]{6}$/i.test(accent.trim())
  const previewAccent = hexOk ? accent.trim().replace('#', '') : null
  const logoUrl = brand.logo ? `${brand.logo.url}?v=${logoStamp}` : null

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <div className="eyebrow text-accent mb-1.5">{copy.nav.workspace}</div>
        <h1 className="display font-semibold text-[30px] leading-tight text-ink">{copy.brandKit.heading}</h1>
        <p className="text-sm text-ink-secondary mt-1.5 max-w-[62ch]">{copy.brandKit.lead}</p>
      </div>

      {/* One form, one primary action (CLAUDE.md §6): accent and name save together. */}
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void run(() => updateBrand({ accent: accent.trim() || null, name: name.trim() || null })) }}>
      <Field label={copy.brandKit.accent} hint={copy.brandKit.accentHint} htmlFor="accent">
        <div className="flex items-center gap-2">
          <input type="color" aria-label={copy.brandKit.accent} value={hexOk ? (accent.startsWith('#') ? accent : `#${accent}`) : '#2F4FD0'}
                 onChange={(e) => setAccent(e.target.value.toUpperCase())} className="h-10 w-12 p-0.5 rounded-md border border-border-strong bg-surface cursor-pointer" />
          <input id="accent" value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#2F4FD0" className={`${inputClass} !w-36 font-mono`} maxLength={7} />
          {brand.accent && <Button size="sm" variant="ghost" onClick={() => { setAccent(''); void run(() => updateBrand({ accent: null })) }} disabled={busy}>{copy.brandKit.reset}</Button>}
        </div>
        {brand.contrast.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs">
            {brand.contrast.map((c) => (
              <li key={c.theme} className={c.textSafe ? 'text-success' : 'text-warning'}>
                {copy.brandKit.contrast(themes.find((t) => t.id === c.theme)?.name ?? c.theme, c.ratio, c.textSafe)}
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label={copy.brandKit.name} hint={copy.brandKit.nameHint} htmlFor="name">
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} />
      </Field>
      <Button type="submit" loading={busy} disabled={accent.trim() !== '' && !hexOk}>Сохранить</Button>
      </form>

      <Field label={copy.brandKit.logo} hint={copy.brandKit.logoHint}>
        <div className="flex flex-wrap items-center gap-3">
          {logoUrl && <img src={logoUrl} alt="" className="h-12 w-auto max-w-[200px] object-contain rounded border border-border bg-surface p-1" />}
          <label className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-sm border border-border bg-surface cursor-pointer hover:bg-surface-soft">
            <Upload className="w-4 h-4" aria-hidden /> {logoUrl ? copy.brandKit.replace : copy.brandKit.upload}
            <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={busy}
                   onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(() => uploadLogo(f)) }} />
          </label>
          {logoUrl && <Button size="sm" variant="ghost" onClick={() => void run(removeLogo)} disabled={busy}><X className="w-3.5 h-3.5" aria-hidden /> {copy.brandKit.removeLogo}</Button>}
        </div>
      </Field>

      <div className="border-y border-border">
        <Checkbox checked={data.style_learning} label={copy.styleLearning.label} hint={copy.styleLearning.hint}
                  onChange={(v) => { void setStyleLearning(v).then((on) => { qc.setQueryData(['brand'], (old: typeof data) => (old ? { ...old, style_learning: on } : old)); toast(copy.brandKit.saved, 'success') }).catch((err) => toast(errorMessage(err), 'error')) }} />
      </div>

      <section aria-label={copy.brandKit.preview}>
        <h2 className="eyebrow mb-3">{copy.brandKit.preview}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <SlidePreview theme={light} accent={previewAccent} name={name} logoUrl={logoUrl} caption={copy.brandKit.previewOnLight} />
          <SlidePreview theme={dark} accent={previewAccent} name={name} logoUrl={logoUrl} caption={copy.brandKit.previewOnDark} />
        </div>
      </section>
    </div>
  )
}

// A 16:9 card mimicking the title slide (themes v2: a short accent rule,
// the kicker, the title low-left, the brand name in the footer, the logo
// top-left), coloured from the same data the exporter uses.
function SlidePreview({ theme, accent, name, logoUrl, caption }: { theme: ThemeSwatch; accent: string | null; name: string; logoUrl: string | null; caption: string }) {
  const a = accent ?? theme.accent
  // The title slide's background at hero strength, tinted with the brand
  // accent the way the export tints it (the strength is the theme's; the
  // exporter refits it for a pale accent — this preview does not).
  const recipe = theme.background ?? SOLID
  const bgImage = hasTreatment(recipe, 'hero') ? backgroundCssUrl(backgroundSvg({ bg: theme.bg, accent: a, ink: theme.ink, panel: theme.panel }, recipe, 'hero')) : undefined
  return (
    <figure className="m-0">
      <div className="aspect-video rounded-md border border-border overflow-hidden relative" style={{ background: `#${theme.bg}`, backgroundImage: bgImage, backgroundSize: '100% 100%', fontFamily: 'Arial, sans-serif' }}>
        {logoUrl && <img src={logoUrl} alt="" className="absolute left-[6%] top-[6%] h-[12%] max-w-[22%] object-contain" />}
        <div className="absolute left-[6%] right-[6%] bottom-[11%]">
          <div className="h-[3px] w-[9%] mb-[3%]" style={{ background: `#${a}` }} />
          <div className="text-[7px] tracking-[0.14em] uppercase font-bold mb-[1.6%]" style={{ color: `#${theme.ink2}` }}>{copy.brandKit.sampleLabel}</div>
          <div className="font-semibold text-[15px] leading-tight max-w-[80%]" style={{ color: `#${theme.ink}`, fontFamily: 'Georgia, serif' }}>{copy.brandKit.sampleTitle}</div>
        </div>
        <div className="absolute left-[6%] right-[6%] bottom-[3.2%] flex justify-between text-[6px]" style={{ color: `#${theme.ink2}` }}>
          <span>{name}</span><span className="font-mono">01 / 12</span>
        </div>
      </div>
      <figcaption className="mt-1 text-xs text-ink-secondary">{caption}</figcaption>
    </figure>
  )
}
