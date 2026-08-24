// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** A small flock lifts once from the hero oak on the first accepted bark. */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { PALETTE } from '@app/tsl/palette';
import { useGameStore } from '@app/state/store';
import { useHeightfield } from '@app/world/heightfield';
import { HERO } from '../treeline/oakSkeleton';
import { BarkEdgeTracker } from './barkPulse';

const BIRDS = 9;
const FLIGHT_SECONDS = 4.8;

function birdGeometry(): THREE.BufferGeometry {
  // Body and two swept wings, readable as a forked brush mark from either
  // gameplay camera. The small y offsets keep the silhouette from vanishing in
  // Follow without adding a second material or draw call.
  const positions = new Float32Array([
    0, 0.08, 0.55, -0.1, 0, -0.45, 0.1, 0, -0.45,
    -0.08, 0.02, 0.18, -0.82, 0.12, -0.16, -0.12, -0.02, -0.34,
    0.08, 0.02, 0.18, 0.12, -0.02, -0.34, 0.82, 0.12, -0.16,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export interface BirdLiftProps {
  readonly reducedMotion: boolean;
}

export function BirdLift({ reducedMotion }: BirdLiftProps) {
  const field = useHeightfield();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const flock = useMemo(() => {
    const geometry = birdGeometry();
    const material = new THREE.MeshBasicNodeMaterial({
      color: PALETTE.dogCoat,
      side: THREE.DoubleSide,
    });
    const object = new THREE.Object3D();
    return {
      geometry,
      material,
      object,
      edge: new BarkEdgeTracker(),
      sim: useGameStore.getState().sim,
      lifted: false,
      age: FLIGHT_SECONDS,
      // Start inside the crown's top edge, not at the fork. The first quarter
      // second is emergence through leaves; after that the flock clears the
      // twenty-metre canopy and reads against sky.
      baseY: field.groundY(HERO.x, HERO.z) + 17.2,
    };
  }, [field]);

  useEffect(() => () => {
    flock.geometry.dispose();
    flock.material.dispose();
  }, [flock]);

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    if (state.sim !== flock.sim) {
      flock.sim = state.sim;
      flock.lifted = false;
      flock.age = FLIGHT_SECONDS;
      if (mesh.current !== null) mesh.current.visible = false;
    }
    const accepted = flock.edge.sample(state.acceptedBark);
    if (!flock.lifted && accepted !== null) {
      flock.lifted = true;
      flock.age = 0;
    }
    if (!flock.lifted || mesh.current === null) return;
    flock.age += delta;
    const duration = reducedMotion ? 1.1 : FLIGHT_SECONDS;
    const t = Math.min(1, flock.age / duration);
    mesh.current.visible = t < 1;
    if (t >= 1) return;

    const travelScale = reducedMotion ? 0.22 : 1;
    const shown = reducedMotion ? 4 : BIRDS;
    for (let i = 0; i < BIRDS; i++) {
      const seed = (i + 1) * 1.61803398875;
      const angle = 0.45 + seed * 1.7 + t * (0.34 + (i % 3) * 0.08);
      const reach = (3.5 + t * (28 + (i % 4) * 2.6)) * travelScale;
      const lift = (t * (12 + (i % 3) * 1.7) + Math.sin(t * Math.PI) * 2.2) * travelScale;
      flock.object.position.set(
        HERO.x + Math.cos(angle) * reach,
        flock.baseY + lift,
        HERO.z + Math.sin(angle) * reach,
      );
      flock.object.rotation.set(
        -0.18 + Math.sin(t * 8 + seed) * 0.12,
        angle - Math.PI / 2,
        Math.sin(t * 16 + seed) * 0.28,
      );
      const wing = 0.82 + Math.sin(t * 34 + seed) * 0.18;
      const scale = i < shown ? (0.78 + (i % 3) * 0.1) : 0;
      flock.object.scale.set(scale * wing, scale, scale);
      flock.object.updateMatrix();
      mesh.current.setMatrixAt(i, flock.object.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[flock.geometry, flock.material, BIRDS]}
      frustumCulled={false}
      renderOrder={3}
      visible={false}
    />
  );
}
