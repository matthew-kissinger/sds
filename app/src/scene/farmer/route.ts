// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** One bounded ambient route; building/pen coordinates remain their authorities. */
import { HOME_FIELD } from '@sim/field';
import { BARN_AT, HOUSE_AT } from '../farmhouse/plan';

export type FarmerActivity = 'walk' | 'inspect' | 'look';
export const FARMER_SPEED = 0.85;
const east = HOME_FIELD.pen.maxX + 3.2;
const north = HOME_FIELD.pen.maxZ + 4;
export const FARMER_ROUTE = [
  { x: east + 2, z: HOUSE_AT.z + 14, wait: 9, activity: 'inspect', yaw: 1.2 },
  { x: east, z: north, wait: 3, activity: 'look', yaw: Math.PI },
  { x: BARN_AT.x, z: north, wait: 10, activity: 'look', yaw: Math.PI },
  { x: east, z: north, wait: 0, activity: 'look', yaw: Math.PI / 2 },
] as const;

export interface FarmerMotion {
  x: number; z: number; yaw: number; elapsed: number; distance: number;
  activity: FarmerActivity; activityTime: number; waitRemaining: number; speed: number;
}
export function createFarmerMotion(): FarmerMotion {
  return { x: FARMER_ROUTE[0].x, z: FARMER_ROUTE[0].z, yaw: FARMER_ROUTE[0].yaw,
    elapsed: 0, distance: 0, activity: 'inspect', activityTime: 0, waitRemaining: 9, speed: 0 };
}
const segments = FARMER_ROUTE.map((from, i) => {
  const to = FARMER_ROUTE[(i + 1) % FARMER_ROUTE.length]!;
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  // Acceleration/deceleration each consume half a second and half their peak
  // speed; adding 0.5 s preserves the exact route length without snapping.
  return { from, to, length, duration: length / FARMER_SPEED + 0.5 };
});
export const FARMER_CYCLE_SECONDS = segments.reduce((sum, part) => sum + part.from.wait + part.duration, 0);

/** Presentation clock only. Pauses freeze both route and joints; no sim writes. */
export function advanceFarmerMotion(state: FarmerMotion, delta: number, paused: boolean): void {
  if (paused) return;
  const dt = Math.max(0, Math.min(delta, 0.05));
  state.elapsed = (state.elapsed + dt) % FARMER_CYCLE_SECONDS;
  let at = state.elapsed;
  for (const segment of segments) {
    const { from, to, duration, length } = segment;
    if (at < from.wait) {
      state.x = from.x; state.z = from.z;
      state.activity = from.activity; state.activityTime = at; state.waitRemaining = from.wait - at; state.speed = 0;
      state.yaw += Math.atan2(Math.sin(from.yaw - state.yaw), Math.cos(from.yaw - state.yaw)) * (1 - Math.exp(-dt * 3));
      return;
    }
    at -= from.wait;
    if (at <= duration) {
      const ramp = 0.5;
      const travelled = at < ramp ? at * at / (2 * ramp)
        : at > duration - ramp ? duration - ramp - (duration - at) ** 2 / (2 * ramp)
          : at - ramp / 2;
      const progress = Math.min(1, travelled * FARMER_SPEED / length);
      state.x = from.x + (to.x - from.x) * progress;
      state.z = from.z + (to.z - from.z) * progress;
      state.speed = FARMER_SPEED * Math.min(1, at / ramp, (duration - at) / ramp);
      state.distance += state.speed * dt;
      state.activity = 'walk'; state.activityTime = at; state.waitRemaining = 0;
      const yaw = Math.atan2(to.x - from.x, to.z - from.z);
      state.yaw += Math.atan2(Math.sin(yaw - state.yaw), Math.cos(yaw - state.yaw)) * (1 - Math.exp(-dt * 5));
      return;
    }
    at -= duration;
  }
}
