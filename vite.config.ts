import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://pizzacatz.github.io/championship-points-calculator/,
// so every asset URL needs that prefix.
export default defineConfig({
  base: '/championship-points-calculator/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
