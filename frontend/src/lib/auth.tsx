import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { me, logout as apiLogout, type User } from '../api/auth'

interface AuthState {
  user:     User | null
  loading:  boolean
  setUser:  (u: User | null) => void
  logout:   () => Promise<void>
}

const Ctx = createContext<AuthState>({ user: null, loading: true, setUser: () => {}, logout: async () => {} })
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [])

  const logout = async () => { await apiLogout().catch(() => null); setUser(null) }

  return <Ctx.Provider value={{ user, loading, setUser, logout }}>{children}</Ctx.Provider>
}
