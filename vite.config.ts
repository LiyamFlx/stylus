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
});
