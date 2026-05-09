/**
 * Refactor-baseline harness — characterization-test fixtures (Cycle 28 Stream B0).
 *
 * Goldens captured here are sampled BEFORE the Stream B god-module
 * decomposition begins. They lock down behaviors that are not directly
 * covered by the existing sim-baseline fixtures but that the refactor
 * could silently change:
 *
 *   1. terrain-mesh-hash      — heightfield sample grid hash per scene
 *   2. scatter-positions      — deterministic tree positions per scene
 *   3. bundle-sizes           — main-*.js / three-*.js byte sizes after build
 *
 * Rocks are placed via Math.random() in the current TerrainBuilder, so a
 * rock-position golden is parked until Phase B2 extracts placement to a
 * deterministic shared/RockPlacement.js module.
 *
 * The harness is pure JS + JSDoc, no Three.js, runs in vitest's Node
 * environment. It loads heightmap bytes via fs (not fetch) since vitest
 * doesn't run the dev server.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Heightfield } from '../../shared/terrain/Heightfield.js';
import { generateTrees } from '../../shared/TreePlacement.js';
import { mulberry32 } from '../../shared/Random.js';
import { field } from '../../shared/scenes/field.js';
import { rollingHills } from '../../shared/scenes/rolling-hills.js';
import { openCountry } from '../../shared/scenes/open-country.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

/** @typedef {import('../../shared/scenes/types.js').SceneDef} SceneDef */

/**
 * Scenes covered by the goldens. The order matters — JSON keys are
 * written in this order so diffs read consistently across regenerations.
 */
export const SCENES = /** @type {const} */ ([
    { id: 'field', def: field, terrainBin: 'public/terrain/field.bin' },
    { id: 'rolling-hills', def: rollingHills, terrainBin: 'public/terrain/rolling-hills.bin' },
    { id: 'open-country', def: openCountry, terrainBin: 'public/terrain/open-country.bin' }
]);

/**
 * 32-bit FNV-1a hash. Stable across V8 versions, good enough for
 * regression detection on a few thousand samples.
 *
 * @param {ArrayLike<number>} values
 * @returns {string} hex-encoded uint32
 */
export function fnv1a32(values) {
    let h = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < values.length; i++) {
        // Snap floats to a 6-decimal-place fixed-point string before hashing.
        // Float bit-pattern hashing would be tighter but cross-engine ULP
        // wobble has bitten this codebase before; 6 dp is more than enough
        // signal to detect real behavior changes.
        const s = Number(values[i]).toFixed(6);
        for (let j = 0; j < s.length; j++) {
            h ^= s.charCodeAt(j);
            h = Math.imul(h, 0x01000193);
        }
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Load a heightfield from `public/terrain/<scene>.bin` + sidecar manifest.
 * Mirrors `Heightfield.load()` but uses `fs` instead of `fetch` since
 * vitest runs in Node without a dev server.
 *
 * @param {string} relPath e.g. `public/terrain/field.bin`
 * @returns {Heightfield}
 */
export function loadHeightfieldFromDisk(relPath) {
    const binPath = resolve(REPO_ROOT, relPath);
    const manifestPath = `${binPath}.json`;
    const buffer = readFileSync(binPath);
    /** @type {import('../../shared/terrain/Heightfield.js').HeightfieldManifest} */
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    // Copy into a fresh ArrayBuffer to guarantee 4-byte alignment for
    // Float32Array — Node Buffers can be sub-aligned slices.
    const data = new Float32Array(buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
    ));
    return new Heightfield({
        data,
        width: manifest.width,
        height: manifest.height,
        worldSize: manifest.worldSize,
        peakHeight: manifest.peakHeight
    });
}

/**
 * Sample the heightfield on a fixed 64×64 grid covering the play area
 * and return a hash of the sampled heights. The sample grid is anchored
 * at world (-100, -100) → (100, 100) so it lands inside every scene's
 * play area regardless of `worldSize`.
 *
 * @param {Heightfield} hf
 * @returns {{ hash: string, gridSize: number, sampleSpan: number, sampleCount: number }}
 */
