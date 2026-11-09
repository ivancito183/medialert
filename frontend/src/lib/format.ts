export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export const ESTADO_ADM: Record<string, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-slate-100 text-slate-700' },
  en_preparacion: { label: 'En preparación', cls: 'bg-brand-50 text-brand-dark' },
  en_verificacion: { label: 'En verificación', cls: 'bg-brand-100 text-brand-dark' },
  bloqueado: { label: 'Bloqueado', cls: 'bg-danger-50 text-danger border border-danger/30' },
  administrado: { label: 'Administrado', cls: 'bg-med-50 text-med-dark' },
  no_administrado: { label: 'No administrado', cls: 'bg-warn-50 text-warn-dark' },
  suspendido: { label: 'Suspendido', cls: 'bg-slate-200 text-slate-700' },
}

export const TIPO_ALERTA: Record<string, string> = {
  dosis: 'Error de dosis', unidad: 'Error de unidad', medicamento: 'Error de medicamento',
  paciente: 'Error de paciente', via: 'Error de vía', horario: 'Error de horario',
  suspendida: 'Medicamento suspendido', prescripcion_modificada: 'Prescripción modificada',
  alergia: 'Posible alergia', administracion_duplicada: 'Administración duplicada',
  concentracion: 'Concentración distinta', preparacion_bloqueada: 'Preparación bloqueada',
}

export const ESTADO_ALERTA: Record<string, string> = {
  activa: 'Activa', pendiente_revision: 'Pendiente de revisión', resuelta: 'Resuelta',
}

export const UNIDADES = ['mcg', 'mg', 'g', 'mL', 'L', 'UI']
export const VIAS = ['Oral', 'Intravenosa', 'Intramuscular', 'Subcutánea', 'Tópica', 'Inhalatoria', 'Sublingual', 'Rectal']
export const TIPOS_DOC = [
  ['CC', 'Cédula de ciudadanía'], ['TI', 'Tarjeta de identidad'], ['CE', 'Cédula de extranjería'],
  ['PA', 'Pasaporte'], ['RC', 'Registro civil'], ['OTRO', 'Otro documento admitido'],
]
export const today = () => new Date().toLocaleDateString('en-CA')
