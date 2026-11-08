import type { Config } from 'tailwindcss'

/**
 * InWIF "stealth terminal" design system.
 * True-black canvas · glass surfaces separated by hairline borders · stark white for primary
 * actions · vivid emerald for active/positive states · electric cyan for data.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#000000', 900: '#040405', 800: '#08080A', 700: '#0F0F12', 600: '#17171B' },
        line: { DEFAULT: 'rgba(255,255,255,0.07)', strong: 'rgba(255,255,255,0.14)' },
        accent: { DEFAULT: '#00E59B', soft: '#7CFFCF', deep: '#00B87C' },
        cyan: { DEFAULT: '#22E5FF', soft: '#A5F3FC', deep: '#06B6D4' },
        mute: '#8B8D98',
        dim: '#5B5D68',
        ok: '#00E59B',
        bad: '#FF4D6A',
        warn: '#FFC24B',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,.04) inset, 0 30px 60px -30px rgba(0,0,0,.9)',
        glow: '0 0 0 1px rgba(0,229,155,.35), 0 0 32px -6px rgba(0,229,155,.45)',
        'glow-soft': '0 0 0 1px rgba(0,229,155,.16), 0 0 44px -14px rgba(0,229,155,.40)',
        'glow-white': '0 0 0 1px rgba(255,255,255,.35), 0 0 30px -6px rgba(255,255,255,.45)',
        'glow-cyan': '0 0 0 1px rgba(34,229,255,.25), 0 0 32px -8px rgba(34,229,255,.5)',
      },
      transitionDuration: { DEFAULT: '180ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      keyframes: {
        pulsedot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
        sheen: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        pulsedot: 'pulsedot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
