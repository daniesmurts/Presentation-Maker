import { describe, it, expect, vi } from 'vitest'
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
import { generateTalkPptx } from './talkExport'
import { THEMES } from './themes'
import type { Slide } from '../../../shared/types'

const base = { notes: '', citations: [] }
const DECK: Slide[] = [
  { type: 'title', title: 'Заголовок', ...base, notes: 'вступительное слово', body: { subtitle: 'Подзаголовок', presenter: 'Имя' } },
  { type: 'bullets', title: 'Тезисы', ...base, body: { items: ['раз $x^2$', 'два [1]'] } },
  { type: 'concept', title: 'Понятие', ...base, body: { definition: 'опр', supporting: ['a'] } },
  { type: 'comparison', title: 'Сравнение', ...base, body: { columns: [{ header: 'A', items: ['1'] }, { header: 'B', items: ['2'] }, { header: 'C', items: ['3'] }] } },
  { type: 'diagram', title: 'Схема', ...base, body: { image_query: 'схема', caption: 'подпись', points: ['п'], image: null } },
  { type: 'discussion', title: 'Вопрос', ...base, body: { question: '?', prompts: ['a'], expected_angles: [] } },
  { type: 'cta', title: 'Призыв', ...base, body: { action: 'Сделайте', reasons: ['потому'], contact: 'mail@x' } },
  { type: 'summary', title: 'Итоги', ...base, body: { takeaways: ['x'], next_steps: ['y'] } },
]
const talk = (slides: Slide[], theme_id = 'default') => ({ title: 'Тест', slides, language: 'ru' as const, theme_id })

async function unzip(buffer: Buffer) {
  const JSZip = (await import('jszip')).default
  return JSZip.loadAsync(buffer)
}

