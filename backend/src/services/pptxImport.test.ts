import { describe, it, expect, vi } from 'vitest'
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
import { extractPptxSlides, toTypedSlides, importPptx, detectLanguage } from './pptxImport'
import { generateTalkPptx } from './talkExport'
import type { Slide } from '../../../shared/types'

// Two kinds of fixture, on purpose (CLAUDE.md §9): a round-trip through our
// own exporter proves the parser matches our idea of the format — and
// nothing else; the hand-built XML below is for the gap between "our
// output" and "a real PowerPoint file", where both of the parent's shipped
// import bugs lived.

const SOURCE: Slide[] = [
  { type: 'title', title: 'Кавитация в насосах', notes: '', citations: [], body: { subtitle: 'Гидравлика', presenter: 'Иванов И.И.' } },
  { type: 'bullets', title: 'Что происходит', notes: 'Здесь я объясняю механизм и привожу пример на 3 атм.', citations: [],
    body: { items: ['падение давления ниже давления насыщения', 'образование пузырьков', 'схлопывание у колеса'] } },
  { type: 'concept', title: 'Определение', notes: 'Даю определение и уточняю границы.', citations: [],
    body: { definition: 'Кавитация — образование паровых пузырьков в потоке', supporting: ['зависит от температуры'] } },
]
const talk = { title: 'Кавитация', slides: SOURCE, language: 'ru' as const, theme_id: 'default' }

describe('pptx round-trip through our own exporter', () => {
  it('reads back the slides in order with bullets and notes on the right slide', async () => {
    const slides = await extractPptxSlides(await generateTalkPptx(talk))
    expect(slides.map((s) => s.title)).toEqual(['Кавитация в насосах', 'Что происходит', 'Определение'])
    expect(slides[1].bullets).toEqual(['падение давления ниже давления насыщения', 'образование пузырьков', 'схлопывание у колеса'])
    expect(slides[1].notes).toContain('3 атм')
    expect(slides[2].notes).toContain('границы')
    expect(slides[0].notes).toBe('')
  }, 30_000)

  it('produces slides the rest of the app can render, and detects the language', async () => {
    const { slides, language } = await importPptx(await generateTalkPptx(talk))
    expect(language).toBe('ru')
    expect(slides[0].type).toBe('title')
    expect(slides.slice(1).every((s) => s.type === 'bullets')).toBe(true)
  }, 30_000)

  it('returns nothing for a file that is not a pptx, without throwing', async () => {
    expect((await importPptx(Buffer.from('definitely not a zip'))).slides).toEqual([])
  })
})

describe('toTypedSlides', () => {
  const s = (title: string, bullets: string[]) => ({ title, bullets, notes: '', images: [] })
  it('only treats the first slide as a title when it looks like one', () => {
    expect(toTypedSlides([s('A', ['x', 'y', 'z'])])[0].type).toBe('bullets')
    expect(toTypedSlides([s('A', ['sub'])])[0].type).toBe('title')
  })
  it('carries subtitle and presenter off a cover slide; names an untitled slide in the deck’s language', () => {
    const [cover] = toTypedSlides([s('A', ['Company', 'Jane Doe'])], 'en')
    expect(cover).toMatchObject({ type: 'title', body: { subtitle: 'Company', presenter: 'Jane Doe' } })
    expect(toTypedSlides([s('', ['a', 'b', 'c'])], 'en')[0].title).toBe('Untitled')
    expect(toTypedSlides([s('', ['a', 'b', 'c'])], 'ru')[0].title).toBe('Без заголовка')
  })
})

describe('detectLanguage', () => {
  it('majority Cyrillic → ru, otherwise en', () => {
    expect(detectLanguage([{ title: 'Отчёт за квартал', bullets: ['KPI'], notes: '', images: [] }])).toBe('ru')
    expect(detectLanguage([{ title: 'Quarterly report', bullets: ['ключевые'], notes: 'for the board', images: [] }])).toBe('en')
  })
})

// ─── Hand-built OOXML — the gap between our output and a real file ─────────

async function minimalPptx(paragraphXml: string): Promise<Buffer> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>')
  zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>')
  zip.file('ppt/slides/slide1.xml',
    '<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:txBody>' +
    paragraphXml + '</p:txBody></p:sp></p:spTree></p:cSld></p:sld>')
  return zip.generateAsync({ type: 'nodebuffer' }) as Promise<Buffer>
}

