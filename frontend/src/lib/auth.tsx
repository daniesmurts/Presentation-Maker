import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { me, logout as apiLogout, type User } from '../api/auth'

interface AuthState {
  user:     User | null
  loading:  boolean
  setUser:  (u: User | null) => void
  logout:   () => Promise<void>
  /** Re-read /me — the quota moved (a download, a new talk). */
  refresh:  () => Promise<void>
}

const Ctx = createContext<AuthState>({ user: null, loading: true, setUser: () => {}, logout: async () => {}, refresh: async () => {} })
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [])

  const logout = async () => { await apiLogout().catch(() => null); setUser(null) }
  const refresh = async () => { try { setUser(await me()) } catch { /* keep what we have */ } }

  return <Ctx.Provider value={{ user, loading, setUser, logout, refresh }}>{children}</Ctx.Provider>
}
