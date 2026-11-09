import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { AlertOctagon, AlertTriangle, ArrowLeft, CheckCircle2, IdCard, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { api, ApiError, D } from '../lib/api'
import { TIPO_ALERTA, UNIDADES, VIAS, fmtDateTime } from '../lib/format'
import { AlertCard } from '../components/AlertCard'
import { ErrorBox, Field, Modal, Spinner, StateBadge } from '../components/ui'

type Result = { bloqueado?: boolean; requiere_reconocer?: boolean; hallazgos: D[]; alertas?: number[] }

function Hallazgos({ r, onCorrect, onRx, onReview }: { r: Result; onCorrect: () => void; onRx: () => void; onReview: () => void }) {
  const crit = r.hallazgos.filter((h) => h.severidad === 'critica')
  const warn = r.hallazgos.filter((h) => h.severidad !== 'critica')
  return (
    <div className="space-y-3" role="alert" aria-live="assertive">
      {crit.length > 0 && (
        <section className="rounded-2xl border-4 border-danger bg-danger-50 p-5 animate-pulseRing">
          <div className="flex items-center gap-3 text-danger">
            <AlertOctagon size={34} className="shrink-0" />
            <div><p className="text-xl font-extrabold leading-tight">🚨 ALERTA CRÍTICA</p><p className="font-bold">POSIBLE ERROR DE MEDICACIÓN</p></div>
          </div>
          <ul className="mt-3 space-y-3">
            {crit.map((h, i) => (
              <li key={i} className="bg-white rounded-xl p-3 border border-danger/30">
                <p className="font-bold text-slate-900">{TIPO_ALERTA[h.tipo] ?? h.tipo}</p>
                {h.detalle?.dosis_prescrita && (
                  <dl className="grid grid-cols-2 gap-3 my-2 text-center">
                    <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-600">Dosis prescrita</dt><dd className="text-2xl font-extrabold">{h.detalle.dosis_prescrita}</dd></div>
                    <div className="rounded-lg bg-danger-50 p-2"><dt className="text-xs text-slate-600">Dosis registrada</dt><dd className="text-2xl font-extrabold text-danger">{h.detalle.dosis_registrada}</dd></div>
                  </dl>)}
                {h.detalle?.ratio && Number(h.detalle.ratio) > 1 && <p className="font-extrabold text-danger">Diferencia: {h.detalle.ratio} veces la dosis prescrita.</p>}
                <p className="text-sm mt-1 break-words">⚠️ {h.mensaje}</p>
              </li>))}
          </ul>
          <p className="mt-3 font-extrabold text-slate-900">La confirmación de administración ha sido bloqueada.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn-danger" onClick={onCorrect}>Corregir dosis</button>
            <button className="btn-ghost" onClick={onRx}>Consultar prescripción original</button>
            <button className="btn-ghost" onClick={onReview}>Solicitar revisión médica</button>
          </div>
        </section>)}
      {warn.length > 0 && (
        <section className="rounded-2xl border-2 border-warn bg-warn-50 p-4">
          <p className="font-bold text-warn-dark flex items-center gap-2"><AlertTriangle size={20} /> Advertencias que requieren verificación</p>
          <ul className="list-disc pl-5 mt-1 text-sm space-y-1">{warn.map((h, i) => <li key={i}><b>{TIPO_ALERTA[h.tipo] ?? h.tipo}:</b> {h.mensaje}</li>)}</ul>
        </section>)}
    </div>
  )
}

export default function Verificacion() {
  const { id } = useParams()
  const qc = useQueryClient()
  const formRef = useRef<HTMLDivElement>(null)
  const d = useQuery({ queryKey: ['adm', id], queryFn: () => api(`/nursing/administrations/${id}`) })
  const meds = useQuery({ queryKey: ['meds'], queryFn: () => api('/medications') })
  const [viewed, setViewed] = useState<number | null>(null)
  const [f, setF] = useState<D>({ medication_id: '', dosis: '', unidad: 'mg', presentacion: '', concentracion: '', via: 'Oral', hora_prevista: '', documento_verificado: '', observaciones: '' })
  const [result, setResult] = useState<Result | null>(null)
  const [prep, setPrep] = useState<D | null>(null)
  const [conf, setConf] = useState<D>({ dosis: '', unidad: 'mg', via: 'Oral', documento: '', observaciones: '', ack: false })
  const [modal, setModal] = useState<null | 'rx' | 'review' | 'notgiven'>(null)
  const [nota, setNota] = useState('')
  const [err, setErr] = useState<unknown>(null)

  const a = d.data
  useEffect(() => { if (a && viewed === null) setViewed(a.version_actual) }, [a, viewed])
  useEffect(() => {  // precarga la hora prevista; la dosis NO se precarga para forzar transcripción consciente
    if (a && !f.hora_prevista) setF((x) => ({ ...x, hora_prevista: a.hora, via: a.prescripcion.via }))
  }, [a]) // eslint-disable-line

  const stale = a && viewed !== null && a.version_actual !== viewed
  const done = a && ['administrado', 'no_administrado', 'suspendido'].includes(a.estado)
  const refresh = () => qc.invalidateQueries()

  const handle = async (p: Promise<any>, ok: (r: any) => void) => {
    setErr(null)
    try { ok(await p) } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.body.hallazgos || e.body.bloqueado)) { setResult(e.body as Result); setPrep(null); refresh() } else setErr(e)
    }
  }
  const prepare = useMutation({
    mutationFn: () => handle(api(`/nursing/administrations/${id}/prepare`, { method: 'POST', body: {
      ...f, medication_id: Number(f.medication_id), dosis: f.dosis.replace(',', '.'), version_visualizada: viewed,
      presentacion: f.presentacion || null, concentracion: f.concentracion || null, hora_prevista: f.hora_prevista || null, observaciones: f.observaciones || null } }),
      (r) => { setResult(r); setPrep(r.preparacion); setConf((c: D) => ({ ...c, dosis: f.dosis, unidad: f.unidad, via: f.via, documento: f.documento_verificado })); refresh() }),
  })
  const confirm = useMutation({
    mutationFn: () => handle(api(`/nursing/administrations/${id}/confirm`, { method: 'POST', body: {
      preparation_id: prep!.id, dosis_administrada: conf.dosis.replace(',', '.'), unidad: conf.unidad, via: conf.via,
      documento_verificado: conf.documento, observaciones: conf.observaciones || null, reconoce_advertencias: conf.ack } }),
      () => { setResult(null); setPrep(null); refresh() }),
  })
  const review = useMutation({
    mutationFn: async () => {
      const alertId = result?.alertas?.[0] ?? a.alertas.find((x: D) => x.estado !== 'resuelta')?.id
      return api(`/alerts/${alertId}/request-review`, { method: 'POST', body: { nota } })
    },
    onSuccess: () => { setModal(null); setNota(''); refresh() },
  })
  const notGiven = useMutation({
    mutationFn: () => api(`/nursing/administrations/${id}/not-given`, { method: 'POST', body: { motivo: nota } }),
    onSuccess: () => { setModal(null); setNota(''); refresh() },
  })

  if (d.isLoading || meds.isLoading) return <Spinner />
  if (d.error) return <ErrorBox error={d.error} />
  const rx = a.prescripcion
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const medSel = meds.data?.find((m: D) => String(m.id) === String(f.medication_id))
  const ready = f.medication_id && f.dosis && f.documento_verificado && !stale
  const openAlerts = a.alertas.filter((x: D) => x.estado !== 'resuelta')

  return (
    <div className="space-y-4">
      <Link to="/enfermeria" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft size={16} /> Volver a medicamentos</Link>

      <header className="card p-4 sm:p-5 border-l-8 border-l-med">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1"><IdCard size={14} /> Identificación del paciente — contraste con la manilla</p>
          <StateBadge estado={a.estado} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">{a.paciente.nombre_completo}</h1>
        <p className="text-lg font-bold text-brand-dark">{a.paciente.tipo_documento} {a.paciente.documento}</p>
        <p className="text-sm text-slate-700 mt-1">Hab. {a.habitacion_cama?.habitacion ?? '—'} · Cama {a.habitacion_cama?.cama ?? '—'} · {a.paciente.edad} años · Programado {a.hora}</p>
        <p className="text-xs text-slate-500">La habitación/cama no sustituye la verificación de identidad.</p>
        {a.datos.alergias && <p className={`mt-2 badge !whitespace-normal ${a.alergias_coinciden.length ? 'bg-danger text-white' : 'bg-warn-50 text-warn-dark border border-warn/40'}`}>
          <ShieldAlert size={14} /> Alergias: {a.datos.alergias}{a.alergias_coinciden.length ? ` — coincide con ${a.alergias_coinciden.join(', ')}` : ''}</p>}
      </header>

      {a.rx_estado === 'suspendida' && <div role="alert" className="rounded-2xl border-4 border-danger bg-danger-50 p-4 font-bold text-danger">⛔ Prescripción SUSPENDIDA por el médico{a.motivo_suspension ? `: ${a.motivo_suspension}` : ''}. No se puede administrar.</div>}
      {stale && (
        <div role="alert" className="rounded-2xl border-2 border-warn bg-warn-50 p-4 flex flex-wrap items-center gap-3">
          <b className="flex-1 min-w-[14rem]">La prescripción fue modificada (v{viewed} → v{a.version_actual}). Revise la versión vigente antes de continuar.</b>
          <button className="btn-primary" onClick={() => { setViewed(a.version_actual); setResult(null); setPrep(null); setF({ ...f, via: rx.via }) }}><RefreshCw size={16} /> Ver versión vigente</button>
        </div>)}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5 bg-brand-50/40" aria-label="Prescripción vigente">
          <h2 className="font-bold text-brand-dark mb-3">Prescripción vigente · v{rx.version}</h2>
          <p className="text-2xl font-extrabold">{rx.medicamento}</p>
          <p className="text-4xl font-extrabold text-brand-dark my-2">{rx.dosis} {rx.unidad}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-600">Principio activo</dt><dd>{rx.principio_activo}</dd></div>
            <div><dt className="text-xs text-slate-600">Presentación</dt><dd>{rx.presentacion}</dd></div>
            <div><dt className="text-xs text-slate-600">Concentración</dt><dd>{rx.concentracion ?? '—'}</dd></div>
            <div><dt className="text-xs text-slate-600">Vía</dt><dd className="font-semibold">{rx.via}</dd></div>
            <div><dt className="text-xs text-slate-600">Frecuencia</dt><dd>{rx.frecuencia}</dd></div>
            <div><dt className="text-xs text-slate-600">Horarios</dt><dd>{rx.horarios.join(', ')}</dd></div>
          </dl>
          {rx.observaciones && <p className="mt-3 text-sm bg-white rounded-lg p-2"><b>Indicaciones médicas:</b> {rx.observaciones}</p>}
        </section>

        <section ref={formRef as any} className="card p-5" aria-label="Registro de enfermería">
          <h2 className="font-bold mb-3">1. Transcripción y preparación</h2>
          {done ? (
            <p className="text-sm text-slate-600">Este evento ya tiene estado final: <StateBadge estado={a.estado} /></p>
          ) : (
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); prepare.mutate() }} noValidate>
              <Field label="Medicamento preparado *" className="sm:col-span-2">
                <select className="input" value={f.medication_id} onChange={(e) => { const m = meds.data.find((x: D) => String(x.id) === e.target.value); setF({ ...f, medication_id: e.target.value, presentacion: m?.presentacion ?? '', concentracion: m?.concentracion ?? '' }) }}>
                  <option value="">Seleccione…</option>{meds.data.map((m: D) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
              </Field>
              <Field label="Dosis preparada *"><input className="input" inputMode="decimal" autoComplete="off" value={f.dosis} onChange={set('dosis')} /></Field>
              <Field label="Unidad *"><select className="input" value={f.unidad} onChange={set('unidad')}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select></Field>
              <Field label="Presentación"><input className="input" value={f.presentacion} onChange={set('presentacion')} /></Field>
              <Field label="Concentración"><input className="input" value={f.concentracion} onChange={set('concentracion')} /></Field>
              <Field label="Vía prevista *"><select className="input" value={f.via} onChange={set('via')}>{VIAS.map((v) => <option key={v}>{v}</option>)}</select></Field>
              <Field label="Hora prevista"><input type="time" className="input" value={f.hora_prevista} onChange={set('hora_prevista')} /></Field>
              <Field label="Documento del paciente (manilla) *" hint="Digite el documento leído en la identificación." className="sm:col-span-2">
                <input className="input" inputMode="text" autoComplete="off" value={f.documento_verificado} onChange={set('documento_verificado')} /></Field>
              <Field label="Observaciones" className="sm:col-span-2"><textarea rows={2} className="input" value={f.observaciones} onChange={set('observaciones')} /></Field>
              {medSel && <p className="sm:col-span-2 text-xs text-slate-500">Catálogo: {medSel.nombre} · {medSel.principio_activo}</p>}
              <div className="sm:col-span-2"><ErrorBox error={err} /></div>
              <button className="btn-primary sm:col-span-2" disabled={!ready || prepare.isPending}>{prepare.isPending && <Loader2 className="animate-spin" size={18} />}<ShieldCheck size={18} /> Registrar y verificar</button>
            </form>)}
        </section>
      </div>

      {result && !done && <Hallazgos r={result} onCorrect={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })} onRx={() => setModal('rx')} onReview={() => setModal('review')} />}

      {prep && !result?.bloqueado && !done && (
        <section className="card p-5 border-2 border-med" aria-label="Confirmar administración">
          <h2 className="font-bold text-med-dark flex items-center gap-2"><CheckCircle2 /> 2. Verificación superada — confirme la administración efectiva</h2>
          <p className="text-sm text-slate-600 mb-3">Preparada: {prep.dosis} {prep.unidad} · {prep.via}. Registre lo que efectivamente se administró.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Dosis administrada *"><input className="input" inputMode="decimal" value={conf.dosis} onChange={(e) => setConf({ ...conf, dosis: e.target.value })} /></Field>
            <Field label="Unidad *"><select className="input" value={conf.unidad} onChange={(e) => setConf({ ...conf, unidad: e.target.value })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select></Field>
            <Field label="Vía *"><select className="input" value={conf.via} onChange={(e) => setConf({ ...conf, via: e.target.value })}>{VIAS.map((v) => <option key={v}>{v}</option>)}</select></Field>
            <Field label="Documento verificado *"><input className="input" value={conf.documento} onChange={(e) => setConf({ ...conf, documento: e.target.value })} /></Field>
            <Field label="Observaciones" className="sm:col-span-4"><input className="input" value={conf.observaciones} onChange={(e) => setConf({ ...conf, observaciones: e.target.value })} /></Field>
          </div>
          {result?.requiere_reconocer && (
            <label className="flex items-start gap-3 mt-3 p-3 rounded-xl bg-warn-50 border border-warn text-sm">
              <input type="checkbox" className="mt-1 !min-h-0 w-5 h-5" checked={conf.ack} onChange={(e) => setConf({ ...conf, ack: e.target.checked })} />
              <span>He verificado las advertencias: {result.hallazgos.map((h) => h.mensaje).join(' ')}</span>
            </label>)}
          <div className="mt-3"><ErrorBox error={err} /></div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="btn-green" disabled={confirm.isPending || (result?.requiere_reconocer && !conf.ack)} onClick={() => confirm.mutate()}>
              {confirm.isPending && <Loader2 className="animate-spin" size={18} />} Confirmar administración</button>
            <button className="btn-ghost" onClick={() => setModal('notgiven')}>No administrado…</button>
          </div>
        </section>)}

      {a.estado === 'administrado' && (
        <section className="card p-5 border-2 border-med bg-med-50" aria-live="polite">
          <p className="font-bold text-med-dark flex items-center gap-2"><CheckCircle2 /> Administración registrada</p>
          <p className="text-sm">{a.dosis_administrada} {a.unidad_administrada} · {a.via_administrada} · {fmtDateTime(a.administrada_en)} · {a.enfermera}</p>
        </section>)}
      {!done && !prep && <div><button className="btn-ghost" onClick={() => setModal('notgiven')}>Marcar como no administrado…</button></div>}

      {a.alertas.length > 0 && (
        <section><h2 className="font-bold mb-2">Alertas de este evento ({openAlerts.length} abiertas)</h2>
          <div className="space-y-3">{a.alertas.map((x: D) => <AlertCard key={x.id} a={x} role="enfermera" />)}</div></section>)}
      {a.preparaciones.length > 0 && (
        <section className="card p-4"><h2 className="font-bold mb-2">Registros de preparación</h2>
          <ul className="divide-y divide-slate-100 text-sm">{a.preparaciones.map((p: D) => (
            <li key={p.id} className="py-2 flex flex-wrap justify-between gap-2"><span>{p.medicamento} · <b>{p.dosis} {p.unidad}</b> · {p.via} · v{p.version}</span>
              <span className={`badge ${p.estado === 'verificada' ? 'bg-med-50 text-med-dark' : 'bg-danger-50 text-danger'}`}>{p.estado}</span><span className="text-slate-500">{fmtDateTime(p.creada)}</span></li>))}</ul></section>)}

      <Modal open={modal === 'rx'} onClose={() => setModal(null)} title="Prescripción original vigente">
        <p className="text-3xl font-extrabold text-brand-dark">{rx.dosis} {rx.unidad}</p>
        <p className="font-semibold">{rx.medicamento} · {rx.via}</p>
        <p className="text-sm text-slate-600">{rx.frecuencia} · {rx.horarios.join(', ')} · v{rx.version} · por {rx.autor}</p>
        {rx.observaciones && <p className="text-sm mt-2">{rx.observaciones}</p>}
      </Modal>
      <Modal open={modal === 'review' || modal === 'notgiven'} onClose={() => setModal(null)} title={modal === 'review' ? 'Solicitar revisión médica' : 'Medicamento no administrado'}>
        <textarea className="input" rows={4} aria-label="Nota" placeholder={modal === 'review' ? 'Describa la discrepancia' : 'Motivo (obligatorio)'} value={nota} onChange={(e) => setNota(e.target.value)} />
        <div className="mt-3"><ErrorBox error={modal === 'review' ? review.error : notGiven.error} /></div>
        <div className="flex justify-end gap-2 mt-4"><button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
          <button className="btn-primary" disabled={nota.trim().length < 5} onClick={() => (modal === 'review' ? review : notGiven).mutate()}>Enviar</button></div>
      </Modal>
    </div>
  )
}
