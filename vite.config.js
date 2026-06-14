// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { readFileSync, writeFileSync, readdirSync, unlinkSync, statSync, rmSync } from 'node:fs'
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
// Cycle 91 Phase 6: the same pass prunes dead runtime assets that ride along
// with the whole-dir assets copy - the scatter GLBs (scatter system removed
// Cycle 19) and the Mountain_Group GLBs (procedural ring removed; the loader
// entries are gone too).
function excludeBlendFilesPlugin() {
  return {
    name: 'exclude-blend-files',
    closeBundle() {
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name)
          if (statSync(p).isDirectory()) walk(p)
          else if (/\.(blend|blend1)$/i.test(name) || /^Mountain_Group_\d\.glb$/i.test(name)) unlinkSync(p)
        }
      }
      const dist = resolve(__dirname, 'dist')
      try { walk(dist) } catch {}
      try { rmSync(resolve(dist, 'assets/models/scatter'), { recursive: true, force: true }) } catch {}
      // Cycle 98: the octahedral impostor set is lab-gated (TreePlacement's
      // useOctahedral, the ?webgpuNativeTreeImpostors=1 debug route) and never
      // loads on the default prod path - ~9 MB of albedo/normal/depth PNGs that
      // shipped dead. Drop from dist; source stays for the lab tool + regen.
      try { rmSync(resolve(dist, 'assets/models/trees/octahedral'), { recursive: true, force: true }) } catch {}
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

// [P4-PRELOAD] Inject <link rel="modulepreload"> for the chunks that gate the
// entrance's first render. Vite only emits modulepreload for the entry's
// STATIC imports (three, vendor); the React overlay is reached through two
// serialized dynamic-import hops (entry -> App.js -> the Promise.all wave in
// initReactUI), so none of those chunks start downloading until main-*.js has
// fully downloaded and executed. Hinting them in the HTML lets the browser
// fetch them in parallel with the entry. The set is computed from the bundle
// graph (App chunk + its direct dynamic-import wave + their static closure),
// so it tracks refactors and never preloads speculative game-world chunks
// (GrassSystem, scenes, GLBs), which are NOT in App's wave.
function entranceModulePreloadPlugin() {
  return {
    name: 'entrance-modulepreload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !/(^|[\\/])index\.html$/.test(ctx.filename)) return
        const chunks = Object.values(ctx.bundle).filter((c) => c.type === 'chunk')
        // The App chunk has no facadeModuleId (Vite folds the facade), so
        // locate it by the module it carries.
        const appChunk = chunks.find((c) =>
          c.moduleIds.some((id) => id.replace(/\\/g, '/').endsWith('/js/components/App.js')))
        if (!appChunk) return
        const byFile = new Map(chunks.map((c) => [c.fileName, c]))
        const gating = new Set()
        const addStaticClosure = (fileName) => {
          if (gating.has(fileName)) return
          gating.add(fileName)
          const c = byFile.get(fileName)
          if (c) for (const imp of c.imports) addStaticClosure(imp)
        }
        addStaticClosure(appChunk.fileName)
        for (const dyn of appChunk.dynamicImports) addStaticClosure(dyn)
        // Skip anything the HTML already references (the entry script and the
        // modulepreloads Vite emitted for its static imports).
        for (const m of html.matchAll(/(?:src|href)="\/([^"]+\.js)"/g)) gating.delete(m[1])
        return [...gating].map((fileName) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href: '/' + fileName },
          injectTo: 'head'
        }))
      }
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
        // Exclude assets/_originals (the gitignored pristine GLB bake sources,
        // ~40 MB locally). It never ships from CI since it isn't committed, but
        // a local `wrangler deploy dist` would otherwise bundle it. Guard it.
        // Cycle 91 Phase 6: dev-only payloads out of dist - marketing
        // captures (~42 MB), the LP_BorderCollie .blend sources (~67 MB,
        // nothing references the dir at runtime since the dead PolyArt png
        // preload dropped), and the source screenshot pile in assets/images
        // (~14 MB; the referenced favicon + PWA icons re-add below).
        {
          src: [
            'assets/*',
            '!assets/_originals',
            '!assets/marketing',
            '!assets/LP_BorderCollie_Blend_v01',
            '!assets/images',
          ],
          dest: 'assets',
        },
        { src: 'assets/images/favicon.png', dest: 'assets/images' },
        { src: 'assets/images/icons/*', dest: 'assets/images/icons' },
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
        },
        // Cycle 98: basis transcoder for the KTX2 tree-impostor atlases.
        // Decode-only (~0.9 MB wasm); KTX2Loader fetches it lazily on first
        // decode, so it never enters the main chunk. See js/rendering/ktx2Loader.js.
        {
          src: 'node_modules/three/examples/jsm/libs/basis/basis_transcoder.js',
          dest: 'assets/vendor/basis'
        },
        {
          src: 'node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm',
          dest: 'assets/vendor/basis'
        }
      ]
    }),
    excludeBlendFilesPlugin(),
    // Absolute /assets/ hrefs assume the web base ('/'); itchio/native use './'.
    ...((!isItchio && !isNative) ? [entranceModulePreloadPlugin()] : []),
    ...(!isNative ? [serviceWorkerPlugin()] : [])
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
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          vendor: ['@three.ez/instanced-mesh', 'kdbush'],
          // Cycle 47: UI-layer libraries (transitions) stay out of the
          // measured main-*.js ratchet. motion (and its motion-dom /
          // motion-utils deps) live here. Cycle 51 P8 dropped lucide-react
          // for the hand-authored Icon set, so it is no longer chunked here.
          ui: ['motion']
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
