// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { HOME_FIELD } from '@sim/field';
import {
  FIELD_FENCE_SECTIONS,
  RETIREMENT_PASTURE_FENCE,
} from '@app/scene/FenceLine';
import { buildPosts, buildRails } from '@app/scene/fence/buildMeshes';
import type { GateLeafAssembly } from '@app/scene/fence/gateKit';
import {
  postGeometry,
  postTimberGeometry,
  railHullGeometry,
  railTimberGeometry,
} from '@app/scene/fence/postGeometry';
import type { PostPlacement, RailPlacement } from '@app/scene/fence/placement';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('field fence GPU batching', () => {
  it('submits the perimeter and pen through one RectFence component', () => {
    expect(FIELD_FENCE_SECTIONS).toHaveLength(2);
    expect(FIELD_FENCE_SECTIONS[0]).toMatchObject({
      rect: HOME_FIELD.bounds,
      postSpacing: 5,
    });
    expect(FIELD_FENCE_SECTIONS[1]).toMatchObject({
      rect: RETIREMENT_PASTURE_FENCE,
      postSpacing: 4,
      sides: ['north', 'west', 'east'],
    });

    const line = source('app/src/scene/FenceLine.tsx');
    const pen = source('app/src/scene/Pen.tsx');
    expect(line.match(/<RectFence\b/g)).toHaveLength(1);
    expect(pen).not.toContain('<RectFence');
  });

  it('builds one post, rail, and shadow batch for every section', () => {
    const component = source('app/src/scene/RectFence.tsx');
    expect(component.match(/\.\.\.buildPosts\(/g)).toHaveLength(1);
    expect(component.match(/buildRails\(/g)).toHaveLength(1);
    expect(component.match(/buildFenceShadow\(/g)).toHaveLength(1);
    expect(component).not.toContain('buildAnimatedGateLeaves');
  });

  it('folds each unchanged inverted hull into its timber draw', () => {
    const postSurface = postGeometry();
    const postHull = postGeometry(true);
    const combinedPost = postTimberGeometry();
    const railSurface = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const railHull = railHullGeometry();
    const combinedRail = railTimberGeometry();

    const assertCombined = (
      combined: THREE.BufferGeometry,
      surface: THREE.BufferGeometry,
      hull: THREE.BufferGeometry,
    ): void => {
      const positions = combined.getAttribute('position');
      const surfacePositions = surface.getAttribute('position');
      const hullPositions = hull.getAttribute('position');
      const flags = combined.getAttribute('uv');
      expect(positions.count).toBe(surfacePositions.count + hullPositions.count);
      for (let i = 0; i < surfacePositions.count; i++) expect(flags.getX(i)).toBe(0);
      for (let i = surfacePositions.count; i < flags.count; i++) expect(flags.getX(i)).toBe(1);

      const offset = surfacePositions.count;
      const copied = (index: number): number[] => [
        positions.getX(offset + index),
        positions.getY(offset + index),
        positions.getZ(offset + index),
      ];
      const original = (index: number): number[] => [
        hullPositions.getX(index),
        hullPositions.getY(index),
        hullPositions.getZ(index),
      ];
      // Reversing 0,1,2 to 0,2,1 makes FrontSide draw exactly the faces the
      // former BackSide outline pass drew.
      expect([copied(0), copied(1), copied(2)]).toEqual([
        original(0), original(2), original(1),
      ]);
    };

    assertCombined(combinedPost, postSurface, postHull);
    assertCombined(combinedRail, railSurface, railHull);

    for (const geometry of [
      postSurface,
      postHull,
      combinedPost,
      railSurface,
      railHull,
      combinedRail,
    ]) geometry.dispose();
  });

  it('submits one instanced pipeline for posts and one for rails', () => {
    const post: PostPlacement = {
      x: 0,
      z: 0,
      baseY: 0,
      height: 1.9,
      girth: 0.3,
      tilt: 0,
      tiltDir: 0,
      yaw: 0,
      tone: 0,
      seed: 0.3,
    };
    const postMeshes = buildPosts([post]);
    const railBatch = buildRails([]);
    expect(postMeshes).toHaveLength(1);
    expect(railBatch.meshes).toHaveLength(1);
    expect(postMeshes[0]!.material).toBeInstanceOf(THREE.MeshBasicNodeMaterial);
    expect(railBatch.meshes[0]!.material).toBeInstanceOf(THREE.MeshBasicNodeMaterial);
    expect((postMeshes[0]!.material as THREE.Material).side).toBe(THREE.FrontSide);
    expect((railBatch.meshes[0]!.material as THREE.Material).side).toBe(THREE.FrontSide);

    for (const mesh of [...postMeshes, ...railBatch.meshes]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
  });

  it('keeps gate boards in the rail tail and skips unchanged updates', () => {
    const staticRail: RailPlacement = {
      ax: 0, ay: 1, az: 0,
      bx: 4, by: 1, bz: 0,
      thickness: 0.2,
      depth: 0.15,
      topness: 0.5,
      tone: 0.4,
      seed: 0.3,
    };
    const gateRail: RailPlacement = {
      ...staticRail,
      ax: 1,
      bx: 3,
      az: 1,
      bz: 1,
    };
    const leaves: GateLeafAssembly[] = [{
      hingeX: 1,
      hingeZ: 1,
      closeTurn: Math.PI / 2,
      parts: [gateRail],
    }];
    const batch = buildRails([staticRail], leaves);
    const [solid] = batch.meshes;
    expect(batch.meshes).toHaveLength(1);
    expect(solid?.count).toBe(2);

    const initial = Array.from(solid!.instanceMatrix.array);
    const staticMatrix = initial.slice(0, 16);
    batch.updateGate(0);
    expect(solid!.instanceMatrix.version).toBe(0);

    batch.updateGate(1);
    expect(solid!.instanceMatrix.version).toBe(1);
    expect(Array.from(solid!.instanceMatrix.array).slice(0, 16)).toEqual(staticMatrix);
    expect(Array.from(solid!.instanceMatrix.array).slice(16)).not.toEqual(initial.slice(16));
    expect(solid!.instanceMatrix.updateRanges).toEqual([{ start: 16, count: 16 }]);

    batch.updateGate(1);
    expect(solid!.instanceMatrix.version).toBe(1);

    for (const mesh of batch.meshes) {
      mesh.geometry.dispose();
      (mesh.material as { dispose(): void }).dispose();
      mesh.dispose();
    }
  });
});
