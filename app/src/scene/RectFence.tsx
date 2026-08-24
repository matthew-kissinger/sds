// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The post-and-rail fences around a set of rects. The perimeter and pen are
 * submitted as one batch: they use the same stock, so splitting them into two
 * React components only duplicated the post, rail, outline and shadow GPU
 * pipelines. An opening in a side is a plain break in the run unless its gap
 * asks for the gate kit, and exactly one opening in the game does
 * (fenceGeometry.ts, `FenceGap.kit`).
 *
 * THREE DRAW CALLS FOR THE WHOLE FIELD. One instanced mesh for every post, one
 * for every static bar of rail, brace, spacer and cap beam plus every animated
 * gate board, and one merged mesh for everything the whole run throws on the
 * ground. Each timber buffer carries its inverted hull with reversed winding,
 * so the spec/05 outline costs no separate draw or pipeline. The perimeter is
 * 800 m of fence, so both rectangles have to be more instances rather than more
 * material, and they are.
 *
 * NOTHING IS PERFECT AND NOTHING IS RANDOM. Every post leans, stands its own
 * height above the cap rail, turns its facets its own way and nudges the three
 * rail lines meeting it, all from a hash of its own position (fenceGeometry.ts).
 * No Math.random anywhere: the fence looks the same on every reload.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import type { RectBounds } from '@sim/boundary';
import { useHeightfield } from '@app/world/heightfield';
import { buildPosts, buildRails } from './fence/buildMeshes';
import { gateKitPlacements, type GateLeafAssembly } from './fence/gateKit';
import { buildFenceShadow } from './fence/shadowCast';
import { rectFenceLayout, type FenceGap, type FenceSide } from './fenceGeometry';
import {
  fencePlacements,
  type PostPlacement,
  type RailPlacement,
} from './fence/placement';
import { useGameStore } from '@app/state/store';
import { useReducedMotion } from '@app/ui/useReducedMotion';
import {
  COMPLETION_GATE_SECONDS,
  advanceCompletion,
  smoothArrival,
} from './juice/completionMotion';

export interface RectFenceSection {
  readonly rect: RectBounds;
  readonly gaps?: Partial<Record<FenceSide, FenceGap>>;
  readonly postSpacing?: number;
  /** Sides that need new timber. Omit a side when an adjoining fence is the
   *  shared boundary, so its rails are not submitted twice. */
  readonly sides?: readonly FenceSide[];
}

export interface RectFenceProps {
  readonly sections: readonly RectFenceSection[];
}

export function RectFence({ sections }: RectFenceProps) {
  const closeProgress = useRef(0);
  const reducedMotion = useReducedMotion();
  const layout = useMemo(
    () => sections.map(({ rect, gaps, postSpacing = 5, sides }) => ({
      layout: rectFenceLayout(rect, postSpacing, gaps, sides),
      postSpacing,
    })),
    [sections],
  );
  const field = useHeightfield();

  // Built once, at mount.
  const meshes = useMemo(() => {
    const groundY = (x: number, z: number): number => field.groundY(x, z);
    const posts: PostPlacement[] = [];
    const rails: RailPlacement[] = [];
    const leaves: GateLeafAssembly[] = [];
    for (const section of layout) {
      const placed = fencePlacements(section.layout, groundY, section.postSpacing);
      posts.push(...placed.posts);
      rails.push(...placed.rails);
      for (const opening of section.layout.openings) {
        if (opening.kit) leaves.push(...gateKitPlacements(opening, groundY, posts, rails));
      }
    }
    const railBatch = buildRails(rails, leaves);
    const openLeafRails = leaves.flatMap((leaf) => leaf.parts);
    const objects = [
      ...buildPosts(posts),
      ...railBatch.meshes,
      buildFenceShadow(posts, [...rails, ...openLeafRails], groundY),
    ];
    return { objects, railBatch };
  }, [layout, field]);

  useFrame((_, delta) => {
    closeProgress.current = advanceCompletion(
      closeProgress.current,
      useGameStore.getState().gamePhase === 'complete',
      delta,
      COMPLETION_GATE_SECONDS,
      reducedMotion,
    );
    meshes.railBatch.updateGate(smoothArrival(closeProgress.current));
  });

  useEffect(
    () => () => {
      for (const mesh of meshes.objects) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
      }
    },
    [meshes],
  );

  return (
    <>
      {meshes.objects.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}
