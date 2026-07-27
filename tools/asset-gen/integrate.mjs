// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Wire gallery picks into the runtime asset pipeline (Cycle 15 Phase 1).
 *
 * Reads `tools/asset-gallery/picks.json`, categorizes by source folder
 * (rocks / trees / scatter / etc.), copies the picked GLBs into the
 * canonical asset locations, then prints suggested PROP_VARIANTS / asset
 * loader patches for the user to paste. Stops short of modifying source
 * code automatically — the variant weights and per-prop targetHeight
 * still need a human eye, and a silent ScatterSystem rewrite would be
 * harder to review than a printed diff.
 *
 * Usage:
 *   node tools/asset-gen/integrate.mjs                # default picks file
 *   node tools/asset-gen/integrate.mjs --picks=other-picks.json
 *   node tools/asset-gen/integrate.mjs --dry-run      # show plan, copy nothing
 *   node tools/asset-gen/integrate.mjs --compress     # also runs npm run compress-glbs after copy
 */

import { readFile, copyFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const args = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);

const PICKS_PATH = resolve(ROOT, args.picks ?? 'tools/asset-gallery/picks.json');
const DRY = !!args['dry-run'];

// Map gallery staging subfolders → committed asset locations.
//
// Cycle 16: `trees-lod1` is the LOD1 sibling tier — picks land in the
// same `assets/models/trees/` dir as LOD0 picks but with a `_lod1`
// suffix on the canonical names. The runtime LOD chain in
// `js/TerrainBuilder.js` looks up matching siblings by name.
const ASSET_TARGETS = {
    rocks: 'assets/models/rocks',
    trees: 'assets/models/trees',
    'trees-lod1': 'assets/models/trees',
    flora: 'assets/models/scatter',
    scatter: 'assets/models/scatter'
};

// Loader-name canonicalization. The TerrainBuilder rock loader reads
// rock1/rock2/rock3 by literal path; the asset loader's tree-critical
// path reads tree1/tree2 (and tree1_lod1/tree2_lod1 for the Cycle 22
// mid-distance LOD swap; pine removed). Picks must rename to these so
// the runtime keeps working without code changes. Order: smallest first.
//
// If picks > slots, extra picks get descriptive names appended (loader
// won't pick them up; the user widens the loader array manually).
const CANONICAL_NAMES = {
    rocks: ['rock1.glb', 'rock2.glb', 'rock3.glb'],
    trees: ['tree1.glb', 'tree2.glb'],
    'trees-lod1': ['tree1_lod1.glb', 'tree2_lod1.glb']
};

function pickCanonicalName(category, picks) {
    // Cycle 16 update: each pick may carry an explicit `canonicalName`
    // override (e.g. `'tree1.glb'`). When present, that wins. Useful when
    // the natural bbox-height sort doesn't match semantics — e.g. pine is
    // shorter than aspen but belongs in the `pine` slot regardless.
    //
    // Without an override: fall back to bbox-height-ascending sort. That
    // works for rocks (rock1 = small pebble, rock3 = largest) and for
    // tree species where height matches the desired slot (rare).
    const slots = CANONICAL_NAMES[category];
    if (!slots) return picks.map((p) => ({ pick: p, name: basename(p.path) }));

    const explicit = picks.filter((p) => typeof p.canonicalName === 'string');
    const implicit = picks.filter((p) => typeof p.canonicalName !== 'string');

    const out = explicit.map((p) => ({ pick: p, name: p.canonicalName }));

    const taken = new Set(out.map((o) => o.name));
    const remainingSlots = slots.filter((s) => !taken.has(s));

    const sortedImplicit = [...implicit].sort((a, b) => {
        const aH = a.bbox?.sy ?? 0;
        const bH = b.bbox?.sy ?? 0;
        return aH - bH;
    });
    sortedImplicit.forEach((p, i) => {
        out.push({ pick: p, name: i < remainingSlots.length ? remainingSlots[i] : basename(p.path) });
    });
    return out;
}

function categoryOf(picPath) {
    // tools/asset-gallery/staging/<category>/<filename>.glb
    const parts = picPath.split('/');
    const stagingIdx = parts.indexOf('staging');
    if (stagingIdx >= 0 && parts[stagingIdx + 1]) return parts[stagingIdx + 1];
    return 'unknown';
}

