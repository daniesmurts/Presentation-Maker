import { describe, it, expect, vi } from 'vitest'
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
import { inflateSync } from 'node:zlib'
import { generateTalkPdf, faceFor } from './talkPdf'
import type { Slide } from '../../../shared/types'

// pdfkit Flate-compresses content streams; to assert on drawing operators
// the streams have to be inflated first.
function contentOps(pdf: Buffer): string {
  const out: string[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(pdf.toString('latin1')))) {
    const start = m.index + m[0].length
    const end = pdf.indexOf('endstream', start)
    try { out.push(inflateSync(pdf.subarray(start, end)).toString('latin1')) } catch { /* not a flate stream (font/image) */ }
  }
  return out.join('\n')
}

const base = { notes: '', citations: [] }
const DECK: Slide[] = [
  { type: 'title', title: 'Заголовок', ...base, notes: 'вступление', body: { subtitle: 'Под', presenter: 'Имя' } },
  { type: 'bullets', title: 'Тезисы', ...base, notes: 'текст докладчика', body: { items: ['раз $x^2$', 'два'] } },
  { type: 'concept', title: 'Понятие', ...base, body: { definition: 'опр', supporting: ['a'] } },
  { type: 'formula', title: 'Формула', ...base, body: { formulas: [{ latex: 'E = mc^2', caption: 'энергия' }], explanation: 'пояснение' } },
  { type: 'comparison', title: 'Сравнение', ...base, body: { columns: [{ header: 'A', items: ['1'] }, { header: 'B', items: ['2'] }] } },
  { type: 'diagram', title: 'Схема', ...base, body: { image_query: 'схема', caption: 'подпись', points: ['п'], image: null } },
  { type: 'discussion', title: 'Вопрос', ...base, body: { question: '?', prompts: ['a'], expected_angles: [] } },
  { type: 'cta', title: 'Призыв', ...base, body: { action: 'Сделайте', reasons: ['потому'], contact: 'mail@x' } },
  { type: 'summary', title: 'Итоги', ...base, body: { takeaways: ['x'], next_steps: ['y'] } },
  // Design v3 (L2) — the rhythm types, both variants, a pattern backdrop.
  { type: 'section', title: 'Рынок', ...base, body: { kicker: 'Часть 2', lead: 'Где деньги' } },
  { type: 'agenda', title: 'План', ...base, body: { items: ['Раз', 'Два', 'Три', 'Четыре', 'Пять'] } },
  { type: 'stats', title: 'Цифры', ...base, body: { stats: [{ value: '42 %', label: 'доля', note: null }, { value: '×3', label: 'рост', note: 'за год' }] } },
  { type: 'stats', title: 'Одна', ...base, design: { variant: 'hero-number', emphasis: 'plain', backdrop: 'none' }, body: { stats: [{ value: '1,2 млрд', label: 'выручка', note: null }] } },
  { type: 'quote', title: 'Клиент', ...base, body: { quote: 'Мы увидели', attribution: 'Иван' } },
  { type: 'image-full', title: 'Вид', ...base, image_query: 'дашборд', body: { caption: 'подпись' } },
  { type: 'bullets', title: 'Шесть', ...base, design: { variant: 'split', emphasis: 'accent', backdrop: 'pattern' }, body: { items: ['a', 'b', 'c', 'd', 'e', 'f'] } },
]
const talk = (slides: Slide[], theme_id = 'default') => ({ title: 'Тест', slides, language: 'ru' as const, theme_id })
const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

describe('generateTalkPdf', () => {
  it('renders every slide type as one landscape page each, with the vendored Cyrillic fonts embedded', async () => {
    const pdf = await generateTalkPdf(talk(DECK))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pages(pdf)).toBe(DECK.length)
    const text = pdf.toString('latin1')
    expect(text).toContain('PTSerif-Bold')
    expect(text).toContain('PTSans-Regular')
    expect(text).toMatch(/\/MediaBox\s*\[0 0 720 405\.36\]/)
  }, 30_000)

  it('adds a notes page after each slide that has notes when asked', async () => {
    expect(pages(await generateTalkPdf(talk(DECK), { notes: true }))).toBe(DECK.length + 2)
    expect(pages(await generateTalkPdf(talk(DECK), { notes: false }))).toBe(DECK.length)
  }, 30_000)

  it('embeds the formula as a picture (a PNG with alpha is an image plus its soft mask)', async () => {
    const pdf = await generateTalkPdf(talk([DECK[3]]))
    expect((pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length).toBeGreaterThanOrEqual(1)
    expect(contentOps(pdf)).toMatch(/\/I\d+ Do/)   // an image XObject is actually drawn
  }, 30_000)

  it('a dark theme paints the page ground', async () => {
    const pdf = await generateTalkPdf(talk(DECK.slice(0, 2), 'dark'))
    // fills are "r g b scn" in 0–1 (pdfkit uses scn, not rg); 15211F → 0.082 0.129 0.122
    expect(contentOps(pdf)).toMatch(/0\.08\d* 0\.12\d* 0\.12\d* scn/)
  }, 30_000)

  it('refuses an empty deck', async () => {
    await expect(generateTalkPdf(talk([]))).rejects.toThrow()
  })
})

describe('faceFor — swap face per paragraph, never per glyph', () => {
  it('keeps PT for Cyrillic and superscript digits, swaps to DejaVu for Greek and operators', () => {
    expect(faceFor('sans', 'обычный текст с x²')).toBe('sans')
    expect(faceFor('sans', 'коэффициент η')).toBe('sansX')
    expect(faceFor('serif', 'a → b')).toBe('serifX')
    expect(faceFor('serifR', '∑ по всем i')).toBe('serifRX')
  })
})
