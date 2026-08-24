// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import {
  advancePositionPresentationBuffers,
  CPU_FLOCK_CAPACITY,
  createFlockPresentationBuffers,
  createPositionPresentationBuffers,
  initializeFlockFirstDraw,
  resetFlockPresentationBuffers,
  resetPositionPresentationBuffers,
} from '@app/scene/flock/presentationBuffers';
import * as THREE from 'three/webgpu';

describe('stable CPU-flock presentation storage', () => {
  it('keeps shader-bound attributes stable across every shipped flock size', () => {
    const buffers = createFlockPresentationBuffers();
    const style = buffers.style;
    const motion = buffers.motion;
    const terrain = buffers.terrain;

    for (const count of [25, 75, 200] as const) {
      resetFlockPresentationBuffers(
        buffers,
        new CpuDeterministicSim(HOME_FIELD, count, 20260821),
      );
      expect(buffers.style).toBe(style);
      expect(buffers.motion).toBe(motion);
      expect(buffers.terrain).toBe(terrain);
      expect(buffers.style.count).toBe(CPU_FLOCK_CAPACITY);
      expect(buffers.motion.count).toBe(CPU_FLOCK_CAPACITY);
      expect(buffers.terrain.count).toBe(CPU_FLOCK_CAPACITY);
    }
  });

  it('re-seeds deterministically for a reset without stale active values', () => {
    const buffers = createFlockPresentationBuffers();
    const sim = new CpuDeterministicSim(HOME_FIELD, 75, 731);
    resetFlockPresentationBuffers(buffers, sim);
    const firstStyle = Array.from(buffers.style.array as Float32Array);
    const firstShape = Array.from(buffers.shape);
    resetFlockPresentationBuffers(buffers, sim);
    expect(Array.from(buffers.style.array as Float32Array)).toEqual(firstStyle);
    expect(Array.from(buffers.shape)).toEqual(firstShape);
    expect(buffers.previousTick).toBe(sim.tick);
    expect(Array.from(buffers.previousPositions.slice(0, sim.positions.length)))
      .toEqual(Array.from(sim.positions));
    expect(Array.from(buffers.currentPositions.slice(0, sim.positions.length)))
      .toEqual(Array.from(sim.positions));
  });

  it('keeps each existing sheep visually identical as flock count grows', () => {
    const buffers = createFlockPresentationBuffers();
    resetFlockPresentationBuffers(
      buffers,
      new CpuDeterministicSim(HOME_FIELD, 25, 20260821),
    );
    const firstStyle = Array.from((buffers.style.array as Float32Array).slice(0, 25 * 2));
    const firstShape = Array.from(buffers.shape.slice(0, 25 * 6));
    const firstMotion = Array.from((buffers.motion.array as Float32Array).slice(0, 25 * 4));

    for (const count of [75, 200] as const) {
      resetFlockPresentationBuffers(
        buffers,
        new CpuDeterministicSim(HOME_FIELD, count, 20260821),
      );
      expect(Array.from((buffers.style.array as Float32Array).slice(0, 25 * 2)))
        .toEqual(firstStyle);
      expect(Array.from(buffers.shape.slice(0, 25 * 6))).toEqual(firstShape);
      expect(Array.from((buffers.motion.array as Float32Array).slice(0, 25 * 4)))
        .toEqual(firstMotion);
    }
  });

  it('fully initializes every newly active presentation record before drawing', () => {
    const buffers = createFlockPresentationBuffers();
    const sim = new CpuDeterministicSim(HOME_FIELD, 200, 20260821);
    resetFlockPresentationBuffers(buffers, sim);
    const style = buffers.style.array as Float32Array;
    const motion = buffers.motion.array as Float32Array;

    expect(buffers.activePositionLength).toBe(sim.positions.length);
    expect(Array.from(buffers.currentPositions.slice(0, sim.positions.length)))
      .toEqual(Array.from(sim.positions));
    for (let i = 0; i < 200; i++) {
      const shapeAt = i * 6;
      const headingAt = i * 2;
      const motionAt = i * 4;
      expect(Number.isFinite(style[headingAt])).toBe(true);
      expect(Number.isFinite(style[headingAt + 1])).toBe(true);
      expect(buffers.shape[shapeAt]).toBeGreaterThan(0);
      expect(buffers.shape[shapeAt + 1]).toBeGreaterThan(0);
      expect(buffers.shape[shapeAt + 2]).toBeGreaterThan(0);
      expect(Number.isFinite(buffers.shape[shapeAt + 3])).toBe(true);
      expect(Number.isFinite(buffers.shape[shapeAt + 4])).toBe(true);
      expect(Number.isFinite(buffers.shape[shapeAt + 5])).toBe(true);
      expect(Math.hypot(buffers.headings[headingAt]!, buffers.headings[headingAt + 1]!))
        .toBeCloseTo(1, 6);
      expect(Number.isFinite(motion[motionAt])).toBe(true);
      expect(motion[motionAt + 2]).toBeGreaterThan(0);
    }
  });

  it('writes every instance matrix before exposing the larger draw count', () => {
    const buffers = createFlockPresentationBuffers();
    const sim = new CpuDeterministicSim(HOME_FIELD, 200, 20260821);
    const mesh = new THREE.InstancedMesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial(),
      200,
    );
    const initialVersion = mesh.instanceMatrix.version;
    mesh.count = 25;
    resetFlockPresentationBuffers(buffers, sim);
    initializeFlockFirstDraw(mesh, buffers, sim, { groundY: () => 0.4 }, new THREE.Object3D());

    expect(mesh.count).toBe(200);
    expect(mesh.instanceMatrix.version).toBe(initialVersion + 1);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 200; i++) {
      mesh.getMatrixAt(i, matrix);
      expect(matrix.elements.every(Number.isFinite)).toBe(true);
      const scale = new THREE.Vector3();
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      expect(scale.x).toBeGreaterThan(0);
      expect(scale.y).toBeGreaterThan(0);
      expect(scale.z).toBeGreaterThan(0);
    }
    expect(Array.from(buffers.terrain.array).slice(0, 200 * 4).every(Number.isFinite)).toBe(true);

    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it('rejects counts beyond the scoreable CPU contract', () => {
    const buffers = createFlockPresentationBuffers();
    expect(() => resetFlockPresentationBuffers(buffers, {
      headings: new Float32Array(CPU_FLOCK_CAPACITY + 1),
      positions: new Float32Array((CPU_FLOCK_CAPACITY + 1) * 2),
      tick: 0,
    } as never)).toThrow(/exceeds presentation capacity/);
  });
});

