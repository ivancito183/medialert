import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Plus, X } from 'lucide-react'
import { api, D } from '../lib/api'
import { VIAS, fmtDateTime, today } from '../lib/format'
import { Empty, ErrorBox, Field, Modal, PageHeader, Spinner } from '../components/ui'

const schema = z.object({
  patient_id: z.string().min(1, 'Seleccione un paciente'),
  medication_id: z.string().min(1, 'Seleccione un medicamento'),
  presentacion: z.string().min(1, 'Obligatoria'),
  concentracion: z.string().optional(),
  dosis: z.string().min(1, 'Obligatoria').refine((v) => Number(v.replace(',', '.')) > 0, 'Debe ser mayor que cero'),
  unidad: z.string().min(1),
  via: z.string().min(1),
  frecuencia: z.string().min(2, 'Obligatoria'),
  horarios: z.array(z.string().regex(/^\d\d:\d\d$/, 'Hora inválida')).min(1, 'Agregue al menos un horario'),
  fecha_inicio: z.string().min(1, 'Obligatoria'),
  fecha_fin: z.string().min(1, 'Obligatoria'),
  observaciones: z.string().optional(),
  motivo_cambio: z.string().optional(),
}).refine((v) => v.fecha_fin >= v.fecha_inicio, { path: ['fecha_fin'], message: 'No puede ser anterior al inicio' })
type F = z.infer<typeof schema>

