// Build config for the AUDIT VIEWER only.
//
// Separate from `apps/web/vite.config.ts` on purpose: this one builds a
// different entry (`viewer/app.html`) into `artifact/dist`, and the product's
// own build is untouched by it. `base: './'` so the published artifact can
// serve the bundle from any path.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // The same alias the product build uses: the engine is consumed from
      // source. Without it the imports in the product's own components do not
      // resolve from this root.
      '@recipe-notebook/engine': fileURLToPath(
        new URL('../packages/engine/src/index.ts', import.meta.url),
      ),
      '@': fileURLToPath(new URL('../apps/web/src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./app.html', import.meta.url)),
    },
  },
});
