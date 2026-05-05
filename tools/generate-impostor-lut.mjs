/**
 * Cycle 21 Phase 2 — calibration LUT generator.
 *
 * Reads `cycle21-validation/phaseN/sandbox-*.json` (Phase 1 12-cell or
 * Phase 2 80-cell), aggregates per-species per-channel ratios, inverts
 * to produce a `uMatchBoost` multiplier that pulls impostor pixels
 * toward LOD0 magnitude. Output:
 *
 *   assets/impostor-calibration-lut.json
 *
 * Schema (v1):
 *   {
 *     "version": 1,
 *     "source": "<input json path>",
 *     "boost": {
 *       "tree1": [r, g, b],
 *       "tree2": [r, g, b],
 *       "pine":  [r, g, b]
 *     }
 *   }
 *
 * Loader contract: `js/GameAssetLoader.js` fetches; `js/TerrainBuilder.js`
 * `setImpostorMatchBoost(species, vec3)` writes the kiln material's
 * `uMatchBoost` uniform once per species at scene init.
 *
 * Why per-species not per-(scene, preset): Phase 1 measurement showed
 * the species-axis residual is ~10× the scene/preset-axis residual.
 * tree1 (Aspen) shows ratio R/G/B = 0.78/0.89/1.16 — a structural
 * impostor-bake property that doesn't depend on which atmosphere the
 * tree is rendered under. Per-(scene, preset) refinement is a Phase 6
 * escalation if the species-only LUT leaves > dE 5 residual.
 *
 * Run as `node tools/generate-impostor-lut.mjs --in <path> --out <path>`.
 * Defaults: --in cycle21-validation/phase1/sandbox-baseline.json,
 *           --out assets/impostor-calibration-lut.json.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);

const IN_PATH  = resolve(ROOT, args.in  ?? 'cycle21-validation/phase1/sandbox-baseline.json');
const OUT_PATH = resolve(ROOT, args.out ?? 'assets/impostor-calibration-lut.json');

const data = JSON.parse(await readFile(IN_PATH, 'utf-8'));
if (!data.perCell?.length) {
    throw new Error(`Input ${IN_PATH} has no perCell array`);
}

// Group cells by species, compute median ratio across all cells in the group.
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const grouped = {};
for (const cell of data.perCell) {
    const key = cell.species;
    if (!grouped[key]) grouped[key] = { r: [], g: [], b: [] };
    // Sandbox ratio = lod2 / lod0 (impostor over LOD0). Boost = 1/ratio
    // pulls impostor toward LOD0 (boost > 1 brightens that channel,
    // < 1 dims it).
    grouped[key].r.push(1 / cell.ratio_r);
    grouped[key].g.push(1 / cell.ratio_g);
    grouped[key].b.push(1 / cell.ratio_b);
}

const boost = {};
for (const [species, channels] of Object.entries(grouped)) {
    boost[species] = [
        +median(channels.r).toFixed(3),
        +median(channels.g).toFixed(3),
        +median(channels.b).toFixed(3),
    ];
}

const lut = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: IN_PATH.replace(ROOT + '\\', '').replace(ROOT + '/', '').replace(/\\/g, '/'),
    boost,
};

await writeFile(OUT_PATH, JSON.stringify(lut, null, 2));
console.log(`[lut] wrote ${OUT_PATH}`);
console.log(`[lut] boost:`, boost);