describe('generateTalkPptx', () => {
  it('writes one slide per input, in order, with every type rendered', async () => {
    const zip = await unzip(await generateTalkPptx(talk(DECK)))
    const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    expect(names).toHaveLength(DECK.length)
    const first = await zip.file(names[0])!.async('string')
    expect(first).toContain('Заголовок')
    const cta = await zip.file(names[6])!.async('string')
    expect(cta).toContain('Сделайте')
    expect(cta).toContain('mail@x')
  }, 30_000)

  it('writes speaker notes into the slide’s notes part (pptxgenjs emits an empty part for every slide)', async () => {
    const zip = await unzip(await generateTalkPptx(talk(DECK)))
    expect(await zip.file('ppt/notesSlides/notesSlide1.xml')!.async('string')).toContain('вступительное слово')
    expect(await zip.file('ppt/notesSlides/notesSlide2.xml')!.async('string')).not.toContain('вступительное слово')
  }, 30_000)

  it('strips [N] markers and flattens inline LaTeX in slide text', async () => {
    const zip = await unzip(await generateTalkPptx(talk(DECK)))
    const xml = await zip.file('ppt/slides/slide2.xml')!.async('string')
    expect(xml).toContain('раз x²')
    expect(xml).not.toContain('[1]')
  }, 30_000)

  // pptxgenjs 4.0.1 writes one slideMasterN Override PER SLIDE; PowerPoint
  // flags the dangling ones as corruption. Assert the fix on a multi-slide deck.
  it('does not reference a slideMasterN.xml part beyond the one that exists in the zip', async () => {
    const zip = await unzip(await generateTalkPptx(talk(DECK)))
    const real = Object.keys(zip.files).filter((n) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(n))
    expect(real).toEqual(['ppt/slideMasters/slideMaster1.xml'])
    const ct = await zip.file('[Content_Types].xml')!.async('string')
    expect([...ct.matchAll(/\/ppt\/slideMasters\/slideMaster(\d+)\.xml/g)].map((m) => Number(m[1]))).toEqual([1])
  }, 30_000)

  // Four captioned formulas + explanation — the shape that once produced a
  // negative extent (cy="-3966630") and a deck PowerPoint refused to open.
  it('emits no non-positive shape extents on a formula-dense deck', async () => {
    const f = (latex: string, caption: string) => ({ latex, caption })
    const deck: Slide[] = [{
      type: 'formula', title: 'Уравнения', ...base,
      body: {
        formulas: [
          f(String.raw`\frac{\partial \rho}{\partial t} + \frac{\partial (\rho u_i)}{\partial x_i} = 0`, 'Неразрывность'),
          f(String.raw`\frac{\partial (\rho u_i)}{\partial t} = -\frac{\partial p}{\partial x_i} + \rho g_i`, 'Импульс'),
          f(String.raw`\rho\frac{DU_i}{Dt}=\frac{\partial}{\partial x_j}\left[\mu\left(\frac{\partial U_i}{\partial x_j}\right)-\rho\overline{u_i'u_j'}\right]`, 'RANS'),
          f(String.raw`\frac{\partial (\rho C)}{\partial t} = \frac{\partial}{\partial x_i}\left(\Gamma \frac{\partial C}{\partial x_i}\right) + S_C`, 'Перенос'),
        ],
        explanation: 'Показаны уравнения неразрывности, импульса и переноса примеси.',
      },
    }]
    const zip = await unzip(await generateTalkPptx(talk(deck)))
    const xml = (await zip.file('ppt/slides/slide1.xml')!.async('string')).replace(/<p:grpSpPr>[\s\S]*?<\/p:grpSpPr>/g, '')
    const extents = [...xml.matchAll(/\b(cx|cy)="(-?\d+)"/g)]
    expect(extents.length).toBeGreaterThan(0)
    expect(extents.filter(([, , v]) => Number(v) <= 0)).toEqual([])
    // The formulas rendered as pictures, not as the Unicode fallback.
    expect(xml.match(/<p:pic>/g)?.length).toBe(4)
  }, 60_000)

  it('a theme is data: the same slides under two themes produce different colours, same structure', async () => {
    const a = await unzip(await generateTalkPptx(talk(DECK.slice(0, 2), 'default')))
    const b = await unzip(await generateTalkPptx(talk(DECK.slice(0, 2), 'dark')))
    const xa = await a.file('ppt/slides/slide2.xml')!.async('string')
    const xb = await b.file('ppt/slides/slide2.xml')!.async('string')
    expect(xa).toContain('0F6E6E')
    expect(xb).toContain('5FC4BE')
    expect(xb).not.toContain('0F6E6E')
    expect((xa.match(/<p:sp>/g) ?? []).length).toBe((xb.match(/<p:sp>/g) ?? []).length)
  }, 30_000)

  it('themes v2: the title sits in the lower half of the title slide, and every slide carries «NN / NN»', async () => {
    const zip = await unzip(await generateTalkPptx(talk(DECK)))
    const first = await zip.file('ppt/slides/slide1.xml')!.async('string')
    // The shape whose text is the title: its frame's y offset (EMU) must be past half the slide (5.63 in → 2.815 in).
    const sp = first.split('<p:sp>').find((x) => x.includes('Заголовок'))!
    const y = Number(sp.match(/<a:off x="\d+" y="(\d+)"/)![1]) / 914400
    expect(y).toBeGreaterThan(2.815)
    expect(first).toContain(`01 / ${String(DECK.length).padStart(2, '0')}`)
    const last = await zip.file(`ppt/slides/slide${DECK.length}.xml`)!.async('string')
    expect(last).toContain(`${String(DECK.length).padStart(2, '0')} / ${String(DECK.length).padStart(2, '0')}`)
  }, 30_000)

  it('an unknown theme id falls back to the default rather than throwing', async () => {
    await expect(generateTalkPptx(talk(DECK.slice(0, 1), 'no-such-theme'))).resolves.toBeInstanceOf(Buffer)
  })

  it('refuses an empty deck', async () => {
    await expect(generateTalkPptx(talk([]))).rejects.toThrow()
  })
})

