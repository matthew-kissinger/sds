// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { readFileSync, writeFileSync, readdirSync, unlinkSync, statSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib'

const buildTarget = process.env.BUILD_TARGET || 'web'
const nativeTargets = new Set(['native', 'desktop', 'electron', 'tauri', 'capacitor', 'ios', 'android'])
const isItchio = buildTarget === 'itchio'
const isNative = nativeTargets.has(buildTarget)
const workerBase = (process.env.SDS_WORKER_BASE || 'https://sds-worker.matt-m-kissinger.workers.dev').replace(/\/+$/, '')
const buildId = Date.now().toString()
const suppressBrowserOpen = process.env.SDS_SUPPRESS_BROWSER_OPEN === '1'
const dracoDecoderCdn = 'https://www.gstatic.com/draco/v1/decoders/'

function patchThreeAddonImport(content) {
  return content.replace(/from 'three';/g, "from '../../../three.core.min.js';")
}

function externalizeThreeDracoDecoderUrlsPlugin() {
  return {
    name: 'externalize-three-draco-decoder-urls',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replace(/\\/g, '/')
      if (!normalized.endsWith('/node_modules/three/examples/jsm/loaders/DRACOLoader.js')) return null
      return code
        .replace(
          "const WASM_BIN_URL = new URL( '../libs/draco/draco_decoder.wasm', import.meta.url ).toString();",
          `const WASM_BIN_URL = '${dracoDecoderCdn}draco_decoder.wasm';`
        )
        .replace(
          "const WASM_JS_URL = new URL( '../libs/draco/draco_wasm_wrapper.js', import.meta.url ).toString();",
          `const WASM_JS_URL = '${dracoDecoderCdn}draco_wasm_wrapper.js';`
        )
        .replace(
          "const JS_URL = new URL( '../libs/draco/draco_decoder.js', import.meta.url ).toString();",
          `const JS_URL = '${dracoDecoderCdn}draco_decoder.js';`
        )
        .replace(
          "js: new URL( '../libs/draco/gltf/draco_wasm_wrapper.js', import.meta.url ).toString(),",
          `js: '${dracoDecoderCdn}draco_wasm_wrapper.js',`
        )
        .replace(
          "wasm: new URL( '../libs/draco/gltf/draco_decoder.wasm', import.meta.url ).toString(),",
          `wasm: '${dracoDecoderCdn}draco_decoder.wasm',`
        )
    }
  }
}

