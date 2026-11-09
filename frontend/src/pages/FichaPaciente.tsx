import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, BedDouble, IdCard } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fmtDate, fmtDateTime } from '../lib/format'
import { AlertCard } from '../components/AlertCard'
import { Empty, ErrorBox, Modal, Spinner, StateBadge, Tabs } from '../components/ui'

function KV({ k, v }: { k: string; v: any }) {
  return <div><dt className="text-xs text-slate-600">{k}</dt><dd className="font-medium break-words">{v || '—'}</dd></div>
}

export default function FichaPaciente() {
  const { id } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState('personal')
  const [modal, setModal] = useState<null | 'edit' | 'bed' | 'discharge'>(null)
  const [form, setForm] = useState<any>({})
  const [bed, setBed] = useState('')
  const q = useQuery({ queryKey: ['patient', id], queryFn: () => api(`/patients/${id}`) })
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => api('/rooms'), enabled: modal === 'bed' })
  const done = () => { setModal(null); qc.invalidateQueries() }
  const patch = useMutation({ mutationFn: () => api(`/patients/${id}`, { method: 'PATCH', body: form }), onSuccess: done })
  const move = useMutation({ mutationFn: () => api(`/patients/${id}/bed`, { method: 'PUT', body: { bed_id: Number(bed) } }), onSuccess: done })
  const out = useMutation({ mutationFn: () => api(`/patients/${id}/discharge`, { method: 'POST' }), onSuccess: done })

  if (q.isLoading) return <Spinner />
  if (q.error) return <ErrorBox error={q.error} />
  const p = q.data
  const d = p.datos
  const medico = user!.rol === 'medico'
  const open = p.alertas.filter((a: any) => a.estado !== 'resuelta')
  return (
    <>
      <header className="card p-5 mb-4 border-l-8 border-l-brand">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">{p.paciente.nombre_completo}</h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700 mt-1">
              <span className="flex items-center gap-1"><IdCard size={15} /> {p.paciente.tipo_documento} {p.paciente.documento}</span>
              <span>{p.paciente.edad} años · {p.paciente.sexo}</span>
              <span className="flex items-center gap-1"><BedDouble size={15} /> {p.cama ? `Hab. ${p.cama.habitacion} · Cama ${p.cama.cama}` : 'Sin cama'}</span>
              <span>Estado: <b className="capitalize">{p.estado}</b>{!p.activa && ' (egresado)'}</span>
            </div>
            <p className="mt-1"><b>Dx:</b> {p.diagnostico}</p>
            {d.alergias && <p className="mt-2 badge bg-warn-50 text-warn-dark border border-warn/40 !whitespace-normal"><AlertTriangle size={14} /> Alergias: {d.alergias}</p>}
          </div>
          {medico && p.activa && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => { setForm({ estado: p.estado, diagnostico: p.diagnostico, alergias: d.alergias ?? '', observaciones: d.observaciones ?? '', peso_kg: d.peso_kg ?? '', estatura_cm: d.estatura_cm ?? '' }); setModal('edit') }}>Editar datos</button>
              <button className="btn-ghost" onClick={() => setModal('bed')}>Cambiar cama</button>
              <Link to="/prescripciones" className="btn-primary">Prescribir</Link>
              <button className="btn-ghost text-danger" onClick={() => setModal('discharge')}>Egresar</button>
            </div>
          )}
        </div>
      </header>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'personal', label: 'Personal' }, { id: 'hosp', label: 'Hospitalaria' }, { id: 'clinica', label: 'Clínica' },
        { id: 'rx', label: 'Prescripciones', count: p.prescripciones.length }, { id: 'pend', label: 'Pendientes', count: p.pendientes.length },
        { id: 'adm', label: 'Administrados', count: p.administrados.length }, { id: 'alertas', label: 'Alertas', count: open.length },
        { id: 'hist', label: 'Historial de cambios', count: p.historial.length },
      ]} />
      {tab === 'personal' && <dl className="card p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KV k="Nombres" v={p.paciente.nombres} /><KV k="Apellidos" v={p.paciente.apellidos} />
        <KV k="Documento" v={`${p.paciente.tipo_documento} ${p.paciente.documento}`} /><KV k="Fecha de nacimiento" v={fmtDate(d.fecha_nacimiento)} />
        <KV k="Edad" v={`${p.paciente.edad} años`} /><KV k="Sexo registrado" v={p.paciente.sexo} /><KV k="Teléfono" v={d.telefono} />
      </dl>}
      {tab === 'hosp' && <dl className="card p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KV k="Fecha de ingreso" v={fmtDate(p.fecha_ingreso)} /><KV k="Habitación / cama" v={p.cama ? `${p.cama.habitacion} / ${p.cama.cama}` : null} />
        <KV k="Médico responsable" v={p.medico} /><KV k="Enfermera asignada" v={p.enfermera?.nombre} />
        <KV k="Estado" v={p.estado} /><KV k="Motivo" v={p.motivo} /><KV k="Diagnóstico principal" v={p.diagnostico} /><KV k="Descripción del caso" v={p.descripcion} />
      </dl>}
      {tab === 'clinica' && <dl className="card p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KV k="Peso" v={d.peso_kg && `${d.peso_kg} kg`} /><KV k="Estatura" v={d.estatura_cm && `${d.estatura_cm} cm`} /><KV k="Alergias" v={d.alergias} />
        <KV k="Antecedentes" v={d.antecedentes} /><KV k="Observaciones" v={d.observaciones} />
        <p className="sm:col-span-3 text-xs text-slate-500">Peso y edad se muestran como información clínica; MediAlert no calcula dosis a partir de ellos.</p>
      </dl>}
      {tab === 'rx' && (p.prescripciones.length ? <ul className="space-y-3">{p.prescripciones.map((r: any) => (
        <li key={r.id} className="card p-4 flex flex-wrap justify-between gap-2">
          <div><b>{r.vigente.medicamento}</b> · {r.vigente.dosis} {r.vigente.unidad} · {r.vigente.via}
            <p className="text-sm text-slate-600">{r.vigente.frecuencia} · {r.vigente.horarios.join(', ')} · v{r.version_actual}</p></div>
          <span className={`badge h-fit ${r.estado === 'activa' ? 'bg-med-50 text-med-dark' : 'bg-slate-200 text-slate-700'}`}>{r.estado}</span>
        </li>))}</ul> : <div className="card"><Empty title="Sin prescripciones" /></div>)}
      {(tab === 'pend' || tab === 'adm') && (() => {
        const rows = tab === 'pend' ? p.pendientes : p.administrados
        return rows.length ? <div className="card overflow-x-auto"><table className="w-full min-w-[560px]"><thead><tr><th>Hora</th><th>Medicamento</th><th>Dosis</th><th>Estado</th>{tab === 'adm' && <th>Administró</th>}</tr></thead>
          <tbody>{rows.map((a: any) => <tr key={a.id}><td>{fmtDateTime(a.programada_para)}</td><td>{a.medicamento}</td>
            <td>{tab === 'adm' && a.dosis_administrada ? `${a.dosis_administrada} ${a.unidad_administrada}` : `${a.dosis} ${a.unidad}`}</td>
            <td><StateBadge estado={a.estado} /></td>{tab === 'adm' && <td>{a.enfermera ?? '—'}</td>}</tr>)}</tbody></table></div>
          : <div className="card"><Empty title="Sin registros" /></div>
      })()}
      {tab === 'alertas' && (p.alertas.length ? <div className="space-y-3">{p.alertas.map((a: any) => <AlertCard key={a.id} a={a} role={user!.rol} />)}</div> : <div className="card"><Empty title="Sin alertas" text="No se han detectado discrepancias para este paciente." /></div>)}
      {tab === 'hist' && (p.historial.length ? <ul className="card divide-y divide-slate-100">{p.historial.map((h: any) => (
        <li key={h.id} className="p-3 text-sm"><b className="capitalize">{h.accion.replace(/_/g, ' ')}</b> · {h.usuario ?? 'Sistema'} · <span className="text-slate-500">{fmtDateTime(h.fecha)}</span>
          {h.detalle && <pre className="mt-1 text-xs bg-slate-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(h.detalle, null, 1)}</pre>}</li>))}</ul> : <div className="card"><Empty title="Sin cambios registrados" /></div>)}

      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title="Editar datos clínicos">
        <div className="grid gap-3">
          <div><label className="label">Estado</label><select className="input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}><option value="hospitalizado">Hospitalizado</option><option value="estable">Estable</option><option value="critico">Crítico</option></select></div>
          <div><label className="label">Diagnóstico</label><input className="input" value={form.diagnostico ?? ''} onChange={(e) => setForm({ ...form, diagnostico: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Peso (kg)</label><input className="input" inputMode="decimal" value={form.peso_kg ?? ''} onChange={(e) => setForm({ ...form, peso_kg: e.target.value || null })} /></div>
            <div><label className="label">Estatura (cm)</label><input className="input" inputMode="decimal" value={form.estatura_cm ?? ''} onChange={(e) => setForm({ ...form, estatura_cm: e.target.value || null })} /></div>
          </div>
          <div><label className="label">Alergias</label><input className="input" value={form.alergias ?? ''} onChange={(e) => setForm({ ...form, alergias: e.target.value })} /></div>
          <div><label className="label">Observaciones</label><textarea className="input" rows={3} value={form.observaciones ?? ''} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></div>
          <ErrorBox error={patch.error} />
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn-primary" disabled={patch.isPending} onClick={() => patch.mutate()}>Guardar</button></div>
        </div>
      </Modal>
      <Modal open={modal === 'bed'} onClose={() => setModal(null)} title="Cambiar de cama">
        <select className="input" aria-label="Cama destino" value={bed} onChange={(e) => setBed(e.target.value)}>
          <option value="">Seleccione una cama disponible…</option>
          {rooms.data?.map((r: any) => <optgroup key={r.id} label={`Habitación ${r.numero}`}>{r.camas.filter((c: any) => c.estado === 'disponible').map((c: any) => <option key={c.id} value={c.id}>Cama {c.etiqueta}</option>)}</optgroup>)}
        </select>
        <div className="mt-3"><ErrorBox error={move.error} /></div>
        <div className="flex justify-end gap-2 mt-4"><button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn-primary" disabled={!bed || move.isPending} onClick={() => move.mutate()}>Trasladar</button></div>
      </Modal>
      <Modal open={modal === 'discharge'} onClose={() => setModal(null)} title="Egresar paciente">
        <p className="text-sm">Se liberará la cama y se suspenderán las prescripciones activas y los eventos pendientes. Esta acción queda auditada.</p>
        <div className="mt-3"><ErrorBox error={out.error} /></div>
        <div className="flex justify-end gap-2 mt-4"><button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn-danger" disabled={out.isPending} onClick={() => out.mutate()}>Confirmar egreso</button></div>
      </Modal>
    </>
  )
}
