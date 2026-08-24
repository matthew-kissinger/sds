// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Ground-level dog feedback: one quiet stamina arc and a twelve-mote dust pool.
 *
 * Both are presentation-only and allocation-free in the frame path. Dust is
 * distance-triggered rather than frame-triggered, so a 30 fps phone and a 144 Hz
 * desktop leave the same density of marks. Reduced motion stops new motes and
 * clears the pool; the stamina read remains because it conveys gameplay state.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { PALETTE } from '@app/tsl/palette';
import { color, float } from '@app/tsl/nodes';
import { useGameStore } from '@app/state/store';
import { useHeightfield } from '@app/world/heightfield';

const ARC_SEGMENTS = 48;
const ARC_LIFT = 0.135;
const DUST_COUNT = 12;
const DUST_STRIDE = 8;
const DUST_STEP = 0.72;
const DUST_MIN_SPEED = 5;

function makeArcGeometry(): THREE.RingGeometry {
  const geometry = new THREE.RingGeometry(0.78, 0.86, ARC_SEGMENTS, 1, -Math.PI / 2, Math.PI * 2);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function makeGroundMaterial(tone: string, opacity: number): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = color(tone);
  material.opacityNode = float(opacity);
  material.transparent = true;
  material.depthWrite = false;
  return material;
}

export function DogGroundFeedback() {
  const sim = useGameStore((state) => state.sim);
  const field = useHeightfield();
  const arcRef = useRef<THREE.Mesh>(null);
  const dustRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const arcGeometry = useMemo(() => makeArcGeometry(), []);
  const arcMaterial = useMemo(() => makeGroundMaterial(PALETTE.dogMark, 0.56), []);
  const dustGeometry = useMemo(() => new THREE.IcosahedronGeometry(0.095, 0), []);
  const dustMaterial = useMemo(() => makeGroundMaterial(PALETTE.penGround, 0.42), []);
  /** x, y, z, age, life, vx, vy, vz per mote. A life of zero is inactive. */
  const dust = useMemo(() => new Float32Array(DUST_COUNT * DUST_STRIDE), []);
  const cursor = useRef(0);
  const travel = useRef(0);
  const lastX = useRef(0);
  const lastZ = useRef(0);
  const primed = useRef(false);

  useEffect(() => {
    dust.fill(0);
    cursor.current = 0;
    travel.current = 0;
    primed.current = false;
  }, [dust, sim]);

  useFrame((_, delta) => {
    const dog = sim.state.dogs[0];
    const arc = arcRef.current;
    const motes = dustRef.current;
    if (!dog || !arc || !motes) return;

    const x = dog.position.x;
    const z = dog.position.z;
    const ground = field.groundY(x, z);
    arc.position.set(x, ground + ARC_LIFT, z);
    const stamina = Math.min(Math.max(dog.stamina / 100, 0), 1);
    arcGeometry.setDrawRange(0, Math.max(1, Math.ceil(stamina * ARC_SEGMENTS)) * 6);

    const reduceMotion = useGameStore.getState().reduceMotion;
    const vx = dog.velocity.x;
    const vz = dog.velocity.z;
    const speed = Math.sqrt(vx * vx + vz * vz);
    if (!primed.current) {
      lastX.current = x;
      lastZ.current = z;
      primed.current = true;
    }
    const dx = x - lastX.current;
    const dz = z - lastZ.current;
    lastX.current = x;
    lastZ.current = z;
    travel.current += Math.sqrt(dx * dx + dz * dz);

    if (!reduceMotion && speed >= DUST_MIN_SPEED && travel.current >= DUST_STEP) {
      travel.current %= DUST_STEP;
      const slot = cursor.current;
      cursor.current = (slot + 1) % DUST_COUNT;
      const at = slot * DUST_STRIDE;
      const side = slot % 2 === 0 ? -1 : 1;
      const rightX = -dog.heading.z;
      const rightZ = dog.heading.x;
      const spawnX = x - dog.heading.x * 0.78 + rightX * side * 0.28;
      const spawnZ = z - dog.heading.z * 0.78 + rightZ * side * 0.28;
      dust[at] = spawnX;
      dust[at + 1] = field.groundY(spawnX, spawnZ) + 0.12;
      dust[at + 2] = spawnZ;
      dust[at + 3] = 0;
      dust[at + 4] = 0.7 + (slot % 3) * 0.08;
      dust[at + 5] = -dog.heading.x * 0.18 + rightX * side * 0.12;
      dust[at + 6] = 0.24 + (slot % 4) * 0.035;
      dust[at + 7] = -dog.heading.z * 0.18 + rightZ * side * 0.12;
    }

    for (let i = 0; i < DUST_COUNT; i++) {
      const at = i * DUST_STRIDE;
      const life = dust[at + 4]!;
      if (reduceMotion || life <= 0) {
        if (reduceMotion) dust[at + 4] = 0;
        dummy.scale.setScalar(0);
      } else {
        const age = dust[at + 3]! + delta;
        dust[at + 3] = age;
        if (age >= life) {
          dust[at + 4] = 0;
          dummy.scale.setScalar(0);
        } else {
          dust[at] = dust[at]! + dust[at + 5]! * delta;
          dust[at + 1] = dust[at + 1]! + dust[at + 6]! * delta;
          dust[at + 2] = dust[at + 2]! + dust[at + 7]! * delta;
          const fade = 1 - age / life;
          dummy.position.set(dust[at]!, dust[at + 1]!, dust[at + 2]!);
          dummy.scale.setScalar(0.45 + fade * 0.85);
        }
      }
      dummy.updateMatrix();
      motes.setMatrixAt(i, dummy.matrix);
    }
    motes.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <mesh ref={arcRef} geometry={arcGeometry} material={arcMaterial} renderOrder={2} />
      <instancedMesh
        ref={dustRef}
        args={[dustGeometry, dustMaterial, DUST_COUNT]}
        frustumCulled={false}
        renderOrder={3}
      />
    </>
  );
}
