import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, D } from './api'

type Ctx = { user: D | null; loading: boolean; login: (e: string, p: string) => Promise<void>; logout: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null as any)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<D | null>(null)
  const [loading, setLoading] = useState(true)
  const qc = useQueryClient()

  useEffect(() => {
    api('/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
    const out = () => { setUser(null); qc.clear() }
    window.addEventListener('medialert:logout', out)
    return () => window.removeEventListener('medialert:logout', out)
  }, [qc])

  const login = useCallback(async (email: string, password: string) => {
    setUser(await api('/auth/login', { method: 'POST', body: { email, password } }))
  }, [])
  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }) } finally { setUser(null); qc.clear() }
  }, [qc])

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>
}
