// One fixed talk in every theme — the gallery a theme is reviewed in
// before it ships (Design v3, L3). Run:
//   npm run gallery:themes --workspace=backend [-- out-dir]
// Writes <out>/<theme>.pdf and <out>/<theme>.pptx for every theme in
// shared/themes.ts, plus index.html that lists them — no API calls, no DB;
// the talk is the landing's demo deck extended with the rhythm types so
// every layout is exercised. Open the PDFs; look at the hero and the
// quiet slides of each; the numbers in themes.ts are already measured —
// this is for the eye.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { THEMES } from '../src/services/themes'
import { generateTalkPptx } from '../src/services/talkExport'
import { generateTalkPdf } from '../src/services/talkPdf'
import type { Slide } from '../../shared/types'

const base = { notes: '', citations: [] }
const SLIDES: Slide[] = [
  { type: 'title', title: 'Контроль качества звонков', ...base, body: { subtitle: 'Питч для инвесторов', presenter: 'Имя, роль' } },
  { type: 'agenda', title: 'О чём поговорим', ...base, body: { items: ['Проблема', 'Решение', 'Рынок', 'Модель', 'Команда', 'Просьба'] } },
  { type: 'section', title: 'Проблема', ...base, body: { kicker: 'Часть 1', lead: 'Руководитель слушает 2 % звонков; остальные 98 % никто не разбирает' } },
  { type: 'bullets', title: 'Что происходит в отделе продаж', ...base, body: { items: ['Менеджеры говорят без чек-листа', 'Ошибки повторяются неделями', 'Руководитель узнаёт из отчёта — поздно', 'Конверсия между людьми отличается втрое'] } },
  { type: 'stats', title: 'Что теряется', ...base, body: { stats: [{ value: '38 %', label: 'звонков без оценки', note: 'выборка 12 отделов, 2025' }, { value: '×3', label: 'разброс конверсии между менеджерами', note: null }, { value: '11 ч', label: 'в неделю на прослушивание', note: 'один руководитель' }] } },
  { type: 'concept', title: 'Оценка по чек-листу', ...base, body: { definition: 'Каждый звонок расшифровывается и оценивается по критериям отдела в течение минуты после разговора.', supporting: ['Расшифровка и разметка ролей', 'Оценка по 12 критериям', 'Подсветка рисков и возражений'] } },
  { type: 'comparison', title: 'Ручной контроль vs сервис', ...base, body: { columns: [{ header: 'Вручную', items: ['2 % звонков', 'Оценка через неделю', 'Субъективно'] }, { header: 'Сервис', items: ['100 % звонков', 'Оценка через минуту', 'Один чек-лист на всех'] }] } },
  { type: 'quote', title: 'Клиент', ...base, body: { quote: 'Мы впервые увидели, что говорят наши менеджеры, не прослушивая ни одного звонка', attribution: 'Руководитель продаж, ритейл' } },
  { type: 'formula', title: 'Экономика клиента', ...base, body: { formulas: [{ latex: String.raw`\Delta R = N \cdot \bar{c} \cdot \Delta k`, caption: 'прирост выручки' }], explanation: 'N — звонков в месяц, c̄ — средний чек, Δk — прирост конверсии' } },
  { type: 'discussion', title: 'Вопрос', ...base, body: { question: 'Сколько звонков в вашем отделе никто не слышит?', prompts: ['Как узнаёте о проблеме сейчас', 'Что стоит одна потерянная сделка'], expected_angles: [] } },
  { type: 'cta', title: 'Просьба', ...base, body: { action: '30 млн ₽ на 18 месяцев', reasons: ['Продажи: три отрасли', 'Продукт: интеграции с CRM'], contact: 'hello@example.com' } },
  { type: 'summary', title: 'Итоги', ...base, body: { takeaways: ['98 % звонков сегодня не слышит никто', 'Оценка за минуту вместо недели', 'Конверсия +11 % в пилоте'], next_steps: ['Пилот на вашем отделе — две недели', 'Встреча с командой'] } },
]

async function main() {
  const out = path.resolve(process.argv[2] ?? 'gallery')
  mkdirSync(out, { recursive: true })
  const rows: string[] = []
  for (const t of Object.values(THEMES)) {
    const talk = { title: 'Контроль качества звонков', slides: SLIDES, language: 'ru' as const, theme_id: t.id }
    const [pptx, pdf] = await Promise.all([generateTalkPptx(talk), generateTalkPdf(talk)])
    writeFileSync(path.join(out, `${t.id}.pptx`), pptx)
    writeFileSync(path.join(out, `${t.id}.pdf`), pdf)
    rows.push(`<li><span style="display:inline-block;width:14px;height:14px;border:1px solid #${t.palette.accent};background:#${t.palette.bg};vertical-align:middle"></span> <b>${t.name}</b> (${t.id}, ${t.background.kind}) — <a href="${t.id}.pdf">pdf</a> · <a href="${t.id}.pptx">pptx</a> · pptx ${(pptx.length / 1024).toFixed(0)} KB</li>`)
    console.log(`${t.id.padEnd(10)} ${t.name.padEnd(10)} pptx ${(pptx.length / 1024).toFixed(0).padStart(4)} KB  pdf ${(pdf.length / 1024).toFixed(0).padStart(4)} KB`)
  }
  writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Themes</title><ul style="font:14px system-ui;line-height:1.8">${rows.join('')}</ul>`)
  console.log(`\n${Object.keys(THEMES).length} themes → ${out}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
