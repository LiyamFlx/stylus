/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Don't run the PWA build pipeline under Vitest.
      disable: !!process.env.VITEST,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Stylus — Universal Digital Ink Canvas',
        short_name: 'Stylus',
        description:
          'Write every thought. On every device. A universal digital ink canvas — pen, stylus, or finger. No install, no login.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell. Tesseract's WASM core + language model are
        // fetched from a CDN at runtime, so cache those on first use instead.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(?:wasm|traineddata\.gz)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-engine',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
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
