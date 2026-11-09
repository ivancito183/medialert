import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bot, Loader2, Send } from 'lucide-react'
import { api, D } from '../lib/api'
import { ErrorBox, PageHeader } from '../components/ui'

export default function Asistente() {
  const meds = useQuery({ queryKey: ['meds'], queryFn: () => api('/medications') })
  const st = useQuery({ queryKey: ['ai-status'], queryFn: () => api('/ai/status') })
  const [med, setMed] = useState('')
  const [pregunta, setPregunta] = useState('')
  const ask = useMutation({ mutationFn: () => api('/ai/ask', { method: 'POST', body: { pregunta, medicamento: med || null } }) })
  const ficha = meds.data?.find((m: D) => m.nombre === med)
  return (
    <>
      <PageHeader title="Asistente IA y base farmacológica" subtitle="Explica riesgos y resuelve dudas educativas. No decide alertas ni sustituye el criterio clínico." />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5 space-y-3" aria-label="Consulta">
          <label className="label" htmlFor="m">Medicamento (opcional)</label>
          <select id="m" className="input" value={med} onChange={(e) => setMed(e.target.value)}>
            <option value="">—</option>{meds.data?.map((m: D) => <option key={m.id}>{m.nombre}</option>)}</select>
          <label className="label" htmlFor="q">Su pregunta</label>
          <textarea id="q" rows={4} maxLength={800} className="input" value={pregunta} onChange={(e) => setPregunta(e.target.value)}
            placeholder="Ej.: ¿Qué debo verificar antes de administrar este medicamento por vía intravenosa?" />
          <p className="text-xs text-slate-600">No escriba nombres, documentos ni otros datos que identifiquen a un paciente.</p>
          {st.data && !st.data.gemini_configurado && <p className="text-xs rounded-lg bg-warn-50 text-warn-dark p-2">Gemini no está configurado (GEMINI_API_KEY): se mostrarán respuestas básicas del motor.</p>}
          <ErrorBox error={ask.error} />
          <button className="btn-primary" disabled={pregunta.trim().length < 3 || ask.isPending} onClick={() => ask.mutate()}>
            {ask.isPending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />} Consultar</button>
          {ask.data && (
            <div className="rounded-xl bg-brand-50 p-4 animate-fadeIn" aria-live="polite">
              <p className="flex items-center gap-2 font-bold text-brand-dark mb-1"><Bot size={18} /> Respuesta ({ask.data.fuente === 'gemini' ? 'Gemini' : 'motor de reglas'})</p>
              <p className="whitespace-pre-wrap text-sm">{ask.data.respuesta}</p>
              <p className="text-xs text-slate-600 mt-2">{ask.data.aviso}</p>
            </div>)}
        </section>
        <section className="card p-5" aria-label="Ficha farmacológica">
          <h2 className="font-bold mb-3">Ficha farmacológica</h2>
          {ficha ? (
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs text-slate-600">Principio activo · presentación</dt><dd>{ficha.principio_activo} · {ficha.presentacion} {ficha.concentracion}</dd></div>
              <div><dt className="text-xs text-slate-600">Indicaciones</dt><dd>{ficha.indicaciones ?? 'Sin información cargada'}</dd></div>
              <div><dt className="text-xs text-slate-600">Contraindicaciones</dt><dd>{ficha.contraindicaciones ?? 'Sin información cargada'}</dd></div>
              <div><dt className="text-xs text-slate-600">Efectos adversos</dt><dd>{ficha.efectos_adversos ?? 'Sin información cargada'}</dd></div>
              <p className="text-xs text-slate-600">Fuente: {ficha.fuente ?? 'sin fuente'}</p>
            </dl>
          ) : <p className="text-sm text-slate-600">Seleccione un medicamento para ver su ficha.</p>}
        </section>
      </div>
    </>
  )
}
