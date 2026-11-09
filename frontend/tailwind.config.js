/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#673AB7', dark: '#4527A0', 50: '#F3EEFB', 100: '#E6DAF6' },
        med: { DEFAULT: '#10B981', dark: '#047857', 50: '#ECFDF5' },
        ink: '#334155', surface: '#F8FAFC',
        danger: { DEFAULT: '#DC2626', 50: '#FEF2F2' },
        warn: { DEFAULT: '#F59E0B', 50: '#FFFBEB', dark: '#92400E' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        pulseRing: { '0%,100%': { boxShadow: '0 0 0 0 rgba(220,38,38,.35)' }, '50%': { boxShadow: '0 0 0 6px rgba(220,38,38,0)' } },
      },
      animation: { fadeIn: 'fadeIn .25s ease-out', pulseRing: 'pulseRing 2s ease-in-out infinite' },
    },
  },
  plugins: [],
}
