import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSharedTalk } from '../api/talks'
import { errorMessage } from '../api/client'
import SlideCard from '../components/talks/SlideCard'
import Spinner from '../components/ui/Spinner'
import { copy, slidesCount } from '../lib/copy'

// The read-only view a share link opens (CLAUDE.md §5.6): no account, no
// notes, no edit controls. The same cards as the owner's viewer, so what
// the recipient sees is what the owner saw.
export default function SharedPage() {
  const { token = '' } = useParams()
  const { data: talk, isLoading, error } = useQuery({ queryKey: ['shared', token], queryFn: () => getSharedTalk(token), retry: false })

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 bg-surface border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <span className="font-semibold text-ink tracking-tight">{copy.brand}</span>
          <span className="text-xs text-ink-secondary">{copy.tagline}</span>
          <a href="/" className="ml-auto text-sm text-accent underline underline-offset-2 hover:text-accent-deep">{copy.nav.newTalk}</a>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {isLoading && <Spinner />}
        {error && <p role="alert" className="text-sm text-danger">{errorMessage(error)}</p>}
        {talk && (
          <>
            <div>
              <h1 className="text-xl font-semibold text-ink leading-tight">{talk.title}</h1>
              <p className="text-xs text-ink-secondary mt-1">{slidesCount(talk.slides.length)} · {copy.talk.sharedBadge}</p>
            </div>
            <div className="space-y-4">
              {talk.slides.map((s, i) => <SlideCard key={i} slide={s} number={i + 1} language={talk.language} notesEnabled={false} />)}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
