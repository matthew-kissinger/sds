import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    viteStaticCopy({
      targets: [
        { src: 'assets/*', dest: 'assets' }
      ]
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 3000,
    open: true
  },
  resolve: {
    alias: {
      // Three.js addons path - resolves 'three/addons/' to the examples folder
      'three/addons/': 'three/examples/jsm/'
    }
  },
  optimizeDeps: {
    include: ['three']
  }
})
