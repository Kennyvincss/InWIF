/** Concept render of the InWIF One hardware wallet (illustration — not a photograph). */
export function DeviceRender({ className = '' }: { className?: string }) {
  return (
    <figure className={className}>
      <svg viewBox="0 0 420 300" className="h-auto w-full" role="img" aria-label="Concept render of the InWIF One hardware wallet">
        <defs>
          <linearGradient id="alu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a525f" />
            <stop offset=".45" stopColor="#2a3039" />
            <stop offset="1" stopColor="#15191f" />
          </linearGradient>
          <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b95a5" stopOpacity=".7" />
            <stop offset=".5" stopColor="#3a414c" stopOpacity=".2" />
            <stop offset="1" stopColor="#8b95a5" stopOpacity=".5" />
          </linearGradient>
          <radialGradient id="glow" cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#E8622C" stopOpacity=".35" />
            <stop offset="1" stopColor="#E8622C" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0b0f14" />
            <stop offset="1" stopColor="#05070a" />
          </linearGradient>
        </defs>
        <ellipse cx="210" cy="272" rx="150" ry="14" fill="#000" opacity=".55" />
        <ellipse cx="210" cy="150" rx="190" ry="120" fill="url(#glow)" />
        {/* body */}
        <rect x="70" y="40" width="280" height="210" rx="42" fill="url(#alu)" />
        <rect x="70.75" y="40.75" width="278.5" height="208.5" rx="41.25" fill="none" stroke="url(#edge)" strokeWidth="1.5" />
        {/* USB-C */}
        <rect x="186" y="246" width="48" height="6" rx="3" fill="#0a0c10" />
        {/* screen */}
        <rect x="100" y="66" width="220" height="118" rx="16" fill="url(#screen)" stroke="#000" />
        <text x="118" y="94" fill="#E8622C" fontFamily="ui-monospace,monospace" fontSize="11" fontWeight="700">SIGN TRANSACTION</text>
        <text x="118" y="116" fill="#8993A4" fontFamily="ui-monospace,monospace" fontSize="9">SEND</text>
        <text x="118" y="130" fill="#fff" fontFamily="ui-monospace,monospace" fontSize="12">25,000 WIF</text>
        <text x="118" y="150" fill="#8993A4" fontFamily="ui-monospace,monospace" fontSize="9">TO</text>
        <text x="118" y="164" fill="#fff" fontFamily="ui-monospace,monospace" fontSize="10">0x7099…79C8</text>
        <text x="300" y="94" fill="#62D99A" fontFamily="ui-monospace,monospace" fontSize="9" textAnchor="end">4663</text>
        {/* buttons */}
        <circle cx="132" cy="214" r="17" fill="#262c35" stroke="#0a0c10" />
        <path d="M126 208l12 12M138 208l-12 12" stroke="#FF5C68" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="288" cy="214" r="17" fill="#262c35" stroke="#0a0c10" />
        <path d="M280 214l6 6 10-11" stroke="#E8622C" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* logo mark */}
        <path d="M196 220a14 14 0 0 1 28 0Z" fill="#E8622C" opacity=".9" />
        <rect x="194" y="222.5" width="32" height="2.5" rx="1.25" fill="#FBE5D6" opacity=".8" />
        <circle cx="336" cy="58" r="3" fill="#E8622C" />
      </svg>
      <figcaption className="mt-3 text-center text-xs text-mute">Concept render · InWIF One prototype in development · not a photograph of an existing product</figcaption>
    </figure>
  )
}

export function PhoneRender() {
  return (
    <svg viewBox="0 0 220 440" className="h-auto w-full max-w-[240px]" role="img" aria-label="Illustration of the InWIF mobile app">
      <rect x="4" y="4" width="212" height="432" rx="38" fill="#1b2029" stroke="#3a414c" strokeWidth="2" />
      <rect x="14" y="14" width="192" height="412" rx="30" fill="#242424" />
      <rect x="84" y="24" width="52" height="14" rx="7" fill="#000" />
      <text x="30" y="78" fill="#8993A4" fontSize="10" fontFamily="Inter, sans-serif">Portfolio</text>
      <text x="30" y="104" fill="#fff" fontSize="24" fontWeight="800" fontFamily="Manrope, sans-serif">$ ••••</text>
      <path d="M30 170 C60 150 80 162 100 140 S150 120 190 112" stroke="#E8622C" strokeWidth="2.5" fill="none" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(30 ${210 + i * 44})`}>
          <rect width="160" height="34" rx="10" fill="#171D27" />
          <circle cx="17" cy="17" r="9" fill={['#E8622C', '#8EA2FF', '#62D99A', '#F7A64B'][i]} />
          <rect x="34" y="11" width="56" height="5" rx="2.5" fill="#fff" opacity=".8" />
          <rect x="34" y="20" width="34" height="4" rx="2" fill="#8993A4" />
          <rect x="118" y="13" width="32" height="6" rx="3" fill="#fff" opacity=".6" />
        </g>
      ))}
      <rect x="30" y="392" width="160" height="16" rx="8" fill="#E8622C" />
    </svg>
  )
}
