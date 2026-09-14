import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSharedTalk } from '../api/talks'
import { errorMessage } from '../api/client'
import SlideCard from '../components/talks/SlideCard'
import Spinner from '../components/ui/Spinner'
import { copy, slidesCount } from '../lib/copy'

// The read-only view a share link opens (CLAUDE.md §5.6): no account, no
// notes, no edit controls. The same manuscript rows as the owner's viewer,
// so what the recipient sees is what the owner saw.
export default function SharedPage() {
  const { token = '' } = useParams()
  const { data: talk, isLoading, error } = useQuery({ queryKey: ['shared', token], queryFn: () => getSharedTalk(token), retry: false })

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 bg-bg/95 backdrop-blur border-b border-border">
        <div className="max-w-4xl mx-auto px-4 h-12 flex items-center gap-4">
          <span className="font-display text-lg text-ink tracking-tight">{copy.brand}</span>
          <span className="hidden sm:inline text-xs text-ink-secondary">{copy.tagline}</span>
          <a href="/" className="ml-auto text-sm text-accent hover:text-accent-deep underline underline-offset-4">{copy.nav.newTalk}</a>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        {isLoading && <Spinner />}
        {error && <p role="alert" className="text-sm text-danger">{errorMessage(error)}</p>}
        {talk && (
          <>
            <div>
              <div className="eyebrow text-accent mb-1.5">{copy.talk.kind} · {copy.talk.sharedBadge}</div>
              <h1 className="display font-semibold text-[30px] leading-tight text-ink">{talk.title}</h1>
              <p className="text-sm text-ink-secondary mt-1.5">{slidesCount(talk.slides.length)}</p>
            </div>
            <div className="border-t border-border-strong grid">
              {talk.slides.map((s, i) => <SlideCard key={i} slide={s} number={i + 1} total={talk.slides.length} language={talk.language} notesEnabled={false} />)}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
