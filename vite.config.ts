// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { fileURLToPath } from 'node:url';
import { writeReleaseManifest } from './scripts/write-release-manifest.mjs';

const root = fileURLToPath(new URL('./app', import.meta.url));
const dist = fileURLToPath(new URL('./dist', import.meta.url));

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

/**
 * Writes dist/release.json (scripts/write-release-manifest.mjs) once the client
 * bundle is on disk. It runs last, after Vite has copied app/public into the
 * output, so the manifest's file count and digest cover the exact directory the
 * Worker uploads as its assets. A dist/ without the manifest is served as the
 * single-page fallback, which is why the build, not a follow-up command, writes
 * it. The Worker's own build environment is skipped.
 */
const releaseManifest: Plugin = {
  name: 'release-manifest',
  apply: 'build',
  applyToEnvironment: (environment) => environment.name === 'client',
  writeBundle: {
    order: 'post',
    sequential: true,
    handler(options) {
      const { manifest, output } = writeReleaseManifest({ distDir: options.dir ?? dist });
      this.info(`wrote ${output} (${manifest.version} ${manifest.commit} ${manifest.artifact.sha256})`);
    },
  },
};

export default defineConfig({
  root,
  publicDir: fileURLToPath(new URL('./app/public', import.meta.url)),
  plugins: [
    react(),
    dropUnreferencedModels,
    // The Worker is built and served by the Cloudflare plugin from the root
    // cloudflare.config.ts (Release 2 Stage B; the plugin's 2.0 line reads
    // that file and has no config path); the client never imports it. Local
    // D1 and asset state for `vite dev` and `vite preview` live under
    // .cloudflare/, gitignored.
    cloudflare({
      persistState: { path: fileURLToPath(new URL('./.cloudflare/state', import.meta.url)) },
    }),
    releaseManifest,
  ],
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('./sim', import.meta.url)),
      '@app': fileURLToPath(new URL('./app/src', import.meta.url)),
      'gltf-validator': fileURLToPath(new URL('./app/src/shims/gltf-validator.ts', import.meta.url)),
    },
  },
  build: {
    // The Cloudflare plugin 2.0 owns the output: it writes the Build Output
    // Specification under the Vite root, app/.cloudflare/output/v0/, with the
    // client at workers/default/assets/ and the Worker beside it. That assets
    // directory is the artifact `cf deploy` uploads, so release.json is
    // written into it (releaseManifest above follows the client's outDir).
    target: 'es2022',
  },
  // The client calls the score API same-origin at /api, as it does in
  // production where sds-worker serves both. `vite dev` runs the Worker beside
  // the client through the Cloudflare plugin, so there is no proxy.
  server: {
    port: 5199,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['ajv'],
  },
});
