// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 20 Phase 1 — bake object impostors via Pixel Forge / Kiln.
 * Cycle 50 Phase 1 — generalized from a hardcoded `['tree1','tree2']` list to a
 * manifest-driven enumerator. Reads `assets/objects.manifest.json` and bakes
 * every impostor-enabled object across its declared layouts and variants. The
 * base variant of the `latlon-hemi-y` layout emits byte-identical output paths
 * to the pre-Cycle-50 bake (`assets/models/trees/<id>.imposter.png`), so this
 * generalization is byte-neutral for tree1/tree2.
 *
 * For each (object, layout, variant) it shells out to the Pixel Forge
 * `kiln bake-imposter` CLI to produce:
 *   <base>.imposter.png         — albedo atlas
 *   <base>.imposter.normal.png  — capture-view-space normal aux atlas
 *   <base>.imposter.depth.png   — depth aux atlas
 *   <base>.imposter.json        — Kiln sidecar (Phase 2 augments it with
 *                                 objectId/category/variant/layoutId)
 *
 * Bake from `_originals/` because the runtime GLBs under `assets/models` are
 * Draco-compressed and Pixel Forge's harness has no DRACOLoader. The Kiln knobs
 * (angles, axis, tile size, aux layers) live in the manifest's `layoutPresets`.
 *
 * Windows install gotcha: `bun run` of pixelforge hangs on Playwright's
 * CDP-pipe handshake. Invoke through Node + tsx instead. The pixel-forge
 * checkout is expected at `../pixel-forge` with `bun install` already run.
 *
 * Run: `npm run bake-tree-impostors`
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileP = promisify(execFile);

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SDS_ROOT = resolve(HERE, '..');
const PF_ROOT = resolve(SDS_ROOT, '../pixel-forge');
// Cycle 91: pixel-forge ships a compiled CLI now - invoke it with plain
// node instead of the old tsx-against-CLI-source path (no bun/tsx
// requirement in consumer repos, per pixel-forge's own packaging intent).
const PF_CLI = resolve(PF_ROOT, 'packages/cli/dist/index.js');

const MANIFEST_PATH = resolve(SDS_ROOT, 'assets/objects.manifest.json');

function assertCliBuilt() {
  if (!existsSync(PF_CLI)) {
    throw new Error(
      `pixel-forge compiled CLI not found at ${PF_CLI}. ` +
      `Run \`bun run build\` in ${PF_ROOT} (packages/cli) first.`
    );
  }
}

/** Load + lightly validate the object manifest. */
export function loadManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  if (!Array.isArray(manifest.objects)) throw new Error('manifest.objects must be an array');
  if (!manifest.layoutPresets || typeof manifest.layoutPresets !== 'object') {
    throw new Error('manifest.layoutPresets must be an object');
  }
  return manifest;
}

/**
 * Albedo-atlas output path for an (object, layout-preset, variant). The base
 * variant of an empty-subdir layout reproduces the pre-Cycle-50 path exactly
 * (`assets/models/<category-dir>/<id>.imposter.png`). Non-default variants get
 * a `.<variantId>` suffix; layouts with a subdir (e.g. octahedral) nest under
 * it. The impostor lives beside the object's runtime model.
 */
export function impostorAssetBase(obj, preset, variant) {
  const modelDir = resolve(SDS_ROOT, dirname(obj.runtimeModel));
  const dir = preset.subdir ? resolve(modelDir, preset.subdir) : modelDir;
  const variantSuffix = variant.default ? '' : `.${variant.id}`;
  return resolve(dir, `${obj.id}${variantSuffix}.imposter.png`);
}

/** Sidecar path beside the atlas: `<base>.imposter.png` -> `<base>.imposter.json`. */
export function sidecarPathFor(obj, preset, variant) {
  return impostorAssetBase(obj, preset, variant).replace(/\.png$/, '.json');
}

/**
 * Every (object, layout, variant) the manifest marks impostor-enabled, with the
 * derived atlas + sidecar paths. Single source of truth for the bake matrix,
 * shared by the CLI here and the parity/sidecar specs so they cannot drift.
 */
export function* enabledImpostorTargets(manifest) {
  for (const obj of manifest.objects) {
    if (!obj.impostor?.enabled) continue;
    for (const layoutId of obj.impostor.layouts) {
      const preset = manifest.layoutPresets[layoutId];
      if (!preset) throw new Error(`object ${obj.id} references unknown layout "${layoutId}"`);
      for (const variant of obj.impostor.variants) {
        yield {
          obj,
          layoutId,
          preset,
          variant,
          atlasPath: impostorAssetBase(obj, preset, variant),
          sidecarPath: sidecarPathFor(obj, preset, variant),
        };
      }
    }
  }
}

/** Manifest-derived identity fields stamped onto each sidecar (Cycle 50 Phase 2). */
export function impostorIdentity(obj, layoutId, variant) {
  return { objectId: obj.id, category: obj.category, variant: variant.id, layoutId };
}

/**
 * Merge the identity fields onto a parsed sidecar. Additive + idempotent:
 * re-applying to an already-stamped sidecar reproduces it byte-for-byte (the
 * determinism golden in tests/objects-impostor-parity.spec.js relies on this).
 */
export function withImpostorIdentity(sidecar, identity) {
  return { ...sidecar, ...identity };
}

