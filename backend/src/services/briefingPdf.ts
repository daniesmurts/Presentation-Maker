// The briefing as one A4 page (TODO O4). Paper, not a slide: black text on
// white, the brand accent only for labels and rules — this is read at
// arm's length in a corridor, often printed on an office printer. Five
// numbered sentences, up to three figures, the ask in a box, the question
// and its answer, the opener. Fonts are the PDF exporter's PT faces with
// the DejaVu fallback per paragraph (faceFor).

import { FONTS, faceFor } from './talkPdf'
import type { Briefing, Talk } from '../../../shared/types'

const W = 595.28, H = 841.89          // A4 portrait, pt
const M = 56                          // margin
const CW = W - M * 2
const INK = '#15171C', INK2 = '#5B6170', RULE = '#D9DCE3'

const T = {
  ru: { kind: 'Памятка докладчика', gist: 'Выступление в пяти предложениях', numbers: 'Цифры, которые нужно помнить', ask: 'Одна просьба к аудитории', question: 'Вас, скорее всего, спросят', answer: 'Ответ', opener: 'Первая фраза', footer: 'Тезариум', min: 'мин', slides: 'слайдов' },
  en: { kind: 'Speaker briefing', gist: 'The talk in five sentences', numbers: 'Numbers to remember', ask: 'The one ask', question: 'They will most likely ask', answer: 'Answer', opener: 'First sentence', footer: 'Tezarium', min: 'min', slides: 'slides' },
}

export interface BriefingPdfOptions { accent?: string | null; brandName?: string | null }

export async function generateBriefingPdf(talk: Pick<Talk, 'title' | 'language' | 'slides' | 'duration_minutes'>, b: Briefing, opts: BriefingPdfOptions = {}): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default
  const L = T[talk.language]
  const accent = opts.accent ? `#${opts.accent.replace('#', '')}` : '#2F4FD0'

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${talk.title} — ${L.kind}`, Author: L.footer } })
    for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, file)
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject)

    let y = M
    const eyebrow = (text: string) => {
      doc.font(faceFor('sansB', text)).fontSize(8.5).fillColor(accent).text(text.toUpperCase(), M, y, { width: CW, characterSpacing: 0.8 })
      y += 14
    }
    const para = (text: string, font: 'serifR' | 'serif' | 'sans' | 'sansB' | 'serifI', size: number, color = INK, opts: { indent?: number; lineGap?: number } = {}) => {
      const x = M + (opts.indent ?? 0), w = CW - (opts.indent ?? 0)
      doc.font(faceFor(font, text)).fontSize(size).fillColor(color)
      const h = doc.heightOfString(text, { width: w, lineGap: opts.lineGap ?? 2 })
      doc.text(text, x, y, { width: w, lineGap: opts.lineGap ?? 2 })
      y += h
    }
    const rule = (gap = 14) => { y += gap; doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.6).strokeColor(RULE).stroke(); y += gap }

    // Head
    eyebrow(L.kind)
    para(talk.title, 'serif', 20, INK, { lineGap: 1 })
    y += 4
    const meta = [talk.duration_minutes ? `${talk.duration_minutes} ${L.min}` : null, `${(talk.slides ?? []).length} ${L.slides}`, opts.brandName || null].filter(Boolean).join(' · ')
    para(meta, 'sans', 9.5, INK2)
    rule(12)

    // Gist — numbered, the number in the margin
    eyebrow(L.gist)
    b.gist.forEach((g, i) => {
      doc.font('mono').fontSize(9).fillColor(INK2).text(String(i + 1).padStart(2, '0'), M, y + 3)
      para(g, 'serifR', 12, INK, { indent: 24, lineGap: 3 })
      y += 6
    })

    // Numbers — three columns, big figures
    if (b.numbers.length) {
      rule(8)
      eyebrow(L.numbers)
      const colW = CW / b.numbers.length
      const top = y
      let maxH = 0
      b.numbers.forEach((n, i) => {
        const x = M + i * colW
        doc.font(faceFor('serif', n.value)).fontSize(26).fillColor(INK).text(n.value, x, top, { width: colW - 12 })
        doc.font(faceFor('sans', n.label)).fontSize(9.5).fillColor(INK2)
        const lh = doc.heightOfString(n.label, { width: colW - 12 })
        doc.text(n.label, x, top + 32, { width: colW - 12 })
        maxH = Math.max(maxH, 32 + lh)
      })
      y = top + maxH + 4
    }

    // Ask — boxed
    if (b.ask) {
      rule(8)
      eyebrow(L.ask)
      doc.font(faceFor('serif', b.ask)).fontSize(13)
      const h = doc.heightOfString(b.ask, { width: CW - 28, lineGap: 3 })
      doc.roundedRect(M, y - 2, CW, h + 24, 4).lineWidth(0.8).strokeColor(accent).stroke()
      doc.fillColor(INK).text(b.ask, M + 14, y + 10, { width: CW - 28, lineGap: 3 })
      y += h + 30
    }

    // Question & answer
    if (b.question.q) {
      rule(8)
      eyebrow(L.question)
      para(b.question.q, 'serifI', 12, INK, { lineGap: 3 })
      y += 6
      if (b.question.a) { para(`${L.answer}: ${b.question.a}`, 'sans', 10.5, INK, { lineGap: 3 }) }
    }

    // Opener
    if (b.opener) {
      rule(8)
      eyebrow(L.opener)
      para(`«${b.opener}»`, 'serifR', 12, INK, { lineGap: 3 })
    }

    // Footer
    const foot = `${L.footer} · ${new Date(b.generated_at).toLocaleDateString(talk.language === 'ru' ? 'ru-RU' : 'en-GB')}`
    doc.font('sans').fontSize(8.5).fillColor(INK2).text(foot, M, H - M + 8, { width: CW, align: 'right' })
    doc.end()
  })
}
