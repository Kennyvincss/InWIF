import type { Config } from 'tailwindcss'

/**
 * InWIF design system: warm and light.
 * Cream page (#F6F2F0), white rounded cards with a soft shadow, light warm tiles (#F7F5F3),
 * near-black text (#111) and one warm orange accent (#E8622C) with a peach tint (#FBE5D6)
 * for icon tiles and banners. Pill-shaped buttons and chips. Dark (#111) cards for feature
 * sections.
 *
 * Use `fg` for text/ink and `paper` for white surfaces (not `white`/`black`), so colours
 * describe their role rather than a fixed shade.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fg: '#111111',
        paper: '#FFFFFF',
        // Surface scale (light): 800 page · 700 panels · 900 tiles · 600 hover · 500 borders/controls
        ink: { 950: '#EFEAE6', 900: '#F7F5F3', 800: '#F6F2F0', 700: '#FFFFFF', 600: '#F1EDEA', 500: '#E6E0DB' },
        line: { DEFAULT: '#EAE6E5', strong: '#DCD5D0' },
        accent: { DEFAULT: '#E8622C', soft: '#FBE5D6', deep: '#C64F1C', wash: '#FCEEE5' },
        cyan: { DEFAULT: '#E8622C', soft: '#FBE5D6', deep: '#C64F1C' },
        lavender: { DEFAULT: '#FBE5D6', deep: '#E8622C' },
        violet: '#E8622C',
        sun: '#F2B33D',
        mute: '#5F5B57',
        dim: '#9B958F',
        ok: '#2F9E6A',
        live: '#75C69E',
        bad: '#E5484D',
        warn: '#C98A12',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '14px',
        xl: '16px',
        '2xl': '22px',
        '3xl': '30px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,17,17,.04), 0 12px 32px -18px rgba(17,17,17,.16)',
        glow: '0 0 0 4px rgba(232,98,44,.14)',
        'glow-soft': '0 1px 2px rgba(17,17,17,.05), 0 16px 36px -18px rgba(17,17,17,.22)',
        'glow-white': 'none',
        'glow-cyan': '0 0 0 4px rgba(232,98,44,.12)',
      },
      transitionDuration: { DEFAULT: '160ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      keyframes: {
        pulsedot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.45' } },
      },
      animation: {
        pulsedot: 'pulsedot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