async function safeCopy(srcRel, destRel) {
    const src = resolve(ROOT, srcRel);
    const dest = resolve(ROOT, destRel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    return (await stat(dest)).size;
}

function suggestPropVariant(filename, category) {
    const name = filename.replace(/\.glb$/, '');
    if (category === 'rocks') {
        return `// Tag for TerrainBuilder rock loader (not ScatterSystem):\nROCK_PATHS.push('assets/models/rocks/${filename}');`;
    }
    const variant = {
        scatter: { weight: 7.5, type: 'flora', targetHeight: 0.40 },
        flora: { weight: 6.25, type: 'flora', targetHeight: 0.30 }
    }[category] ?? { weight: 5, type: 'pebble', targetHeight: 0.10 };
    const line = `    { name: '${name}', path: 'assets/models/scatter/${filename}', weight: ${variant.weight}, type: '${variant.type}', targetHeight: ${variant.targetHeight.toFixed(2)} },`;
    return line;
}

async function main() {
    let picksFile;
    try {
        picksFile = JSON.parse(await readFile(PICKS_PATH, 'utf8'));
    } catch (err) {
        console.error(`[INTEGRATE] No picks at ${relative(ROOT, PICKS_PATH).split('\\').join('/')}.`);
        console.error('            Open the gallery (npm run gallery), pick GLBs, hit Save Picks first.');
        process.exit(1);
    }

    const byCategory = new Map();
    for (const pick of picksFile.picks) {
        const cat = categoryOf(pick.path);
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat).push(pick);
    }

    console.log(`[INTEGRATE] ${picksFile.picks.length} picks across ${byCategory.size} categories. Saved at ${picksFile.savedAt}`);
    if (DRY) console.log('[INTEGRATE] Dry-run — copying nothing.');

    const copied = [];
    const skipped = [];

    for (const [cat, picks] of byCategory) {
        const targetBase = ASSET_TARGETS[cat];
        if (!targetBase) {
            console.log(`[INTEGRATE] Category ${cat} has no canonical target — skipping ${picks.length} GLBs.`);
            skipped.push(...picks.map((p) => ({ ...p, reason: 'no target dir' })));
            continue;
        }
        const renamed = pickCanonicalName(cat, picks);
        console.log(`\n[INTEGRATE] ${cat} → ${targetBase}/  (${picks.length} GLBs)`);
        if (CANONICAL_NAMES[cat]) {
            console.log(`            Renaming picks to canonical loader names (sorted by bbox height):`);
        }
        for (const { pick, name } of renamed) {
            const srcName = basename(pick.path);
            const dest = `${targetBase}/${name}`;
            try {
                const bytes = DRY ? pick.size : await safeCopy(pick.path, dest);
                const renameTag = name !== srcName ? ` (was ${srcName})` : '';
                console.log(`            ✓ ${name}${renameTag}  (${(bytes / 1024).toFixed(1)} KB)`);
                copied.push({ ...pick, dest, category: cat, canonicalName: name, originalName: srcName });
            } catch (err) {
                console.error(`            ✗ ${name}  ${err.message}`);
                skipped.push({ ...pick, reason: err.message });
            }
        }
    }

    if (copied.length === 0) {
        console.log('[INTEGRATE] Nothing copied. Done.');
        return;
    }

    // Suggested code edits.
    console.log('\n[INTEGRATE] Suggested edits:');

    const scatterPicks = copied.filter((p) => p.category === 'scatter' || p.category === 'flora');
    if (scatterPicks.length > 0) {
        console.log('\n  In js/ScatterSystem.js — append to PROP_VARIANTS:');
        console.log('  // (re-tune `weight` so the array sums to ~100; targetHeight is a starting guess)\n');
        for (const p of scatterPicks) {
            console.log(suggestPropVariant(basename(p.path), p.category));
        }
    }

    const treePicks = copied.filter((p) => p.category === 'trees');
    if (treePicks.length > 0) {
        console.log('\n  Trees: edit js/TerrainBuilder.js if you want to add these to the production loader,');
        console.log('  then update tests/tree-assets.spec.js TREE_FILES to keep the contract spec honest.');
        console.log('  Files copied:');
        for (const p of treePicks) console.log(`    - ${p.dest}`);
    }

    const rockPicks = copied.filter((p) => p.category === 'rocks');
    if (rockPicks.length > 0) {
        console.log('\n  Rocks: js/TerrainBuilder.js loads rocks via the rock_pool. Look for the rock paths array');
        console.log('  near ROCK_NATIVE_HEIGHT and append the new files:');
        for (const p of rockPicks) console.log(`    - assets/models/rocks/${basename(p.path)}`);
    }

    if (args.compress && !DRY) {
        console.log('\n[INTEGRATE] Running compress-glbs…');
        await new Promise((resolveSpawn, reject) => {
            const child = spawn('npm', ['run', 'compress-glbs'], { cwd: ROOT, stdio: 'inherit', shell: true });
            child.on('exit', (code) => code === 0 ? resolveSpawn() : reject(new Error('compress-glbs exit ' + code)));
        });
    } else if (!DRY) {
        console.log('\n[INTEGRATE] Tip: re-run with --compress to also draco-compress, or `npm run compress-glbs` manually.');
    }

    console.log(`\n[INTEGRATE] Copied ${copied.length}, skipped ${skipped.length}.`);
    if (skipped.length) console.log('[INTEGRATE] Skipped:', skipped.map((s) => `${basename(s.path)} (${s.reason})`).join(', '));
}

main().catch((err) => {
    console.error('[INTEGRATE] FATAL:', err);
    process.exit(1);
});
