/** Escudo médico + cruz sanitaria + sello de verificación. */
export function LogoMark({ size = 40, onDark = false }: { size?: number; onDark?: boolean }) {
  const id = onDark ? 'lgd' : 'lgl'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Logo de MediAlert">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={onDark ? '#fff' : '#673AB7'} />
          <stop offset="1" stopColor={onDark ? '#E6DAF6' : '#4527A0'} />
        </linearGradient>
      </defs>
      <path d="M32 4 8 13v17c0 15 10 25 24 30 14-5 24-15 24-30V13z" fill={`url(#${id})`} />
      <path d="M27 18h10v9h9v10h-9v9H27v-9h-9V27h9z" fill={onDark ? '#4527A0' : '#fff'} />
      <circle cx="44" cy="44" r="12" fill="#10B981" stroke={onDark ? '#4527A0' : '#fff'} strokeWidth="3" />
      <path d="m38.5 44 4 4 7-8" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ onDark = false, size = 36 }: { onDark?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} onDark={onDark} />
      <span className={`text-xl font-extrabold tracking-tight ${onDark ? 'text-white' : 'text-brand-dark'}`}>
        Medi<span className={onDark ? 'text-emerald-300' : 'text-med-dark'}>Alert</span>
      </span>
    </div>
  )
}
