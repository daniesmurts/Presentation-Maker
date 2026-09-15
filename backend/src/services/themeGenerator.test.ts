import { describe, it, expect, vi } from 'vitest'
vi.mock('./llm/registry', () => ({ chatJSON: vi.fn() }))
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
import { chatJSON } from './llm/registry'
import { coerceTheme, readStoredTheme, deriveThemeFromAccent, themeFromColorScheme, themeFromPptx, generateThemeFromDescription, ALLOWED_FACES } from './themeGenerator'
import { extractPptxColorScheme } from './pptxImport'
import { contrastRatio } from '../lib/brandColor'
import { THEMES } from './themes'

// Design v3 (L3): a theme from anywhere goes through the same two gates.

const floorsHold = (t: ReturnType<typeof coerceTheme>) => {
  const p = t.palette
  for (const [fg, bg] of [[p.ink, p.bg], [p.ink2, p.bg], [p.ink, p.panel], [p.ink2, p.panel], [p.accent, p.bg], [p.accentText, p.accent]]) {
    expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
  }
}

describe('coerceTheme — shape', () => {
  it('fills every missing part from the base, rejects a face off the allow-list and a bad hex, clamps strengths', () => {
    const t = coerceTheme({ name: 'Ночь', palette: { bg: '#101010', accent: 'zzz' }, fonts: { display: 'Comic Sans MS' }, background: { kind: 'laser', hero: 7 } }, THEMES.dark)
    expect(t.id).toBe('custom')
    expect(t.name).toBe('Ночь')
    expect(t.palette.bg).toBe('101010')
    expect(t.palette.accent).toBe(THEMES.dark.palette.accent)
    expect(t.fonts.display).toBe(THEMES.dark.fonts.display)
    expect(t.background.kind).toBe(THEMES.dark.background.kind)
    expect(t.background.hero).toBe(1)
    expect(ALLOWED_FACES).toContain('Georgia')
  })
  it('readStoredTheme validates a stored row again and null stays null', () => {
    expect(readStoredTheme(null)).toBeNull()
    const t = readStoredTheme({ ...THEMES.warm, id: 'whatever', palette: { ...THEMES.warm.palette, ink2: 'CCCCCC' } })!
    expect(t.id).toBe('custom')
    expect(contrastRatio(t.palette.ink2, t.palette.bg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('deriveThemeFromAccent', () => {
  it('a whole palette from one colour, light and dark, both clearing the floors — even from a pale accent', () => {
    for (const accent of ['2F4FD0', 'F3D27A', '0F6E6E', 'FF6B6B']) for (const mode of ['light', 'dark'] as const) {
      const v = deriveThemeFromAccent(accent, mode, 'Бренд')
      floorsHold(v.theme)
      expect(v.theme.name).toBe('Бренд')
      expect(v.theme.background.kind).toBe('wash')
    }
    // a pale accent on a light ground was corrected and says so
    expect(deriveThemeFromAccent('F3D27A', 'light', 'x').issues.some((i) => i.pair === 'accent/bg')).toBe(true)
  })
})

// A theme1.xml as Office writes it: dk1/lt1 as sysClr with lastClr, the
// rest srgbClr — the shape our own exporter never produces.
const OFFICE_THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements>
<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>
</a:themeElements></a:theme>`

async function pptxWithTheme(themeXml: string | null): Promise<Buffer> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('ppt/slides/slide1.xml', '<p:sld/>')
  if (themeXml) zip.file('ppt/theme/theme1.xml', themeXml)
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('a theme from an uploaded .pptx — a brand source, not a layout source', () => {
  it('reads Office’s scheme (sysClr and srgbClr alike) and the major face', async () => {
    const s = (await extractPptxColorScheme(await pptxWithTheme(OFFICE_THEME)))!
    expect(s).toMatchObject({ dk1: '000000', lt1: 'FFFFFF', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', majorFont: 'Georgia', minorFont: 'Calibri' })
    const v = themeFromColorScheme(s, 'Наша')
    expect(v.theme.palette).toMatchObject({ bg: 'FFFFFF', ink: '000000', panel: 'E7E6E6' })
    // Office blue clears white (4.9) but not the E7E6E6 panel (3.9): corrected, and reported
    expect(v.theme.palette.accent).not.toBe('4472C4')
    expect(v.issues.map((i) => i.pair)).toContain('accent/panel')
    expect(v.theme.fonts.display).toBe('Georgia')
    expect(v.theme.fonts.body).toBe(THEMES.default.fonts.body)   // Calibri is not on the allow-list
    floorsHold(v.theme)
  })
  it('a deck without a theme part yields nothing; our own decks yield ours', async () => {
    expect(await themeFromPptx(await pptxWithTheme(null), 'x')).toBeNull()
    expect(await extractPptxColorScheme(Buffer.from('not a zip'))).toBeNull()
  })
})

describe('generateThemeFromDescription — the model proposes, the validator disposes', () => {
  it('coerces a dark answer against the dark base and corrects its failing pairs', async () => {
    vi.mocked(chatJSON).mockResolvedValueOnce({ name: 'Финтех', palette: { bg: '#0B1220', ink: '#FFFFFF', ink2: '#556677', accent: '#3355AA' }, fonts: { display: 'Arial' }, background: { kind: 'blob', hero: 0.9, quiet: 0.1 } })
    const v = await generateThemeFromDescription('финтех, надёжно, тёмная', 'ru', { userId: 'u', workspaceId: 'w' })
    expect(v.theme.name).toBe('Финтех')
    expect(v.theme.palette.panel).toBe(THEMES.dark.palette.panel)   // missing → the dark base's, not a white panel
    floorsHold(v.theme)
    expect(v.issues.map((i) => i.pair)).toEqual(expect.arrayContaining(['ink2/bg', 'accent/bg']))
    expect(v.theme.background.hero).toBeLessThan(0.9)
    const [messages] = vi.mocked(chatJSON).mock.calls[0]
    expect(messages[0].content).toContain('4.5:1')
  })
  it('garbage from the model is still a valid theme', async () => {
    vi.mocked(chatJSON).mockResolvedValueOnce('nope')
    const v = await generateThemeFromDescription('что-нибудь', 'ru', { userId: 'u', workspaceId: 'w' })
    floorsHold(v.theme)
    expect(v.theme.id).toBe('custom')
  })
})
