// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Authored gait timing and contacts shared by skeletal pose and terrain planting. */
import { DOG_MAX_SPEED, DOG_SPRINT_SPEED } from '@sim/tuning';
export const DOG_GAIT_TAU = Math.PI * 2;
export const DOG_MAX_PAW_REACH = 0.4;
export function dogGaitRate(speed: number): number {
  return 1.4 + Math.min(Math.max(speed, 0), DOG_SPRINT_SPEED) * 0.112;
}
export function dogStanceShare(speed: number): number {
  // Faster travel needs shorter contact, not impossible metre-long legs.
  return Math.min(0.62, DOG_MAX_PAW_REACH * 2 * dogGaitRate(speed) / Math.max(speed, 0.01));
}
export function dogStride(speed: number): number {
  return Math.min(DOG_MAX_PAW_REACH, Math.max(speed, 0) * dogStanceShare(speed) / (2 * dogGaitRate(speed)));
}
export interface DogPawPose { travel: number; lift: number; planted: boolean; recovery: number }
export function sampleDogPaw(phase: number, speed: number, foot: number, out: DogPawPose): void {
  const sprint = Math.max(0, Math.min(1, (speed - DOG_MAX_SPEED) / (DOG_SPRINT_SPEED - DOG_MAX_SPEED)));
  // Diagonal trot becomes a separated fore/hind gallop as sprint opens.
  const offset = foot === 0 ? 0 : foot === 1 ? 0.5 - sprint * 0.4
    : foot === 2 ? 0.5 : sprint * 0.6;
  const cycle = ((phase / DOG_GAIT_TAU + offset) % 1 + 1) % 1;
  const stance = dogStanceShare(speed);
  const stride = dogStride(speed);
  out.planted = cycle < stance || speed < 0.08;
  out.recovery = out.planted ? 0 : (cycle - stance) / (1 - stance);
  if (cycle < stance) {
    out.travel = (1 - 2 * cycle / stance) * stride;
    out.lift = 0;
  } else {
    const recovery = (cycle - stance) / (1 - stance);
    const smooth = recovery * recovery * (3 - 2 * recovery);
    out.travel = (-1 + 2 * smooth) * stride;
    out.lift = Math.sin(recovery * Math.PI) * Math.min(0.18, stride * 0.5);
  }
}
