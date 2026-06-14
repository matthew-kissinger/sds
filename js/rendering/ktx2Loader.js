// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Lazy KTX2Loader singleton + impostor-atlas loader (Cycle 98).
 *
 * The impostor color/normal/depth atlases ship as UASTC `.ktx2`
 * (tools/encode-impostors-ktx2.mjs). KTX2Loader transcodes them to the GPU's
 * native compressed format (BC7 / ASTC / ETC) at load - or to uncompressed
 * RGBA on a GPU with no supported compressed format - so the runtime never
 * needs a PNG copy in dist for format support. The load sites still
 * degrade-not-crash: if the loader (or a file) is unavailable they fall back to
 * the legacy `.png`, and the caller's existing catch turns a total failure into
 * its null path.
 *
 * Two costs are kept off the critical path:
 *   - `KTX2Loader.js` is dynamic-imported here, so it lands in its own async
 *     chunk, never in `main-*.js` (the bundle-size emergency stop).
 *   - The basis transcoder (~0.9 MB wasm, vendored to `assets/vendor/basis/`)
 *     is fetched by KTX2Loader on first decode, not at startup.
 *
 * `detectSupport(renderer)` must run on the *initialized* renderer before the
 * first `.ktx2` load (three r181+: `detectSupport()` plus an awaited
 * `renderer.init()`). SceneManager calls `initKtx2Loader()` when the renderer
 * becomes ready; the load sites `await getKtx2Loader()` via loadImpostorTexture.
 */

import * as THREE from 'three';

// Relative path matches the three.webgpu vendor convention (vite.config.js
// copies the transcoder here). Resolves correctly under both the web base
// ('/') and the itchio/native base ('./').
const TRANSCODER_PATH = 'assets/vendor/basis/';

let _loaderPromise = null;

/**
 * Warm the KTX2Loader against an initialized renderer. Idempotent: the first
 * call wins; later calls return the same promise. Fire-and-forget safe - a
 * caller that needs the loader awaits {@link getKtx2Loader}.
 *
 * @param {object} renderer - an initialized WebGPURenderer or WebGLRenderer
 * @returns {Promise<object|null>|null} the loader promise, or null if no renderer
 */
export function initKtx2Loader(renderer) {
    if (!renderer) return null;
    if (!_loaderPromise) {
        _loaderPromise = (async () => {
            const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
            const loader = new KTX2Loader();
            loader.setTranscoderPath(TRANSCODER_PATH);
            loader.detectSupport(renderer);
            return loader;
        })().catch((err) => {
            console.warn('[KTX2] loader init failed; impostors fall back:', err);
            _loaderPromise = null; // allow a later retry
            return null;
        });
    }
    return _loaderPromise;
}

/**
 * The ready KTX2Loader, or null if it was never initialized or init failed.
 *
 * @returns {Promise<object|null>}
 */
export async function getKtx2Loader() {
    if (!_loaderPromise) return null;
    return _loaderPromise;
}

/**
 * Load one impostor atlas texture, preferring the UASTC `.ktx2` and falling
 * back to the legacy `.png`. Applies the texture settings both impostor load
 * sites share. Rejects only if the `.png` fallback also fails (the caller's
 * existing catch turns that into the null degrade-not-crash path).
 *
 * @param {string} base e.g. 'assets/models/trees/tree1.imposter'
 * @param {string} suffix '' (albedo) | '.normal' | '.depth'
 * @param {object} colorSpace THREE.SRGBColorSpace | THREE.NoColorSpace
 * @returns {Promise<object>} a configured THREE.Texture
 */
export async function loadImpostorTexture(base, suffix, colorSpace) {
    const ktx2 = await getKtx2Loader();
    if (ktx2) {
        try {
            return _applyImpostorTextureSettings(await ktx2.loadAsync(`${base}${suffix}.ktx2`), colorSpace);
        } catch (err) {
            console.warn(`[KTX2] ${base}${suffix}.ktx2 failed; falling back to .png:`, err);
        }
    }
    const tex = await new THREE.TextureLoader().loadAsync(`${base}${suffix}.png`);
    return _applyImpostorTextureSettings(tex, colorSpace);
}

// Cycle 20 v5: NO mipmaps but KEEP anisotropy. Adjacent tiles in the 4x4
// lat/lon atlas are distinct azimuth/elevation views; box-mip averaging across
// those borders glints ("reflective sparkle") at distance. Aniso 8 keeps the
// foreshortened azimuth axis sharp without crossing tile borders.
function _applyImpostorTextureSettings(tex, colorSpace) {
    tex.colorSpace = colorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
}

/** Test-only reset of the module singleton. */
export function _resetKtx2LoaderForTest() {
    _loaderPromise = null;
}
