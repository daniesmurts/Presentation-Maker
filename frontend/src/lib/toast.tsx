import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

interface Toast { id: number; message: string; kind: 'error' | 'success' | 'info' }
interface ToastApi { toast: (message: string, kind?: Toast['kind']) => void }

const Ctx = createContext<ToastApi>({ toast: () => {} })
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const toast = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    setToasts((t) => [...t, { id: Date.now() + Math.random(), message, kind }])
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return
    const id = toasts[0].id
    const timer = setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
    return () => clearTimeout(timer)
  }, [toasts])

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={
            'flex items-center gap-3 px-4 py-3 rounded-md text-sm border max-w-sm pointer-events-auto shadow-sm ' +
            (t.kind === 'error' ? 'bg-danger-bg text-danger border-danger/20'
             : t.kind === 'success' ? 'bg-success-bg text-success border-success/20'
             : 'bg-surface text-ink border-border')
          }>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Закрыть" className="text-base leading-none">×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