// Cycle 119: stop Vite emitting a second, never-fetched copy of the basis
// transcoder.
//
// `three/examples/jsm/loaders/KTX2Loader.js:106-107` computes
//   WASM_BIN_URL = new URL('../libs/basis/basis_transcoder.wasm', import.meta.url)
//   WASM_JS_URL  = new URL('../libs/basis/basis_transcoder.js',  import.meta.url)
// at module scope. Vite resolves `new URL(..., import.meta.url)` at build time and
// emits each referenced file as a hashed asset, unconditionally, because the
// reference is evaluated whether or not the branch that uses it is reachable.
//
// It is not reachable. KTX2Loader only reads those two URLs when
// `this.transcoderPath === ''` (:295-299), and `js/rendering/ktx2Loader.js:51`
// always calls `setTranscoderPath('assets/vendor/basis/')` before any load. The
// bytes the game actually fetches are the vendored pair copied by
// vite-plugin-static-copy below, at `assets/vendor/basis/`.
//
// So every build shipped two byte-identical copies of both files (verified by
// md5: the emitted chunk, the vendored copy and the node_modules original all
// hash to 3acfda59c08cbb3875d1a4a5de3efa5a). That is 57,529 bytes of dead JS -
// which the `other` chunk-family ratchet counts - plus 527,333 bytes of dead
// wasm, on every deploy and in every user's service-worker cache.
//
// Dropped in `generateBundle` rather than deleted after write, so they are never
// emitted at all and the build output is honest about what ships. The dead URL
// strings left in the KTX2Loader chunk are inert: nothing dereferences them
// without an empty transcoderPath.
function dropDeadBasisTranscoderPlugin() {
  const DEAD = /^assets\/basis_transcoder-[A-Za-z0-9_-]+\.(js|wasm)$/
  return {
    name: 'drop-dead-basis-transcoder',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (bundle[fileName].type === 'asset' && DEAD.test(fileName)) delete bundle[fileName]
      }
    }
  }
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
      // Cycle 98 dropped the octahedral set from dist as lab-only. Cycle 101 P4
      // makes it the production far-impostor atlas on the consolidated path
      // (NSL + the islands), now a lean 1024^2 albedo + normal (no depth). Cycle
      // 102 KTX2-encodes it (tools/encode-impostors-ktx2.mjs) like the latlon set,
      // so it ships as .ktx2 and its .png is dropped below. The latlon set still
      // ships for cold coverage + the canopy shadow caster.
      // Cycle 99: the live impostor atlases ship as both .png and .ktx2. A
      // KTX2-capable browser loads the .ktx2 (Cycle 99 probe: 6/6 ktx2, 0 png
      // fallback, SSIM 0.99 vs png - cycle99-validation/), so the .png set is dead
      // weight on disk/CDN. Drop each impostor .png whose .ktx2 sibling is present,
      // in both the latlon dir and the octahedral subdir (the guard keeps a future
      // png-without-ktx2 fallback intact). Source assets/ keeps the .png - the KTX2
      // encoder and the objects-impostor-parity hashes both read it.
      const dropPngWithKtx2Sibling = (dir) => {
        const names = new Set(readdirSync(dir))
        for (const name of names) {
          if (/\.imposter(\.\w+)?\.png$/.test(name) && names.has(name.replace(/\.png$/, '.ktx2'))) {
            unlinkSync(join(dir, name))
          }
        }
      }
      try {
        const treesDir = resolve(dist, 'assets/models/trees')
        dropPngWithKtx2Sibling(treesDir)
        dropPngWithKtx2Sibling(join(treesDir, 'octahedral'))
      } catch {}
    }
  }
}

// Cycle 100: ship the baked terrain heightfields brotli-pre-compressed on the
// web (Cloudflare Pages) build. CF leaves application/octet-stream uncompressed
// (measured: 4 MiB raw on the wire per scene), so we compress dist/terrain/*.bin
// in place at q11 and declare Content-Encoding: br + no-transform in
// public/_headers. The browser decodes below fetch(), so Heightfield.load reads
// byte-identical float32 - lossless, no baseline moves, frozen Heightfield.js
// untouched. Registered for the web build only; itchio ignores _headers and
// native loads off disk, so both keep raw .bin. configurePreviewServer mirrors
// the header so `vite preview` (which does not read _headers) still decodes.
function precompressTerrainPlugin() {
  const TERRAIN_BIN = /^\/terrain\/[^/]+\.bin(\?.*)?$/
  return {
    name: 'precompress-terrain',
    closeBundle() {
      const dir = resolve(__dirname, 'dist/terrain')
      let names
      try { names = readdirSync(dir) } catch { return }
      for (const name of names) {
        if (!name.endsWith('.bin')) continue
        const p = join(dir, name)
        const raw = readFileSync(p)
        const compressed = brotliCompressSync(raw, {
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length
          }
        })
        writeFileSync(p, compressed)
      }
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && TERRAIN_BIN.test(req.url)) res.setHeader('Content-Encoding', 'br')
        next()
      })
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
    externalizeThreeDracoDecoderUrlsPlugin(),
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
    dropDeadBasisTranscoderPlugin(),
    excludeBlendFilesPlugin(),
    // Absolute /assets/ hrefs assume the web base ('/'); itchio/native use './'.
    ...((!isItchio && !isNative) ? [entranceModulePreloadPlugin()] : []),
    ...(!isNative ? [serviceWorkerPlugin()] : []),
    // Cycle 100: brotli-pre-compress dist/terrain/*.bin (web/CF build only).
    ...((!isItchio && !isNative) ? [precompressTerrainPlugin()] : [])
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html',
        support: 'support.html',
        privacy: 'privacy.html'
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
