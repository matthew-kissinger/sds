// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Presentation-only sheep response, derived from renderer-visible movement.
 *
 * The FlockSim contract intentionally exposes positions/headings/state flags,
 * not bark events. Acceleration and direction changes are enough to reveal the
 * same delayed neighbor ripple without reaching into CpuDeterministicSim's
 * internal sheep objects, so this remains valid for the future GPU backend.
 */

const RESPONSE_DECAY_PER_SECOND = 2.25;
const ACCEL_START = 3;
const ACCEL_SPAN = 15;
const TURN_GAIN = 0.78;
const MOVING_SPEED = 0.35;

export interface SheepResponseState {
  /** Previous presentation velocity, x/z per sheep. */
  readonly velocity: Float32Array;
  /** 0..1 response envelope per sheep. */
  readonly strength: Float32Array;
  readonly primed: Uint8Array;
}

export function createSheepResponseState(count: number): SheepResponseState {
  return {
    velocity: new Float32Array(count * 2),
    strength: new Float32Array(count),
    primed: new Uint8Array(count),
  };
}

export function advanceSheepResponse(
  state: SheepResponseState,
  index: number,
  velocityX: number,
  velocityZ: number,
  delta: number,
  crossedGate: boolean,
  sampledMotion = true,
  sampleDelta = delta,
): number {
  const at = index * 2;
  let response = Math.max(0, state.strength[index]! - delta * RESPONSE_DECAY_PER_SECOND);

  if (sampledMotion && state.primed[index] !== 0 && delta > 0) {
    const previousX = state.velocity[at]!;
    const previousZ = state.velocity[at + 1]!;
    const dvX = velocityX - previousX;
    const dvZ = velocityZ - previousZ;
    const acceleration = Math.sqrt(dvX * dvX + dvZ * dvZ) / sampleDelta;
    const accelResponse = Math.min(Math.max((acceleration - ACCEL_START) / ACCEL_SPAN, 0), 1);

    const speedSquared = velocityX * velocityX + velocityZ * velocityZ;
    const previousSpeedSquared = previousX * previousX + previousZ * previousZ;
    let turnResponse = 0;
    if (speedSquared > MOVING_SPEED * MOVING_SPEED && previousSpeedSquared > MOVING_SPEED * MOVING_SPEED) {
      const denominator = Math.sqrt(speedSquared * previousSpeedSquared);
      const cross = Math.abs(previousX * velocityZ - previousZ * velocityX) / denominator;
      turnResponse = Math.min(cross * TURN_GAIN, 1);
    }
    response = Math.max(response, accelResponse, turnResponse);
  } else if (sampledMotion) {
    state.primed[index] = 1;
  }

  if (crossedGate) response = 1;
  if (sampledMotion) {
    state.velocity[at] = velocityX;
    state.velocity[at + 1] = velocityZ;
  }
  state.strength[index] = response;
  return response;
}
