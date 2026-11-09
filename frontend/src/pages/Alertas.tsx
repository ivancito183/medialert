import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, D } from '../lib/api'
import { useAuth } from '../lib/auth'
import { TIPO_ALERTA } from '../lib/format'
import { AlertCard } from '../components/AlertCard'
import { Empty, ErrorBox, PageHeader, Spinner } from '../components/ui'

const TABS = [['activa', 'Activas'], ['pendiente_revision', 'Pendientes de revisión'], ['resuelta', 'Resueltas'], ['', 'Historial completo']]

export default function Alertas() {
  const { user } = useAuth()
  const [estado, setEstado] = useState('activa')
  const [sev, setSev] = useState('')
  const [tipo, setTipo] = useState('')
  const qs = new URLSearchParams({ estado, severidad: sev, tipo }).toString()
  const q = useQuery({ queryKey: ['alerts', qs], queryFn: () => api(`/alerts?${qs}`) })
  const rows: D[] = q.data ?? []
  return (
    <>
      <PageHeader title="Centro de Alertas MediAlert" subtitle="Las alertas nunca se eliminan: quedan como historial auditable." />
      <div className="flex gap-2 overflow-x-auto pb-2">
        {TABS.map(([k, l]) => <button key={k} aria-pressed={estado === k} onClick={() => setEstado(k)} className={`btn !whitespace-nowrap ${estado === k ? 'bg-brand text-white' : 'bg-white border border-slate-300'}`}>{l}</button>)}
      </div>
      <div className="grid sm:grid-cols-2 gap-3 my-3 max-w-xl">
        <select className="input" aria-label="Prioridad" value={sev} onChange={(e) => setSev(e.target.value)}>
          <option value="">Todas las prioridades</option><option value="critica">🔴 Crítica</option><option value="advertencia">🟡 Advertencia</option></select>
        <select className="input" aria-label="Tipo de error" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>{Object.entries(TIPO_ALERTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : !rows.length ? (
        <div className="card"><Empty title="Sin alertas en esta vista" text="Cuando MediAlert detecte una discrepancia aparecerá aquí al instante." /></div>
      ) : <div className="space-y-3">{rows.map((a) => <AlertCard key={a.id} a={a} role={user!.rol} />)}</div>}
    </>
  )
}
