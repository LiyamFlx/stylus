/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on LAN so you can test on a real iPad / Android tablet
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    // jsdom gives the DOM-dependent suites (localStorage, components) a browser
    // environment; the pure-logic suites don't need it but it's harmless.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
      // Guard the well-tested pure logic against regressions. The canvas-heavy
      // gesture code in useDrawing is better covered by e2e and is left out of
      // the gate intentionally.
      thresholds: {
        'src/lib/geometry.ts': { lines: 100, functions: 100 },
        'src/hooks/useHistory.ts': { lines: 95, functions: 100 },
        'src/hooks/useLocalStorage.ts': { lines: 90, functions: 90 },
        'src/hooks/useRecognition.ts': { lines: 90, functions: 100 },
      },
    },
  },
});
