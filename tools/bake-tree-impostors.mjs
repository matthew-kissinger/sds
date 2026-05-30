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
import { existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SDS_ROOT = resolve(HERE, '..');
const PF_ROOT = resolve(SDS_ROOT, '../pixel-forge');
const PF_TSX = resolve(PF_ROOT, 'node_modules/.bin/tsx');
const PF_CLI = resolve(PF_ROOT, 'packages/cli/src/index.ts');
// Windows packs tsx as a .exe shim; .cmd may also exist depending on the
// installer. Prefer .exe (direct executable) over .cmd (shell wrapper).
const PF_TSX_WIN_EXE = `${PF_TSX}.exe`;
const PF_TSX_WIN_CMD = `${PF_TSX}.cmd`;

const MANIFEST_PATH = resolve(SDS_ROOT, 'assets/objects.manifest.json');

function pickTsxBin() {
  if (process.platform === 'win32') {
    if (existsSync(PF_TSX_WIN_EXE)) return PF_TSX_WIN_EXE;
    if (existsSync(PF_TSX_WIN_CMD)) return PF_TSX_WIN_CMD;
  }
  if (existsSync(PF_TSX)) return PF_TSX;
  throw new Error(
    `pixel-forge tsx binary not found. Expected ${PF_TSX}, ${PF_TSX_WIN_EXE}, or ${PF_TSX_WIN_CMD}. ` +
    `Run \`bun install\` in ${PF_ROOT} first.`
  );
}

/** Load + lightly validate the object manifest. */
function loadManifest() {
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
function impostorAssetBase(obj, preset, variant) {
  const modelDir = resolve(SDS_ROOT, dirname(obj.runtimeModel));
  const dir = preset.subdir ? resolve(modelDir, preset.subdir) : modelDir;
  const variantSuffix = variant.default ? '' : `.${variant.id}`;
  return resolve(dir, `${obj.id}${variantSuffix}.imposter.png`);
}

async function bakeOne(obj, layoutId, preset, variant, tsxBin) {
  const src = resolve(SDS_ROOT, obj.source);
  if (!existsSync(src)) throw new Error(`missing source GLB: ${src}`);
  const out = impostorAssetBase(obj, preset, variant);

  const args = [
    PF_CLI,
    'kiln', 'bake-imposter', src,
    '--out', out,
    '--angles', String(preset.angles),
    '--axis', preset.axis,
    '--tile-size', String(preset.tileSize),
    '--aux-layers', (preset.auxLayers ?? ['normal', 'depth']).join(','),
    '--bg', preset.bg ?? 'transparent',
    '--color-layer', preset.colorLayer ?? 'baseColor',
    '--edge-bleed', String(preset.edgeBleed ?? 2),
    '--json',
  ];

  const t0 = Date.now();
  console.log(`[bake] ${obj.id} / ${layoutId} / ${variant.id} (${preset.angles} ${preset.axis}, tile ${preset.tileSize})…`);
  const { stdout, stderr } = await execFileP(tsxBin, args, {
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

(async () => {
  const tsxBin = pickTsxBin();
  const manifest = loadManifest();
  const targets = manifest.objects.filter((o) => o.impostor?.enabled);
  console.log(`pixel-forge tsx:  ${tsxBin}`);
  console.log(`manifest:         ${MANIFEST_PATH}`);
  console.log(`impostor objects: ${targets.map((o) => o.id).join(', ') || '(none)'}\n`);

  let count = 0;
  for (const obj of targets) {
    for (const layoutId of obj.impostor.layouts) {
      const preset = manifest.layoutPresets[layoutId];
      if (!preset) throw new Error(`object ${obj.id} references unknown layout "${layoutId}"`);
      for (const variant of obj.impostor.variants) {
        await bakeOne(obj, layoutId, preset, variant, tsxBin);
        count++;
      }
    }
  }

  console.log(`\n[bake] all ${count} object-impostor bakes done.`);
})().catch((err) => {
  console.error('[bake] FAILED:', err.message);
  process.exit(1);
});