describe('run boundaries (parent production bug, 2026-09-08: «ВСС на базеЖКВН»)', () => {
  it('keeps the space a formatting change left on the preceding run', async () => {
    const [s] = await extractPptxSlides(await minimalPptx('<a:p><a:r><a:t>ВСС на базе </a:t></a:r><a:r><a:t>ЖКВН</a:t></a:r></a:p>'))
    expect(s.title).toBe('ВСС на базе ЖКВН')
  })
  it('treats a soft line break as a word boundary', async () => {
    const [s] = await extractPptxSlides(await minimalPptx('<a:p><a:r><a:t>Рис. 1.</a:t></a:r><a:br/><a:r><a:t>Схема насоса</a:t></a:r></a:p>'))
    expect(s.title).toBe('Рис. 1. Схема насоса')
  })
  it('still collapses the whitespace a prettified deck carries between runs', async () => {
    const [s] = await extractPptxSlides(await minimalPptx('<a:p>\n  <a:r><a:t>Кавитация</a:t></a:r>\n  <a:r><a:t>   в насосах</a:t></a:r>\n</a:p>'))
    expect(s.title).toBe('Кавитация в насосах')
  })
})

describe('slide order comes from <p:sldIdLst>, not file names', () => {
  it('a reordered deck imports in presentation order', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const slide = (t: string) => `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
    zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="1" r:id="rB"/><p:sldId id="2" r:id="rA"/></p:sldIdLst></p:presentation>')
    zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rA" Target="slides/slide1.xml"/><Relationship Id="rB" Target="slides/slide2.xml"/></Relationships>')
    zip.file('ppt/slides/slide1.xml', slide('first file'))
    zip.file('ppt/slides/slide2.xml', slide('second file'))
    const slides = await extractPptxSlides(await zip.generateAsync({ type: 'nodebuffer' }))
    expect(slides.map((s) => s.title)).toEqual(['second file', 'first file'])
  })
})

describe('footer furniture — the slide number, the date, the footer text (hand-built, the shapes PowerPoint makes)', () => {
  it('drops ftr/sldNum/dt placeholders and a text box parked in the bottom strip; keeps the body', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const sp = (t: string, extra = '', off = '') => `<p:sp><p:nvSpPr><p:cNvPr id="1" name="x"/><p:cNvSpPr/><p:nvPr>${extra}</p:nvPr></p:nvSpPr><p:spPr>${off}</p:spPr><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`
    const xml = `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${
      sp('Заголовок', '<p:ph type="title"/>')}${
      sp('пункт')}${
      sp('Компания · конференция', '<p:ph type="ftr"/>')}${
      sp('7', '<p:ph type="sldNum"/>')}${
      sp('14.09.2026', '<p:ph type="dt"/>')}${
      sp('02 / 03', '', '<a:xfrm><a:off x="7000000" y="4700000"/><a:ext cx="1000000" cy="200000"/></a:xfrm>')
    }</p:spTree></p:cSld></p:sld>`
    zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="1" r:id="rA"/></p:sldIdLst></p:presentation>')
    zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rA" Target="slides/slide1.xml"/></Relationships>')
    zip.file('ppt/slides/slide1.xml', xml)
    const [slide] = await extractPptxSlides(await zip.generateAsync({ type: 'nodebuffer' }))
    expect(slide.title).toBe('Заголовок')
    expect(slide.bullets).toEqual(['пункт'])
  })
})

describe('template furniture — the same picture on many slides (real deck, 2026-09-14)', () => {
  const png = (w: number, h: number): Buffer => {
    const buf = Buffer.alloc(33)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
    buf.writeUInt32BE(13, 8); buf.write('IHDR', 12, 'latin1'); buf.writeUInt32BE(w, 16); buf.writeUInt32BE(h, 20)
    return buf
  }
  const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
  async function deckOf(n: number, extraOnSlide2: boolean): Promise<Buffer> {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>${Array.from({ length: n }, (_, i) => `<p:sldId id="${i + 1}" r:id="r${i + 1}"/>`).join('')}</p:sldIdLst></p:presentation>`)
    zip.file('ppt/_rels/presentation.xml.rels', `<Relationships>${Array.from({ length: n }, (_, i) => `<Relationship Id="r${i + 1}" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`)
    for (let i = 1; i <= n; i++) {
      const extra = extraOnSlide2 && i === 2 ? '<p:pic><p:blipFill><a:blip r:embed="rF"/></p:blipFill></p:pic>' : ''
      zip.file(`ppt/slides/slide${i}.xml`, `<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:cSld><p:spTree><p:pic><p:blipFill><a:blip r:embed="rB"/></p:blipFill></p:pic>${extra}<p:sp><p:txBody><a:p><a:r><a:t>s${i}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`)
      zip.file(`ppt/slides/_rels/slide${i}.xml.rels`, `<Relationships><Relationship Id="rB" Type="${IMAGE_REL}" Target="../media/bg.png"/><Relationship Id="rF" Type="${IMAGE_REL}" Target="../media/figure.png"/></Relationships>`)
    }
    zip.file('ppt/media/bg.png', png(2400, 1600))
    zip.file('ppt/media/figure.png', png(800, 600))
    return zip.generateAsync({ type: 'nodebuffer' }) as Promise<Buffer>
  }
  it('a picture on three or more slides is furniture; the slide’s real figure survives', async () => {
    const slides = await extractPptxSlides(await deckOf(4, true))
    expect(slides.map((s) => s.images.length)).toEqual([0, 1, 0, 0])
    expect(slides[1].images[0].width).toBe(800)
  })
  it('a picture on only two slides is kept — a figure shown twice is a real case', async () => {
    const slides = await extractPptxSlides(await deckOf(2, false))
    expect(slides.map((s) => s.images.length)).toEqual([1, 1])
  })
})

describe('slide pictures', () => {
  // Header-only PNGs: imageSize reads the IHDR at a fixed offset.
  const png = (w: number, h: number): Buffer => {
    const buf = Buffer.alloc(33)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
    buf.writeUInt32BE(13, 8); buf.write('IHDR', 12, 'latin1'); buf.writeUInt32BE(w, 16); buf.writeUInt32BE(h, 20)
    return buf
  }
  const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
  const pic = (rId: string) => `<p:pic><p:blipFill><a:blip r:embed="${rId}"/></p:blipFill></p:pic>`
  const rel = (id: string, target: string, extra = '') => `<Relationship Id="${id}" Type="${IMAGE_REL}" Target="${target}"${extra}/>`

  async function deck(slideBody: string, rels: string, media: Record<string, Buffer>): Promise<Buffer> {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>')
    zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>')
    zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:cSld><p:spTree>${slideBody}</p:spTree></p:cSld></p:sld>`)
    zip.file('ppt/slides/_rels/slide1.xml.rels', `<Relationships>${rels}</Relationships>`)
    for (const [name, bytes] of Object.entries(media)) zip.file(`ppt/media/${name}`, bytes)
    return zip.generateAsync({ type: 'nodebuffer' }) as Promise<Buffer>
  }

  it('lifts a picture off the slide it belongs to, and keeps a picture-only slide', async () => {
    const [s] = await extractPptxSlides(await deck(pic('rId2'), rel('rId2', '../media/image1.png'), { 'image1.png': png(800, 600) }))
    expect(s.images).toHaveLength(1)
    expect(s.images[0]).toMatchObject({ mime: 'image/png', width: 800, height: 600 })
  })
  it('orders several pictures largest first', async () => {
    const [s] = await extractPptxSlides(await deck(pic('r1') + pic('r2'), rel('r1', '../media/a.png') + rel('r2', '../media/b.png'), { 'a.png': png(200, 200), 'b.png': png(1000, 800) }))
    expect(s.images.map((i) => i.width)).toEqual([1000, 200])
  })
  it('ignores a picture used as a shape FILL — texture, not content', async () => {
    const [s] = await extractPptxSlides(await deck('<p:sp><p:spPr><a:blipFill><a:blip r:embed="r1"/></a:blipFill></p:spPr><p:txBody><a:p><a:r><a:t>t</a:t></a:r></a:p></p:txBody></p:sp>', rel('r1', '../media/a.png'), { 'a.png': png(900, 900) }))
    expect(s.images).toHaveLength(0)
  })
  it('skips furniture (tiny), unmeasurable formats (EMF), linked images, and counts a twice-placed picture once', async () => {
    const [s] = await extractPptxSlides(await deck(
      pic('r1') + pic('r2') + pic('r3') + pic('r4') + pic('r4'),
      rel('r1', '../media/glyph.png') + rel('r2', '../media/vector.emf') + rel('r3', 'https://x/y.png', ' TargetMode="External"') + rel('r4', '../media/big.png'),
      { 'glyph.png': png(20, 20), 'vector.emf': Buffer.from('emf'), 'big.png': png(640, 480) },
    ))
    expect(s.images).toHaveLength(1)
    expect(s.images[0].width).toBe(640)
  })
})
