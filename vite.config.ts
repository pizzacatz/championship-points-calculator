import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://points.georgiaplayevents.com/ at the domain root.
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
