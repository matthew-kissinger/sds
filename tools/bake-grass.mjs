// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The grass recipe. Scatters every tuft in the game once, here, and commits the
// result under assets/grass/ (spec/04: every generated asset has an in-repo
// recipe; the runtime never bakes and never scatters - sds measured ~489 ms of
// load in a runtime Poisson pass and this field carries an order of magnitude
// more placements than that one did).
//
//   node tools/bake-grass.mjs               rebake into assets/grass/
//   node tools/bake-grass.mjs --out DIR     bake into DIR instead
//
// The output is byte-deterministic: same sources, same bytes, every run and
// every machine. tests/grass-bake.spec.ts rebakes into a temp directory and
// byte-compares against the committed files, so a recipe edit that was not
// meant to move a blade fails there.
//
// THIS BAKE HAS TWO INPUTS AND OWNS NEITHER OF THEM.
//
//  - sim/field.ts HOME_FIELD is the authority for the bounds, the gate and the
//    pen (spec/04: bake scripts read the layout, never carry their own copy).
//  - assets/terrain/ is the authority for the ground. Every tuft's Y comes from
//    the committed heightfield through the SAME `Heightfield.groundY` the
//    renderer and every other ground-sitting object uses, and the flattened
//    pads in that manifest are read as the scatter keep-out rects they are
//    declared to be. So a terrain rebake changes these bytes, the grass
//    byte-compare goes red, and the two assets cannot silently part ways.
//
// TUFTS, NOT BLADES. A record here is a clump; the blades inside it are the
// tuft mesh (app/src/scene/grass/tuftGeometry.ts), which is one small
// deterministic geometry shared by every instance. That is what keeps the
// committed asset under a megabyte (78k records, 12 bytes each) while the field
// carries half a million blades, and it is also the art direction: spec/05 asks
// for brushstroke masses, and a mass is the unit that should be placed.
//
// THE RECORD ORDER IS LOAD-BEARING. Records are shuffled with the seeded rng
// after placement, so ANY PREFIX of a group is a fair, evenly spread subset of
// it. That is the entire density-tier mechanism (spec/08): the reduced preset
// is not a second bake, it is a smaller instance count over the same buffer.

import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// The recipe. Every number that decides where a tuft stands lives here.
// ---------------------------------------------------------------------------

const RECIPE = {
  /** Bake format version. Bump when the byte layout or the fields change. */
  version: 1,
  /** The one seed. Change it and you get a different, equally valid meadow. */
  seed: 20260821,
  /**
   * The play area, metres from the origin on each axis. The fence is at 100
   * (HOME_FIELD.bounds, asserted below); this reaches six metres past it so the
   * grass the player walks the dog through does not end where the fence does.
   * Everything inside this square is the interactive tier.
   */
  fieldHalf: 106,
  /** Chebyshev radius the surround tier reaches. Past this there is only the
   *  flat skirt, and by then the grass has already faded to nothing. */
  surroundOuter: 190,

  /**
   * Candidate spacing, metres. Placement is a jittered grid at this pitch with
   * each candidate accepted against the density field, so this is the pitch of
   * the DENSEST ground (inside the fence) and everywhere else is thinner.
   * 0.72 m is measured, not chosen: a tuft is about 1 m across once its blades
   * splay, so at this pitch clumps overlap their neighbours and the meadow
   * closes. At 1.0 m they stop touching and the field reads as dots on a lawn -
   * which is exactly what the first bake looked like from the Classic camera.
   */
  fieldSpacing: 0.72,
  /** The same, for the surround. Coarser: it is scenery, not playfield. */
  surroundSpacing: 1.28,
  /** Fraction of a cell a candidate may wander from its centre. Below 1 the
   *  grid still shows through; at 1 clumps collide. 0.92 is the compromise. */
  jitter: 0.92,

  /** Where the open-field density starts giving way to the surround, metres. */
  openEdge: 104,
  /** Where it reaches its floor. */
  openFade: 150,
  /** Surround density floor, as a fraction of open-field density. */
  surroundFloor: 0.3,
  /** The last of the grass: from here it thins to nothing by `surroundOuter`. */
  outerFadeStart: 150,
  outerFadeEnd: 188,

  /**
   * The treeline ring, thinned per spec/04 ("thin out under the treeline
   * ring"). These radii are declared HERE because no module owns the treeline
   * yet; the tree scatter has to land inside this band, and inside
   * `surroundOuter`, so nothing stands on bare ground.
   */
  treelineInner: 114,
  treelineOuter: 140,
  /** How much of the grass the trees take. */
  treelineThinning: 0.45,

  /** Keep-out rim, metres: how far a hard cut takes to reach full density. */
  cutRim: 1.6,
  /** The farmyard: thinned and trodden rather than cut, so no barn floats. */
  farmyardDensity: 0.2,
  farmyardVigour: 0.5,
  farmyardRim: 5,
  /** The trodden approach south of the gate. Half-width comes from the gate. */
  gateLaneWidthScale: 1.6,
  gateLaneDepth: 14,
  gateLaneDensity: 0.34,
  gateLaneVigour: 0.55,
  gateLaneRim: 3.5,

  /** Vigour (height and colour health) at the outer edge of the open field. */
  surroundVigour: 0.72,

  /** Owner-directed continuous meadow: modest individual height variation,
   *  without short clearings alternating with isolated tall islands. */
  heightMin: 0.75,
  heightMax: 1.25,

  /** Encoding ranges. Positions are int16 over +/- this, in metres. */
  xzRange: 200,
  /** Ground height range, metres. The terrain amplitude is 2.4; this is slack. */
  yRange: 8,
};

