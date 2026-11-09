import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search, UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Empty, ErrorBox, PageHeader, Spinner } from '../components/ui'

const EST: Record<string, string> = { hospitalizado: 'Hospitalizado', estable: 'Estable', critico: 'Crítico' }

export default function Pacientes() {
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [hab, setHab] = useState('')
  const [cama, setCama] = useState('')
  const [estado, setEstado] = useState('')
  const qs = new URLSearchParams({ q, habitacion: hab, cama, estado }).toString()
  const res = useQuery({ queryKey: ['patients', qs], queryFn: () => api(`/patients?${qs}`) })
  const rows: any[] = res.data ?? []
  return (
    <>
      <PageHeader title={user!.rol === 'medico' ? 'Pacientes' : 'Pacientes asignados'} subtitle="Busque por nombre, cédula, habitación o cama."
        actions={user!.rol === 'medico' && <Link to="/pacientes/nuevo" className="btn-primary"><UserPlus size={18} /> Registrar paciente</Link>} />
      <div className="card p-3 mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_8rem_8rem_12rem]">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input className="input pl-10" placeholder="Nombre o cédula" aria-label="Buscar por nombre o cédula" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <input className="input" placeholder="Habitación" aria-label="Filtrar por habitación" value={hab} onChange={(e) => setHab(e.target.value)} />
        <input className="input" placeholder="Cama" aria-label="Filtrar por cama" value={cama} onChange={(e) => setCama(e.target.value)} />
        <select className="input" aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(EST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {res.isLoading ? <Spinner /> : res.error ? <ErrorBox error={res.error} /> : !rows.length ? (
        <div className="card"><Empty title="No se encontraron pacientes" text="Ajuste los filtros o registre un nuevo paciente." /></div>
      ) : (
        <>
          <div className="card overflow-x-auto hidden md:block">
            <table className="w-full min-w-[720px]">
              <thead><tr><th>Paciente</th><th>Documento</th><th>Edad</th><th>Hab. / Cama</th><th>Diagnóstico</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="font-semibold">{h.paciente.nombre_completo}</td>
                    <td>{h.paciente.tipo_documento} {h.paciente.documento}</td>
                    <td>{h.paciente.edad}</td>
                    <td>{h.cama ? `${h.cama.habitacion}-${h.cama.cama}` : <span className="text-slate-400">Sin cama</span>}</td>
                    <td className="max-w-[16rem] truncate" title={h.diagnostico}>{h.diagnostico}</td>
                    <td><span className={`badge ${h.estado === 'critico' ? 'bg-danger-50 text-danger' : 'bg-med-50 text-med-dark'}`}>{EST[h.estado]}</span></td>
                    <td><Link to={`/pacientes/${h.paciente.id}`} className="btn-ghost !min-h-0 py-1.5">Ver ficha</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="md:hidden space-y-3">
            {rows.map((h) => (
              <li key={h.id} className="card p-4">
                <div className="flex justify-between gap-2"><b>{h.paciente.nombre_completo}</b>
                  <span className={`badge ${h.estado === 'critico' ? 'bg-danger-50 text-danger' : 'bg-med-50 text-med-dark'}`}>{EST[h.estado]}</span></div>
                <p className="text-sm text-slate-600">{h.paciente.tipo_documento} {h.paciente.documento} · {h.paciente.edad} años</p>
                <p className="text-sm">Hab. {h.cama ? `${h.cama.habitacion} · Cama ${h.cama.cama}` : 'sin cama'}</p>
                <p className="text-sm text-slate-600 break-words">{h.diagnostico}</p>
                <Link to={`/pacientes/${h.paciente.id}`} className="btn-primary w-full mt-3">Ver ficha</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
