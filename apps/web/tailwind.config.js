/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        ink: { 950: '#07060d', 900: '#0d0b18', 800: '#15122a', 700: '#1f1b3a', 600: '#2c2752', 400: '#8b86b3', 300: '#b4b0d4' },
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
