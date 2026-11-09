import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BedDouble, Lock, UserRound } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ErrorBox, Modal, PageHeader, Spinner } from '../components/ui'

const ESTILO: Record<string, string> = {
  disponible: 'border-med bg-med-50 text-med-dark',
  ocupada: 'border-brand bg-brand-50 text-brand-dark',
  reservada: 'border-slate-400 bg-slate-100 text-slate-700',
  fuera_de_servicio: 'border-slate-300 bg-slate-200 text-slate-600',
}
const NOMBRE: Record<string, string> = { disponible: 'Disponible', ocupada: 'Ocupada', reservada: 'Reservada', fuera_de_servicio: 'Fuera de servicio' }

export default function Habitaciones() {
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['rooms'], queryFn: () => api('/rooms') })
  const [sel, setSel] = useState<any>(null)
  const setState = useMutation({
    mutationFn: (estado: string) => api(`/beds/${sel.id}`, { method: 'PATCH', body: { estado } }),
    onSuccess: () => { setSel(null); qc.invalidateQueries({ queryKey: ['rooms'] }) },
  })
  if (q.isLoading) return <Spinner />
  const rooms: any[] = q.data ?? []
  const click = (b: any) => {
    if (b.estado === 'ocupada') { b.paciente.accesible ? nav(`/pacientes/${b.paciente.id}`) : setSel(b) }
    else if (user!.rol === 'medico') setSel(b)
  }
  return (
    <>
      <PageHeader title="Habitaciones y camas" subtitle="Seleccione una cama ocupada para abrir la ficha del paciente."
        actions={<div className="flex flex-wrap gap-2 text-xs">{Object.entries(NOMBRE).map(([k, v]) => <span key={k} className={`badge border ${ESTILO[k]}`}>{v}</span>)}</div>} />
      <ErrorBox error={q.error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rooms.map((r) => (
          <section key={r.id} className="card p-4" aria-label={`Habitación ${r.numero}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg flex items-center gap-2"><BedDouble className="text-brand" size={20} /> Habitación {r.numero}</h2>
              <span className="text-sm text-slate-600">{r.ocupadas}/{r.total} ocupadas</span>
            </div>
            <ul className="space-y-2">
              {r.camas.map((b: any) => (
                <li key={b.id}>
                  <button onClick={() => click(b)} className={`w-full text-left rounded-xl border-2 px-3 py-2.5 flex items-center gap-3 ${ESTILO[b.estado]} hover:shadow`}>
                    <span className="font-extrabold w-14 shrink-0">Cama {b.etiqueta}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      {b.paciente ? <><span className="font-semibold block truncate"><UserRound size={14} className="inline mr-1" />{b.paciente.nombre_completo}</span><span>{b.paciente.tipo_documento} {b.paciente.documento}</span></> : NOMBRE[b.estado]}
                    </span>
                    {b.estado === 'fuera_de_servicio' && <Lock size={16} />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Cama ${sel.etiqueta}` : ''}>
        {sel?.paciente ? (
          <p className="text-sm">Esta cama está ocupada por un paciente a su cargo no asignado a usted. No tiene acceso a su ficha por responsabilidad asistencial.</p>
        ) : sel && (
          <div className="space-y-3">
            <p className="text-sm">Estado actual: <b>{NOMBRE[sel.estado]}</b>. Para asignar un paciente, hágalo desde su ficha o al registrarlo.</p>
            <ErrorBox error={setState.error} />
            <div className="flex flex-wrap gap-2">
              {['disponible', 'reservada', 'fuera_de_servicio'].filter((s) => s !== sel.estado).map((s) => (
                <button key={s} className="btn-ghost" onClick={() => setState.mutate(s)}>Marcar {NOMBRE[s].toLowerCase()}</button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
