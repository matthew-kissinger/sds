// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The terrain recipe. Bakes the Home Field's relief to a raw R32F grid plus a
// manifest, both committed under assets/terrain/ (spec/04: every generated
// asset has an in-repo recipe; the runtime never bakes and never scatters).
//
//   node tools/bake-terrain.mjs               rebake into assets/terrain/
//   node tools/bake-terrain.mjs --out DIR     bake into DIR instead
//
// The output is byte-deterministic: same source, same bytes, every run and
// every machine. tests/terrain-bake.spec.ts rebakes into a temp directory and
// byte-compares against the committed files, so a recipe edit that was not
// meant to change the world fails there.
//
// WHAT THE RELIEF IS FOR. It is VISUAL ONLY (spec/04). The sim is flat 2D and
// never reads this; nothing here can change where a sheep goes. The numbers are
// chosen so the ground rolls enough to catch golden-hour light and hide a
// horizon seam, and never enough to occlude a sheep from the Classic camera:
// the recipe is checked against a maximum-gradient budget below and in the
// test, because "gently rolling" has to be a number to stay true.
//
// The pen, gate approach, farmhouse and barn sites are flattened pads with
// smoothstep rims. Those rects are also the scatter keep-out rects: a pad is
// where a structure sits, and a structure's ground carries no rocks or
// wildflowers. One list, in the manifest, so the terrain and the scatter bake
// cannot disagree about where the farmyard is.

import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// The recipe. Every number that shapes the ground lives here and nowhere else.
// ---------------------------------------------------------------------------

const RECIPE = {
  /** Bake format version. Bump when the byte layout or the fields change. */
  version: 1,
  /** The one seed. Change it and you get a different, equally valid field. */
  seed: 20260821,
  /** Samples per side. Odd, so the field centre lands exactly on a sample. */
  gridSize: 161,
  /** Side length of the square footprint, metres, centred on the origin. */
  worldSize: 400,
  /** Peak |height| in metres after normalisation. A few metres across 200 m. */
  amplitude: 2.4,
  /** fBm octaves, coarsest first. */
  octaves: 4,
  /** Wavelength of the coarsest octave, metres. */
  baseWavelength: 260,
  /** Octave frequency multiplier. */
  lacunarity: 2,
  /** Octave amplitude multiplier. Low, so the field stays broad and calm. */
  gain: 0.42,
  /** Domain warp, metres. Breaks the grid-aligned look of raw Perlin. */
  warpStrength: 16,
  /** Wavelength of the warp field, metres. */
  warpWavelength: 190,
  /** Chebyshev radius where the relief starts easing to the flat surround. */
  edgeFadeStart: 150,
  /** Chebyshev radius where it reaches flat. Equals worldSize / 2. */
  edgeFadeEnd: 200,
};

/**
 * Slope budget, rise over run. A sheep stands 1.1 m and the Classic camera
 * looks down at 50 degrees (tan 1.19), so anything under this cannot put a
 * sheep behind a rise. The bake fails loudly rather than shipping a hill.
 */
const MAX_GRADIENT = 0.18;

/** Pad geometry that is not derivable from HOME_FIELD, in metres. */
const PAD_RECIPE = {
  /** Margin around the pen rect, so the pen fence stands on level ground. */
  penMargin: 4,
  /** How far south of the gate line the approach stays flat. */
  gateApproach: 8,
  /** Rim width: the smoothstep from a pad's level back into the roll. */
  penRim: 16,
  /** The farmhouse site, east of the pen. Offsets from the pen rect. */
  farmhouse: { eastOffset: 10, width: 36, northOffset: 2, depth: 36, rim: 16 },
  /** The barn site, beyond the retirement pasture. Offsets from its north-west. */
  barn: { westInset: 28, width: 28, northGap: 5, depth: 18, rim: 14 },
};

// ---------------------------------------------------------------------------
// HOME_FIELD is the sole authority for the pen, the gate and the bounds
// (spec/04). Bundle it rather than copying the numbers: a bake script with its
// own zone table is exactly how sds ended up with two diverged copies.
// ---------------------------------------------------------------------------

const staging = mkdtempSync(join(tmpdir(), 'herd-bake-terrain-'));
const entry = join(staging, 'field-entry.ts');
writeFileSync(
  entry,
  "export { HOME_FIELD } from '@sim/field';\nexport { mulberry32 } from '@sim/rng';\n",
);
const bundle = join(staging, 'field.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  alias: { '@sim': join(repo, 'sim') },
});
const { HOME_FIELD, mulberry32 } = await import(pathToFileURL(bundle).href);

