import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#090B10', 900: '#11151D', 800: '#171D27', 700: '#1F2733', 600: '#2A3442' },
        lime: { DEFAULT: '#A6F36A', soft: '#D5FFB8', deep: '#7BC944' },
        mute: '#8993A4',
        ok: '#62D99A',
        bad: '#FF5C68',
        warn: '#F5C451',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Manrope Variable"', 'Manrope', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(166,243,106,.25), 0 8px 40px -8px rgba(166,243,106,.25)',
        card: '0 1px 0 0 rgba(255,255,255,.04) inset, 0 20px 40px -24px rgba(0,0,0,.6)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
} satisfies Config
