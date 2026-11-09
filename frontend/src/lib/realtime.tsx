import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { D } from './api'

type Toast = D & { key: number }
const Ctx = createContext<{ toasts: Toast[]; dismiss: (k: number) => void }>({ toasts: [], dismiss: () => {} })
export const useToasts = () => useContext(Ctx)

/** Conexión WebSocket con reconexión; cada evento invalida las consultas para refrescar sin recargar. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [toasts, setToasts] = useState<Toast[]>([])
  const ref = useRef<WebSocket | null>(null)

  useEffect(() => {
    let closed = false
    let timer: number
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/api/ws`)
      ref.current = ws
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data)
        if (m.event === 'notification') {
          const key = Date.now() + Math.random()
          setToasts((t) => [...t.slice(-3), { ...m, key }])
          window.setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), m.severidad === 'critical' ? 15000 : 8000)
          qc.invalidateQueries()
        }
      }
      ws.onclose = () => { if (!closed) timer = window.setTimeout(connect, 3000) }
    }
    connect()
    const ping = window.setInterval(() => ref.current?.readyState === 1 && ref.current.send('ping'), 25000)
    return () => { closed = true; clearTimeout(timer); clearInterval(ping); ref.current?.close() }
  }, [qc])

  return <Ctx.Provider value={{ toasts, dismiss: (k) => setToasts((t) => t.filter((x) => x.key !== k)) }}>{children}</Ctx.Provider>
}