/** Canonical sidecar serialization (2-space, no trailing newline). */
export function serializeSidecar(sidecar) {
  return JSON.stringify(sidecar, null, 2);
}

/**
 * Read a Kiln-written sidecar, stamp the manifest identity onto it, write it
 * back canonically. The PNG atlases are never touched, so this is byte-safe for
 * the tree1/tree2 production atlases (Cycle 50 holds them byte-identical).
 */
export function augmentSidecarFile(sidecarPath, identity) {
  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
  writeFileSync(sidecarPath, serializeSidecar(withImpostorIdentity(sidecar, identity)));
}

async function bakeOne(obj, layoutId, preset, variant) {
  const src = resolve(SDS_ROOT, obj.source);
  if (!existsSync(src)) throw new Error(`missing source GLB: ${src}`);
  const out = impostorAssetBase(obj, preset, variant);

  // Octahedral uses `--layout octahedral` + `--grid` (angles ignored); latlon
  // uses `--angles` + `--axis`. The shared flags (tile size, aux layers, bg,
  // color layer, edge bleed) follow. Latlon's flags are unchanged from
  // pre-Cycle-50 so the production tree1/tree2 bake stays byte-identical.
  const isOctahedral = preset.layout === 'octahedral';
  const layoutArgs = isOctahedral
    ? ['--layout', 'octahedral', '--grid', preset.grid ?? '8x8']
    : ['--angles', String(preset.angles), '--axis', preset.axis];
  const args = [
    PF_CLI,
    'kiln', 'bake-imposter', src,
    '--out', out,
    ...layoutArgs,
    '--tile-size', String(preset.tileSize),
    '--aux-layers', (preset.auxLayers ?? ['normal', 'depth']).join(','),
    '--bg', preset.bg ?? 'transparent',
    '--color-layer', preset.colorLayer ?? 'baseColor',
    '--edge-bleed', String(preset.edgeBleed ?? 2),
    '--json',
  ];

  const t0 = Date.now();
  const layoutDesc = isOctahedral ? `octahedral ${preset.grid ?? '8x8'}` : `${preset.angles} ${preset.axis}`;
  console.log(`[bake] ${obj.id} / ${layoutId} / ${variant.id} (${layoutDesc}, tile ${preset.tileSize})…`);
  const { stdout, stderr } = await execFileP(process.execPath, args, {
    cwd: PF_ROOT,
    maxBuffer: 16 * 1024 * 1024,
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  let info = null;
  try { info = JSON.parse(stdout); } catch { /* ignore — leave info null */ }
  if (info?.ok) {
    const pngBytes = statSync(out).size;
    console.log(
      `  → ok (${dt}s) — ${info.tiles} ${info.atlas}, ` +
      `${info.tris} tris, ${(pngBytes / 1024).toFixed(0)} KB albedo`
    );
  } else {
    console.warn(`  → bake returned ok=false. stderr: ${stderr}`);
    console.warn(`  raw stdout: ${stdout}`);
    throw new Error(`bake failed for ${obj.id} / ${layoutId} / ${variant.id}`);
  }
}

/**
 * Bake (or, with `--augment-only`, just re-stamp sidecars for) every
 * impostor-enabled object in the manifest. `--augment-only` skips the Kiln
 * render entirely: it reads each committed sidecar, stamps the manifest
 * identity, and rewrites it, leaving the PNG atlases untouched. That is how the
 * Cycle 50 Phase 2 identity fields land on tree1/tree2 without a re-render (CI
 * has neither the source GLBs nor a browser, so it can never render here).
 */
export async function bakeAll({ augmentOnly = false } = {}) {
  const manifest = loadManifest();
  const targets = [...enabledImpostorTargets(manifest)];
  if (!augmentOnly) {
    assertCliBuilt();
    console.log(`pixel-forge cli:  ${PF_CLI}`);
  }
  console.log(`manifest:         ${MANIFEST_PATH}`);
  console.log(`mode:             ${augmentOnly ? 'augment-only (no render)' : 'full bake'}`);
  console.log(`impostor targets: ${targets.map((t) => `${t.obj.id}/${t.layoutId}/${t.variant.id}`).join(', ') || '(none)'}\n`);

  let count = 0;
  for (const t of targets) {
    if (!augmentOnly) {
      await bakeOne(t.obj, t.layoutId, t.preset, t.variant);
    } else if (!existsSync(t.sidecarPath)) {
      throw new Error(
        `--augment-only: sidecar missing for ${t.obj.id}/${t.layoutId}/${t.variant.id} ` +
        `(${t.sidecarPath}). Run a full bake first.`
      );
    }
    // Stamp identity in both modes: a full bake also re-runs this after Kiln
    // writes the raw sidecar, so the committed file is always baker output.
    augmentSidecarFile(t.sidecarPath, impostorIdentity(t.obj, t.layoutId, t.variant));
    if (augmentOnly) console.log(`[augment] ${t.obj.id} / ${t.layoutId} / ${t.variant.id}`);
    count++;
  }

  console.log(`\n[bake] all ${count} object-impostor ${augmentOnly ? 'sidecar augments' : 'bakes'} done.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  bakeAll({ augmentOnly: process.argv.includes('--augment-only') }).catch((err) => {
    console.error('[bake] FAILED:', err.message);
    process.exit(1);
  });
}
