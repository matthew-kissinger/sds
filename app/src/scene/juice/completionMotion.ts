// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/** Soft completion motion shared by the gate, camera and warm post lift. */
export const COMPLETION_GATE_SECONDS = 1.65;
export const COMPLETION_CAMERA_SECONDS = 3.2;
export const COMPLETION_BLOOM_SECONDS = 2.4;

export function smoothArrival(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/**
 * Advances a normalized one-way completion value. Reduced motion keeps the
 * state change but shortens it to a quiet 180 ms transition.
 */
export function advanceCompletion(
  current: number,
  active: boolean,
  dt: number,
  duration: number,
  reducedMotion: boolean,
): number {
  const target = active ? 1 : 0;
  const seconds = reducedMotion ? 0.18 : duration;
  const step = seconds > 0 ? Math.max(0, dt) / seconds : 1;
  if (target > current) return Math.min(target, current + step);
  if (target < current) return Math.max(target, current - step);
  return current;
}
