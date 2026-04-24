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
 *   --out <path>          Output .r32f path (required). A sibling .json manifest
 *                         is written next to it with shape
 *                         { width, height, worldSize, peakHeight, version, scene, seed }.
 *
 * Notes:
 *   - 3 octaves of ridged fBm: `ridge(n) = 1 - abs(n)`, amplitudes 1.0 / 0.4 / 0.15.
 *   - For scenes 'field' and 'rolling-hills' a 40m radius around (180, 160) (world
 *     coords, with origin at world centre) is flattened to 0 — that's the
 *     farmhouse footprint. 'open-country' and others are not flattened.
 *   - When peakHeight <= 0 the output is all zeros (`field` baseline) so consumers
 *     can use a single code path regardless of biome.
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

if (!Number.isFinite(size) || size <= 0) throw new Error(`Invalid --size ${args.size}`);
if (!Number.isFinite(worldSize) || worldSize <= 0) throw new Error(`Invalid --worldSize ${args.worldSize}`);
if (!Number.isFinite(peakHeight)) throw new Error(`Invalid --peakHeight ${args.peakHeight}`);
if (!Number.isInteger(seed)) throw new Error(`--seed must be an integer, got ${args.seed}`);

const heights = new Float32Array(size * size);

if (peakHeight > 0) {
  const noise = createNoise2D(mulberry32(seed));
  // Octave amplitudes per the plan; sum so we can normalise the ridged stack to [0, peakHeight].
  const AMPLITUDES = [1.0, 0.4, 0.15];
  const FREQUENCIES = [1, 2, 4];
  const ampSum = AMPLITUDES.reduce((s, a) => s + a, 0);

  // Base frequency: ~2 ridges across the world extent gives gentle hills.
  const BASE_FREQ = 2 / worldSize;
  const flatten = SCENES_WITH_FARMHOUSE.has(scene);
  const halfWorld = worldSize / 2;

  for (let z = 0; z < size; z++) {
    // Map pixel index → world coordinate centred on origin.
    const wz = (z / (size - 1)) * worldSize - halfWorld;
    for (let x = 0; x < size; x++) {
      const wx = (x / (size - 1)) * worldSize - halfWorld;

      let h = 0;
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

      heights[z * size + x] = h;
    }
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
await writeFile(`${outAbs}.json`, JSON.stringify(manifest, null, 2) + '\n');

const expectedBytes = size * size * 4;
console.log(`Baked ${outAbs}: ${size}x${size} float32 (${expectedBytes} bytes), peakHeight=${peakHeight}, seed=${seed}`);