// ---------------------------------------------------------------------------
// Seeded Perlin. Gradient noise rather than value noise: value noise at this
// few octaves reads as a quilt, and the quilt survives the toon ramp.
// ---------------------------------------------------------------------------

/** 8 unit-ish gradients. Fixed table, so the field is reproducible anywhere. */
const GRADIENTS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071067811865476, 0.7071067811865476],
  [-0.7071067811865476, 0.7071067811865476],
  [0.7071067811865476, -0.7071067811865476],
  [-0.7071067811865476, -0.7071067811865476],
];

/** Fisher-Yates over 0..255 from the seeded stream, mirrored to 512 for wrap. */
function permutationTable(seed) {
  const rng = mulberry32(seed);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = base[i];
    base[i] = base[j];
    base[j] = swap;
  }
  const table = new Uint8Array(512);
  for (let i = 0; i < 512; i++) table[i] = base[i & 255];
  return table;
}

const PERM = permutationTable(RECIPE.seed);

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function perlin(x, y) {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[xi] + yi] & 7;
  const ab = PERM[PERM[xi] + yi + 1] & 7;
  const ba = PERM[PERM[xi + 1] + yi] & 7;
  const bb = PERM[PERM[xi + 1] + yi + 1] & 7;

  const g = (index, dx, dy) => GRADIENTS[index][0] * dx + GRADIENTS[index][1] * dy;

  const x1 = g(aa, xf, yf) + u * (g(ba, xf - 1, yf) - g(aa, xf, yf));
  const x2 = g(ab, xf, yf - 1) + u * (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1));
  return x1 + v * (x2 - x1);
}

/** Domain-warped fBm in roughly [-1, 1]. Deterministic pure arithmetic. */
function fbm(x, z) {
  const wf = 1 / RECIPE.warpWavelength;
  const wx = x + RECIPE.warpStrength * perlin(x * wf + 41.7, z * wf - 17.3);
  const wz = z + RECIPE.warpStrength * perlin(x * wf - 88.1, z * wf + 63.9);

  let amplitude = 1;
  let frequency = 1 / RECIPE.baseWavelength;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < RECIPE.octaves; octave++) {
    sum += perlin(wx * frequency + octave * 137.13, wz * frequency - octave * 91.7) * amplitude;
    norm += amplitude;
    amplitude *= RECIPE.gain;
    frequency *= RECIPE.lacunarity;
  }
  return sum / norm;
}

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Pads: the flattened rects, derived from HOME_FIELD where HOME_FIELD knows.
// ---------------------------------------------------------------------------

const { bounds, pen } = HOME_FIELD;
const farm = PAD_RECIPE.farmhouse;
const barn = PAD_RECIPE.barn;

/**
 * Pads are applied in declaration order. Pads sharing a `terrace` are levelled
 * together: one height measured over the union of their rects, so a farmyard
 * reads as one graded place instead of two shelves with a step between them.
 */
const PAD_RECTS = [
  {
    // The gate approach, the corridor and the pen, as one pad: the perimeter
    // gate and the pen's south fence frame the same opening (sim/field.ts), so
    // they have to stand at the same height or the corridor develops a step.
    id: 'pen-and-gate',
    minX: pen.minX - PAD_RECIPE.penMargin,
    maxX: pen.maxX + PAD_RECIPE.penMargin,
    minZ: bounds.maxZ - PAD_RECIPE.gateApproach,
    maxZ: pen.maxZ + PAD_RECIPE.penMargin,
    rim: PAD_RECIPE.penRim,
    terrace: 'farmyard',
  },
  {
    // The farmhouse site, east of the pen (spec/04: part of the pen's
    // backdrop). Flat so the building sits rather than floats,
    // and on the pen's terrace so the ground between the pen fence and the
    // house has no step in it and the two rims never fight each other.
    id: 'farmhouse',
    minX: pen.maxX + farm.eastOffset,
    maxX: pen.maxX + farm.eastOffset + farm.width,
    minZ: pen.minZ + farm.northOffset,
    maxZ: pen.minZ + farm.northOffset + farm.depth,
    rim: farm.rim,
    terrace: 'farmyard',
  },
  {
    // The barn now anchors the view beyond the retirement pasture. The whole
    // pad begins north of its back rail, and shares the farmyard terrace so the
    // narrow grass interval between rail and building cannot form a step.
    id: 'barn',
    minX: pen.minX + barn.westInset,
    maxX: pen.minX + barn.westInset + barn.width,
    minZ: pen.maxZ + barn.northGap,
    maxZ: pen.maxZ + barn.northGap + barn.depth,
    rim: barn.rim,
    terrace: 'farmyard',
  },
];

