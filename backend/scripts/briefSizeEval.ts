// Does a longer brief still reach the slides? (2026-09-22, when the brief's
// ceiling went 20 000 → 50 000 characters.)
//
//   npm run eval:brief --workspace=backend -- <material.txt> [slideTarget]
//
// Real calls — costs money. Three arms over ONE piece of material, so the
// two axes are separated:
//   A vs B — more characters at the same slide count (does size hurt?)
//   B vs C — the same characters in fewer slides (does DENSITY hurt?)
// Density is the one that generalises: 50 000 chars across 40 slides is the
// same 1 250 chars a slide as 30 000 across 24. The form's nudge
// (CHARS_PER_SLIDE in TalkForm.tsx) is the thing this measures.

import { readFileSync } from 'node:fs'
import { scoreSlides } from '../src/services/talkEvalHarness'
import { generateTalk, type GenerateParams } from '../src/services/talks'

const file = process.argv[2]
if (!file) { console.error('usage: eval:brief -- <material.txt> [slideTarget]'); process.exit(1) }
const material = readFileSync(file, 'utf8')
const target = Number(process.argv[3] ?? 20)

const arms: Array<{ label: string; chars: number; slides: number }> = [
  { label: 'A · 20k × 20 слайдов', chars: 20_000, slides: target },
  { label: 'B · 30k × 20 слайдов', chars: 30_000, slides: target },
  { label: 'C · 30k × 12 слайдов', chars: 30_000, slides: Math.max(6, Math.round(target * 0.6)) },
]

async function main() {
  console.log(`material: ${material.length.toLocaleString('ru-RU')} chars\n`)
  for (const arm of arms) {
    const brief = material.slice(0, arm.chars)
    const params: GenerateParams = {
      userId: undefined, workspaceId: undefined,
      title: 'Редакционный дизайн и качество звонков — рабочий материал',
      brief, intent: 'teach', audience: 'team', language: 'ru',
      durationMinutes: 30, slideCountTarget: arm.slides,
      notesEnabled: true, strictToBrief: true, styleExemplars: false,
    }
    const started = Date.now()
    try {
      const { slides } = await generateTalk(params)
      const s = scoreSlides(slides, true, brief)
      console.log(
        `${arm.label}\n` +
        `  slides ${slides.length}/${arm.slides} · ${s.coverage.charsPerSlide} chars/slide\n` +
        `  coverage: terms ${(s.coverage.terms * 100).toFixed(0)}% · figures ${(s.coverage.figures * 100).toFixed(0)}%\n` +
        `  notes avg ${s.avgNotesWordCount.toFixed(0)} w (min ${s.minNotesWordCount}) · bullets ${(s.bulletsShare * 100).toFixed(0)}%` +
        `${s.rhythm.violations.length ? ` · rhythm: ${s.rhythm.violations.join(', ')}` : ''}\n` +
        `  ${((Date.now() - started) / 1000).toFixed(0)} s\n`,
      )
    } catch (err) {
      console.log(`${arm.label}\n  FAILED: ${(err as Error).message}\n`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