export function hashHeightfieldGrid(hf) {
    const gridSize = 64;
    const sampleSpan = 200;            // metres on a side
    const half = sampleSpan / 2;
    const step = sampleSpan / (gridSize - 1);
    const samples = new Float32Array(gridSize * gridSize);
    for (let iy = 0; iy < gridSize; iy++) {
        const z = -half + iy * step;
        for (let ix = 0; ix < gridSize; ix++) {
            const x = -half + ix * step;
            samples[iy * gridSize + ix] = hf.sample(x, z);
        }
    }
    return {
        hash: fnv1a32(samples),
        gridSize,
        sampleSpan,
        sampleCount: samples.length
    };
}

/**
 * Generate the deterministic tree-position fingerprint for a scene.
 * Uses seed 0xC25 ("Cycle 25" — arbitrary stable seed) so the fixture
 * stays reproducible. Captures count + (x, z, type, scale, rotationY)
 * hash so any per-tree mutation surfaces as a hash drift.
 *
 * @param {SceneDef} scene
 * @returns {{ hash: string, count: number, seed: number }}
 */
export function hashScatterPositions(scene) {
    const SEED = 0xC25;
    const trees = generateTrees(scene, mulberry32(SEED));
    // Flatten into a numeric array for the hash. Type strings hash via
    // their char codes through `String(values[i])` cast — we need a
    // numeric companion to keep type changes visible.
    const flat = new Array(trees.length * 5);
    let i = 0;
    for (const t of trees) {
        flat[i++] = t.x;
        flat[i++] = t.z;
        // Type → small integer so the hash is stable across naming changes
        // we explicitly want to flag (i.e. "tree2" → "tree3" SHOULD change
        // the hash; that's the regression detector working).
        flat[i++] = t.type === 'tree1' ? 1 : t.type === 'tree2' ? 2 : 0;
        flat[i++] = t.scale;
        flat[i++] = t.rotationY;
    }
    return {
        hash: fnv1a32(flat),
        count: trees.length,
        seed: SEED
    };
}

/**
 * Read sizes from `dist/assets/` after `npm run build`. Returns null
 * when dist/ doesn't exist (the bundle-size assertion in the spec
 * tolerates this — running goldens before the first build is fine).
 *
 * @returns {{ mainKB: number, threeKB: number } | null}
 */
export function readBundleSizes() {
    const distAssets = resolve(REPO_ROOT, 'dist', 'assets');
    if (!existsSync(distAssets)) return null;
    const entries = readdirSync(distAssets);
    const mainEntry = entries.find((n) => /^main-[A-Za-z0-9_-]+\.js$/.test(n));
    const threeEntry = entries.find((n) => /^three-[A-Za-z0-9_-]+\.js$/.test(n));
    if (!mainEntry || !threeEntry) return null;
    const mainBytes = statSync(resolve(distAssets, mainEntry)).size;
    const threeBytes = statSync(resolve(distAssets, threeEntry)).size;
    return {
        mainKB: Math.round(mainBytes / 1024),
        threeKB: Math.round(threeBytes / 1024)
    };
}

/**
 * Capture the full set of goldens for every scene. Used by the
 * regenerate path in the spec when `UPDATE_FIXTURES=true`.
 *
 * @returns {{
 *   terrainMeshHash: Record<string, ReturnType<typeof hashHeightfieldGrid>>,
 *   scatterPositions: Record<string, ReturnType<typeof hashScatterPositions>>
 * }}
 */
export function captureSceneGoldens() {
    /** @type {Record<string, ReturnType<typeof hashHeightfieldGrid>>} */
    const terrainMeshHash = {};
    /** @type {Record<string, ReturnType<typeof hashScatterPositions>>} */
    const scatterPositions = {};
    for (const { id, def, terrainBin } of SCENES) {
        const hf = loadHeightfieldFromDisk(terrainBin);
        terrainMeshHash[id] = hashHeightfieldGrid(hf);
        scatterPositions[id] = hashScatterPositions(def);
    }
    return { terrainMeshHash, scatterPositions };
}
