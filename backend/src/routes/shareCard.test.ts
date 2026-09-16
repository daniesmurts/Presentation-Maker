import { describe, it, expect } from 'vitest'
import { escapeHtml, slideWord, resolveCardImageUrl, shareCardHtml, TOKEN } from './shareCard'
import type { Slide, TitleSlide, DiagramSlide, SummarySlide, SlideImage } from '../../../shared/types'

const IMG = (url: string): SlideImage => ({ url, source_url: url, thumbnail: url, width: 100, height: 100, query: 'x', source_host: null })

const titleSlide = (image?: SlideImage | null): TitleSlide =>
  ({ type: 'title', title: 'T', notes: '', citations: [], body: { subtitle: null, presenter: null }, image: image ?? null } as TitleSlide)
const summarySlide = (): SummarySlide =>
  ({ type: 'summary', title: 'S', notes: '', citations: [], body: { takeaways: [], next_steps: [] }, image: null } as SummarySlide)
const diagramSlide = (image?: SlideImage | null): DiagramSlide =>
  ({ type: 'diagram', title: 'D', notes: '', citations: [], body: { image_query: 'x', caption: '', points: [], image: image ?? null } } as DiagramSlide)

describe('escapeHtml', () => {
  it('escapes every reserved character, including inside a talk title', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'quote'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quote&#39;')
  })
})

describe('slideWord', () => {
  it('picks the right Russian plural form', () => {
    expect(slideWord(1)).toBe('слайд')
    expect(slideWord(2)).toBe('слайда')
    expect(slideWord(5)).toBe('слайдов')
    expect(slideWord(11)).toBe('слайдов')   // the -надцать exception
    expect(slideWord(21)).toBe('слайд')
  })
})

describe('resolveCardImageUrl', () => {
  const token = 'a'.repeat(40)

  it('uses the first slide with a top-level image', () => {
    const slides: Slide[] = [titleSlide(), titleSlide(IMG('/api/talks/media/abc123/image')), summarySlide()]
    expect(resolveCardImageUrl(slides, token)).toContain(`/api/shared/${token}/media/abc123/image`)
  })

  it("falls back to a diagram slide's body.image when nothing has a top-level image", () => {
    const slides: Slide[] = [titleSlide(), diagramSlide(IMG('/api/talks/media/def456/image'))]
    expect(resolveCardImageUrl(slides, token)).toContain(`/api/shared/${token}/media/def456/image`)
  })

  it('falls back to the site image when the talk has no pictures at all', () => {
    const slides: Slide[] = [titleSlide(), summarySlide()]
    expect(resolveCardImageUrl(slides, token)).toMatch(/\/og\.png$/)
  })
})

describe('shareCardHtml', () => {
  it('embeds an absolute og:image, the slide count, and a redirect to the real page', () => {
    const html = shareCardHtml('Моя презентация', 12, 'tok123', 'https://tezarium.ru/og.png')
    expect(html).toContain('<meta property="og:title" content="Моя презентация">')
    expect(html).toContain('12 слайдов')
    expect(html).toContain('<meta property="og:image" content="https://tezarium.ru/og.png">')
    expect(html).toContain('twitter:card" content="summary_large_image"')
    expect(html).toContain('http-equiv="refresh"')
    expect(html).toContain('/s/tok123')
  })

  it('escapes a title carrying HTML so the card can never inject markup', () => {
    const html = shareCardHtml('<b>hack</b>', 1, 'tok', 'https://tezarium.ru/og.png')
    expect(html).not.toContain('<b>hack</b>')
    expect(html).toContain('&lt;b&gt;hack&lt;/b&gt;')
  })
})

describe('TOKEN', () => {
  it('accepts a real share token shape and rejects garbage', () => {
    expect(TOKEN.test('a'.repeat(44))).toBe(true)
    expect(TOKEN.test('../../etc/passwd')).toBe(false)
    expect(TOKEN.test('short')).toBe(false)
  })
})