describe('fixed-tick position presentation', () => {
  it('reconstructs the fixed-loop alpha between preallocated endpoints', () => {
    const buffers = createPositionPresentationBuffers(1);
    const positions = new Float32Array([0, 0]);
    resetPositionPresentationBuffers(buffers, positions, 0);

    positions[0] = 1;
    expect(advancePositionPresentationBuffers(buffers, positions, 1, 1 / 60, true)).toBe(1);
    expect(buffers.interpolationAlpha).toBeCloseTo(0, 7);
    expect(Array.from(buffers.previousPositions)).toEqual([0, 0]);
    expect(Array.from(buffers.currentPositions)).toEqual([1, 0]);

    expect(advancePositionPresentationBuffers(buffers, positions, 1, 1 / 120, true)).toBe(0);
    expect(buffers.interpolationAlpha).toBeCloseTo(0.5, 7);
    const halfway = buffers.previousPositions[0]!
      + (buffers.currentPositions[0]! - buffers.previousPositions[0]!)
        * buffers.interpolationAlpha;
    expect(halfway).toBeCloseTo(0.5, 7);

    positions[0] = 2;
    expect(advancePositionPresentationBuffers(buffers, positions, 2, 1 / 120, true)).toBe(1);
    expect(buffers.interpolationAlpha).toBeCloseTo(0, 7);
    expect(Array.from(buffers.previousPositions)).toEqual([1, 0]);
    expect(Array.from(buffers.currentPositions)).toEqual([2, 0]);
  });

  it('initializes both endpoints on resets and count changes without a jump', () => {
    const buffers = createPositionPresentationBuffers(2);
    resetPositionPresentationBuffers(buffers, new Float32Array([2, 3]), 8);
    advancePositionPresentationBuffers(buffers, new Float32Array([5, 7]), 9, 1 / 120, true);

    const reset = new Float32Array([-4, 6, 9, 11]);
    expect(advancePositionPresentationBuffers(buffers, reset, 0, 1 / 60, true)).toBe(0);
    expect(buffers.interpolationAlpha).toBe(0);
    expect(Array.from(buffers.previousPositions)).toEqual(Array.from(reset));
    expect(Array.from(buffers.currentPositions)).toEqual(Array.from(reset));
  });

  it('keeps already-interpolated multiplayer frames direct', () => {
    const buffers = createPositionPresentationBuffers(1);
    const positions = new Float32Array([1, 2]);
    resetPositionPresentationBuffers(buffers, positions, 10);
    positions.set([4, 6]);

    advancePositionPresentationBuffers(buffers, positions, 11, 1 / 144, false);
    expect(buffers.interpolationAlpha).toBe(1);
    expect(Array.from(buffers.previousPositions)).toEqual([1, 2]);
    expect(Array.from(buffers.currentPositions)).toEqual([4, 6]);
  });
});
