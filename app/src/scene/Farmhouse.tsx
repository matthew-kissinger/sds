// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The homestead on the pad beyond the pen: an L-plan farmhouse, a barn and a
 * lean-to, standing in the grass beyond the pen.
 *
 * IT IS A DISTANCE ASSET AND IT IS BUILT LIKE ONE. At roughly 100 m the frame
 * gives eight pixels to the metre, so this cluster is authored as silhouette,
 * band and colour mass. What it spends on is the six things that survive that
 * distance: the crossing rooflines, the split between a sunlit wall and a
 * shadowed gable, the coursed slate stepping down every pitch, the long shadows
 * the three masses throw across their own yard, a drift of woodsmoke off the
 * stack, and six warm points of lamplight on the faces that have fallen into
 * shadow.
 *
 * WHY IT IS HERE AT ALL. The field is 200 m of green with a fence around it, and
 * the gate at (0, 100) is the only thing in it the player is aiming at. A farm
 * past that gate gives the destination somewhere to BE: it turns a gap in a
 * fence into an approach, and it puts a fixed landmark up-field so the
 * world-locked Classic camera has something to be locked against.
 *
 * TEN DRAW CALLS, one per surface: limewash, slate, rust boards, weathered
 * board, warm stone and masonry, dark openings, lamplit glass,
 * the shadows the buildings cast on it, the inverted hull that keeps the roofline
 * off the treeline, and the smoke. The whole cluster is welded into one buffer
 * per material at build time (farmhouse/shell.ts), so adding a third outbuilding
 * later costs triangles and not calls.
 *
 * NOTHING HERE RUNS IN A FRAME. There is no useFrame in this file: the buildings
 * do not move, the lamps do not flicker, and the smoke is a held drift rather
 * than a particle system (farmhouse/smoke.ts explains why). The geometry is
 * built once behind the heightfield's Suspense gate and never touched again.
 */

import { useEffect, useMemo } from 'react';
import { useHeightfield } from '@app/world/heightfield';
import { buildFarmhouse } from './farmhouse/cluster';
import {
  makeBarnMaterial,
  makeDressMaterial,
  makeLampMaterial,
  makeOpeningMaterial,
  makeOutlineMaterial,
  makeTimberMaterial,
  makeWallMaterial,
} from './farmhouse/materials';
import { makeRoofMaterial } from './farmhouse/roofMaterial';
import { makeShadowMaterial } from './farmhouse/shadows';
import { makeSmokeMaterial } from './farmhouse/smoke';

export function Farmhouse() {
  const field = useHeightfield();

  // The pad is flat, so the buildings need one sample; the cast shadows run off
  // it onto the rim, so those sample per vertex through the same
  // function every ground-sitting object in the game reads (spec/04). It is
  // called through the field rather than detached from it: `groundY` is a method
  // and reads its own decoded array.
  const built = useMemo(() => buildFarmhouse((x, z) => field.groundY(x, z)), [field]);

  const materials = useMemo(
    () => ({
      // The limewash is the one material that needs to know where the ground is:
      // it draws a damp course at the foot of every wall, and the foot of a wall
      // is a world height, not a vertex attribute.
      wall: makeWallMaterial(built.level),
      roof: makeRoofMaterial(),
      barn: makeBarnMaterial(),
      timber: makeTimberMaterial(),
      dress: makeDressMaterial(),
      opening: makeOpeningMaterial(),
      lamp: makeLampMaterial(),
      shadow: makeShadowMaterial(),
      outline: makeOutlineMaterial(),
      smoke: makeSmokeMaterial(),
    }),
    [built.level],
  );

  useEffect(() => {
    return () => {
      for (const geometry of Object.values(built.geometry)) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    };
  }, [built, materials]);

  const g = built.geometry;

  return (
    <group>
      {/* The hull first: back faces only, so it is behind everything it edges. */}
      <mesh geometry={g.outline} material={materials.outline} />
      <mesh geometry={g.wall} material={materials.wall} />
      <mesh geometry={g.roof} material={materials.roof} />
      <mesh geometry={g.barn} material={materials.barn} />
      <mesh geometry={g.timber} material={materials.timber} />
      <mesh geometry={g.dress} material={materials.dress} />
      <mesh geometry={g.opening} material={materials.opening} />
      <mesh geometry={g.lamp} material={materials.lamp} />
      {/* The two blended surfaces, in the order they have to reach the frame:
          the shadows multiply down the ground they lie on, and the smoke draws
          over everything it drifts in front of. */}
      <mesh geometry={g.shadow} material={materials.shadow} renderOrder={1} />
      <mesh geometry={g.smoke} material={materials.smoke} renderOrder={2} />
    </group>
  );
}
