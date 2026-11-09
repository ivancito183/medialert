import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, Bot, BedDouble, Bell, ClipboardList, History, LayoutDashboard, LogOut, Menu, Pill,
  Stethoscope, UserCircle, UserPlus, Users, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToasts } from '../lib/realtime'
import { fmtDateTime } from '../lib/format'
import { Logo } from './Logo'

const MENU_MEDICO = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pacientes', label: 'Pacientes', icon: Users },
  { to: '/pacientes/nuevo', label: 'Registrar paciente', icon: UserPlus },
  { to: '/habitaciones', label: 'Habitaciones y camas', icon: BedDouble },
  { to: '/prescripciones', label: 'Prescripciones', icon: Pill },
  { to: '/alertas', label: 'Alertas', icon: AlertTriangle },
  { to: '/historial', label: 'Historial', icon: History },
  { to: '/asistente', label: 'Asistente IA', icon: Bot },
  { to: '/perfil', label: 'Perfil', icon: UserCircle },
]
const MENU_ENFERMERA = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/enfermeria', label: 'Medicamentos', icon: ClipboardList },
  { to: '/pacientes', label: 'Pacientes asignados', icon: Users },
  { to: '/habitaciones', label: 'Habitaciones y camas', icon: BedDouble },
  { to: '/alertas', label: 'Alertas', icon: AlertTriangle },
  { to: '/historial', label: 'Historial de administración', icon: History },
  { to: '/asistente', label: 'Asistente IA', icon: Bot },
  { to: '/perfil', label: 'Perfil', icon: UserCircle },
]

function Bell_() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const nav = useNavigate()
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api('/notifications'), refetchInterval: 60000 })
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) })
  const n = q.data?.no_leidas ?? 0
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-label={`Notificaciones, ${n} sin leer`} aria-expanded={open}
        className="relative p-2.5 rounded-xl hover:bg-slate-100">
        <Bell size={22} />
        {n > 0 && <span className="absolute top-1 right-1 min-w-5 h-5 px-1 rounded-full bg-danger text-white text-[11px] font-bold grid place-items-center">{n > 9 ? '9+' : n}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="fixed sm:absolute z-40 right-2 left-2 sm:left-auto top-16 sm:top-12 sm:w-96 card shadow-xl max-h-[70vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
              <b>Notificaciones</b>
              {n > 0 && <button className="text-sm text-brand font-semibold" onClick={() => readAll.mutate()}>Marcar leídas</button>}
            </div>
            {q.data?.items.length ? q.data.items.map((x: any) => (
              <button key={x.id} onClick={() => { setOpen(false); api(`/notifications/${x.id}/read`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })); x.enlace && nav(x.enlace) }}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 ${x.leida ? '' : 'bg-brand-50/50'}`}>
                <div className="flex items-center gap-2">
                  {x.severidad === 'critical' && <span className="w-2 h-2 rounded-full bg-danger shrink-0" />}
                  <span className="font-semibold text-sm">{x.titulo}</span>
                </div>
                <p className="text-sm text-slate-600 break-words">{x.mensaje}</p>
                <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(x.creada)}</p>
              </button>
            )) : <p className="p-6 text-center text-sm text-slate-500">Sin notificaciones por ahora.</p>}
          </div>
        </>
      )}
    </div>
  )
}

function Toasts() {
  const { toasts, dismiss } = useToasts()
  const nav = useNavigate()
  return (
    <div className="fixed z-[60] top-3 right-3 left-3 sm:left-auto sm:w-96 space-y-2 pointer-events-none" aria-live="assertive">
      {toasts.map((t) => (
        <div key={t.key} role="alert" className={`pointer-events-auto card p-3 pr-2 flex gap-3 animate-fadeIn shadow-lg border-l-4 ${t.severidad === 'critical' ? 'border-l-danger' : t.severidad === 'warning' ? 'border-l-warn' : 'border-l-brand'}`}>
          <button className="text-left flex-1 min-w-0" onClick={() => { dismiss(t.key); t.enlace && nav(t.enlace) }}>
            <div className="font-semibold text-sm">{t.titulo}</div>
            <div className="text-sm text-slate-600 break-words">{t.mensaje}</div>
          </button>
          <button onClick={() => dismiss(t.key)} aria-label="Cerrar notificación" className="p-1 h-fit rounded hover:bg-slate-100"><X size={16} /></button>
        </div>
      ))}
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const menu = user!.rol === 'medico' ? MENU_MEDICO : MENU_ENFERMERA
  const alertsQ = useQuery({ queryKey: ['alerts', 'badge'], queryFn: () => api('/alerts?estado=activa'), refetchInterval: 60000 })
  const nAlerts = alertsQ.data?.length ?? 0

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[70] focus:bg-white focus:p-3">Saltar al contenido</a>
      {open && <div className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed lg:sticky top-0 z-50 h-screen w-72 lg:w-64 shrink-0 bg-gradient-to-b from-brand-dark to-brand text-white flex flex-col transition-transform ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        aria-label="Menú principal">
        <div className="px-5 py-5 flex items-center justify-between">
          <Logo onDark />
          <button className="lg:hidden p-2 rounded-lg hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={22} /></button>
        </div>
        <div className="px-5 pb-3 text-xs uppercase tracking-wider text-white/70 flex items-center gap-1.5">
          {user!.rol === 'medico' ? <Stethoscope size={14} /> : <Activity size={14} />}
          {user!.rol === 'medico' ? 'Médico' : 'Enfermería'}
        </div>
        <nav className="flex-1 overflow-y-auto px-3 space-y-1">
          {menu.map((m) => (
            <NavLink key={m.to} to={m.to} end={m.end} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium transition-colors ${isActive ? 'bg-white text-brand-dark' : 'text-white/90 hover:bg-white/10'}`}>
              <m.icon size={20} /> <span className="flex-1">{m.label}</span>
              {m.to === '/alertas' && nAlerts > 0 && <span className="badge bg-danger text-white">{nAlerts}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/15">
          <div className="text-sm font-semibold truncate">{user!.nombre_completo}</div>
          <div className="text-xs text-white/70 truncate mb-3">{user!.email}</div>
          <button onClick={logout} className="btn w-full bg-white/10 hover:bg-white/20 text-white"><LogOut size={18} /> Cerrar sesión</button>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 h-16 px-3 sm:px-6 flex items-center gap-2">
          <button className="lg:hidden p-2.5 rounded-xl hover:bg-slate-100" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={24} /></button>
          <div className="lg:hidden"><Logo size={28} /></div>
          <div className="flex-1" />
          <span className="hidden md:inline text-xs text-slate-500 mr-2">Prototipo demostrativo · datos ficticios</span>
          <Bell_ />
        </header>
        <main id="main" key={loc.pathname} className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto animate-fadeIn">
          <Outlet />
        </main>
      </div>
      <Toasts />
    </div>
  )
}
