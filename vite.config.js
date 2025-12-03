import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Use relative paths for itch.io, absolute for GitHub Pages
const isItchio = process.env.BUILD_TARGET === 'itchio'

export default defineConfig({
  // Relative paths for itch.io, absolute for GitHub Pages
  base: isItchio ? './' : '/',
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
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html'
      }
    }
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
