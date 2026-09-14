import { Loader2 } from 'lucide-react'

export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-secondary" role="status">
      <Loader2 className="w-5 h-5 animate-spin text-accent" aria-hidden />
      {label && <span>{label}</span>}
    </div>
  )
}
