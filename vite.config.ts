// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./app', import.meta.url));

export default defineConfig({
  root,
  publicDir: fileURLToPath(new URL('./app/public', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('./sim', import.meta.url)),
      '@app': fileURLToPath(new URL('./app/src', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5199,
    strictPort: true,
  },
});
