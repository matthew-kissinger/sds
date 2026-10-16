// SPDX-License-Identifier: AGPL-3.0-or-later
// The asset lab's dev server (spec/13-asset-lab.md).
//
// Development only. The production build is `vite.config.ts` with `app/` as its
// root, and it never references `lab/`, so no lab code can reach `dist/`. There
// is deliberately no `build` section here: the lab is a thing you look through,
// not a thing that ships.
import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('.', import.meta.url));

/**
 * The standalone grass library, if it is checked out beside this repository.
 *
 * `threejs-field-grass` is the extracted, MIT-licensed grass package. It is NOT
 * a dependency: it is absent from `package.json`, so no production build can
 * reach it, and the lab mounts it only to compare it against the shipped
 * implementation side by side. Resolving a sibling checkout rather than naming
 * an absolute path keeps this file machine-independent, and the alias is only
 * registered when the checkout exists, so the lab still starts without it.
 */
const grassLibrary = fileURLToPath(new URL('../threejs-field-grass/src/index.ts', import.meta.url));
const grassLibraryRoot = fileURLToPath(new URL('../threejs-field-grass', import.meta.url));
export const hasGrassLibrary = existsSync(grassLibrary);

export default defineConfig({
  root: fileURLToPath(new URL('./lab', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('./sim', import.meta.url)),
      '@app': fileURLToPath(new URL('./app/src', import.meta.url)),
      '@lab': fileURLToPath(new URL('./lab/src', import.meta.url)),
      'gltf-validator': fileURLToPath(new URL('./app/src/shims/gltf-validator.ts', import.meta.url)),
      ...(hasGrassLibrary ? { 'threejs-field-grass': grassLibrary } : {}),
    },
  },
  server: {
    port: 5200,
    strictPort: true,
    // The committed assets live at the repository root, and the game loads them
    // with `new URL('../../../assets/...', import.meta.url)`. Those resolve to
    // /@fs/ paths outside this root, so the root has to be served.
    fs: { allow: hasGrassLibrary ? [repo, grassLibraryRoot] : [repo] },
  },
  optimizeDeps: {
    include: ['ajv'],
  },
});
