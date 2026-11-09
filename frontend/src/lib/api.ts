export type D = Record<string, any>

export class ApiError extends Error {
  status: number
  body: D
  constructor(status: number, body: D) {
    super(typeof body?.detail === 'string' ? body.detail : 'Error de solicitud')
    this.status = status
    this.body = body
  }
  /** Mensaje con detalle de campos (422) */
  get full(): string {
    const e = this.body?.errores as { campo: string; mensaje: string }[] | undefined
    return e?.length ? e.map((x) => `${x.campo ? x.campo + ': ' : ''}${x.mensaje}`).join(' · ') : this.message
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch('/api' + path, {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'medialert' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let data: any = null
  try { data = await res.json() } catch { /* sin cuerpo */ }
  // 409 con "bloqueado" es una respuesta funcional del motor de seguridad, no un fallo
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('medialert:logout'))
    throw new ApiError(res.status, data ?? {})
  }
  return data as T
}
