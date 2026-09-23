import { defineConfig } from 'vite';

/**
 * GitHub Pages project sites are served from `https://<user>.github.io/<repo>/`, so every
 * asset URL needs that prefix. `BASE_PATH` is injected by the deploy workflow; the default
 * keeps `vite dev` and `vite preview` working at the root.
 */
export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
