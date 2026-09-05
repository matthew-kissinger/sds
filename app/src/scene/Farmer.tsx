// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Ambient homestead resident: one skin, one outline, one contact patch. */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useHeightfield } from '@app/world/heightfield';
import { useGameStore } from '@app/state/store';
import { useReducedMotion } from '@app/ui/useReducedMotion';
import { PALETTE } from '@app/tsl/palette';
import { attribute, color, float, length, normalLocal, positionLocal, smoothstep, uv, vec2 } from '@app/tsl/nodes';
import { makeToonMaterial } from '@app/tsl/toon';
import { buildFarmer } from './farmer/geometry';
import { advanceFarmerMotion, createFarmerMotion } from './farmer/route';
import { poseFarmer } from './farmer/animation';

export function Farmer() {
  const field = useHeightfield();
  const reducedMotion = useReducedMotion();
  const built = useMemo(() => {
    const rig = buildFarmer();
    const material = makeToonMaterial(attribute('color', 'vec3'));
    const ink = new THREE.MeshBasicNodeMaterial();
    ink.side = THREE.BackSide; ink.colorNode = color(PALETTE.farmerInk);
    ink.positionNode = positionLocal.add(normalLocal.mul(float(0.018)));
    const body = new THREE.SkinnedMesh(rig.geometry, material);
    body.add(rig.root); body.bind(rig.skeleton);
    const outline = new THREE.SkinnedMesh(rig.geometry, ink);
    outline.bind(rig.skeleton, body.bindMatrix);
    // Tiny actor, with limbs allowed outside the static bind-pose bound.
    body.frustumCulled = false; outline.frustumCulled = false;
    const group = new THREE.Group(); group.add(outline, body);
    const shadowGeometry = new THREE.PlaneGeometry(1.35, 1.15);
    shadowGeometry.rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.MeshBasicNodeMaterial();
    shadowMaterial.colorNode = color(PALETTE.farmerShadow);
    shadowMaterial.opacityNode = float(1).sub(smoothstep(float(0.12), float(0.5), length(uv().sub(vec2(0.5))))).mul(float(0.32));
    shadowMaterial.transparent = true; shadowMaterial.depthWrite = false;
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.renderOrder = 1;
    const motion = createFarmerMotion();
    const sample = (x: number, z: number) => field.groundY(x, z);
    return { ...rig, material, ink, group, shadow, shadowGeometry, shadowMaterial, motion, sample };
  }, [field]);
  useEffect(() => () => {
    built.geometry.dispose(); built.skeleton.dispose(); built.material.dispose(); built.ink.dispose();
    built.shadowGeometry.dispose(); built.shadowMaterial.dispose();
  }, [built]);
  useFrame((_, delta) => {
    const paused = useGameStore.getState().gamePhase === 'paused';
    advanceFarmerMotion(built.motion, delta, paused);
    const motion = built.motion;
    const ground = built.sample(motion.x, motion.z);
    poseFarmer(built.bones, motion, reducedMotion, built.sample, ground);
    built.group.position.set(motion.x, ground, motion.z);
    built.group.rotation.y = motion.yaw;
    built.shadow.position.set(motion.x, ground + 0.06, motion.z);
    built.shadow.rotation.y = motion.yaw;
  });
  return <><primitive object={built.group} /><primitive object={built.shadow} /></>;
}
