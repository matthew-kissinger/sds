// SPDX-License-Identifier: AGPL-3.0-or-later
// The asset lab's dev server (spec/13-asset-lab.md).
//
// Development only. The production build is `vite.config.ts` with `app/` as its
// root, and it never references `lab/`, so no lab code can reach `dist/`. There
// is deliberately no `build` section here: the lab is a thing you look through,
// not a thing that ships.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('./lab', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('./sim', import.meta.url)),
      '@app': fileURLToPath(new URL('./app/src', import.meta.url)),
      '@lab': fileURLToPath(new URL('./lab/src', import.meta.url)),
      'gltf-validator': fileURLToPath(new URL('./app/src/shims/gltf-validator.ts', import.meta.url)),
    },
  },
  server: {
    port: 5200,
    strictPort: true,
    // The committed assets live at the repository root, and the game loads them
    // with `new URL('../../../assets/...', import.meta.url)`. Those resolve to
    // /@fs/ paths outside this root, so the root has to be served.
    fs: { allow: [repo] },
  },
  optimizeDeps: {
    include: ['ajv'],
  },
});
