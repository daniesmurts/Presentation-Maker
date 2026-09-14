import { describe, it, expect, vi } from 'vitest'
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
import { generateTalkPptx } from './talkExport'
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

  it('an unknown theme id falls back to the default rather than throwing', async () => {
    await expect(generateTalkPptx(talk(DECK.slice(0, 1), 'no-such-theme'))).resolves.toBeInstanceOf(Buffer)
  })

  it('refuses an empty deck', async () => {
    await expect(generateTalkPptx(talk([]))).rejects.toThrow()
  })
})
