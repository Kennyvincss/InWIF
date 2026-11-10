import type { Config } from 'tailwindcss'

/**
 * InWIF design system, modelled on a flat charcoal dashboard:
 * charcoal surfaces (#242424 page, #272727 panels, #212121 insets) separated by 1px borders,
 * small square-ish corners, no glows or glass. The logo's lime is the primary accent
 * (active navigation, main actions); green marks success and gains; lavender, yellow and
 * red are used for tags, counts and warnings.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#1C1C1C', 900: '#212121', 800: '#242424', 700: '#272727', 600: '#2E2E2E', 500: '#393939' },
        line: { DEFAULT: '#323232', strong: '#3D3D3D' },
        accent: { DEFAULT: '#B1FB59', soft: '#D2FF9C', deep: '#8FD63A' },
        // "cyan" was the data colour; data now uses the brand lime too.
        cyan: { DEFAULT: '#B1FB59', soft: '#D2FF9C', deep: '#8FD63A' },
        lavender: { DEFAULT: '#B4AAFF', deep: '#9081FF' },
        violet: '#5039FF',
        sun: '#FFCD1A',
        mute: '#8E8E8E',
        dim: '#6E717B',
        ok: '#2ECC71',
        bad: '#FF5A5F',
        warn: '#FFCD1A',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      // Small, square-ish corners everywhere (pills and dots keep rounded-full).
      borderRadius: {
        sm: '3px',
        DEFAULT: '4px',
        md: '5px',
        lg: '6px',
        xl: '6px',
        '2xl': '8px',
        '3xl': '10px',
      },
      // Flat surfaces: the old glows become plain borders.
      boxShadow: {
        card: 'none',
        glow: '0 0 0 1px rgba(177,251,89,.45)',
        'glow-soft': '0 0 0 1px #3D3D3D',
        'glow-white': 'none',
        'glow-cyan': '0 0 0 1px rgba(177,251,89,.35)',
      },
      transitionDuration: { DEFAULT: '150ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      keyframes: {
        pulsedot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.4' } },
      },
      animation: {
        pulsedot: 'pulsedot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
