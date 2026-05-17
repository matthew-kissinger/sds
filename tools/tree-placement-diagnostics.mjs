import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    generateTrees,
    getTreeCanopyRadius,
    TREE_CANOPY_SPACING_PADDING
} from '../shared/TreePlacement.js';
import { mulberry32 } from '../shared/Random.js';
import { field } from '../shared/scenes/field.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { openCountry } from '../shared/scenes/open-country.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SCENES = [
    { id: 'field', scene: field, seed: field.terrain.seed },
    { id: 'rolling-hills', scene: rollingHills, seed: rollingHills.terrain.seed },
    { id: 'open-country', scene: openCountry, seed: openCountry.terrain.seed },
];

function percentile(sorted, p) {
    if (sorted.length === 0) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function rounded(value) {
    return Number.isFinite(value) ? +value.toFixed(3) : null;
}

function summarize(scene, seed) {
    const trees = generateTrees(scene, mulberry32(seed));
    const nearest = [];
    let overlapPairs = 0;
    let severeOverlapPairs = 0;
    let minNearest = Infinity;

    for (let i = 0; i < trees.length; i++) {
        let localNearest = Infinity;
        for (let j = 0; j < trees.length; j++) {
            if (i === j) continue;
            const a = trees[i];
            const b = trees[j];
            const distance = Math.hypot(a.x - b.x, a.z - b.z);
            localNearest = Math.min(localNearest, distance);
            if (j <= i) continue;
            const overlap =
                getTreeCanopyRadius(a) +
                getTreeCanopyRadius(b) +
                TREE_CANOPY_SPACING_PADDING -
                distance;
            if (overlap > 0) overlapPairs++;
            if (overlap > 5) severeOverlapPairs++;
        }
        minNearest = Math.min(minNearest, localNearest);
        nearest.push(localNearest);
    }

    nearest.sort((a, b) => a - b);
    const scales = trees.map((tree) => tree.scale).sort((a, b) => a - b);
    const typeCounts = trees.reduce((counts, tree) => {
        counts[tree.type] = (counts[tree.type] ?? 0) + 1;
        return counts;
    }, {});

    return {
        seed,
        count: trees.length,
        nearestNeighborMeters: {
            min: rounded(minNearest),
            p05: rounded(percentile(nearest, 0.05)),
            median: rounded(percentile(nearest, 0.5)),
            p95: rounded(percentile(nearest, 0.95)),
        },
        canopySpacing: {
            paddingMeters: TREE_CANOPY_SPACING_PADDING,
            overlapPairs,
            severeOverlapPairs,
        },
        scale: {
            min: rounded(scales[0]),
            median: rounded(percentile(scales, 0.5)),
            max: rounded(scales[scales.length - 1]),
        },
        typeCounts,
    };
}

const report = {
    generatedAt: new Date().toISOString(),
    contract: 'deterministic-cross-zone-canopy-spacing',
    scenes: Object.fromEntries(SCENES.map(({ id, scene, seed }) => [id, summarize(scene, seed)])),
};

const outPath = resolve(ROOT, 'cycle38-validation/runtime/tree-placement-spacing-diagnostics.json');
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 2));
