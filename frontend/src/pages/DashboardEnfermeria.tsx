import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Lock, Pill, Timer, Users, XCircle } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ErrorBox, PageHeader, Spinner, StatCard } from '../components/ui'

const COLORS: Record<string, string> = {
  Pendiente: '#673AB7', Bloqueado: '#DC2626', Administrado: '#10B981', 'No administrado': '#F59E0B', Suspendido: '#94A3B8',
}

export default function DashboardEnfermeria() {
  const { user } = useAuth()
  const q = useQuery({ queryKey: ['stats', 'nurse'], queryFn: () => api('/stats/nurse') })
  if (q.isLoading) return <Spinner />
  if (q.error) return <ErrorBox error={q.error} />
  const s = q.data
  const total = s.pendientes + s.administrados + s.no_administrados
  const pct = total ? Math.round((s.administrados / total) * 100) : 0
  return (
    <>
      <PageHeader title={`Hola, ${user!.nombres}`} subtitle="Turno de hoy: medicamentos por verificar y alertas activas."
        actions={<Link to="/enfermeria" className="btn-primary"><Pill size={18} /> Ver medicamentos de hoy</Link>} />
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Pacientes asignados" value={s.pacientes_asignados} icon={<Users />} to="/pacientes" />
        <StatCard label="Medicamentos pendientes" value={s.pendientes} icon={<Clock />} to="/enfermeria" />
        <StatCard label="Medicamentos administrados" value={s.administrados} icon={<CheckCircle2 />} tone="green" hint={`${pct}% de los eventos de hoy`} />
        <StatCard label="Próximos (2 h)" value={s.proximos} icon={<Timer />} tone="slate" />
        <StatCard label="Alertas activas" value={s.alertas_activas} icon={<AlertTriangle />} tone={s.alertas_activas ? 'red' : 'slate'} to="/alertas" />
        <StatCard label="Registros bloqueados" value={s.bloqueados} icon={<Lock />} tone={s.bloqueados ? 'red' : 'slate'} to="/enfermeria" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        <section className="card p-4" aria-label="Estado de los eventos de hoy">
          <h2 className="font-bold mb-3">Eventos de medicación de hoy</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.estado_hoy} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="estado" tick={{ fontSize: 11 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total" name="Eventos" radius={[6, 6, 0, 0]}>
                  {s.estado_hoy.map((e: any) => <Cell key={e.estado} fill={COLORS[e.estado]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card p-4" aria-label="Alertas en el tiempo">
          <h2 className="font-bold mb-1">Alertas detectadas (14 días)</h2>
          <p className="text-xs text-slate-500 mb-3">{s.alertas_detectadas} detectadas · {s.discrepancias_corregidas} discrepancias críticas corregidas o resueltas.</p>
          <div className="h-60">
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
      </div>
      <section className="card p-4 mt-4 flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0" role="img" aria-label={`${pct}% administrado`}>
          <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E2E8F0" strokeWidth="4" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#10B981" strokeWidth="4" strokeDasharray={`${pct} 100`} strokeLinecap="round" />
          </svg>
          <span className="absolute inset-0 grid place-items-center font-extrabold">{pct}%</span>
        </div>
        <div>
          <p className="font-bold">Avance de administración de hoy</p>
          <p className="text-sm text-slate-600"><XCircle size={14} className="inline mr-1" />{s.no_administrados} no administrados · {s.administrados} administrados · {s.pendientes} por completar</p>
        </div>
      </section>
    </>
  )
}
