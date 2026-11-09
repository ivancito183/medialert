import { ReactNode, useEffect, useRef } from 'react'
import { AlertTriangle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react'
import { ESTADO_ADM } from '../lib/format'

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-slate-500" role="status" aria-live="polite">
      <Loader2 className="animate-spin" size={20} /> {label}
    </div>
  )
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4">
      <div className="w-14 h-14 rounded-full bg-brand-50 text-brand grid place-items-center mb-3"><Inbox size={26} /></div>
      <p className="font-semibold text-slate-800">{title}</p>
      {text && <p className="text-sm text-slate-500 max-w-md mt-1">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

const TONES = {
  brand: 'bg-brand-50 text-brand-dark', green: 'bg-med-50 text-med-dark',
  red: 'bg-danger-50 text-danger', amber: 'bg-warn-50 text-warn-dark', slate: 'bg-slate-100 text-slate-700',
}
export function StatCard({ label, value, icon, tone = 'brand', hint, to }: {
  label: string; value: ReactNode; icon: ReactNode; tone?: keyof typeof TONES; hint?: string; to?: string
}) {
  const inner = (
    <div className="card p-4 flex items-center gap-4 animate-fadeIn h-full hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 shrink-0 rounded-xl grid place-items-center ${TONES[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-2xl font-extrabold text-slate-900 leading-tight">{value}</div>
        <div className="text-sm text-slate-600">{label}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
    </div>
  )
  return to ? <a href={to} className="block rounded-2xl">{inner}</a> : inner
}

export function StateBadge({ estado }: { estado: string }) {
  const s = ESTADO_ADM[estado] ?? { label: estado, cls: 'bg-slate-100 text-slate-700' }
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

export function SevBadge({ sev, estado }: { sev: string; estado?: string }) {
  if (estado === 'resuelta') return <span className="badge bg-med-50 text-med-dark"><CheckCircle2 size={13} /> Resuelta</span>
  return sev === 'critica'
    ? <span className="badge bg-danger text-white"><AlertTriangle size={13} /> Crítica</span>
    : <span className="badge bg-warn text-slate-900"><AlertTriangle size={13} /> Advertencia</span>
}

export function Modal({ open, onClose, title, children, wide = false }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; prev?.focus() }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50" onMouseDown={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl animate-fadeIn`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, error, children, hint, className = '' }: {
  label: string; error?: string; children: ReactNode; hint?: string; className?: string
}) {
  return (
    <div className={className}>
      <label className="label">{label}{children && null}</label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  )
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-bold text-brand-dark mb-4 pb-2 border-b border-slate-100">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const msg = (error as any)?.full ?? (error as any)?.message ?? 'Ocurrió un error'
  return <div role="alert" className="rounded-xl border border-danger/30 bg-danger-50 text-danger px-4 py-3 text-sm">{msg}</div>
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200 mb-4">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${value === t.id ? 'border-brand text-brand-dark' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 badge bg-slate-100 text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