/** 1 inside the rect, smoothstepping to 0 over `rim` metres outside it. */
function padWeight(pad, x, z) {
  const dx = Math.max(pad.minX - x, x - pad.maxX, 0);
  const dz = Math.max(pad.minZ - z, z - pad.maxZ, 0);
  const distance = Math.sqrt(dx * dx + dz * dz);
  return 1 - smoothstep(0, pad.rim, distance);
}

// ---------------------------------------------------------------------------
// Bake.
// ---------------------------------------------------------------------------

const { gridSize, worldSize } = RECIPE;
const half = worldSize / 2;
const spacing = worldSize / (gridSize - 1);
const worldX = (ix) => -half + ix * spacing;
const worldZ = (iz) => -half + iz * spacing;

/**
 * Pad rects snap OUTWARD to grid lines. A pad edge that falls between samples
 * leaves the sample just outside it a little off the level, and a bilinear or
 * triangle query near that edge picks it up: the rect would be "flat" at its
 * centre and a centimetre off at its border, which is exactly the kind of
 * almost-true that puts a fence post in the air. Snapped, every sample from
 * the border inward is exactly the level, so the whole declared rect is flat.
 */
const snapDown = (world) => Math.floor((world + half) / spacing) * spacing - half;
const snapUp = (world) => Math.ceil((world + half) / spacing) * spacing - half;
const PADS = PAD_RECTS.map((pad) => ({
  ...pad,
  minX: snapDown(pad.minX),
  maxX: snapUp(pad.maxX),
  minZ: snapDown(pad.minZ),
  maxZ: snapUp(pad.maxZ),
}));

// Pass 1: raw fBm, and the peak that normalises it. Normalising against the
// measured peak is what makes `amplitude` an exact promise instead of a hope.
const heights = new Float32Array(gridSize * gridSize);
let peak = 0;
for (let iz = 0; iz < gridSize; iz++) {
  for (let ix = 0; ix < gridSize; ix++) {
    const value = fbm(worldX(ix), worldZ(iz));
    heights[iz * gridSize + ix] = value;
    if (Math.abs(value) > peak) peak = Math.abs(value);
  }
}

// Pass 2: to metres, then ease to flat at the footprint edge so the displaced
// grid meets the flat surround skirt with no step to catch the light.
const scale = RECIPE.amplitude / peak;
for (let iz = 0; iz < gridSize; iz++) {
  const z = worldZ(iz);
  for (let ix = 0; ix < gridSize; ix++) {
    const x = worldX(ix);
    const radial = Math.max(Math.abs(x), Math.abs(z));
    const falloff = 1 - smoothstep(RECIPE.edgeFadeStart, RECIPE.edgeFadeEnd, radial);
    // The `+ 0` collapses negative zero: a faded-out negative height would
    // otherwise write -0, which is a different byte pattern for the same
    // height and makes every equality check downstream a trap.
    heights[iz * gridSize + ix] = heights[iz * gridSize + ix] * scale * falloff + 0;
  }
}

// Pass 3: pads. The level is the mean of the ground the pad replaces, rounded
// so the manifest number and the baked bytes agree exactly; consumers that
// want the pad height read the manifest rather than re-deriving it.
const inRect = (rect, x, z) => x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;

/** Declaration-ordered terrace groups; a pad without one is its own group. */
const terraces = [];
for (const pad of PADS) {
  const key = pad.terrace ?? pad.id;
  const existing = terraces.find((group) => group.key === key);
  if (existing) existing.members.push(pad);
  else terraces.push({ key, members: [pad] });
}

