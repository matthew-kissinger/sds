// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Stable CPU-flock presentation storage.
 *
 * The title field starts with 25 sheep, but Play can select 75 or 200. Replacing
 * the InstancedMesh attributes for that selection used to create a second TSL
 * material graph and a visible first-play pipeline hitch. The shipped CPU sizes
 * are bounded, so one 200-instance allocation can serve every selection while
 * each mesh still draws only the active count.
 */

import * as THREE from 'three/webgpu';
import type { FlockSim } from '@sim/FlockSim';
import { mulberry32 } from '@sim/rng';
import { TICK_HZ } from '@sim/tuning';
import {
  BUILD_LONG,
  BUILD_TALL,
  BUILD_WIDE,
  OUTLINE_MIN,
  SCATTER,
  SHAPE_STRIDE,
  SIZE_MIN,
  SIZE_SEED,
  SIZE_SPREAD,
  STYLE_SEED,
  TAU,
  TINT_MIN,
  TINT_SPREAD,
  YAW_JITTER,
} from './flockTuning';
import { createSheepResponseState, type SheepResponseState } from './sheepResponse';
import { SHEEP_HOOF_BASELINE } from './sheepParts';
import {
  writeSheepTerrainOffsets,
  type GroundSampler,
} from './terrainPlanting';

export const CPU_FLOCK_CAPACITY = 200;
/** Debug receipts are deliberately much slower than the render loop. */
export const PRESENTATION_DIAGNOSTIC_INTERVAL = 0.1;

/**
 * Derive one visual stream from the sheep's stable array identity. The flock
 * count must never participate: activating sheep 25..74 or 25..199 may reveal
 * new animals, but it must not reshape or recolor sheep 0..24.
 */
function sheepVisualRng(seed: number, sheepIndex: number) {
  return mulberry32((seed ^ Math.imul(sheepIndex + 1, 0x9e37_79b1)) >>> 0);
}

/**
 * Preallocated endpoints and clock for fixed-tick position presentation. The
 * sim remains authoritative; these arrays are renderer-owned copies used only
 * to draw the interval between its previous and current ticks.
 */
export interface PositionPresentationBuffers {
  readonly previousPositions: Float32Array;
  readonly currentPositions: Float32Array;
  previousTick: number;
  interpolationAlpha: number;
  activePositionLength: number;
}

export function createPositionPresentationBuffers(
  entityCapacity: number,
): PositionPresentationBuffers {
  const positionCapacity = entityCapacity * 2;
  return {
    previousPositions: new Float32Array(positionCapacity),
    currentPositions: new Float32Array(positionCapacity),
    previousTick: 0,
    interpolationAlpha: 0,
    activePositionLength: 0,
  };
}

/** Both endpoints take the source pose, so resets and count changes never lerp
 * from stale storage. */
export function resetPositionPresentationBuffers(
  buffers: PositionPresentationBuffers,
  positions: Float32Array,
  tick: number,
): void {
  if (positions.length > buffers.currentPositions.length) {
    throw new RangeError(
      `Position count ${positions.length / 2} exceeds presentation capacity ${buffers.currentPositions.length / 2}`,
    );
  }
  buffers.previousPositions.fill(0);
  buffers.currentPositions.fill(0);
  buffers.previousPositions.set(positions);
  buffers.currentPositions.set(positions);
  buffers.previousTick = tick;
  buffers.interpolationAlpha = 0;
  buffers.activePositionLength = positions.length;
}

/**
 * Observe the fixed-tick source after the game loop has advanced it. The local
 * alpha reconstructs that loop's accumulator: render delta enters both loops,
 * and every observed tick removes one fixed interval. The returned tick delta
 * lets gait derive speed from the same two endpoints without another copy.
 *
 * Multiplayer positions have already passed through the snapshot interpolator.
 * `interpolate=false` keeps those frames direct while retaining tick endpoints
 * for gait sampling and clean transitions back to solo presentation.
 */
export function advancePositionPresentationBuffers(
  buffers: PositionPresentationBuffers,
  positions: Float32Array,
  tick: number,
  delta: number,
  interpolate: boolean,
): number {
  if (
    positions.length !== buffers.activePositionLength
    || tick < buffers.previousTick
  ) {
    resetPositionPresentationBuffers(buffers, positions, tick);
    return 0;
  }

  const tickDelta = tick - buffers.previousTick;
  const elapsedTicks = Math.max(0, delta) * TICK_HZ;
  if (tickDelta > 0) {
    // Copy the fixed-capacity buffers directly. No subarray/view allocation in
    // the frame path, and inactive tail values are never drawn.
    buffers.previousPositions.set(buffers.currentPositions);
    buffers.currentPositions.set(positions);
    buffers.previousTick = tick;
    buffers.interpolationAlpha = interpolate
      ? Math.max(0, Math.min(1, buffers.interpolationAlpha + elapsedTicks - tickDelta))
      : 1;
  } else {
    buffers.interpolationAlpha = interpolate
      ? Math.min(1, buffers.interpolationAlpha + elapsedTicks)
      : 1;
  }
  return tickDelta;
}

export interface FlockPresentationBuffers extends PositionPresentationBuffers {
  readonly style: THREE.InstancedBufferAttribute;
  readonly shape: Float32Array;
  readonly motion: THREE.InstancedBufferAttribute;
  readonly terrain: THREE.InstancedBufferAttribute;
  readonly headings: Float32Array;
  response: SheepResponseState;
}

type PresentationSource = Pick<FlockSim, 'headings' | 'positions'> & {
  readonly tick: number;
};

