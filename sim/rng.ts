// SPDX-License-Identifier: AGPL-3.0-or-later
// mulberry32, lifted from sds/shared/Random.js (same license, same copyright
// holder). The rng parameter is REQUIRED at every sim call site; there is no
// default seed anywhere (spec/02).
//
// Transcription note: this form differs textually from sds (`a |= 0; a = (a +
// C) | 0` vs `a = (a + C) >>> 0`, and `t = (t + imul(...)) ^ t` vs
// `t ^= t + imul(...)`) but is BIT-IDENTICAL in output: ToInt32/ToUint32 agree
// on the underlying 32-bit pattern and XOR is commutative. Verified
// empirically against sds across 8 seeds x 200k draws, zero mismatches
// (phase 1 audit). Do not "fix" it back, and do not assume other edits here
// are equally safe: any real change desyncs multiplayer.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
