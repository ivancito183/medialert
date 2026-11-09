import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Activity, AlertTriangle, BedDouble, ClipboardCheck, ClipboardList, DoorOpen, Pill, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fmtDateTime } from '../lib/format'
import { ErrorBox, PageHeader, Spinner, StatCard } from '../components/ui'

export default function DashboardMedico() {
  const { user } = useAuth()
  const q = useQuery({ queryKey: ['stats', 'doctor'], queryFn: () => api('/stats/doctor') })
  if (q.isLoading) return <Spinner />
  if (q.error) return <ErrorBox error={q.error} />
  const s = q.data
  return (
    <>
      <PageHeader title={`Hola, Dr./Dra. ${user!.apellidos.split(' ')[0]}`} subtitle="Resumen de sus pacientes, prescripciones y alertas de seguridad."
        actions={<><Link to="/pacientes/nuevo" className="btn-primary">Registrar paciente</Link><Link to="/prescripciones" className="btn-ghost">Nueva prescripción</Link></>} />
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total de pacientes" value={s.pacientes_total} icon={<Users />} to="/pacientes" />
        <StatCard label="Pacientes hospitalizados" value={s.hospitalizados} icon={<Activity />} tone="green" to="/pacientes" />
        <StatCard label="Habitaciones ocupadas" value={s.habitaciones_ocupadas} icon={<DoorOpen />} to="/habitaciones" />
        <StatCard label="Camas disponibles" value={s.camas_disponibles} icon={<BedDouble />} tone="green" to="/habitaciones" />
        <StatCard label="Prescripciones activas" value={s.prescripciones_activas} icon={<Pill />} to="/prescripciones" hint={`${s.prescripciones_modificadas} modificadas`} />
        <StatCard label="Pendientes de revisión" value={s.pendientes_revision} icon={<ClipboardCheck />} tone={s.pendientes_revision ? 'amber' : 'slate'} to="/alertas" />
        <StatCard label="Alertas de seguridad abiertas" value={s.alertas_abiertas} icon={<AlertTriangle />} tone={s.alertas_abiertas ? 'red' : 'slate'} to="/alertas" hint={`${s.alertas_criticas_abiertas} críticas`} />
        <StatCard label="Prescripciones modificadas" value={s.prescripciones_modificadas} icon={<ClipboardList />} tone="slate" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3 mt-4">
        <section className="card p-4 lg:col-span-2" aria-label="Evolución de alertas">
          <h2 className="font-bold mb-1">Evolución de alertas (14 días)</h2>
          <p className="text-xs text-slate-500 mb-3">Una alerta indica una discrepancia detectada; no equivale a un daño evitado.</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s.serie_alertas} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="fecha" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip /><Legend />
                <Line type="monotone" dataKey="criticas" name="Críticas" stroke="#DC2626" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="advertencias" name="Advertencias" stroke="#F59E0B" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card p-4" aria-label="Alertas por tipo">
          <h2 className="font-bold mb-3">Alertas por tipo</h2>
          {s.alertas_por_tipo.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.alertas_por_tipo} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="tipo" width={110} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="total" name="Alertas" fill="#673AB7" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-slate-500 py-10 text-center">Aún no hay alertas registradas.</p>}
        </section>
      </div>
      <section className="card p-4 mt-4">
        <h2 className="font-bold mb-3">Actividad reciente</h2>
        {s.actividad.length ? (
          <ul className="divide-y divide-slate-100">
            {s.actividad.map((a: any, i: number) => (
              <li key={i} className="py-2 flex justify-between gap-3 text-sm">
                <span><b className="capitalize">{a.accion.replace(/_/g, ' ')}</b> · {a.entidad}</span>
                <span className="text-slate-500 shrink-0">{fmtDateTime(a.fecha)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">Sin actividad todavía.</p>}
      </section>
    </>
  )
}
