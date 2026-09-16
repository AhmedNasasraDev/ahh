import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The engine is consumed from source, so a change there is picked up by the
      // dev server with no rebuild step. It still publishes dist/ for other
      // consumers — see packages/engine/package.json.
      '@recipe-notebook/engine': here('../../packages/engine/src/index.ts'),
      '@': here('./src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    reporters: ['verbose'],
  },
});
