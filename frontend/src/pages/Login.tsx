import { FormEvent, useState } from 'react'
import { Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import { Logo, LogoMark } from '../components/Logo'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try { await login(email, password) } catch (x) { setErr(x instanceof ApiError ? x.message : 'No se pudo conectar con el servidor') } finally { setBusy(false) }
  }
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-brand-dark via-brand to-med-dark text-white p-12">
        <Logo onDark size={44} />
        <div>
          <LogoMark size={96} onDark />
          <h1 className="text-4xl font-extrabold mt-6 leading-tight !text-white">Cada dosis verificada antes de administrarse.</h1>
          <p className="mt-4 text-white/85 max-w-md text-lg">Comunicación médico–enfermería, trazabilidad de prescripciones y alertas que detienen los errores de medicación.</p>
        </div>
        <p className="text-sm text-white/80 flex items-center gap-2"><ShieldCheck size={16} /> Prototipo demostrativo con datos ficticios.</p>
      </div>
      <div className="flex items-center justify-center p-6 bg-surface">
        <form onSubmit={submit} className="card w-full max-w-md p-7 sm:p-9" aria-label="Inicio de sesión">
          <div className="lg:hidden mb-6"><Logo /></div>
          <h2 className="text-2xl font-extrabold">Iniciar sesión</h2>
          <p className="text-sm text-slate-600 mt-1 mb-6">Acceso exclusivo para personal clínico autorizado.</p>
          <label className="label" htmlFor="email">Usuario, correo o documento</label>
          <div className="relative mb-4">
            <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
            <input id="email" type="text" required autoComplete="username" className="input pl-10" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <label className="label" htmlFor="pw">Contraseña</label>
          <div className="relative mb-4">
            <LockKeyhole className="absolute left-3 top-3 text-slate-400" size={18} />
            <input id="pw" type="password" required autoComplete="current-password" className="input pl-10" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <p role="alert" className="rounded-xl bg-danger-50 text-danger text-sm px-3 py-2 mb-4">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" size={18} />} Ingresar</button>
          <p className="text-xs text-slate-600 mt-5">Las cuentas las crea personal autorizado de la institución; no existe registro público.</p>
        </form>
      </div>
    </div>
  )
}
