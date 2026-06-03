import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const buildTarget = process.env.BUILD_TARGET || 'web'
const nativeTargets = new Set(['native', 'desktop', 'electron', 'tauri', 'capacitor', 'ios', 'android'])
const isItchio = buildTarget === 'itchio'
const isNative = nativeTargets.has(buildTarget)
const workerBase = (process.env.SDS_WORKER_BASE || 'https://sds-worker.matt-m-kissinger.workers.dev').replace(/\/+$/, '')
const buildId = Date.now().toString()
const suppressBrowserOpen = process.env.SDS_SUPPRESS_BROWSER_OPEN === '1'

function patchThreeAddonImport(content) {
  return content.replace(/from 'three';/g, "from '../../../three.core.min.js';")
}

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

function htmlRuntimeConfigPlugin() {
  return {
    name: 'html-runtime-config',
    transformIndexHtml(html) {
      return html.replace(/__SDS_BUILD_TARGET__/g, buildTarget)
    }
  }
}

export default defineConfig({
  base: (isItchio || isNative) ? './' : '/',
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __SDS_BUILD_TARGET__: JSON.stringify(buildTarget),
    __SDS_WORKER_BASE__: JSON.stringify(workerBase)
  },
  plugins: [
    tailwindcss(),
    react(),
    htmlRuntimeConfigPlugin(),
    viteStaticCopy({
      targets: [
        { src: 'assets/*', dest: 'assets' },
        { src: 'node_modules/three/build/three.webgpu.min.js', dest: 'assets/vendor/three' },
        { src: 'node_modules/three/build/three.core.min.js', dest: 'assets/vendor/three' },
        {
          src: 'node_modules/three/examples/jsm/loaders/GLTFLoader.js',
          dest: 'assets/vendor/three/examples/jsm/loaders',
          transform: { encoding: 'utf8', handler: patchThreeAddonImport }
        },
        {
          src: 'node_modules/three/examples/jsm/loaders/DRACOLoader.js',
          dest: 'assets/vendor/three/examples/jsm/loaders',
          transform: { encoding: 'utf8', handler: patchThreeAddonImport }
        },
        {
          src: 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js',
          dest: 'assets/vendor/three/examples/jsm/utils',
          transform: { encoding: 'utf8', handler: patchThreeAddonImport }
        },
        {
          src: 'node_modules/three/examples/jsm/utils/SkeletonUtils.js',
          dest: 'assets/vendor/three/examples/jsm/utils',
          transform: { encoding: 'utf8', handler: patchThreeAddonImport }
        },
        {
          src: 'node_modules/three/examples/jsm/libs/meshopt_decoder.module.js',
          dest: 'assets/vendor/three/examples/jsm/libs'
        }
      ]
    }),
    excludeBlendFilesPlugin(),
    ...(!isNative ? [serviceWorkerPlugin()] : [])
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html',
        // Cycle 49 P3: standalone UI gallery (gallery.html). A pure React + CSS
        // review surface that renders no WebGPU game, so the pastoral look is
        // verifiable headlessly. Separate entry; does not touch the main chunk.
        gallery: 'gallery.html'
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          three: ['three'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          vendor: ['@three.ez/instanced-mesh', 'kdbush'],
          // Cycle 47: UI-layer libraries (icons, transitions) stay out of the
          // measured main-*.js ratchet. lucide-react lands here in P3; motion
          // (and its motion-dom / motion-utils deps) join in P7.
          ui: ['lucide-react', 'motion']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: suppressBrowserOpen ? false : true
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
