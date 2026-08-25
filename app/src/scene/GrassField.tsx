// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The grass. The signature system (spec/04): half a million instanced blades
 * with wind you can see and a field that answers every body moving through it.
 *
 * TWO GRASS GROUPS, TWO DRAW CALLS (spec/08: grass is one draw call per group).
 *
 *  - `field` covers the 200 m playfield plus six metres, in seven-blade clumps
 *    with a three-segment curve, and it is the tier that pays for interaction.
 *  - `surround` covers everything from there out to 190 m, in cheaper
 *    five-blade clumps with no interaction at all, because the sim clamps every
 *    body inside the fence and nothing can ever reach it.
 *
 * Both read the SAME committed scatter (tools/bake-grass.mjs), and the reduced
 * density preset is a prefix of the same buffer rather than a second asset, so
 * a phone and a desktop are looking at the same meadow with different amounts
 * of it (grass/density.ts, grass/tuftData.ts).
 *
 * WHAT RUNS PER FRAME. One call: the interaction field repacks the dog, the
 * flock and their trailing ghosts into two small textures, allocating nothing
 * (grass/interactionField.ts). There is no React state on that path and no
 * per-instance CPU work - half a million blades is not something a frame loop
 * can afford to touch, and it never does. Every blade is placed by the bake,
 * curved by the tuft mesh, and moved by the vertex shader.
 *
 * The meshes are built imperatively because their instance matrices come out of
 * the decoder as one packed array; handing three the array directly is one
 * fewer copy of 30,000 matrices than filling an Object3D would be.
 */

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useGameStore } from '@app/state/store';
import { GRASS_PRESETS } from './grass/density';
import { resolvedRenderTier } from '@app/quality/autoTier';
import { makeGrassMaterial } from './grass/grassMaterial';
import { createInteractionField, type InteractionField } from './grass/interactionField';
import { FIELD_TUFT, SURROUND_TUFT, buildTuftGeometry, type TuftShape } from './grass/tuftGeometry';
import { decodeTufts, grassGroup, useTufts } from './grass/tuftData';
import { useReducedMotion } from '@app/ui/useReducedMotion';
import { BarkRing } from './juice/BarkRing';

interface GrassTier {
  readonly mesh: THREE.InstancedMesh;
  readonly blades: number;
}

function buildTier(
  records: DataView,
  groupId: string,
  shape: TuftShape,
  fraction: number,
  spread: number,
  interaction: InteractionField | null,
): GrassTier {
  const group = grassGroup(groupId);
  const buffers = decodeTufts(records, group, Math.round(group.count * fraction), spread);
  const geometry = buildTuftGeometry(shape);
  const material = makeGrassMaterial({
    tufts: new THREE.InstancedBufferAttribute(buffers.tufts, 4),
    interaction,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, buffers.count);
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(buffers.matrices, 16);
  // The scatter covers the whole world and the wind moves it further, so a
  // bounding volume would be the world; culling it per frame is work with one
  // possible answer.
  mesh.frustumCulled = false;
  // Drawn before the sheep and the dog, which is the order they are mounted in
  // (scene/FieldScene.tsx); grass is opaque, so this only decides overdraw.
  mesh.renderOrder = -1;
  return { mesh, blades: shape.blades * buffers.count };
}

export function GrassField() {
  const sim = useGameStore((state) => state.sim);
  const quality = useGameStore((state) => state.quality);
  const autoTierReceipt = useGameStore((state) => state.autoTierReceipt);
  const reducedMotion = useReducedMotion();
  const records = useTufts();
  // Boot-measured, then eligible for rare demotion after a sustained slow window.
  const density = GRASS_PRESETS[resolvedRenderTier(quality, autoTierReceipt)];

  // One scoreable-capacity field for the life of the scene. Its update reads
  // the live sim length, so 25/75/200 and the zero-sheep GPU scale controller
  // all share the same textures and grass material pipelines.
  const interaction = useMemo(() => createInteractionField(), []);
  useEffect(() => () => interaction.dispose(), [interaction]);

  const tiers = useMemo(
    () => [
      buildTier(records, 'field', FIELD_TUFT, density.field, density.spread, interaction),
      buildTier(records, 'surround', SURROUND_TUFT, density.surround, density.spread, null),
    ],
    [records, density, interaction],
  );

  useEffect(
    () => () => {
      for (const tier of tiers) {
        tier.mesh.geometry.dispose();
        (tier.mesh.material as THREE.Material).dispose();
        tier.mesh.dispose();
      }
    },
    [tiers],
  );

  // Default priority: after the sim step (-1), alongside the instance writes,
  // and before the post chain takes the frame (+1).
  useFrame((_, delta) => {
    interaction.update(
      delta,
      sim,
      useGameStore.getState().acceptedBark,
      reducedMotion,
    );
  });

  return (
    <>
      {tiers.map((tier) => (
        <primitive key={tier.mesh.uuid} object={tier.mesh} />
      ))}
      <BarkRing reducedMotion={reducedMotion} />
    </>
  );
}
