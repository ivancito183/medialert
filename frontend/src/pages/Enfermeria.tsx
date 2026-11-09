import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Search } from 'lucide-react'
import { api, D } from '../lib/api'
import { today } from '../lib/format'
import { Empty, ErrorBox, PageHeader, Spinner, StateBadge } from '../components/ui'

const FILTROS = [['', 'Todos'], ['pendiente', 'Pendientes'], ['bloqueado', 'Bloqueados'], ['en_verificacion', 'En verificación'], ['administrado', 'Administrados'], ['no_administrado', 'No administrados'], ['suspendido', 'Suspendidos']]

export default function Enfermeria() {
  const [q, setQ] = useState('')
  const [hab, setHab] = useState('')
  const [cama, setCama] = useState('')
  const [estado, setEstado] = useState('')
  const [fecha, setFecha] = useState(today())
  const qs = new URLSearchParams({ q, habitacion: hab, cama, estado, fecha }).toString()
  const res = useQuery({ queryKey: ['tasks', qs], queryFn: () => api(`/nursing/tasks?${qs}`), refetchInterval: 30000 })
  const rows: D[] = res.data ?? []
  return (
    <>
      <PageHeader title="Medicamentos del turno" subtitle="Seleccione un evento para transcribir, preparar y verificar." />
      <div className="card p-3 mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_7rem_7rem_11rem]">
        <div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input className="input pl-10" placeholder="Nombre o cédula" aria-label="Buscar por nombre o cédula" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <input className="input" placeholder="Habitación" aria-label="Habitación" value={hab} onChange={(e) => setHab(e.target.value)} />
        <input className="input" placeholder="Cama" aria-label="Cama" value={cama} onChange={(e) => setCama(e.target.value)} />
        <input type="date" className="input" aria-label="Fecha" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
        {FILTROS.map(([k, l]) => <button key={k} aria-pressed={estado === k} onClick={() => setEstado(k)} className={`btn !whitespace-nowrap ${estado === k ? 'bg-brand text-white' : 'bg-white border border-slate-300'}`}>{l}</button>)}
      </div>
      {res.isLoading ? <Spinner /> : res.error ? <ErrorBox error={res.error} /> : !rows.length ? (
        <div className="card"><Empty title="No hay medicamentos para estos filtros" text="Cuando el médico prescriba o modifique un tratamiento aparecerá aquí automáticamente." /></div>
      ) : (
        <>
          <div className="card overflow-x-auto hidden md:block">
            <table className="w-full min-w-[820px]">
              <thead><tr><th>Hab.</th><th>Cama</th><th>Paciente</th><th>Cédula</th><th>Medicamento</th><th>Dosis</th><th>Horario</th><th>Estado</th><th><span className="sr-only">Acción</span></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.estado === 'bloqueado' ? 'bg-danger-50/60' : 'hover:bg-slate-50'}>
                    <td>{r.cama?.habitacion ?? '—'}</td><td>{r.cama?.cama ?? '—'}</td>
                    <td className="font-semibold">{r.paciente.nombre_completo}</td><td>{r.paciente.documento}</td>
                    <td>{r.medicamento}</td><td className="font-bold whitespace-nowrap">{r.dosis} {r.unidad}</td><td>{r.hora}</td>
                    <td><StateBadge estado={r.estado} />{r.alertas_abiertas > 0 && <span className="badge bg-danger text-white ml-1"><AlertTriangle size={12} />{r.alertas_abiertas}</span>}</td>
                    <td><Link className="btn-primary !min-h-0 py-1.5" to={`/enfermeria/${r.id}`}>{['administrado', 'no_administrado', 'suspendido'].includes(r.estado) ? 'Detalle' : 'Verificar'}</Link></td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          <ul className="md:hidden space-y-3">
            {rows.map((r) => (
              <li key={r.id} className={`card p-4 ${r.estado === 'bloqueado' ? 'border-danger border-2' : ''}`}>
                <div className="flex justify-between gap-2"><b className="break-words">{r.paciente.nombre_completo}</b><StateBadge estado={r.estado} /></div>
                <p className="text-sm text-slate-600">CC {r.paciente.documento} · Hab. {r.cama?.habitacion ?? '—'} · Cama {r.cama?.cama ?? '—'}</p>
                <p className="mt-1">{r.medicamento}</p>
                <p className="text-xl font-extrabold text-brand-dark">{r.dosis} {r.unidad} <span className="text-sm text-slate-600 font-medium">· {r.hora}</span></p>
                {r.alertas_abiertas > 0 && <p className="text-sm text-danger font-semibold flex items-center gap-1"><AlertTriangle size={14} /> {r.alertas_abiertas} alerta(s) activa(s)</p>}
                <Link className="btn-primary w-full mt-3" to={`/enfermeria/${r.id}`}>{['administrado', 'no_administrado', 'suspendido'].includes(r.estado) ? 'Ver detalle' : 'Verificar'}</Link>
              </li>))}
          </ul>
        </>)}
    </>
  )
}
