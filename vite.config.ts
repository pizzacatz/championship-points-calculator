import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';

// Served from https://points.georgiaplayevents.com/ at the domain root.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: '/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
