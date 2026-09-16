import { ExternalLink } from 'lucide-react'
import { copy } from '../../lib/copy'

// «Подробнее» at the control it explains (CLAUDE.md §6: explanation lives
// at the control) — pointing to the public explainer on the site, same
// origin, new tab so the form is not lost. The slugs are the site's
// `landing/src/data/help.ts`; a renamed article changes there and here.
export type HelpSlug = 'outline' | 'editor' | 'strict' | 'overfull' | 'share' | 'brand' | 'pptx' | 'import' | 'rehearsal'

export default function HelpLink({ to, label = copy.help.more, className = '' }: { to: HelpSlug; label?: string; className?: string }) {
  return (
    <a href={`/help/${to}`} target="_blank" rel="noopener"
       className={`inline-flex items-center gap-0.5 text-accent hover:text-accent-deep underline underline-offset-2 whitespace-nowrap ${className}`}>
      {label} <ExternalLink className="w-3 h-3" aria-hidden />
    </a>
  )
}
