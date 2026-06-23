/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Verified from the Scanmarker app (html.dark theme). Stylus is a
        // brother product and shares this exact palette.
        bg: '#0a0a0a',
        'bg-subtle': '#111113', // cards
        'bg-muted': '#18181b', // elevated surfaces
        border: '#27272a',
        'border-strong': '#3f3f46',
        ink: {
          900: '#fafafa', // primary text
          800: '#e4e4e7',
          700: '#d4d4d8', // body
          400: '#a1a1aa', // muted / labels
        },
        brand: {
          50: '#fff4ed',
          100: '#ffe3d0',
          200: '#fdc4a0',
          300: '#fa9f70',
          500: '#e76f2c', // primary accent / CTA
          600: '#cc5b1f', // hover
          700: '#a6481b', // eyebrow labels
          800: '#7e3614',
        },
        danger: '#dc2626',
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          'Inter',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        md: '0.375rem',
        lg: '14px',
        panel: '24px',
      },
      boxShadow: {
        soft: '0 1px 2px #0000000a, 0 1px 3px #0000000f',
        lift: '0 4px 12px #0000000f, 0 2px 4px #0000000a',
        pop: '0 12px 32px #0000001a, 0 4px 8px #0000000f',
      },
      backdropBlur: {
        pill: '12px',
      },
      letterSpacing: {
        eyebrow: '0.14em',
      },
    },
  },
  plugins: [],
};
