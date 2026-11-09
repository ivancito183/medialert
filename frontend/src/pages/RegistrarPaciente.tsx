import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { TIPOS_DOC, today } from '../lib/format'
import { ErrorBox, Field, FormSection, PageHeader } from '../components/ui'

const schema = z.object({
  nombres: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  apellidos: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  tipo_documento: z.string().min(1),
  documento: z.string().trim().min(4, 'Mínimo 4 caracteres').max(20).regex(/^[A-Za-z0-9-]+$/, 'Solo letras, números y guion'),
  fecha_nacimiento: z.string().min(1, 'Obligatoria').refine((v) => v <= today(), 'No puede ser futura'),
  sexo: z.string().min(1, 'Seleccione'),
  telefono: z.string().optional(),
  peso_kg: z.string().optional().refine((v) => !v || (Number(v) > 0 && Number(v) <= 500), 'Peso inválido'),
  estatura_cm: z.string().optional().refine((v) => !v || (Number(v) > 0 && Number(v) <= 260), 'Estatura inválida'),
  alergias: z.string().optional(),
  antecedentes: z.string().optional(),
  observaciones: z.string().optional(),
  bed_id: z.string().optional(),
  fecha_ingreso: z.string().min(1, 'Obligatoria'),
  motivo: z.string().trim().min(3, 'Obligatorio'),
  diagnostico: z.string().trim().min(3, 'Obligatorio'),
  descripcion: z.string().optional(),
  estado: z.string(),
  enfermera_id: z.string().min(1, 'Asigne una enfermera responsable'),
})
type F = z.infer<typeof schema>

function edad(f: string) {
  if (!f) return '—'
  const b = new Date(f), t = new Date()
  let e = t.getFullYear() - b.getFullYear()
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) e--
  return e >= 0 ? `${e} años` : '—'
}

export default function RegistrarPaciente() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { register, handleSubmit, watch, formState: { errors } } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: { tipo_documento: 'CC', estado: 'hospitalizado', fecha_ingreso: today(), sexo: '' },
  })
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => api('/rooms') })
  const nurses = useQuery({ queryKey: ['nurses'], queryFn: () => api('/users/nurses') })
  const save = useMutation({
    mutationFn: (v: F) => {
      const num = (x?: string) => (x ? Number(x) : null)
      return api('/patients', { method: 'POST', body: {
        ...v, bed_id: v.bed_id ? Number(v.bed_id) : null, enfermera_id: Number(v.enfermera_id),
        peso_kg: num(v.peso_kg), estatura_cm: num(v.estatura_cm),
        telefono: v.telefono || null, alergias: v.alergias || null, antecedentes: v.antecedentes || null,
        observaciones: v.observaciones || null, descripcion: v.descripcion || null,
      } })
    },
    onSuccess: (r) => { qc.invalidateQueries(); nav(`/pacientes/${r.id}`) },
  })
  const E = (k: keyof F) => errors[k]?.message as string | undefined
  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
      <PageHeader title="Registrar paciente" subtitle="Complete los datos personales, hospitalarios y clínicos. El documento es obligatorio y único." />
      <FormSection title="Datos personales">
        <Field label="Nombres *" error={E('nombres')}><input className="input" autoComplete="off" {...register('nombres')} /></Field>
        <Field label="Apellidos *" error={E('apellidos')}><input className="input" autoComplete="off" {...register('apellidos')} /></Field>
        <Field label="Tipo de documento *">
          <select className="input" {...register('tipo_documento')}>{TIPOS_DOC.map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}</select>
        </Field>
        <Field label="Número de documento *" error={E('documento')}><input className="input" inputMode="text" autoComplete="off" {...register('documento')} /></Field>
        <Field label="Fecha de nacimiento *" error={E('fecha_nacimiento')}><input type="date" max={today()} className="input" {...register('fecha_nacimiento')} /></Field>
        <Field label="Edad (calculada)"><div className="input bg-slate-50" aria-live="polite">{edad(watch('fecha_nacimiento'))}</div></Field>
        <Field label="Sexo registrado *" error={E('sexo')}>
          <select className="input" {...register('sexo')}><option value="">Seleccione…</option><option>Femenino</option><option>Masculino</option><option>Otro</option></select>
        </Field>
        <Field label="Teléfono de contacto"><input className="input" type="tel" {...register('telefono')} /></Field>
      </FormSection>
      <FormSection title="Información hospitalaria">
        <Field label="Habitación y cama" hint="Solo se listan camas disponibles.">
          <select className="input" {...register('bed_id')}>
            <option value="">Sin asignar</option>
            {rooms.data?.map((r: any) => (
              <optgroup key={r.id} label={`Habitación ${r.numero}`}>
                {r.camas.filter((c: any) => c.estado === 'disponible').map((c: any) => <option key={c.id} value={c.id}>Cama {c.etiqueta}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Fecha de ingreso *" error={E('fecha_ingreso')}><input type="date" className="input" {...register('fecha_ingreso')} /></Field>
        <Field label="Estado de hospitalización">
          <select className="input" {...register('estado')}><option value="hospitalizado">Hospitalizado</option><option value="estable">Estable</option><option value="critico">Crítico</option></select>
        </Field>
        <Field label="Motivo de hospitalización *" error={E('motivo')} className="sm:col-span-2"><input className="input" {...register('motivo')} /></Field>
        <Field label="Diagnóstico principal *" error={E('diagnostico')}><input className="input" {...register('diagnostico')} /></Field>
        <Field label="Enfermera responsable *" error={E('enfermera_id')}>
          <select className="input" {...register('enfermera_id')}><option value="">Seleccione…</option>{nurses.data?.map((n: any) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select>
        </Field>
        <Field label="Descripción del caso" className="sm:col-span-2 lg:col-span-3"><textarea rows={3} className="input" {...register('descripcion')} /></Field>
      </FormSection>
      <FormSection title="Información clínica relevante">
        <Field label="Peso (kg)" error={E('peso_kg')}><input className="input" inputMode="decimal" {...register('peso_kg')} /></Field>
        <Field label="Estatura (cm)" error={E('estatura_cm')}><input className="input" inputMode="decimal" {...register('estatura_cm')} /></Field>
        <Field label="Alergias conocidas" hint="Separe con comas. Se usan para advertencias, no para calcular dosis."><input className="input" {...register('alergias')} /></Field>
        <Field label="Antecedentes importantes" className="sm:col-span-2"><textarea rows={2} className="input" {...register('antecedentes')} /></Field>
        <Field label="Observaciones clínicas"><textarea rows={2} className="input" {...register('observaciones')} /></Field>
      </FormSection>
      <ErrorBox error={save.error} />
      <div className="flex justify-end gap-2 sticky bottom-0 bg-surface/90 backdrop-blur py-3">
        <button type="button" className="btn-ghost" onClick={() => nav(-1)}>Cancelar</button>
        <button className="btn-primary" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" size={18} />} Registrar paciente</button>
      </div>
    </form>
  )
}
