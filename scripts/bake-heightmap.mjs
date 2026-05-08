#!/usr/bin/env node
/**
 * Bake a Float32 R32F heightmap from 3-octave ridged fBm.
 *
 * CLI:
 *   --scene <id>          Scene id to embed in the manifest (required)
 *   --size <px>           Square heightmap edge length in pixels (default 1024)
 *   --worldSize <m>       World extent the heightmap covers in metres (default 400)
 *   --peakHeight <m>      Maximum vertical amplitude in metres (default 6)
 *   --seed <int>          Integer seed (default 1)
 *   --boundary <kind>     'rect' (default) or 'island' — island applies a radial
 *                         smoothstep falloff outside `radius - falloff` toward `seaLevel`.
 *   --radius <m>          Island radius in metres (only used when --boundary island, default 90)
 *   --falloff <m>         Island falloff width in metres (default 15)
 *   --seaLevel <m>        Height outside the falloff zone (default -2)
 *   --centerX <m>         Island centre X (default 0)
 *   --centerZ <m>         Island centre Z (default 0)
 *   --out <path>          Output binary path (required, conventionally `.bin`).
 *                         Format is still raw R32F floats; the `.bin` extension
 *                         is used so itch.io's CDN doesn't 403 on unrecognised
 *                         extensions like `.r32f`. A sibling `.json` manifest
 *                         is written next to it with shape
 *                         { width, height, worldSize, peakHeight, version, scene, seed,
 *                           boundary?: { kind, ... } }.
 *
 * Notes:
 *   - 3 octaves of ridged fBm: `ridge(n) = 1 - abs(n)`, amplitudes 1.0 / 0.4 / 0.15.
 *   - For scenes 'field' and 'rolling-hills' a 40m radius around (180, 160) (world
 *     coords, with origin at world centre) is flattened to 0 — that's the
 *     farmhouse footprint. 'open-country' and others are not flattened.
 *   - When peakHeight <= 0 the output is all zeros (`field` baseline) so consumers
 *     can use a single code path regardless of biome. The `--boundary island`
 *     falloff is applied AFTER hill generation, so peakHeight=0 + island gives
 *     a flat sea-level disc at peak.
 *   - Float32Array bytes are written raw, little-endian (Node default). Consumers
 *     should read with `new Float32Array(buf.buffer)`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createNoise2D } from 'simplex-noise';

/** Tiny mulberry32 PRNG so a given seed deterministically drives simplex-noise. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parse `--key value` pairs. Booleans and unknown keys are passed through. */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const FARMHOUSE_X = 180;
const FARMHOUSE_Z = 160;
const FARMHOUSE_RADIUS = 40;
const SCENES_WITH_FARMHOUSE = new Set(['field', 'rolling-hills']);

const args = parseArgs(process.argv.slice(2));

const scene = args.scene;
const out = args.out;
if (!scene || !out) {
  console.error('Usage: bake-heightmap.mjs --scene <id> --out <path> [--size 1024] [--worldSize 400] [--peakHeight 6] [--seed 1]');
  process.exit(1);
}

const size = Number(args.size ?? 1024);
const worldSize = Number(args.worldSize ?? 400);
const peakHeight = Number(args.peakHeight ?? 6);
const seed = Number(args.seed ?? 1);

const boundaryKind = (args.boundary ?? 'rect').toString();
if (boundaryKind !== 'rect' && boundaryKind !== 'island') {
  throw new Error(`Invalid --boundary ${args.boundary} (must be 'rect' or 'island')`);
}
const islandRadius = Number(args.radius ?? 90);
const islandFalloff = Number(args.falloff ?? 15);
const seaLevel = Number(args.seaLevel ?? -2);
const islandCenterX = Number(args.centerX ?? 0);
const islandCenterZ = Number(args.centerZ ?? 0);

