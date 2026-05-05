/**
 * Cycle 20 Phase 1 — bake tree impostors via Pixel Forge / Kiln.
 *
 * For each of `tree1.glb`, `tree2.glb`, `pine.glb` in `assets/_originals/models/trees/`,
 * shells out to the Pixel Forge `kiln bake-imposter` CLI to produce:
 *   <name>.imposter.png         — albedo atlas (4×4 lat/lon hemi-y, baseColor unlit)
 *   <name>.imposter.normal.png  — capture-view-space normal aux atlas
 *   <name>.imposter.depth.png   — depth aux atlas (used by Phase 2 for parallax)
 *   <name>.imposter.json        — Kiln sidecar (azimuths, elevations, worldSize, yOffset, ...)
 *
 * Output: `assets/models/trees/`. Q2 verdict (16 hemi-y) is locked per
 * `cycle20-validation/phase0/AUDIT.md`. Bake from `_originals/` because
 * the runtime `assets/models/trees/*.glb` are Draco-compressed and Pixel
 * Forge's harness has no DRACOLoader.
 *
 * Windows install gotcha: `bun run` of pixelforge hangs on Playwright's
 * CDP-pipe handshake. Invoke through Node + tsx instead. The pixel-forge
 * checkout is expected at `../pixel-forge` with `bun install` already run.
 *
 * Run: `npm run bake-tree-impostors`
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, basename } from 'node:path';
import { existsSync, statSync } from 'node:fs';
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

const SOURCE_DIR = resolve(SDS_ROOT, 'assets/_originals/models/trees');
const OUT_DIR = resolve(SDS_ROOT, 'assets/models/trees');
const TREES = ['tree1', 'tree2', 'pine'];

// Q2 verdict — see cycle20-validation/phase0/AUDIT.md.
const ANGLES = '16';
const AXIS = 'hemi-y';
const TILE_SIZE = '512';

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

async function bakeOne(name, tsxBin) {
  const src = resolve(SOURCE_DIR, `${name}.glb`);
  if (!existsSync(src)) throw new Error(`missing source GLB: ${src}`);
  const out = resolve(OUT_DIR, `${name}.imposter.png`);

  const args = [
    PF_CLI,
    'kiln', 'bake-imposter', src,
    '--out', out,
    '--angles', ANGLES,
    '--axis', AXIS,
    '--tile-size', TILE_SIZE,
    '--aux-layers', 'normal,depth',
    '--bg', 'transparent',
    '--color-layer', 'baseColor',
    '--edge-bleed', '2',
    '--json',
  ];

  const t0 = Date.now();
  console.log(`[bake] ${name} (${ANGLES} ${AXIS}, tile ${TILE_SIZE})…`);
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
    throw new Error(`bake failed for ${name}`);
  }
}

(async () => {
  const tsxBin = pickTsxBin();
  console.log(`pixel-forge tsx: ${tsxBin}`);
  console.log(`source dir:      ${SOURCE_DIR}`);
  console.log(`output dir:      ${OUT_DIR}\n`);

  for (const t of TREES) {
    await bakeOne(t, tsxBin);
  }

  console.log(`\n[bake] all ${TREES.length} trees done.`);
})().catch((err) => {
  console.error('[bake] FAILED:', err.message);
  process.exit(1);
});
