import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ShieldX } from 'lucide-react'
import { api, D } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fmtDateTime } from '../lib/format'
import { Empty, ErrorBox, PageHeader, Spinner, StateBadge, Tabs } from '../components/ui'

function Nurse() {
  const [estado, setEstado] = useState('')
  const [q, setQ] = useState('')
  const res = useQuery({ queryKey: ['nhist', estado, q], queryFn: () => api(`/nursing/history?estado=${estado}&q=${encodeURIComponent(q)}`) })
  const rows: D[] = res.data ?? []
  return (
    <>
      <PageHeader title="Historial de administración" subtitle="Dosis prescrita, preparada y efectivamente administrada se registran por separado." />
      <div className="grid sm:grid-cols-2 gap-3 mb-3 max-w-xl">
        <input className="input" placeholder="Paciente o cédula" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos</option><option value="administrado">Administrado</option><option value="no_administrado">No administrado</option><option value="suspendido">Suspendido</option><option value="bloqueado">Bloqueado</option></select>
      </div>
      {res.isLoading ? <Spinner /> : res.error ? <ErrorBox error={res.error} /> : !rows.length ? <div className="card"><Empty title="Sin registros" /></div> : (
        <>
          <div className="card overflow-x-auto hidden md:block"><table className="w-full min-w-[900px]">
            <thead><tr><th>Programada</th><th>Paciente</th><th>Medicamento</th><th>Dosis prescrita</th><th>Administrada</th><th>Vía</th><th>Responsable</th><th>Estado</th><th>Alertas</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap">{fmtDateTime(r.programada_para)}</td><td><b>{r.paciente.nombre_completo}</b><br /><span className="text-slate-500">{r.paciente.tipo_documento} {r.paciente.documento}</span></td>
                <td>{r.medicamento}</td><td>{r.dosis} {r.unidad}</td><td className="font-bold">{r.dosis_administrada ? `${r.dosis_administrada} ${r.unidad_administrada}` : '—'}</td>
                <td>{r.via_administrada ?? r.via}</td><td>{r.enfermera ?? '—'}</td><td><StateBadge estado={r.estado} />{r.observaciones && <p className="text-xs text-slate-500 mt-1 max-w-[12rem]">{r.observaciones}</p>}</td>
                <td>{r.alertas_relacionadas || '—'}</td></tr>))}</tbody></table></div>
          <ul className="md:hidden space-y-3">{rows.map((r) => (
            <li key={r.id} className="card p-4"><div className="flex justify-between gap-2"><b>{r.paciente.nombre_completo}</b><StateBadge estado={r.estado} /></div>
              <p className="text-sm">{r.medicamento} · prescrita {r.dosis} {r.unidad}</p>
              <p className="text-sm">Administrada: <b>{r.dosis_administrada ? `${r.dosis_administrada} ${r.unidad_administrada}` : '—'}</b></p>
              <p className="text-xs text-slate-500">{fmtDateTime(r.programada_para)} · {r.enfermera ?? 'sin responsable'} · {r.alertas_relacionadas} alerta(s)</p></li>))}</ul>
        </>)}
    </>
  )
}

function Medico() {
  const [tab, setTab] = useState('rx')
  const rx = useQuery({ queryKey: ['hist-rx'], queryFn: () => api('/history/prescriptions') })
  const au = useQuery({ queryKey: ['audit'], queryFn: () => api('/audit') })
  return (
    <>
      <PageHeader title="Historial" subtitle="Trazabilidad de prescripciones y bitácora de auditoría." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'rx', label: 'Versiones de prescripción' }, { id: 'audit', label: 'Auditoría' }]} />
      {tab === 'rx' && (rx.isLoading ? <Spinner /> : !rx.data?.length ? <div className="card"><Empty title="Sin prescripciones" /></div> : (
        <ul className="space-y-3">{rx.data.map((v: D) => (
          <li key={v.id} className="card p-4"><div className="flex flex-wrap justify-between gap-2"><b>{v.paciente} · {v.medicamento}</b>
            <span className={`badge ${v.vigente ? 'bg-med-50 text-med-dark' : 'bg-slate-100 text-slate-600'}`}>v{v.version}{v.vigente ? ' vigente' : ' anterior'}</span></div>
            <p className="text-sm">{v.dosis} {v.unidad} · {v.via} · {v.horarios.join(', ')}</p>
            <p className="text-xs text-slate-600">{fmtDateTime(v.creada)} · {v.autor}{v.motivo_cambio ? ` · ${v.motivo_cambio}` : ''}</p></li>))}</ul>))}
      {tab === 'audit' && (au.isLoading ? <Spinner /> : au.error ? <ErrorBox error={au.error} /> : (
        <>
          <div className={`card p-3 mb-3 flex items-center gap-2 text-sm font-semibold ${au.data.cadena.integra ? 'text-med-dark' : 'text-danger'}`}>
            {au.data.cadena.integra ? <ShieldCheck /> : <ShieldX />}
            {au.data.cadena.integra ? `Cadena de auditoría íntegra (${au.data.cadena.verificados} registros verificados)` : `¡Cadena alterada! Primer registro afectado: #${au.data.cadena.primer_registro_alterado}`}
          </div>
          <div className="card overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr><th>#</th><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th></tr></thead>
            <tbody>{au.data.items.map((r: D) => <tr key={r.id}><td>{r.id}</td><td className="whitespace-nowrap">{fmtDateTime(r.fecha)}</td><td>{r.usuario ?? 'Sistema'}</td><td className="capitalize">{r.accion.replace(/_/g, ' ')}</td><td>{r.entidad} {r.entidad_id ?? ''}</td></tr>)}</tbody></table></div>
        </>))}
    </>
  )
}

export default function Historial() {
  const { user } = useAuth()
  return user!.rol === 'enfermera' ? <Nurse /> : <Medico />
}
