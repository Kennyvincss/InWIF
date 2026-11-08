import { ImageResponse } from 'next/og'

export const dynamic = 'force-static'
export const alt = 'InWIF — Your Assets. Your Keys. Your Control.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Social share card (X, Telegram, Discord, LinkedIn…). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#090B10', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <svg width="88" height="88" viewBox="0 0 64 64">
            <rect x="1" y="1" width="62" height="62" rx="18" fill="#11151D" stroke="#00E59B" strokeOpacity=".35" strokeWidth="2" />
            <path d="M12 40a20 20 0 0 1 40 0Z" fill="#00E59B" />
            <circle cx="32" cy="30" r="4.2" fill="#11151D" />
            <path d="M30 32.5h4l1.2 7.5h-6.4Z" fill="#11151D" />
            <rect x="10" y="43" width="44" height="3.5" rx="1.75" fill="#7CFFCF" />
            <rect x="18" y="49.5" width="28" height="2.5" rx="1.25" fill="#7CFFCF" fillOpacity=".45" />
          </svg>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 800 }}>
            In<span style={{ color: '#00E59B' }}>WIF</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Your Assets. Your Keys.</div>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: '#00E59B' }}>Your Control.</div>
          <div style={{ display: 'flex', fontSize: 30, color: '#8993A4', marginTop: 12 }}>Free self-custody wallet for Robinhood Chain · $WIF ecosystem · hardware wallet in development</div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 24 }}>
          {['Free forever', '0% InWIF fees', 'Keys never leave your device'].map((t) => (
            <div key={t} style={{ display: 'flex', padding: '8px 18px', borderRadius: 999, border: '1px solid rgba(0,229,155,.4)', color: '#7CFFCF' }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  )
}
