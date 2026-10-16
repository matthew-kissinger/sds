// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./app', import.meta.url));

/**
 * Rollup emits an asset when it transforms the module that names it, before
 * tree-shaking has decided whether any code survives to use it. With
 * FARMHOUSE_SOURCE = 'procedural' (app/src/scene/farmhouse/source.ts) the Kiln
 * loader is dead code, but farmhouse.glb would still land in dist/ unreferenced.
 * This drops a built model that no chunk names, so that build ships no model.
 */
const dropUnreferencedModels: Plugin = {
  name: 'drop-unreferenced-models',
  generateBundle(_options, bundle) {
    const code = Object.values(bundle)
      .map((file) => (file.type === 'chunk' ? file.code : ''))
      .join('\n');
    for (const [name, file] of Object.entries(bundle)) {
      if (file.type === 'asset' && name.endsWith('.glb') && !code.includes(name)) {
        delete bundle[name];
      }
    }
  },
};

export default defineConfig({
  root,
  publicDir: fileURLToPath(new URL('./app/public', import.meta.url)),
  plugins: [react(), dropUnreferencedModels],
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('./sim', import.meta.url)),
      '@app': fileURLToPath(new URL('./app/src', import.meta.url)),
      'gltf-validator': fileURLToPath(new URL('./app/src/shims/gltf-validator.ts', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
  },
  // The client calls the score API same-origin at /api, as it does in
  // production where sds-worker serves both. Locally that is `wrangler dev`
  // run from worker/ on its default port; without it the online boards report
  // unavailable and the game itself is unaffected.
  server: {
    port: 5199,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  preview: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  optimizeDeps: {
    include: ['ajv'],
  },
});
