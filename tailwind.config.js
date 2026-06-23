/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0a0a0a',
        panel: 'rgba(24, 24, 27, 0.72)',
      },
      backdropBlur: {
        pill: '12px',
      },
    },
  },
  plugins: [],
};
