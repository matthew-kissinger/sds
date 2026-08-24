// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The ground dressing: lichened stones, wildflower drifts, one fallen log, and
 * the darkened grass and standing blades at the foot of every solid.
 *
 * It is the layer that makes the meadow a place rather than a playfield, and it
 * is deliberately quiet. spec/05's reference bar is Alto's Odyssey restraint as
 * much as it is Ghibli warmth: the field's subject is a flock at golden hour,
 * and dressing that competes with the flock has failed even if every piece of it
 * is well made.
 *
 * SO IT IS GROUPS, AND THE GROUPS ARE SMALL. Sixteen stones in five interlocking
 * clusters, twelve flower drifts and one fallen log across forty thousand square
 * metres, all of it on the flanks and none of it in the corridor the player
 * pushes sheep down (scatter/placement.ts). The dominant stone in a cluster is
 * 1.2 m across and 0.4 m tall - a third of what it was, and clearly smaller than
 * the dog standing beside it - because a boulder the size of the animals reads
 * as collision geometry and takes the frame off the flock. Between the clusters
 * there are long empty stretches of clean pasture, which is the other half of
 * restraint.
 *
 * IT SITS UNDER THE HERD. Every band on every surface is authored to land below
 * the sunlit grass around it and well below the wool, because the flock and the
 * dog have to be the brightest things on the ground plane. Dressing that reads
 * before the sheep do has failed at its only job.
 *
 * FIVE DRAW CALLS, ONE PER KIND. Flowers and contact shading are each a single
 * InstancedMesh over one small geometry; the stones, the log and the grass
 * collar are one merged mesh each - and each merged mesh carries its own
 * inverted-hull outline in the SAME buffer, so the scene's contour costs no
 * extra draw (scatter/outline.ts). Nothing here is built per frame, nothing is
 * written per frame, and there is no `useFrame` on this path at all: the only
 * motion in the asset is the flowers' wind, which is a function of `time` inside
 * the shader and costs the CPU nothing.
 *
 * ONE LIGHTING MODEL. Every solid goes through the scene's toon ramp
 * (tsl/toon.ts) with its three band tones authored rather than derived
 * (scatter/bandedMaterial.ts), which is how a warm taupe stone and a weathered
 * timber can both keep saturated shadows under a ramp whose shadow gain was
 * measured for pasture green. Every camera-facing surface in the asset is warm;
 * the one cool band on a stone and the one on the log are both reached only by
 * normals pointing below the horizon, which is where a blue sky actually lands.
 *
 * DETERMINISTIC. Every position, rotation and size is a pure hash of the item's
 * index (scatter/hash.ts). No Math.random, no clock, no runtime scatter pass:
 * the field looks the same on every reload, on both renderer backends, and on
 * every machine.
 *
 * NOT SIMULATED. These are visual only. The sim's field is bounds, gate, pen and
 * spawn (sim/field.ts) and it never learns any of this exists, so a stone can
 * neither block a sheep nor change a fixed-seed run. The clearances in
 * scatter/keepOut.ts are a composition rule, not a collision rule.
 */

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useHeightfield } from '@app/world/heightfield';
import { buildBaseGrassMesh } from './scatter/baseGrass';
import { buildContactMesh } from './scatter/contactShade';
import { buildFlowerMesh } from './scatter/flowers';
import { buildLogMesh } from './scatter/fallenLog';
import { buildRockMesh } from './scatter/rocks';
import { useScatterManifest } from './scatter/manifest';
import { useGameStore } from '@app/state/store';
import { useReducedMotion } from '@app/ui/useReducedMotion';
import { BirdLift } from './juice/BirdLift';
import { createBarkPulseField } from './juice/barkPulse';

export function Scatter() {
  const field = useHeightfield();
  const placement = useScatterManifest();
  const reducedMotion = useReducedMotion();
  const flowerPulse = useMemo(() => createBarkPulseField(), []);

  const pieces = useMemo(() => {
    const spots = placement.contacts;
    const built: THREE.Object3D[] = [
      buildContactMesh(field, spots),
      buildRockMesh(placement.rocks),
      // After the stones, so the collar's blades are the last opaque thing
      // written at a base and cannot lose a depth tie to the solid they overlap.
      buildBaseGrassMesh(field, spots),
      buildFlowerMesh(placement.flowers, flowerPulse.texture),
    ];
    const log = buildLogMesh(placement.log);
    if (log !== null) built.push(log);
    return built;
  }, [field, placement, flowerPulse]);

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    flowerPulse.update(delta, state.acceptedBark, reducedMotion);
  });

  useEffect(
    () => () => {
      for (const piece of pieces) {
        const mesh = piece as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
      }
      flowerPulse.dispose();
    },
    [pieces, flowerPulse],
  );

  return (
    <>
      {pieces.map((piece) => (
        <primitive key={piece.uuid} object={piece} />
      ))}
      <BirdLift reducedMotion={reducedMotion} />
    </>
  );
}
