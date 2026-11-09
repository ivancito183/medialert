import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertOctagon, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { api, D } from '../lib/api'
import { ESTADO_ALERTA, TIPO_ALERTA, fmtDateTime } from '../lib/format'
import { ErrorBox, Modal } from './ui'

export function AlertCard({ a, role }: { a: D; role: string }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<null | 'review' | 'resolve'>(null)
  const [nota, setNota] = useState('')
  const m = useMutation({
    mutationFn: () => api(`/alerts/${a.id}/${mode === 'review' ? 'request-review' : 'resolve'}`, { method: 'POST', body: { nota } }),
    onSuccess: () => { setMode(null); setNota(''); qc.invalidateQueries() },
  })
  const ai = useMutation({ mutationFn: () => api(`/ai/explain-alert/${a.id}`, { method: 'POST' }) })
  const crit = a.severidad === 'critica' && a.estado !== 'resuelta'
  const tone = a.estado === 'resuelta' ? 'border-med/50 bg-med-50/40' : crit ? 'border-danger bg-danger-50' : 'border-warn bg-warn-50'
  const Icon = a.estado === 'resuelta' ? CheckCircle2 : crit ? AlertOctagon : AlertTriangle
  const color = a.estado === 'resuelta' ? 'text-med-dark' : crit ? 'text-danger' : 'text-warn-dark'
  return (
    <article className={`rounded-2xl border-2 p-4 ${tone} ${crit ? 'animate-pulseRing' : ''}`} aria-label={`Alerta ${a.codigo}`}>
      <div className="flex flex-wrap items-start gap-3">
        <Icon className={`${color} shrink-0 mt-0.5`} size={26} />
        <div className="flex-1 min-w-[12rem]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-900">{TIPO_ALERTA[a.tipo] ?? a.tipo}</span>
            <span className="text-xs text-slate-500 font-mono">{a.codigo}</span>
            <span className={`badge ${a.estado === 'resuelta' ? 'bg-med-dark text-white' : a.estado === 'pendiente_revision' ? 'bg-brand text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>
              {ESTADO_ALERTA[a.estado]}
            </span>
          </div>
          <p className="text-sm text-slate-800 mt-1 break-words">{a.mensaje}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm mt-3">
        <div><dt className="text-xs text-slate-600">Paciente</dt><dd className="font-semibold">{a.paciente.nombre_completo}</dd></div>
        <div><dt className="text-xs text-slate-600">Documento</dt><dd>{a.paciente.tipo_documento} {a.paciente.documento}</dd></div>
        <div><dt className="text-xs text-slate-600">Medicamento</dt><dd>{a.medicamento ?? '—'}</dd></div>
        <div><dt className="text-xs text-slate-600">Fecha</dt><dd className="flex items-center gap-1"><Clock size={13} />{fmtDateTime(a.creada)}</dd></div>
        {a.dosis_prescrita && <div><dt className="text-xs text-slate-600">Dosis prescrita</dt><dd className="font-bold">{a.dosis_prescrita}</dd></div>}
        {a.dosis_registrada && <div><dt className="text-xs text-slate-600">Dosis registrada</dt><dd className={`font-bold ${crit ? 'text-danger' : ''}`}>{a.dosis_registrada}</dd></div>}
        <div><dt className="text-xs text-slate-600">Enfermera</dt><dd>{a.enfermera ?? '—'}</dd></div>
        <div><dt className="text-xs text-slate-600">Médico</dt><dd>{a.medico ?? '—'}</dd></div>
      </dl>
      {a.nota_revision && <p className="text-sm mt-2 bg-white/70 rounded-lg p-2"><b>Solicitud de revisión:</b> {a.nota_revision}</p>}
      {a.resolucion && <p className="text-sm mt-2 bg-white/70 rounded-lg p-2"><b>Resolución:</b> {a.resolucion}</p>}
      {ai.data && <p className="text-sm mt-2 bg-white rounded-lg p-3 border border-brand/30 whitespace-pre-wrap"><b>Explicación ({ai.data.fuente === 'gemini' ? 'IA' : 'reglas'}):</b> {ai.data.respuesta}<span className="block text-xs text-slate-600 mt-1">{ai.data.aviso}</span></p>}
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn-ghost" disabled={ai.isPending} onClick={() => ai.mutate()}>Explicar con IA</button>
        {a.prescription_id && role === 'medico' && <Link to="/prescripciones" className="btn-ghost">Consultar prescripción</Link>}
        {role === 'enfermera' && a.administration_id && a.estado !== 'resuelta' && <Link to={`/enfermeria/${a.administration_id}`} className="btn-primary">Corregir registro</Link>}
        {role === 'enfermera' && a.estado === 'activa' && <button className="btn-ghost" onClick={() => setMode('review')}>Solicitar revisión médica</button>}
        {role === 'medico' && a.estado !== 'resuelta' && <button className="btn-green" onClick={() => setMode('resolve')}>Revisar y resolver</button>}
      </div>
      <Modal open={!!mode} onClose={() => setMode(null)} title={mode === 'review' ? 'Solicitar revisión médica' : 'Resolver alerta'}>
        <p className="text-sm text-slate-600 mb-3">
          {mode === 'review' ? 'Describa la discrepancia para el médico responsable.' : 'Documente la revisión realizada. Resolver no marca el medicamento como administrado: enfermería deberá repetir la verificación.'}
        </p>
        <textarea className="input" rows={4} value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nota" />
        <div className="mt-3"><ErrorBox error={m.error} /></div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-ghost" onClick={() => setMode(null)}>Cancelar</button>
          <button className="btn-primary" disabled={nota.trim().length < 5 || m.isPending} onClick={() => m.mutate()}>{mode === 'review' ? 'Enviar solicitud' : 'Resolver'}</button>
        </div>
      </Modal>
    </article>
  )
}
