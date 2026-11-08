import type { Config } from 'tailwindcss'

/**
 * InWIF "stealth terminal" theme: a true-black canvas, near-black layered surfaces separated
 * by ultra-subtle borders, InWIF lime for actions and electric cyan for data.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces, darkest first. Depth comes from borders and light, not lighter greys.
        ink: { 950: '#000000', 900: '#050505', 800: '#0A0A0B', 700: '#111113', 600: '#18181B' },
        line: { DEFAULT: 'rgba(255,255,255,0.06)', strong: 'rgba(255,255,255,0.12)' },
        lime: { DEFAULT: '#A6F36A', soft: '#D5FFB8', deep: '#7BC944' },
        cyan: { DEFAULT: '#22E5FF', soft: '#A5F3FC', deep: '#06B6D4' },
        mute: '#8A8F98',
        ok: '#34E39A',
        bad: '#FF5C68',
        warn: '#F5C451',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,.035) inset',
        glow: '0 0 0 1px rgba(166,243,106,.28), 0 0 28px -6px rgba(166,243,106,.45)',
        'glow-soft': '0 0 0 1px rgba(166,243,106,.12), 0 0 36px -14px rgba(166,243,106,.40)',
        'glow-cyan': '0 0 0 1px rgba(34,229,255,.22), 0 0 28px -8px rgba(34,229,255,.45)',
      },
      // Every `transition` is a 180ms ease-out unless a component says otherwise.
      transitionDuration: { DEFAULT: '180ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
} satisfies Config
