import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

// Use relative paths for itch.io, absolute for GitHub Pages
const isItchio = process.env.BUILD_TARGET === 'itchio'
const buildId = Date.now().toString()

// Cloudflare Pages has a 26MB per-file limit; .blend source files aren't needed at runtime.
function excludeBlendFilesPlugin() {
  return {
    name: 'exclude-blend-files',
    closeBundle() {
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name)
          if (statSync(p).isDirectory()) walk(p)
          else if (/\.(blend|blend1)$/i.test(name)) unlinkSync(p)
        }
      }
      const dist = resolve(__dirname, 'dist')
      try { walk(dist) } catch {}
    }
  }
}

function serviceWorkerPlugin() {
  return {
    name: 'service-worker-cache-bust',
    closeBundle() {
      const src = resolve(__dirname, 'sw.js')
      const dest = resolve(__dirname, 'dist/sw.js')
      const content = readFileSync(src, 'utf8').replace(/__BUILD_ID__/g, buildId)
      writeFileSync(dest, content)
    }
  }
}

export default defineConfig({
  base: isItchio ? './' : '/',
  define: {
    __BUILD_ID__: JSON.stringify(buildId)
  },
  plugins: [
    tailwindcss(),
    react(),
    viteStaticCopy({
      targets: [
        { src: 'assets/*', dest: 'assets' }
      ]
    }),
    excludeBlendFilesPlugin(),
    serviceWorkerPlugin()
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html'
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          three: ['three'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  },
  resolve: {
    alias: {
      'three/addons/': 'three/examples/jsm/'
    }
  },
  optimizeDeps: {
    include: ['three', 'mediabunny']
  }
})