/** Bytes per tuft record. See `writeRecord` for the layout. */
const STRIDE = 12;

// ---------------------------------------------------------------------------
// Inputs. HOME_FIELD and the heightfield sampler are bundled rather than
// re-implemented: a bake script with its own copy of the layout or its own
// copy of the ground is how sds ended up with two diverged zone tables.
// ---------------------------------------------------------------------------

const staging = mkdtempSync(join(tmpdir(), 'herd-bake-grass-'));
const entry = join(staging, 'grass-entry.ts');
writeFileSync(
  entry,
  [
    "export { HOME_FIELD } from '@sim/field';",
    "export { mulberry32 } from '@sim/rng';",
    "export { Heightfield } from '@app/world/heightfieldSampler';",
    '',
  ].join('\n'),
);
const bundle = join(staging, 'grass-inputs.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  alias: { '@sim': join(repo, 'sim'), '@app': join(repo, 'app', 'src') },
});
const { HOME_FIELD, mulberry32, Heightfield } = await import(pathToFileURL(bundle).href);

const terrainDir = join(repo, 'assets', 'terrain');
const terrainManifest = JSON.parse(readFileSync(join(terrainDir, 'manifest.json'), 'utf8'));
const terrainBytes = readFileSync(join(terrainDir, 'heightfield.bin'));
const heightfield = new Heightfield(
  new Float32Array(
    terrainBytes.buffer.slice(
      terrainBytes.byteOffset,
      terrainBytes.byteOffset + terrainBytes.byteLength,
    ),
  ),
  terrainManifest,
);

const { bounds, pen, gate } = HOME_FIELD;

// The recipe's fieldHalf is stated as "the fence plus six metres". Stating it
// and deriving it are different things; assert the relationship rather than
// letting a HOME_FIELD edit silently turn it into something else.
if (bounds.maxX !== 100 || bounds.maxZ !== 100 || bounds.minX !== -100 || bounds.minZ !== -100) {
  throw new Error(
    `bake-grass assumes the 200 m Home Field; HOME_FIELD.bounds is ` +
      `${JSON.stringify(bounds)}. Re-derive fieldHalf before rebaking.`,
  );
}

// ---------------------------------------------------------------------------
// Noise. Two octaves of seeded value noise, used for one thing only: the
// low-frequency lush and thin patches that keep a 200 m meadow from reading as
// one uniform pile. The renderer adds its own patch breakup at the terrain's
// frequencies on top of this (see grassMaterial.ts); this one is what decides
// where there are FEWER tufts, which only a bake can decide.
// ---------------------------------------------------------------------------