function RxForm({ rx, onDone }: { rx?: D; onDone: () => void }) {
  const qc = useQueryClient()
  const meds = useQuery({ queryKey: ['meds'], queryFn: () => api('/medications') })
  const pats = useQuery({ queryKey: ['patients', ''], queryFn: () => api('/patients') })
  const v = rx?.vigente
  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: rx ? {
      patient_id: String(rx.paciente_id), medication_id: String(v.medication_id), presentacion: v.presentacion,
      concentracion: v.concentracion ?? '', dosis: v.dosis, unidad: v.unidad, via: v.via, frecuencia: v.frecuencia,
      horarios: v.horarios, fecha_inicio: v.fecha_inicio, fecha_fin: v.fecha_fin, observaciones: v.observaciones ?? '', motivo_cambio: '',
    } : { patient_id: '', medication_id: '', unidad: 'mg', via: 'Oral', horarios: ['08:00'], fecha_inicio: today(), fecha_fin: today(), presentacion: '', frecuencia: '' },
  })
  const medId = watch('medication_id')
  const med = meds.data?.find((m: any) => String(m.id) === medId)
  const patId = watch('patient_id')
  const pat = pats.data?.find((h: any) => String(h.paciente.id) === patId)
  useEffect(() => {
    if (med && !rx) { setValue('presentacion', med.presentacion); setValue('concentracion', med.concentracion ?? ''); if (med.unidades.length && !med.unidades.includes(watch('unidad'))) setValue('unidad', med.unidades[0]) }
  }, [medId]) // eslint-disable-line
  const save = useMutation({
    mutationFn: (f: F) => {
      const body: D = { ...f, medication_id: Number(f.medication_id), dosis: f.dosis.replace(',', '.'), concentracion: f.concentracion || null, observaciones: f.observaciones || null }
      if (rx) { delete body.patient_id; return api(`/prescriptions/${rx.id}/versions`, { method: 'POST', body: { ...body, motivo_cambio: f.motivo_cambio } }) }
      delete body.motivo_cambio
      return api('/prescriptions', { method: 'POST', body: { ...body, patient_id: Number(f.patient_id) } })
    },
    onSuccess: () => { qc.invalidateQueries(); onDone() },
  })
  const E = (k: keyof F) => errors[k]?.message as string | undefined
  return (
    <form onSubmit={handleSubmit((f) => save.mutate(f))} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Paciente *" error={E('patient_id')} className="sm:col-span-2">
        <select className="input" disabled={!!rx} {...register('patient_id')}>
          <option value="">Seleccione…</option>
          {pats.data?.map((h: any) => <option key={h.id} value={h.paciente.id}>{h.paciente.nombre_completo} — {h.paciente.tipo_documento} {h.paciente.documento}</option>)}
        </select>
      </Field>
      {pat && <p className="sm:col-span-2 text-sm bg-brand-50 rounded-xl px-3 py-2">Habitación {pat.cama?.habitacion ?? '—'} · Cama {pat.cama?.cama ?? '—'} · Cédula {pat.paciente.documento}</p>}
      <Field label="Medicamento *" error={E('medication_id')}>
        <select className="input" {...register('medication_id')}><option value="">Seleccione…</option>{meds.data?.map((m: any) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
      </Field>
      <Field label="Principio activo"><div className="input bg-slate-50">{med?.principio_activo ?? '—'}</div></Field>
      <Field label="Presentación *" error={E('presentacion')}><input className="input" {...register('presentacion')} /></Field>
      <Field label="Concentración"><input className="input" {...register('concentracion')} /></Field>
      <Field label="Dosis prescrita *" error={E('dosis')} hint="Use punto o coma decimal."><input className="input" inputMode="decimal" {...register('dosis')} /></Field>
      <Field label="Unidad de medida *" hint="mg, g y mcg son masa; mL volumen; UI actividad. No son intercambiables entre magnitudes.">
        <select className="input" {...register('unidad')}>{(med?.unidades?.length ? med.unidades : ['mcg', 'mg', 'g', 'mL', 'L', 'UI']).map((u: string) => <option key={u}>{u}</option>)}</select>
      </Field>
      <Field label="Vía de administración *"><select className="input" {...register('via')}>{VIAS.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Frecuencia *" error={E('frecuencia')}><input className="input" placeholder="Ej.: cada 12 horas" {...register('frecuencia')} /></Field>
      <Controller control={control} name="horarios" render={({ field }) => (
        <Field label="Horarios *" error={(errors.horarios as any)?.message ?? (errors.horarios as any)?.[0]?.message} className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {field.value.map((h: string, i: number) => (
              <span key={i} className="flex items-center gap-1">
                <input type="time" className="input !w-32" aria-label={`Horario ${i + 1}`} value={h} onChange={(e) => field.onChange(field.value.map((x: string, j: number) => (j === i ? e.target.value : x)))} />
                {field.value.length > 1 && <button type="button" aria-label="Quitar horario" className="p-2 rounded-lg hover:bg-slate-100" onClick={() => field.onChange(field.value.filter((_: string, j: number) => j !== i))}><X size={16} /></button>}
              </span>
            ))}
            <button type="button" className="btn-ghost" onClick={() => field.onChange([...field.value, '12:00'])}><Plus size={16} /> Horario</button>
          </div>
        </Field>)} />
      <Field label="Fecha de inicio *" error={E('fecha_inicio')}><input type="date" className="input" {...register('fecha_inicio')} /></Field>
      <Field label="Fecha de finalización *" error={E('fecha_fin')} hint="Duración máxima: 30 días."><input type="date" className="input" {...register('fecha_fin')} /></Field>
      <Field label="Observaciones / indicaciones" className="sm:col-span-2"><textarea rows={2} className="input" {...register('observaciones')} /></Field>
      {rx && <Field label="Motivo del cambio *" error={watch('motivo_cambio') !== undefined && (watch('motivo_cambio') ?? '').length < 5 && save.isError ? 'Mínimo 5 caracteres' : undefined} className="sm:col-span-2"><input className="input" {...register('motivo_cambio')} /></Field>}
      <div className="sm:col-span-2"><ErrorBox error={save.error} /></div>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>Cancelar</button>
        <button className="btn-primary" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" size={18} />}{rx ? 'Guardar nueva versión' : 'Crear prescripción'}</button>
      </div>
    </form>
  )
}

export default function Prescripciones() {
  const qc = useQueryClient()
  const [estado, setEstado] = useState('')
  const [modal, setModal] = useState<null | 'new' | 'edit' | 'suspend' | 'detail'>(null)
  const [sel, setSel] = useState<D | null>(null)
  const [motivo, setMotivo] = useState('')
  const q = useQuery({ queryKey: ['rx', estado], queryFn: () => api(`/prescriptions?estado=${estado}`) })
  const detail = useQuery({ queryKey: ['rx-detail', sel?.id], queryFn: () => api(`/prescriptions/${sel!.id}`), enabled: !!sel && (modal === 'detail' || modal === 'edit') })
  const suspend = useMutation({
    mutationFn: () => api(`/prescriptions/${sel!.id}/suspend`, { method: 'POST', body: { motivo } }),
    onSuccess: () => { setModal(null); setMotivo(''); qc.invalidateQueries() },
  })
  const close = () => { setModal(null); setSel(null) }
  const rows: D[] = q.data ?? []
  const open = (r: D, m: any) => { setSel(r); setModal(m) }
  return (
    <>
      <PageHeader title="Prescripciones médicas" subtitle="Cada modificación crea una nueva versión; la original se conserva."
        actions={<button className="btn-primary" onClick={() => setModal('new')}><Plus size={18} /> Nueva prescripción</button>} />
      <div className="flex gap-2 mb-4">
        {[['', 'Todas'], ['activa', 'Activas'], ['suspendida', 'Suspendidas']].map(([k, l]) => (
          <button key={k} onClick={() => setEstado(k)} aria-pressed={estado === k} className={`btn ${estado === k ? 'bg-brand text-white' : 'bg-white border border-slate-300'}`}>{l}</button>))}
      </div>
      {q.isLoading ? <Spinner /> : !rows.length ? <div className="card"><Empty title="No hay prescripciones" text="Cree la primera prescripción para un paciente hospitalizado." /></div> : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="card p-4">
              <div className="flex justify-between gap-2">
                <div className="min-w-0"><b className="text-lg">{r.vigente.medicamento}</b>
                  <p className="text-sm text-slate-600 truncate">{r.paciente.nombre_completo} · {r.paciente.tipo_documento} {r.paciente.documento}</p></div>
                <span className={`badge h-fit ${r.estado === 'activa' ? 'bg-med-50 text-med-dark' : 'bg-slate-200 text-slate-700'}`}>{r.estado}</span>
              </div>
              <p className="mt-2 text-xl font-extrabold text-brand-dark">{r.vigente.dosis} {r.vigente.unidad} <span className="text-sm font-medium text-slate-600">· {r.vigente.via}</span></p>
              <p className="text-sm text-slate-600">{r.vigente.frecuencia} · {r.vigente.horarios.join(' · ')} · Hab. {r.cama?.habitacion ?? '—'}-{r.cama?.cama ?? '—'} · v{r.version_actual}</p>
              {r.motivo_suspension && <p className="text-sm text-danger mt-1">Suspendida: {r.motivo_suspension}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                <button className="btn-ghost" onClick={() => open(r, 'detail')}>Consultar / historial</button>
                {r.estado === 'activa' && <button className="btn-ghost" onClick={() => open(r, 'edit')}>Modificar</button>}
                {r.estado === 'activa' && <button className="btn-ghost text-danger" onClick={() => open(r, 'suspend')}>Suspender</button>}
              </div>
            </li>))}
        </ul>
      )}
      <Modal open={modal === 'new'} onClose={close} title="Nueva prescripción" wide><RxForm onDone={close} /></Modal>
      <Modal open={modal === 'edit'} onClose={close} title="Modificar prescripción (nueva versión)" wide>
        {detail.data ? <RxForm rx={detail.data} onDone={close} /> : <Spinner />}
      </Modal>
      <Modal open={modal === 'suspend'} onClose={close} title="Suspender prescripción">
        <p className="text-sm text-slate-600 mb-3">Enfermería será notificada y no podrá registrar administraciones de este medicamento.</p>
        <textarea className="input" rows={3} placeholder="Motivo de la suspensión" aria-label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <div className="mt-3"><ErrorBox error={suspend.error} /></div>
        <div className="flex justify-end gap-2 mt-4"><button className="btn-ghost" onClick={close}>Cancelar</button>
          <button className="btn-danger" disabled={motivo.trim().length < 5 || suspend.isPending} onClick={() => suspend.mutate()}>Suspender</button></div>
      </Modal>
      <Modal open={modal === 'detail'} onClose={close} title="Historial de versiones" wide>
        {detail.data ? (
          <ol className="space-y-3">
            {[...detail.data.versiones].reverse().map((v: D) => (
              <li key={v.id} className={`rounded-xl border p-3 ${v.version === detail.data.version_actual ? 'border-brand bg-brand-50' : 'border-slate-200'}`}>
                <div className="flex justify-between gap-2"><b>Versión {v.version}{v.version === detail.data.version_actual && ' (vigente)'}</b><span className="text-xs text-slate-500">{fmtDateTime(v.creada)}</span></div>
                <p className="text-sm">{v.medicamento} · <b>{v.dosis} {v.unidad}</b> · {v.via} · {v.horarios.join(', ')}</p>
                <p className="text-xs text-slate-600">Por {v.autor}{v.motivo_cambio && ` · Motivo: ${v.motivo_cambio}`}</p>
              </li>))}
          </ol>) : <Spinner />}
      </Modal>
    </>
  )
}
