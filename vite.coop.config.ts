// SPDX-License-Identifier: AGPL-3.0-or-later
// Co-op client build. The staging mode is served by the separate staging Workers.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const path = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const proxy = {
  '/api': { target: 'http://127.0.0.1:8799' },
  '^/r/(health|rooms|lobbies)(/|$)': { target: 'http://127.0.0.1:8799' },
  '^/r/(na|eu|apac)_[a-f0-9]{32}/(join|ws|status)': { target: 'http://127.0.0.1:8799', ws: true },
};
export default defineConfig(({ mode }) => ({ root: path('./app'), plugins: [react(), { name: 'coop-analytics-isolation', transformIndexHtml: html => html.replace(/<!-- Cloudflare Web Analytics -->[\s\S]*?<!-- End Cloudflare Web Analytics -->/, '') }], mode: 'coop',
  resolve: { alias: { '@sim': path('./sim'), '@app': path('./app/src'), 'gltf-validator': path('./app/src/shims/gltf-validator.ts') } },
  build: { outDir: path(mode === 'coop-staging' ? './.wrangler/staging/assets' : './.wrangler/coop-client'), emptyOutDir: true, target: 'es2022' },
  server: { host: '127.0.0.1', port: 5198, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5198, strictPort: true, proxy },
}));