const NOISE_SEED = RECIPE.seed ^ 0x9e3779b9;

/** Deterministic integer hash to [0, 1). No Math.random, no float drift. */
function hash2(ix, iz) {
  let h = (ix * 0x27d4eb2d) ^ (iz * 0x165667b1) ^ NOISE_SEED;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smootherstep(x - ix);
  const fz = smootherstep(z - iz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

/** Broad meadow masses, with smaller irregular edges rather than uniform detail. */
function patchiness(x, z) {
  return valueNoise(x / 28, z / 28) * 0.8 + valueNoise(x / 7 + 31.7, z / 7 - 12.3) * 0.2;
}

// ---------------------------------------------------------------------------
// The density and vigour fields.
// ---------------------------------------------------------------------------

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** 1 in the middle of [a, b], 0 outside it, smooth at both ends. */
function ring(value, a, b) {
  const shoulder = (b - a) * 0.4;
  return smoothstep(a, a + shoulder, value) * (1 - smoothstep(b - shoulder, b, value));
}

/** 1 inside the rect, easing to 0 over `rim` metres outside it. */
function rectWeight(rect, x, z, rim) {
  const dx = Math.max(rect.minX - x, x - rect.maxX, 0);
  const dz = Math.max(rect.minZ - z, z - rect.maxZ, 0);
  return 1 - smoothstep(0, rim, Math.sqrt(dx * dx + dz * dz));
}

/**
 * The keep-outs, derived from the two authorities and from nothing else.
 *
 *  - the pen floor and the gate corridor are DRAWN (scene/Pen.tsx lays trodden
 *    earth over the pad), so grass there would grow through a floor: hard cut.
 *  - the farmhouse and barn pads are declared terrain pads, which spec/04 says
 *    are also scatter keep-outs. Thinned rather than cut: a yard with short trodden grass
 *    reads as a farmyard, bare ground reads as a bug.
 *  - the gate approach is the ground the whole flock is pushed across, twice a
 *    run. It wears.
 */
const PEN_RECT = { minX: pen.minX, maxX: pen.maxX, minZ: pen.minZ, maxZ: pen.maxZ };
const CORRIDOR_RECT = {
  minX: gate.position.x - gate.width / 2,
  maxX: gate.position.x + gate.width / 2,
  minZ: bounds.maxZ,
  maxZ: pen.minZ,
};
const GATE_LANE_RECT = {
  minX: gate.position.x - (gate.width / 2) * RECIPE.gateLaneWidthScale,
  maxX: gate.position.x + (gate.width / 2) * RECIPE.gateLaneWidthScale,
  minZ: bounds.maxZ - RECIPE.gateLaneDepth,
  maxZ: bounds.maxZ,
};
const FARMYARD_RECTS = terrainManifest.pads.filter((pad) => pad.id === 'farmhouse' || pad.id === 'barn');
if (FARMYARD_RECTS.length !== 2) {
  throw new Error('assets/terrain/manifest.json must have farmhouse and barn pads');
}

function farmyardWeight(x, z) {
  let weight = 0;
  for (const rect of FARMYARD_RECTS) {
    weight = Math.max(weight, rectWeight(rect, x, z, RECIPE.farmyardRim));
  }
  return weight;
}

/**
 * Tufts per candidate cell, in [0, 1]: the probability that a jittered-grid
 * candidate at (x, z) becomes a tuft.
 */
function density(x, z) {
  const radius = Math.max(Math.abs(x), Math.abs(z));

  // Open field, then the surround floor, then nothing at all.
  const open = 1 - smoothstep(RECIPE.openEdge, RECIPE.openFade, radius);
  let d = RECIPE.surroundFloor + (1 - RECIPE.surroundFloor) * open;
  d *= 1 - smoothstep(RECIPE.outerFadeStart, RECIPE.outerFadeEnd, radius);

  // Under the trees.
  d *= 1 - RECIPE.treelineThinning * ring(radius, RECIPE.treelineInner, RECIPE.treelineOuter);

  // Maintain an evenly dense field. Only subtle density variation remains;
  // paths, structures and authored boundary thinning retain their keep-outs.
  d *= 0.92 + 0.08 * patchiness(x, z);

  // Keep-outs.
  const penned = Math.max(
    rectWeight(PEN_RECT, x, z, RECIPE.cutRim),
    rectWeight(CORRIDOR_RECT, x, z, RECIPE.cutRim),
  );
  d *= 1 - penned;
  d *= 1 - (1 - RECIPE.farmyardDensity) * farmyardWeight(x, z);
  d *= 1 - (1 - RECIPE.gateLaneDensity) * rectWeight(GATE_LANE_RECT, x, z, RECIPE.gateLaneRim);

  return clamp01(d);
}

/**
 * How well the grass is doing at (x, z), in [0, 1]. Drives height and colour in
 * the shader, not placement: trodden ground keeps its tufts and loses its
 * stature, which is what makes a worn lane read as worn rather than as missing.
 */
function vigour(x, z) {
  const radius = Math.max(Math.abs(x), Math.abs(z));
  const open = 1 - smoothstep(RECIPE.openEdge, RECIPE.openFade, radius);
  let v = RECIPE.surroundVigour + (1 - RECIPE.surroundVigour) * open;
  v *= 1 - (1 - RECIPE.farmyardVigour) * farmyardWeight(x, z);
  v *= 1 - (1 - RECIPE.gateLaneVigour) * rectWeight(GATE_LANE_RECT, x, z, RECIPE.gateLaneRim);
  v *= 0.78 + 0.22 * patchiness(x + 57.3, z - 41.9);
  return clamp01(v);
}

// ---------------------------------------------------------------------------
// Placement.
// ---------------------------------------------------------------------------

/**
 * One group of tufts. `field` is the square the entities live in and is the
 * only tier that pays for grass interaction; `surround` is everything beyond
 * it, drawn with a cheaper tuft and no interaction at all, because no body in
 * this game can reach it (the sim clamps every entity inside the fence).
 */
function scatter(rng, { spacing, minRadius, maxRadius }) {
  const records = [];
  const half = maxRadius;
  const cells = Math.ceil((half * 2) / spacing);
  const origin = -half;
  const wander = spacing * RECIPE.jitter;

  for (let iz = 0; iz < cells; iz++) {
    for (let ix = 0; ix < cells; ix++) {
      // Five draws per cell, always, whether or not the candidate is kept: the
      // rng stream must not depend on the acceptance test, or a density tweak
      // in one corner of the field would reshuffle the whole meadow.
      const jx = rng();
      const jz = rng();
      const keep = rng();
      const seed = rng();
      const heightDraw = rng();

      const x = origin + (ix + 0.5) * spacing + (jx - 0.5) * wander;
      const z = origin + (iz + 0.5) * spacing + (jz - 0.5) * wander;

      const radius = Math.max(Math.abs(x), Math.abs(z));
      if (radius < minRadius || radius >= maxRadius) continue;
      if (keep >= density(x, z)) continue;

      records.push({
        x,
        z,
        y: heightfield.groundY(x, z),
        // Yaw is a free draw from the seed rather than a sixth call: one hash
        // of the seed gives a decorrelated angle and keeps the stream short.
        yaw: (seed * 977.13) % (Math.PI * 2),
        seed,
        height: RECIPE.heightMin + (RECIPE.heightMax - RECIPE.heightMin) * heightDraw,
        vigour: vigour(x, z),
      });
    }
  }
  return records;
}

/** Fisher-Yates from the same stream. See the header: prefixes are the tiers. */
function shuffle(records, rng) {
  for (let i = records.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = records[i];
    records[i] = records[j];
    records[j] = swap;
  }
}

const rng = mulberry32(RECIPE.seed);
const field = scatter(rng, {
  spacing: RECIPE.fieldSpacing,
  minRadius: 0,
  maxRadius: RECIPE.fieldHalf,
});
shuffle(field, rng);
const surround = scatter(rng, {
  spacing: RECIPE.surroundSpacing,
  minRadius: RECIPE.fieldHalf,
  maxRadius: RECIPE.surroundOuter,
});
shuffle(surround, rng);

// ---------------------------------------------------------------------------
// Write. Explicit little-endian, so the bytes do not depend on the machine.
// ---------------------------------------------------------------------------

const groups = [
  { id: 'field', records: field },
  { id: 'surround', records: surround },
];
const total = field.length + surround.length;
const bytes = Buffer.alloc(total * STRIDE);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const XZ_SCALE = 32767 / RECIPE.xzRange;
const Y_SCALE = 32767 / RECIPE.yRange;
const YAW_SCALE = 65536 / (Math.PI * 2);

/**
 * Twelve bytes a tuft:
 *
 *   0  int16   x       metres * 32767 / xzRange
 *   2  int16   z
 *   4  int16   y       the committed ground under it, metres * 32767 / yRange
 *   6  uint16  yaw     radians * 65536 / 2pi
 *   8  uint16  seed    the tuft's own random word: tint, lean, wind phase
 *  10  uint8   height  heightMin..heightMax across 0..255
 *  11  uint8   vigour  0..1 across 0..255
 *
 * Quantised, and the quantisation is the point: at 0.006 m of position and 0.0001
 * rad of yaw nothing is visible, and the whole half-million-blade meadow lands
 * in under a megabyte instead of five.
 */
function writeRecord(offset, record) {
  view.setInt16(offset, Math.round(record.x * XZ_SCALE), true);
  view.setInt16(offset + 2, Math.round(record.z * XZ_SCALE), true);
  view.setInt16(offset + 4, Math.round(record.y * Y_SCALE), true);
  view.setUint16(offset + 6, Math.round(record.yaw * YAW_SCALE) & 0xffff, true);
  view.setUint16(offset + 8, Math.floor(record.seed * 65536) & 0xffff, true);
  view.setUint8(
    offset + 10,
    Math.round(
      ((record.height - RECIPE.heightMin) / (RECIPE.heightMax - RECIPE.heightMin)) * 255,
    ),
  );
  view.setUint8(offset + 11, Math.round(record.vigour * 255));
}

let cursor = 0;
const manifestGroups = [];
for (const group of groups) {
  const offset = cursor / STRIDE;
  for (const record of group.records) {
    writeRecord(cursor, record);
    cursor += STRIDE;
  }
  manifestGroups.push({ id: group.id, offset, count: group.records.length });
}

const outFlag = process.argv.indexOf('--out');
const outDir = outFlag === -1 ? join(repo, 'assets', 'grass') : resolve(process.argv[outFlag + 1]);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'tufts.bin'), bytes);

const manifest = {
  version: RECIPE.version,
  recipe: 'tools/bake-grass.mjs',
  seed: RECIPE.seed,
  format: 'tuft12',
  stride: STRIDE,
  /** The terrain bake these heights were sampled from. A mismatch is a rebake. */
  terrainSeed: terrainManifest.seed,
  encoding: {
    xzRange: RECIPE.xzRange,
    yRange: RECIPE.yRange,
    heightMin: RECIPE.heightMin,
    heightMax: RECIPE.heightMax,
  },
  /** Where the grass is, so the treeline and the scatter can stay inside it. */
  footprint: {
    fieldHalf: RECIPE.fieldHalf,
    surroundOuter: RECIPE.surroundOuter,
    treelineInner: RECIPE.treelineInner,
    treelineOuter: RECIPE.treelineOuter,
  },
  groups: manifestGroups,
};
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const report = manifestGroups
  .map((group) => `  ${group.id}: ${group.count} tufts at offset ${group.offset}`)
  .join('\n');
console.log(
  `baked ${total} tufts (${bytes.length} bytes, ${STRIDE} B each)\n` +
    `${report}\n` +
    `  footprint ${RECIPE.fieldHalf} m field, ${RECIPE.surroundOuter} m surround`,
);
