import { ListChecks, Presentation, Download } from 'lucide-react'
import { copy } from '../../lib/copy'

const ICONS = [ListChecks, Presentation, Download]

// The desk («Редакция») in miniature: a stack of slide cards, drawn with
// divs, not a screenshot — nothing here is staged content that could go
// stale. Paper behind (bg), the cards on surface, same two-plane logic as
// AppShell. Desktop only (lg+); on a phone the form is the whole screen
// and this would just push it below the fold (CLAUDE.md §6: content first).
export default function AuthShowcase() {
  return (
    <div className="relative hidden lg:flex flex-col justify-center h-full px-16 xl:px-24 overflow-hidden bg-bg">
      {/* A faint paper grid — texture, not decoration with a second meaning. */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(rgb(var(--c-ink)) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        aria-hidden
      />

      <div className="relative max-w-md">
        <div className="display text-[40px] xl:text-[46px] leading-[1.05] text-ink tracking-tight">{copy.brand}</div>
        <div className="font-display text-[22px] xl:text-[24px] text-ink mt-3 leading-snug">
          {copy.taglineParts[0]}<span className="marker-under">{copy.taglineParts[1]}</span>
        </div>

        {/* The stack — one real slide layout (title + bullets), two blank
            sheets behind it, echoing the manuscript view users land in
            right after signing up. */}
        <div className="relative h-[200px] mt-12 mb-10" aria-hidden>
          <div className="absolute left-6 top-6 w-[280px] h-[168px] rounded-xl border border-border-strong bg-surface rotate-[5deg]" />
          <div className="absolute left-3 top-3 w-[280px] h-[168px] rounded-xl border border-border-strong bg-surface -rotate-[3deg]" />
          <div className="absolute left-0 top-0 w-[280px] h-[168px] rounded-xl border border-border-strong bg-surface shadow-sm p-5 flex flex-col gap-2.5">
            <div className="h-2.5 w-2/3 rounded-full bg-ink/80" />
            <div className="h-px w-full bg-border mt-1 mb-1.5" />
            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" /><div className="h-2 w-[85%] rounded-full bg-ink-tertiary/50" /></div>
            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" /><div className="h-2 w-[70%] rounded-full bg-ink-tertiary/50" /></div>
            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" /><div className="h-2 w-[78%] rounded-full bg-ink-tertiary/50" /></div>
          </div>
        </div>

        <ul className="space-y-4">
          {copy.auth.showcase.steps.map((step, i) => {
            const Icon = ICONS[i]
            return (
              <li key={step.title} className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-accent" aria-hidden />
                </span>
                <div>
                  <div className="text-sm font-medium text-ink">{step.title}</div>
                  <div className="text-sm text-ink-secondary">{step.hint}</div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
