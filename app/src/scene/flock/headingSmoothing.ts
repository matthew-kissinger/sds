// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Presentation-only shortest-arc heading smoothing shared by both animals. */

/**
 * Rotate one unit heading toward another with an exponential response, a
 * sustained turn rate in radians per second and a displayed-frame catch-up
 * ceiling. The output is written into a caller-owned buffer so flock updates
 * allocate nothing. The returned signed angle is the step actually applied,
 * used by diagnostics without repeating the atan2.
 */
export function smoothHeadingInto(
  out: Float32Array,
  at: number,
  currentX: number,
  currentZ: number,
  targetX: number,
  targetZ: number,
  dt: number,
  tau: number,
  snapCeiling: number,
  maxRate = Number.POSITIVE_INFINITY,
): number {
  const targetLength = Math.sqrt(targetX * targetX + targetZ * targetZ);
  if (targetLength < 1e-8) {
    out[at] = currentX;
    out[at + 1] = currentZ;
    return 0;
  }
  const currentLength = Math.sqrt(currentX * currentX + currentZ * currentZ);
  const cx = currentLength < 1e-8 ? targetX / targetLength : currentX / currentLength;
  const cz = currentLength < 1e-8 ? targetZ / targetLength : currentZ / currentLength;
  const tx = targetX / targetLength;
  const tz = targetZ / targetLength;
  const dot = Math.max(-1, Math.min(1, cx * tx + cz * tz));
  const cross = cx * tz - cz * tx;
  const delta = Math.atan2(cross, dot);
  const blend = dt > 0 && tau > 0 ? 1 - Math.exp(-dt / tau) : dt > 0 ? 1 : 0;
  // Two different jobs, so two limits. The rate is the fastest sustained turn
  // the presentation may show; expressed per second it stops depending on the
  // display, which a per-frame value does not: 0.14 rad a frame is 481 deg/s at
  // 60 Hz and 962 deg/s on a 120 Hz phone.
  // The exponential remains frame-rate independent during ordinary rendering.
  // After a long or CPU-throttled frame, however, consuming all elapsed time in
  // one displayed transform is itself a visible snap, and a rate times a long
  // delta does not bound that. Let presentation lag for a few frames instead of
  // rotating the animal by a large angle at once.
  const byRate = dt > 0 && maxRate < Number.POSITIVE_INFINITY ? maxRate * dt : Number.POSITIVE_INFINITY;
  const limit = Math.max(0, Math.min(snapCeiling, byRate));
  const step = Math.max(-limit, Math.min(limit, delta * blend));
  const c = Math.cos(step);
  const s = Math.sin(step);
  out[at] = cx * c - cz * s;
  out[at + 1] = cx * s + cz * c;
  return step;
}
