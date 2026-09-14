import type { Slide, TalkLanguage } from '../../../../shared/types'

// Plain-text rendering for the clipboard. Mirrors the server's
// renderSlidesAsText so the textual artefact looks the same wherever it
// comes from. LaTeX stays as $...$ — the most portable representation.
export function slideToText(s: Slide, n: number, language: TalkLanguage): string {
  const ru = language === 'ru'
  const out: string[] = [`${ru ? 'Слайд' : 'Slide'} ${n}: ${s.title}`]
  switch (s.type) {
    case 'title':
      if (s.body.subtitle) out.push(s.body.subtitle)
      if (s.body.presenter) out.push(s.body.presenter)
      break
    case 'bullets':    s.body.items.forEach((b) => out.push(`• ${b}`)); break
    case 'concept':    out.push(s.body.definition); s.body.supporting.forEach((b) => out.push(`• ${b}`)); break
    case 'formula':
      s.body.formulas.forEach((f) => { out.push(`  $$${f.latex}$$`); if (f.caption) out.push(`  — ${f.caption}`) })
      if (s.body.explanation) out.push(s.body.explanation)
      break
    case 'comparison': s.body.columns.forEach((c) => { out.push(c.header.toUpperCase()); c.items.forEach((it) => out.push(`  • ${it}`)) }); break
    case 'diagram':    if (s.body.caption) out.push(s.body.caption); s.body.points.forEach((p) => out.push(`• ${p}`)); break
    case 'discussion': out.push(`? ${s.body.question}`); s.body.prompts.forEach((p) => out.push(`  • ${p}`)); break
    case 'cta':        out.push(`→ ${s.body.action}`); s.body.reasons.forEach((r) => out.push(`• ${r}`)); if (s.body.contact) out.push(s.body.contact); break
    case 'summary':    s.body.takeaways.forEach((t) => out.push(`• ${t}`)); s.body.next_steps.forEach((t) => out.push(`→ ${t}`)); break
  }
  if (s.notes) out.push('', ru ? 'Текст докладчика:' : 'Speaker notes:', s.notes)
  return out.join('\n')
}
