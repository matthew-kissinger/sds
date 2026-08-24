// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** A terrain-following, soft ring for the one accepted bark event. */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { PALETTE } from '@app/tsl/palette';
import { useGameStore } from '@app/state/store';
import { useHeightfield } from '@app/world/heightfield';
import { BarkEdgeTracker, BARK_RING_SECONDS, barkRingFrame } from './barkPulse';

const SEGMENTS = 96;
const HALF_WIDTH = 0.5;
const GROUND_LIFT = 0.12;

function ringGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(SEGMENTS * 2 * 3);
  const indices = new Uint16Array(SEGMENTS * 6);
  for (let i = 0; i < SEGMENTS; i++) {
    const next = (i + 1) % SEGMENTS;
    const at = i * 6;
    indices[at] = i * 2;
    indices[at + 1] = next * 2;
    indices[at + 2] = i * 2 + 1;
    indices[at + 3] = next * 2;
    indices[at + 4] = next * 2 + 1;
    indices[at + 5] = i * 2 + 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

export interface BarkRingProps {
  readonly reducedMotion: boolean;
}

export function BarkRing({ reducedMotion }: BarkRingProps) {
  const field = useHeightfield();
  const mesh = useRef<THREE.Mesh>(null);
  const effect = useMemo(() => {
    const material = new THREE.MeshBasicNodeMaterial({
      color: PALETTE.sunGlow,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return {
      geometry: ringGeometry(),
      material,
      edge: new BarkEdgeTracker(),
      age: BARK_RING_SECONDS,
      x: 0,
      z: 0,
      cos: Float32Array.from({ length: SEGMENTS }, (_, i) => Math.cos((i / SEGMENTS) * Math.PI * 2)),
      sin: Float32Array.from({ length: SEGMENTS }, (_, i) => Math.sin((i / SEGMENTS) * Math.PI * 2)),
    };
  }, []);

  useEffect(() => () => {
    effect.geometry.dispose();
    effect.material.dispose();
  }, [effect]);

  useFrame((_, delta) => {
    const accepted = effect.edge.sample(useGameStore.getState().acceptedBark);
    if (accepted !== null) {
      effect.x = accepted.x;
      effect.z = accepted.z;
      effect.age = 0;
    } else {
      effect.age += delta;
    }
    const frame = barkRingFrame(effect.age, reducedMotion);
    if (mesh.current === null) return;
    mesh.current.visible = frame.visible;
    effect.material.opacity = 0.48 * frame.amplitude;
    if (!frame.visible) return;

    const position = effect.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SEGMENTS; i++) {
      const c = effect.cos[i]!;
      const s = effect.sin[i]!;
      const inner = Math.max(0.2, frame.radius - HALF_WIDTH);
      const outer = frame.radius + HALF_WIDTH;
      const ix = effect.x + c * inner;
      const iz = effect.z + s * inner;
      const ox = effect.x + c * outer;
      const oz = effect.z + s * outer;
      position.setXYZ(i * 2, ix, field.groundY(ix, iz) + GROUND_LIFT, iz);
      position.setXYZ(i * 2 + 1, ox, field.groundY(ox, oz) + GROUND_LIFT, oz);
    }
    position.needsUpdate = true;
  });

  return (
    <mesh
      ref={mesh}
      args={[effect.geometry, effect.material]}
      renderOrder={7}
      frustumCulled={false}
      visible={false}
    />
  );
}
