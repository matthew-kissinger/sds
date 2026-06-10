// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 23 Phase D1 — Hardware tier detection.
 *
 * Inspect WebGL capability + GPU vendor/renderer string to classify the
 * current device into one of three tiers. Used by GrassSystem (and
 * eventually TerrainBuilder) to dial per-tier presets — clumps per
 * chunk, blades per clump, fade-distance, wind-octave count.
 *
 * Heuristic (Q3 resolution):
 *   - MAX_VERTEX_UNIFORM_VECTORS < 256
 *     OR vendor regex /Adreno [3-5]\d\d|Mali-[GT]\d\d|PowerVR/i
 *     → 'low'
 *   - Discrete desktop GPU strings (NVIDIA / AMD / Intel Arc / Intel UHD / Iris)
 *     → 'high'
 *   - Otherwise → 'med'
 *
 * Set ONCE at SceneManager init; pass into subsystems via constructor.
 * No per-frame cost.
 */

const LOW_TIER_VENDOR_RE = /Adreno [3-5]\d\d|Mali-[GT]\d\d|PowerVR/i;
const HIGH_TIER_VENDOR_RE = /NVIDIA|GeForce|Quadro|Radeon|AMD|Intel\(R\) Arc|Intel\(R\) UHD|Iris/i;

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ isMobile?: boolean, debugForceTier?: 'low'|'med'|'high' }} [opts]
 * @returns {'low'|'med'|'high'}
 */
export function detectTier(renderer, opts = {}) {
    if (opts.debugForceTier === 'low' || opts.debugForceTier === 'med' || opts.debugForceTier === 'high') {
        return opts.debugForceTier;
    }

    if (!renderer || typeof renderer.getContext !== 'function') {
        return detectNonWebGlTier(renderer, opts);
    }

    let gl;
    try {
        gl = renderer.getContext();
    } catch (_) {
        return detectNonWebGlTier(renderer, opts);
    }

    if (!gl) return detectNonWebGlTier(renderer, opts);

    let maxVertexUniforms = 256;
    try {
        maxVertexUniforms = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) ?? 256;
    } catch (_) { /* default */ }

    let rendererStr = '';
    try {
        // WEBGL_debug_renderer_info gives the unmasked vendor/renderer (Chrome
        // hides them by default for fingerprinting reasons but the extension
        // is still exposed).
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
            rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
        }
        if (!rendererStr) {
            rendererStr = String(gl.getParameter(gl.RENDERER) ?? '');
        }
    } catch (_) { /* default empty */ }

    if (maxVertexUniforms < 256) return 'low';
    if (LOW_TIER_VENDOR_RE.test(rendererStr)) return 'low';
    if (HIGH_TIER_VENDOR_RE.test(rendererStr) && !opts.isMobile) return 'high';
    return opts.isMobile ? 'low' : 'med';
}

function detectNonWebGlTier(renderer, opts = {}) {
    const isWebGpu = renderer?.isWebGPURenderer === true
        || renderer?.constructor?.name === 'WebGPURenderer'
        || String(globalThis.window?.__sdsRendererMode?.effective ?? '').startsWith('webgpu');
    if (!isWebGpu) return opts.isMobile ? 'low' : 'med';
    if (!opts.isMobile) return 'high';

    const limits = globalThis.window?.__sdsG?.productionWebGpu?.devicePreflight?.adapterLimits ?? {};
    const maxTexture = limits.maxTextureDimension2D ?? 0;
    const concurrency = globalThis.navigator?.hardwareConcurrency ?? 0;
    const memory = globalThis.navigator?.deviceMemory ?? 0;
    const width = globalThis.window?.innerWidth ?? 0;
    const height = globalThis.window?.innerHeight ?? 0;
    const dpr = globalThis.window?.devicePixelRatio ?? 1;
    const physicalPixels = width * height * dpr * dpr;

    if (maxTexture >= 8192 && concurrency >= 8 && (memory === 0 || memory >= 6) && physicalPixels >= 1_000_000) {
        return 'high';
    }
    if (maxTexture >= 4096 && concurrency >= 4) return 'med';
    return 'low';
}

/**
 * Per-tier preset numbers used by subsystems. Numbers picked to roughly
 * preserve v1.3.0 desktop behavior at 'med' (was the implicit default
 * desktop path), drop to the v1.3.0 mobile path at 'low', and earn a
 * ~15% perf headroom at 'high' by uncapping a few knobs.
 */
export const TIER_PRESETS = {
    low: {
        // Mirror existing isMobile=true defaults.
        clumpsPerChunkScale: 1.0, // applied to scene's mobile value
        bladesPerClump:      5,
        windOctaves:         1,
        meadowQuadEnabled:   false, // Q3: low-tier skips T4 meadow-quad
        // Cycle 25 Phase B: low-tier devices keep the meshopt LOD1 chain
        // (perf headroom matters more than silhouette fidelity here).
        usesLod1ForFoliage:  true,
        // [start, end] crossfade band for LOD0->LOD2 alphaHash. Mobile-low
        // pushes the band closer (80-100m) so geometry budget stays low.
        lod0CrossfadeBand:   [80, 100],
        // Cycle 87 Phase 4: low-tier devices stream only the first deferred
        // tree zone (the near band) and no streamed grass.
        foliageStreamWaves:  1,
        foliageStreamGrass:  false,
    },
    med: {
        clumpsPerChunkScale: 1.0, // applied to scene's desktop value
        bladesPerClump:      7,
        windOctaves:         2,
        // Cycle 51: meadow-quad far-grass LOD disabled. It only ever fired on
        // Open Country (the one scene whose grass reaches 260m from center),
        // where that band sits INSIDE the 380m playable island, so the player
        // walks into flat color carpets that read as a lighter-green
        // checkerboard against the instanced grass. A static center-distance
        // flat LOD can't work inside the play area; off until a camera-relative
        // version exists. The material factory stays for the konveyor catalog.
        meadowQuadEnabled:   false,
        // Cycle 25 Phase B: drop LOD1 on med + high desktop. The mid-band
        // mesh's silhouette mismatch with LOD0 is what
        // AtmosphericDesatPatch was hiding; replacing the seam with a
        // 20m alphaHash crossfade (180-200m) eliminates the pop entirely.
        usesLod1ForFoliage:  false,
        lod0CrossfadeBand:   [180, 200],
        // Cycle 87 Phase 4: mid/high tiers stream every deferred zone + grass.
        foliageStreamWaves:  Infinity,
        foliageStreamGrass:  true,
    },
    high: {
        clumpsPerChunkScale: 1.0,
        bladesPerClump:      7,
        windOctaves:         3,
        meadowQuadEnabled:   false, // Cycle 51: disabled, see the med-tier note
        usesLod1ForFoliage:  false,
        lod0CrossfadeBand:   [180, 200],
        foliageStreamWaves:  Infinity,
        foliageStreamGrass:  true,
    },
};
