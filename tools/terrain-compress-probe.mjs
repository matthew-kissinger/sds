#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 100 measuring spike: how compressible are the baked terrain heightfields?
 *
 * Reads each public/terrain/<scene>.bin (1024x1024 raw float32, 4 MiB), and for
 * each candidate representation reports the compressed size with gzip(-9) and
 * brotli(q11) - the ceiling a pre-compressed static asset would hit.
 *
 * Candidates:
 *   - f32 raw                : the bytes we ship today
 *   - f32 byte-shuffled      : 4 byte-planes deinterleaved (lossless, exact)
 *   - i16 quant raw          : float -> uint16 over [min,max] (LOSSY, 2x smaller)
 *   - i16 quant byte-shuffled: + 2 byte-planes deinterleaved
 *
 * Lossless = f32 rows (no value change, no baseline moves).
 * Lossy    = i16 rows (sub-mm..mm error, but a recorded sim/refactor-baseline regen).
 *
 * Read-only. No writes. Run: node tools/terrain-compress-probe.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';

const SCENES = ['field', 'rolling-hills', 'open-country', 'newsheepdogland'];
const TERRAIN_DIR = resolve(import.meta.dirname, '..', 'public', 'terrain');

const KiB = (n) => (n / 1024).toFixed(1).padStart(8) + ' KiB';
const pct = (n, base) => ((n / base) * 100).toFixed(1).padStart(5) + '%';

/** Deinterleave an element-stride buffer into N byte-planes (lossless transpose). */
function bytePlaneShuffle(buf, stride) {
  const n = buf.length / stride;
  const out = Buffer.allocUnsafe(buf.length);
  for (let p = 0; p < stride; p++) {
    const planeBase = p * n;
    for (let i = 0; i < n; i++) out[planeBase + i] = buf[i * stride + p];
  }
  return out;
}

const gz = (b) => gzipSync(b, { level: 9 }).length;
const br = (b) =>
  brotliCompressSync(b, {
    params: { [zc.BROTLI_PARAM_QUALITY]: 11, [zc.BROTLI_PARAM_SIZE_HINT]: b.length },
  }).length;

/** float32 -> uint16 over observed [min,max]; returns {buf, maxErrM, range}. */
function quantizeI16(f32) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < f32.length; i++) {
    const v = f32[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const u16 = new Uint16Array(f32.length);
  let maxErr = 0;
  for (let i = 0; i < f32.length; i++) {
    const q = Math.round(((f32[i] - min) / range) * 65535);
    u16[i] = q;
    const back = min + (q / 65535) * range;
    const e = Math.abs(back - f32[i]);
    if (e > maxErr) maxErr = e;
  }
  return { buf: Buffer.from(u16.buffer), maxErrM: maxErr, range, min, max };
}

console.log(`\nTerrain compressibility probe (gzip -9 / brotli q11)\n${'='.repeat(72)}`);

const totals = { rawF32: 0, gzF32: 0, brF32: 0, gzF32sh: 0, brF32sh: 0, i16: 0, gzI16sh: 0, brI16sh: 0 };

for (const scene of SCENES) {
  const path = resolve(TERRAIN_DIR, `${scene}.bin`);
  const raw = readFileSync(path);
  const f32 = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);

  const f32sh = bytePlaneShuffle(raw, 4);
  const q = quantizeI16(f32);
  const i16sh = bytePlaneShuffle(q.buf, 2);

  const rawF32 = raw.length;
  const gzF32 = gz(raw);
  const brF32 = br(raw);
  const gzF32sh = gz(f32sh);
  const brF32sh = br(f32sh);
  const i16raw = q.buf.length;
  const gzI16 = gz(q.buf);
  const brI16 = br(q.buf);
  const gzI16sh = gz(i16sh);
  const brI16sh = br(i16sh);

  totals.rawF32 += rawF32;
  totals.gzF32 += gzF32;
  totals.brF32 += brF32;
  totals.gzF32sh += gzF32sh;
  totals.brF32sh += brF32sh;
  totals.i16 += i16raw;
  totals.gzI16sh += gzI16sh;
  totals.brI16sh += brI16sh;

  console.log(`\n${scene}  (range ${q.min.toFixed(2)}..${q.max.toFixed(2)} m, i16 step ${(q.range / 65535).toFixed(5)} m, max quant err ${(q.maxErrM * 1000).toFixed(3)} mm)`);
  console.log(`  LOSSLESS  f32 raw        ${KiB(rawF32)}  (baseline on wire)`);
  console.log(`  LOSSLESS  f32 gzip       ${KiB(gzF32)}  ${pct(gzF32, rawF32)} of raw`);
  console.log(`  LOSSLESS  f32 brotli     ${KiB(brF32)}  ${pct(brF32, rawF32)} of raw`);
  console.log(`  LOSSLESS  f32 sh gzip    ${KiB(gzF32sh)}  ${pct(gzF32sh, rawF32)} of raw`);
  console.log(`  LOSSLESS  f32 sh brotli  ${KiB(brF32sh)}  ${pct(brF32sh, rawF32)} of raw`);
  console.log(`  LOSSY     i16 raw        ${KiB(i16raw)}  ${pct(i16raw, rawF32)} of raw`);
  console.log(`  LOSSY     i16 gzip       ${KiB(gzI16)}  ${pct(gzI16, rawF32)} of raw`);
  console.log(`  LOSSY     i16 brotli     ${KiB(brI16)}  ${pct(brI16, rawF32)} of raw`);
  console.log(`  LOSSY     i16 sh gzip    ${KiB(gzI16sh)}  ${pct(gzI16sh, rawF32)} of raw`);
  console.log(`  LOSSY     i16 sh brotli  ${KiB(brI16sh)}  ${pct(brI16sh, rawF32)} of raw`);
}

console.log(`\n${'='.repeat(72)}\nTOTAL across ${SCENES.length} scenes (vs ${KiB(totals.rawF32)} shipped today)`);
console.log(`  LOSSLESS  f32 gzip          ${KiB(totals.gzF32)}  ${pct(totals.gzF32, totals.rawF32)}`);
console.log(`  LOSSLESS  f32 brotli        ${KiB(totals.brF32)}  ${pct(totals.brF32, totals.rawF32)}`);
console.log(`  LOSSLESS  f32 shuffle gzip  ${KiB(totals.gzF32sh)}  ${pct(totals.gzF32sh, totals.rawF32)}`);
console.log(`  LOSSLESS  f32 shuffle brot  ${KiB(totals.brF32sh)}  ${pct(totals.brF32sh, totals.rawF32)}`);
console.log(`  LOSSY     i16 raw           ${KiB(totals.i16)}  ${pct(totals.i16, totals.rawF32)}`);
console.log(`  LOSSY     i16 shuffle gzip  ${KiB(totals.gzI16sh)}  ${pct(totals.gzI16sh, totals.rawF32)}`);
console.log(`  LOSSY     i16 shuffle brot  ${KiB(totals.brI16sh)}  ${pct(totals.brI16sh, totals.rawF32)}`);
console.log('');
