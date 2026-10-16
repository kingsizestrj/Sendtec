/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        // cores do tema vêm de variáveis CSS (modo escuro/claro em src/index.css)
        white: 'rgb(var(--c-white) / <alpha-value>)',
        snow: '#ffffff', // branco de verdade nos dois temas (texto sobre o gradiente)
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
        },
      },
      backgroundImage: {
        brand: 'linear-gradient(135deg, #7c3aed 0%, #db2777 55%, #f97316 100%)',
        'brand-soft': 'linear-gradient(135deg, rgba(124,58,237,.18), rgba(219,39,119,.14) 55%, rgba(249,115,22,.12))',
      },
      boxShadow: { glow: '0 10px 40px -10px rgba(219,39,119,.55)', card: '0 1px 0 rgba(255,255,255,.04) inset, 0 20px 50px -20px rgba(0,0,0,.6)' },
      keyframes: {
        'fade-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { 'fade-up': 'fade-up .35s ease-out both' },
    },
  },
  plugins: [],
};