if (!Number.isFinite(size) || size <= 0) throw new Error(`Invalid --size ${args.size}`);
if (!Number.isFinite(worldSize) || worldSize <= 0) throw new Error(`Invalid --worldSize ${args.worldSize}`);
if (!Number.isFinite(peakHeight)) throw new Error(`Invalid --peakHeight ${args.peakHeight}`);
if (!Number.isInteger(seed)) throw new Error(`--seed must be an integer, got ${args.seed}`);
if (boundaryKind === 'island') {
  if (!Number.isFinite(islandRadius) || islandRadius <= 0) throw new Error(`Invalid --radius ${args.radius}`);
  if (!Number.isFinite(islandFalloff) || islandFalloff < 0) throw new Error(`Invalid --falloff ${args.falloff}`);
  if (islandFalloff > islandRadius) throw new Error(`--falloff (${islandFalloff}) cannot exceed --radius (${islandRadius})`);
  if (!Number.isFinite(seaLevel)) throw new Error(`Invalid --seaLevel ${args.seaLevel}`);
}

const heights = new Float32Array(size * size);

const noise = peakHeight > 0 ? createNoise2D(mulberry32(seed)) : null;
const AMPLITUDES = [1.0, 0.4, 0.15];
const FREQUENCIES = [1, 2, 4];
const ampSum = AMPLITUDES.reduce((s, a) => s + a, 0);
const BASE_FREQ = 2 / worldSize;
const flatten = SCENES_WITH_FARMHOUSE.has(scene);
const halfWorld = worldSize / 2;
const islandSafeRadius = islandRadius - islandFalloff;

for (let z = 0; z < size; z++) {
  // Map pixel index → world coordinate centred on origin.
  const wz = (z / (size - 1)) * worldSize - halfWorld;
  for (let x = 0; x < size; x++) {
    const wx = (x / (size - 1)) * worldSize - halfWorld;

    let h = 0;
    if (peakHeight > 0 && noise) {
      for (let o = 0; o < AMPLITUDES.length; o++) {
        const f = BASE_FREQ * FREQUENCIES[o];
        const n = noise(wx * f, wz * f); // [-1, 1]
        const ridged = 1 - Math.abs(n); // [0, 1]
        h += ridged * AMPLITUDES[o];
      }
      h = (h / ampSum) * peakHeight; // [0, peakHeight]

      if (flatten) {
        const dx = wx - FARMHOUSE_X;
        const dz = wz - FARMHOUSE_Z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= FARMHOUSE_RADIUS) {
          h = 0;
        } else if (dist <= FARMHOUSE_RADIUS * 1.5) {
          // Soft falloff so the flattened pad doesn't have a hard rim.
          const t = (dist - FARMHOUSE_RADIUS) / (FARMHOUSE_RADIUS * 0.5);
          h *= t * t * (3 - 2 * t); // smoothstep
        }
      }
    }

    // Island radial falloff: blend computed h toward seaLevel across the
    // falloff band; clamp to seaLevel outside the radius. Mirrors the
    // existing farmhouse smoothstep math.
    if (boundaryKind === 'island') {
      const dx = wx - islandCenterX;
      const dz = wz - islandCenterZ;
      const distFromIsland = Math.sqrt(dx * dx + dz * dz);
      if (distFromIsland >= islandRadius) {
        h = seaLevel;
      } else if (distFromIsland > islandSafeRadius) {
        const t = (distFromIsland - islandSafeRadius) / islandFalloff;
        const ts = t * t * (3 - 2 * t); // smoothstep
        h = h * (1 - ts) + seaLevel * ts;
      }
    }

    heights[z * size + x] = h;
  }
}

const outAbs = resolve(out);
await mkdir(dirname(outAbs), { recursive: true });
await writeFile(outAbs, Buffer.from(heights.buffer));

const manifest = {
  width: size,
  height: size,
  worldSize,
  peakHeight,
  version: 1,
  scene,
  seed,
};
if (boundaryKind === 'island') {
  manifest.boundary = {
    kind: 'island',
    center: { x: islandCenterX, z: islandCenterZ },
    radius: islandRadius,
    falloff: islandFalloff,
    seaLevel,
  };
}
await writeFile(`${outAbs}.json`, JSON.stringify(manifest, null, 2) + '\n');

const expectedBytes = size * size * 4;
const islandSummary = boundaryKind === 'island'
  ? ` island(r=${islandRadius}, falloff=${islandFalloff}, sea=${seaLevel})`
  : '';
console.log(`Baked ${outAbs}: ${size}x${size} float32 (${expectedBytes} bytes), peakHeight=${peakHeight}, seed=${seed}${islandSummary}`);