export function createFlockPresentationBuffers(): FlockPresentationBuffers {
  const positions = createPositionPresentationBuffers(CPU_FLOCK_CAPACITY);
  const motion = new THREE.InstancedBufferAttribute(
    new Float32Array(CPU_FLOCK_CAPACITY * 4),
    4,
  );
  motion.setUsage(THREE.DynamicDrawUsage);
  const terrain = new THREE.InstancedBufferAttribute(
    new Float32Array(CPU_FLOCK_CAPACITY * 4),
    4,
  );
  terrain.setUsage(THREE.DynamicDrawUsage);
  return {
    ...positions,
    style: new THREE.InstancedBufferAttribute(
      new Float32Array(CPU_FLOCK_CAPACITY * 2),
      2,
    ),
    shape: new Float32Array(CPU_FLOCK_CAPACITY * SHAPE_STRIDE),
    motion,
    terrain,
    headings: new Float32Array(CPU_FLOCK_CAPACITY * 2),
    response: createSheepResponseState(CPU_FLOCK_CAPACITY),
  };
}

/** Re-seed the active range without replacing any shader-bound attribute. */
export function resetFlockPresentationBuffers(
  buffers: FlockPresentationBuffers,
  sim: PresentationSource,
): void {
  const count = sim.headings.length;
  if (count > CPU_FLOCK_CAPACITY) {
    throw new RangeError(`CPU flock count ${count} exceeds presentation capacity ${CPU_FLOCK_CAPACITY}`);
  }

  const style = buffers.style.array as Float32Array;
  const motion = buffers.motion.array as Float32Array;
  const terrain = buffers.terrain.array as Float32Array;
  style.fill(0);
  buffers.shape.fill(0);
  motion.fill(0);
  terrain.fill(0);
  buffers.headings.fill(0);

  for (let i = 0; i < count; i++) {
    const styleRng = sheepVisualRng(STYLE_SEED, i);
    const shapeRng = sheepVisualRng(SIZE_SEED, i);
    const motionRng = sheepVisualRng(STYLE_SEED ^ SIZE_SEED, i);
    style[i * 2] = TINT_MIN + styleRng() * TINT_SPREAD;
    style[i * 2 + 1] = styleRng() * 8;

    const size = SIZE_MIN + shapeRng() * SIZE_SPREAD;
    const shapeAt = i * SHAPE_STRIDE;
    buffers.shape[shapeAt] = size * (1 + (shapeRng() - 0.5) * BUILD_WIDE);
    buffers.shape[shapeAt + 1] = size * (1 + (shapeRng() - 0.5) * BUILD_TALL);
    buffers.shape[shapeAt + 2] = size * (1 + (shapeRng() - 0.5) * BUILD_LONG);
    buffers.shape[shapeAt + 3] = (shapeRng() - 0.5) * 2 * YAW_JITTER;
    buffers.shape[shapeAt + 4] = (shapeRng() - 0.5) * 2 * SCATTER;
    buffers.shape[shapeAt + 5] = (shapeRng() - 0.5) * 2 * SCATTER;

    motion[i * 4] = motionRng() * TAU;
    motion[i * 4 + 2] = OUTLINE_MIN;
    buffers.headings[i * 2] = Math.cos(sim.headings[i]!);
    buffers.headings[i * 2 + 1] = Math.sin(sim.headings[i]!);
  }

  resetPositionPresentationBuffers(buffers, sim.positions, sim.tick);
  buffers.response = createSheepResponseState(CPU_FLOCK_CAPACITY);
  buffers.style.needsUpdate = true;
  buffers.motion.needsUpdate = true;
  buffers.terrain.needsUpdate = true;
}

/**
 * Write the complete initial transform/contact range before making a larger
 * flock visible. InstancedMesh capacity starts as zero matrices, so exposing
 * indices 25..199 and waiting for the next useFrame can submit one malformed
 * frame on an async renderer. The ordinary frame loop takes ownership after
 * this synchronous first pose.
 */
export function initializeFlockFirstDraw(
  mesh: THREE.InstancedMesh,
  buffers: FlockPresentationBuffers,
  sim: PresentationSource,
  field: GroundSampler,
  dummy: THREE.Object3D,
): void {
  const count = sim.headings.length;
  const terrain = buffers.terrain.array as Float32Array;
  for (let i = 0; i < count; i++) {
    const shapeAt = i * SHAPE_STRIDE;
    const positionAt = i * 2;
    const x = sim.positions[positionAt]! + buffers.shape[shapeAt + 4]!;
    const z = sim.positions[positionAt + 1]! + buffers.shape[shapeAt + 5]!;
    const scaleX = buffers.shape[shapeAt]!;
    const scaleY = buffers.shape[shapeAt + 1]!;
    const scaleZ = buffers.shape[shapeAt + 2]!;
    const yaw = Math.PI / 2 - sim.headings[i]! + buffers.shape[shapeAt + 3]!;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const groundY = field.groundY(x, z);
    writeSheepTerrainOffsets(
      terrain,
      i * 4,
      field,
      groundY,
      x,
      z,
      cosYaw,
      sinYaw,
      scaleX,
      scaleY,
      scaleZ,
      0,
    );
    dummy.position.set(x, groundY - SHEEP_HOOF_BASELINE * scaleY, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(scaleX, scaleY, scaleZ);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  buffers.terrain.needsUpdate = true;
  // Count is deliberately last. Before this assignment every active index has
  // a valid CPU matrix and terrain record ready for the renderer upload.
  mesh.count = count;
}