describe('brand kit applied to a theme', () => {
  // A header-only PNG 400×100 — a wide logo, the case that came out squashed
  // in the parent when the frame size was trusted.
  const wideLogo = (() => {
    const buf = Buffer.alloc(33)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
    buf.writeUInt32BE(13, 8); buf.write('IHDR', 12, 'latin1'); buf.writeUInt32BE(400, 16); buf.writeUInt32BE(100, 20)
    return buf
  })()
  const brand = { accent: 'B42318', name: 'ООО «Пример»', logo: { buffer: wideLogo, dataUri: 'data:image/png;base64,' + wideLogo.toString('base64') } }

  it('draws the logo at its own aspect ratio and the name on the title slide; the accent replaces the theme’s', async () => {
    const zip = await unzip(await generateTalkPptx(talk(DECK.slice(0, 2)), { brand }))
    const title = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(title).toContain('ООО «Пример»')
    expect(title).toContain('<p:pic>')
    // 2.6in box, 4:1 logo → 2.6 × 0.65in; EMU = in × 914400. cy must be a quarter of cx.
    const pic = title.slice(title.indexOf('<p:pic>'))
    const cx = Number(pic.match(/cx="(\d+)"/)![1]), cy = Number(pic.match(/cy="(\d+)"/)![1])
    expect(cx / cy).toBeCloseTo(4, 1)
    const body = await zip.file('ppt/slides/slide2.xml')!.async('string')
    expect(body).toContain('B42318')
    expect(body).not.toContain('0F6E6E')
  }, 30_000)

  it('a pale brand accent keeps the graphics but labels fall back to ink2 — contrast is measured, not assumed', async () => {
    const pale = { accent: 'F4C55A', name: null, logo: null }   // 1.6:1 on white
    const deck: Slide[] = [{ type: 'summary', title: 'Итоги', ...base, body: { takeaways: ['x'], next_steps: ['y'] } }]
    const zip = await unzip(await generateTalkPptx(talk(deck), { brand: pale }))
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(xml).toContain('F4C55A')                       // the header rule, a graphic
    // Themes v2: the only label on a summary slide is the «ЧТО ДАЛЬШЕ» kicker.
    const label = xml.slice(xml.indexOf('ЧТО ДАЛЬШЕ') - 600, xml.indexOf('ЧТО ДАЛЬШЕ'))
    expect(label).toContain('57635F')                     // ink2 carries the label text
    expect(label).not.toContain('F4C55A')
  }, 30_000)

  it('the warm theme exists and differs from default', async () => {
    const zip = await unzip(await generateTalkPptx(talk(DECK.slice(0, 2), 'warm')))
    expect(await zip.file('ppt/slides/slide2.xml')!.async('string')).toContain('8A5C06')
  }, 30_000)

  // Design v3 (L3): a talk on theme_id 'custom' is drawn in the workspace's
  // own theme, carried in the brand kit; without one it falls back to the default.
  it('renders the brand kit’s custom theme for theme_id = custom, and the default without one', async () => {
    const custom = { ...THEMES.warm, id: 'custom', name: 'Наша', palette: { ...THEMES.warm.palette, accent: '7A1E1E' } }
    const zip = await unzip(await generateTalkPptx(talk(DECK.slice(0, 2), 'custom'), { brand: { customTheme: custom } }))
    expect(await zip.file('ppt/slides/slide2.xml')!.async('string')).toContain('7A1E1E')
    const plain = await unzip(await generateTalkPptx(talk(DECK.slice(0, 2), 'custom')))
    expect(await plain.file('ppt/slides/slide2.xml')!.async('string')).toContain(THEMES.default.palette.accent)
  }, 30_000)

  // Design v3 (TODO L2): the rhythm types and the two variants render;
  // the text lands in the slide XML; a split bullets slide has two text
  // boxes; a stats slide's figures are in the display face, not the mono.
  it('renders section, agenda, stats (both variants), quote and image-full, with the design applied', async () => {
    const deck: Slide[] = [
      { type: 'section', title: 'Рынок', ...base, body: { kicker: 'Часть 2', lead: 'Где деньги' } },
      { type: 'agenda', title: 'План', ...base, body: { items: ['Раз', 'Два', 'Три', 'Четыре', 'Пять'] } },
      { type: 'stats', title: 'Цифры', ...base, body: { stats: [{ value: '42 %', label: 'доля', note: null }, { value: '×3', label: 'рост', note: 'за год' }] } },
      { type: 'stats', title: 'Одна', ...base, design: { variant: 'hero-number', emphasis: 'plain', backdrop: 'none' }, body: { stats: [{ value: '1,2 млрд', label: 'выручка', note: null }] } },
      { type: 'quote', title: 'Клиент', ...base, body: { quote: 'Мы увидели', attribution: 'Иван' } },
      { type: 'image-full', title: 'Вид', ...base, image_query: 'дашборд', body: { caption: 'подпись' } },
      { type: 'bullets', title: 'Шесть', ...base, design: { variant: 'split', emphasis: 'accent', backdrop: 'pattern' }, body: { items: ['a', 'b', 'c', 'd', 'e', 'f'] } },
    ]
    const zip = await unzip(await generateTalkPptx(talk(deck, 'default')))
    const xml = async (i: number) => zip.file(`ppt/slides/slide${i}.xml`)!.async('string')
    expect(await xml(1)).toContain('ЧАСТЬ 2')
    expect(await xml(2)).toContain('05')                      // the fifth agenda number
    expect(await xml(3)).toContain('42 %')
    expect((await xml(3)).match(/typeface="Georgia"/g)!.length).toBeGreaterThan(0)   // figures in the display face
    expect(await xml(4)).toContain('1,2 млрд')
    expect(await xml(5)).toContain('«Мы увидели»')
    expect(await xml(6)).toContain('дашборд')                 // the placeholder names the query
    // split: two bullet boxes, three items each
    const split = await xml(7)
    expect(split.match(/<a:buChar char="&#x25CF;"\/>/g)!.length).toBe(6)
    // title, rule, two columns, two footer boxes — one more shape than the plain layout
    expect(split.match(/<p:sp>/g)!.length).toBe(6)
    // backdrop=pattern → the hero layout
    const rel = (i: number) => zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)!.async('string').then((r) => r.match(/slideLayout\d+/)![0])
    expect(await rel(7)).toBe(await rel(1))
    expect(await rel(7)).not.toBe(await rel(2))
  }, 30_000)

  // Design v3 (TODO L1): the background raster is embedded ONCE per role
  // through a slide layout — pptxgenjs writes a media part per slide for a
  // per-slide background, which on 40 slides is 40 copies. Hero slides
  // (title, question, cta) use one layout, content the other, and no slide
  // carries its own <p:bg> to override the picture.
  it('embeds the background once per role via slide layouts, and slides inherit it', async () => {
    const zip = await unzip(await generateTalkPptx(talk(DECK, 'bold')))
    const media = Object.keys(zip.files).filter((n) => /^ppt\/media\/.+\.png$/.test(n) && !zip.files[n].dir)
    expect(media.filter((n) => n.includes('TZ_HERO')).length).toBe(1)
    expect(media.filter((n) => n.includes('TZ_QUIET')).length).toBe(1)
    const layoutOf = async (i: number) => (await zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)!.async('string')).match(/slideLayout\d+/)![0]
    expect(await layoutOf(1)).toBe(await layoutOf(6))        // title and discussion: hero
    expect(await layoutOf(2)).toBe(await layoutOf(8))        // bullets and summary: quiet
    expect(await layoutOf(1)).not.toBe(await layoutOf(2))
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).not.toContain('<p:bg>')
  }, 30_000)
})
