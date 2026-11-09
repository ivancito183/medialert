import { useAuth } from '../lib/auth'
import { PageHeader } from '../components/ui'

export default function Perfil() {
  const { user: u } = useAuth()
  const rows: [string, any][] = [
    ['Nombres', u!.nombres], ['Apellidos', u!.apellidos], ['Documento', `${u!.tipo_documento} ${u!.documento}`],
    ['Correo', u!.email], ['Rol', u!.rol === 'medico' ? 'Médico' : 'Enfermera'], ['Registro profesional', u!.registro_profesional],
    ['Estado', u!.activo ? 'Activo' : 'Inactivo'],
  ]
  return (
    <>
      <PageHeader title="Perfil" subtitle="Información de su cuenta. Los cambios de cuenta los gestiona personal autorizado." />
      <dl className="card p-5 grid gap-4 sm:grid-cols-2 max-w-3xl">
        {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-600">{k}</dt><dd className="font-semibold">{v || '—'}</dd></div>)}
      </dl>
    </>
  )
}
