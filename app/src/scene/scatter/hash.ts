// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The deterministic draw. Every position, size, tilt and tint in the scatter
 * comes out of `hash01(index, salt)` and nothing else.
 *
 * BY HASH, NOT BY SEQUENCE, and the difference is worth stating because a
 * seeded stream would look equally deterministic and behave worse. A stream
 * couples every draw to every draw before it: inserting one rock at the front of
 * a cluster reshuffles the whole field, and a change meant to move one stone
 * turns into a diff nobody can review. A hash of the item's own index does not
 * do that. It is also order-free, which means the placement is identical across
 * reloads, identical on both renderer backends, and identical whether the rocks
 * or the flowers are generated first.
 *
 * There is no Math.random in this module or anything that calls it, and no
 * clock: spec/04's runtime scatter ban and the determinism the rest of the game
 * is built on both start here.
 */

/**
 * A value in [0, 1) from an index and a salt. The murmur3 finaliser over the
 * mixed pair, which decorrelates neighbouring indices well enough that
 * `hash01(k, SALT.yaw)` and `hash01(k, SALT.radius)` never rhyme.
 *
 * Integer-only: Math.imul keeps every step inside 32 bits, so this returns the
 * same bits in every engine the game runs in.
 */
export function hash01(index: number, salt: number): number {
  let h = (Math.imul(index | 0, 0x27d4eb2d) ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  // Back to unsigned before the divide. Math.imul and ^ both hand back a SIGNED
  // 32-bit value, so without this half the draws come out negative and every
  // caller that takes a square root of one gets NaN. Measured, not theoretical:
  // the first build placed 154 of 334 flower clumps at (NaN, NaN).
  return (h >>> 0) / 4294967296;
}

/** The same value mapped onto a range. */
export function range(index: number, salt: number, min: number, max: number): number {
  return min + (max - min) * hash01(index, salt);
}

/**
 * Salts, named so a reader can tell which draw moved when a number changes.
 * They are arbitrary constants and their only requirement is to differ; the
 * names carry the meaning.
 */
export const SALT = {
  around: 0x1a3f,
  radius: 0x2b71,
  yaw: 0x3c19,
  tilt: 0x4d05,
  wide: 0x5e63,
  tall: 0x6f27,
  size: 0x7048,
  keep: 0x8153,
  scale: 0x92a6,
  seed: 0xa3b4,
  species: 0xb4c8,
  droop: 0xc5d9,
} as const;

/**
 * The golden angle, in radians. Successive multiples never fall into a lane,
 * which is what keeps a spiral of items from reading as spokes.
 */
export const GOLDEN_ANGLE = 2.399963229728653;
