// Replays generation against three fixed briefs and prints the metrics.
// Run: npm run eval:talks --workspace=backend   (needs DEEPSEEK_API_KEY)
// Real calls — costs money; ~3 outline + ~12 expansion calls.
//
// The three cases are the ones CLAUDE.md §3.3 says fail first: a short
// Russian talk (baseline), a 40-slide Russian talk (where the outline call
// hits the token wall), an English talk (different tokenizer density).

import { runTalkEval, type EvalBrief } from '../src/services/talkEvalHarness'

const RU_BRIEF = `Наш продукт — сервис контроля качества звонков для отделов продаж.
Проблема: руководитель слушает 2% звонков, остальные 98% никто не разбирает.
Решение: автоматическая расшифровка, оценка по чек-листу, подсветка рисков.
Результаты пилота: 3 компании, 14 000 звонков, конверсия выросла на 11%.
Модель: подписка от 15 000 ₽/мес за отдел до 10 человек.
Конкуренты: ручной контроль, зарубежные сервисы без русского языка.
Команда: двое из B2B-продаж, один ML-инженер.
Просим: 30 млн ₽ на 18 месяцев на продажи и продукт.`

const BRIEFS: EvalBrief[] = [
  {
    label: 'ru-pitch-15min', title: 'Контроль качества звонков — питч для инвесторов', brief: RU_BRIEF,
    intent: 'pitch', audience: 'investors', language: 'ru', durationMinutes: 15, notesEnabled: false, strictToBrief: true,
  },
  {
    label: 'ru-teach-60min-40slides', title: 'Основы гидравлики для инженеров-эксплуатационников', brief: '',
    intent: 'teach', audience: 'classroom', language: 'ru', durationMinutes: 60, slideCountTarget: 40, notesEnabled: true, strictToBrief: false,
  },
  {
    label: 'en-inform-30min', title: 'Why our support tickets doubled in Q2 and what we are doing about it', brief: '',
    intent: 'report', audience: 'executives', language: 'en', durationMinutes: 30, notesEnabled: true, strictToBrief: false,
  },
]

async function main() {
  const report = await runTalkEval(BRIEFS, (done, total) => console.error(`  ${done}/${total}`))
  for (const s of report.scored) {
    console.log(`\n${s.label}: ${s.slideCount}/${s.slideTarget} slides in ${(s.durationMs / 1000).toFixed(0)}s`)
    console.log(`  notes avg ${s.avgNotesWordCount.toFixed(0)} min ${s.minNotesWordCount} below-target ${(s.notesBelowTargetShare * 100).toFixed(0)}%`)
    console.log(`  bullets ${(s.bulletsShare * 100).toFixed(0)}%  image-queries ${(s.imageQueryShare * 100).toFixed(0)}%`)
    console.log(`  types ${JSON.stringify(s.typeDistribution)}`)
  }
  for (const f of report.failed) console.log(`\nFAILED ${f.label}: ${f.error}`)
  console.log(`\nsummary ${JSON.stringify(report.summary)}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
