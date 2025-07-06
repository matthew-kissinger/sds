import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-react',
    emptyOutDir: true
  },
  server: {
    port: 3000,
    open: true
  },
  // Handle CDN imports via import maps
  define: {
    // Allow import maps to work
  },
  resolve: {
    alias: {
      // Map Three.js to CDN for dev server
      'three': 'https://cdn.jsdelivr.net/npm/three@0.176.0/build/three.module.js',
      'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/',
      '@geckos.io/client': 'https://cdn.jsdelivr.net/npm/@geckos.io/client@3.0.2/+esm',
      'stats.js': 'https://cdn.jsdelivr.net/npm/stats.js@0.17.0/build/stats.min.js'
    }
  },
  optimizeDeps: {
    exclude: ['three', '@geckos.io/client', 'stats.js']
  }
})