const pads = [];
for (const group of terraces) {
  let sum = 0;
  let samples = 0;
  for (let iz = 0; iz < gridSize; iz++) {
    const z = worldZ(iz);
    for (let ix = 0; ix < gridSize; ix++) {
      const x = worldX(ix);
      if (!group.members.some((rect) => inRect(rect, x, z))) continue;
      sum += heights[iz * gridSize + ix];
      samples++;
    }
  }
  if (samples === 0) throw new Error(`terrace "${group.key}" covers no grid sample`);
  const level = Math.round((sum / samples) * 1000) / 1000;

  for (const { terrace: _terrace, ...pad } of group.members) {
    for (let iz = 0; iz < gridSize; iz++) {
      const z = worldZ(iz);
      if (z < pad.minZ - pad.rim || z > pad.maxZ + pad.rim) continue;
      for (let ix = 0; ix < gridSize; ix++) {
        const x = worldX(ix);
        if (x < pad.minX - pad.rim || x > pad.maxX + pad.rim) continue;
        const weight = padWeight(pad, x, z);
        if (weight <= 0) continue;
        const index = iz * gridSize + ix;
        heights[index] = heights[index] + (level - heights[index]) * weight;
      }
    }
    pads.push({ ...pad, level });
  }
}

// ---------------------------------------------------------------------------
// Budget check: gently rolling has to be a number.
// ---------------------------------------------------------------------------

let maxGradient = 0;
let lowest = Infinity;
let highest = -Infinity;
for (let iz = 0; iz < gridSize; iz++) {
  for (let ix = 0; ix < gridSize; ix++) {
    const h = heights[iz * gridSize + ix];
    if (h < lowest) lowest = h;
    if (h > highest) highest = h;
    if (ix + 1 < gridSize) {
      const g = Math.abs(heights[iz * gridSize + ix + 1] - h) / spacing;
      if (g > maxGradient) maxGradient = g;
    }
    if (iz + 1 < gridSize) {
      const g = Math.abs(heights[(iz + 1) * gridSize + ix] - h) / spacing;
      if (g > maxGradient) maxGradient = g;
    }
  }
}
if (maxGradient > MAX_GRADIENT) {
  console.error(
    `terrain gradient ${maxGradient.toFixed(4)} exceeds the budget ${MAX_GRADIENT}: ` +
      'lower amplitude or raise baseWavelength before committing.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write. Explicit little-endian, so the bytes do not depend on the machine.
// ---------------------------------------------------------------------------

const outFlag = process.argv.indexOf('--out');
const outDir = outFlag === -1 ? join(repo, 'assets', 'terrain') : resolve(process.argv[outFlag + 1]);
mkdirSync(outDir, { recursive: true });

const bytes = Buffer.alloc(heights.length * 4);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
for (let i = 0; i < heights.length; i++) view.setFloat32(i * 4, heights[i], true);
writeFileSync(join(outDir, 'heightfield.bin'), bytes);

const manifest = {
  version: RECIPE.version,
  recipe: 'tools/bake-terrain.mjs',
  seed: RECIPE.seed,
  format: 'r32f',
  // Row-major, index = iz * width + ix, ix east from -worldSize/2, iz south
  // from -worldSize/2. Sample ix = width - 1 sits exactly on +worldSize/2, so
  // the terrain mesh's vertices land on grid samples with nothing to resample.
  width: gridSize,
  height: gridSize,
  worldSize,
  spacing,
  amplitude: RECIPE.amplitude,
  relief: Math.round((highest - lowest) * 1000) / 1000,
  maxGradient: Math.round(maxGradient * 10000) / 10000,
  noise: {
    octaves: RECIPE.octaves,
    baseWavelength: RECIPE.baseWavelength,
    lacunarity: RECIPE.lacunarity,
    gain: RECIPE.gain,
    warpStrength: RECIPE.warpStrength,
    warpWavelength: RECIPE.warpWavelength,
    edgeFadeStart: RECIPE.edgeFadeStart,
    edgeFadeEnd: RECIPE.edgeFadeEnd,
  },
  // Flattened pads. Also the scatter keep-out rects: a structure's ground
  // carries no rocks or flowers, and the two lists must never diverge.
  pads,
};
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `baked ${gridSize}x${gridSize} R32F (${bytes.length} bytes) over ${worldSize} m\n` +
    `  relief ${manifest.relief} m, max gradient ${manifest.maxGradient} ` +
    `(budget ${MAX_GRADIENT}), amplitude ${RECIPE.amplitude} m\n` +
    pads.map((pad) => `  pad ${pad.id} level ${pad.level} m, rim ${pad.rim} m`).join('\n'),
);
