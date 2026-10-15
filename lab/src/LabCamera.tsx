// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The turntable. One authored orbit around whatever the subject points at, with
 * the camera and its aim both riding the relief through the one `groundY` every
 * ground-sitting thing reads (spec/04), so the horizon never tilts against the
 * subject on a hill.
 *
 * The spin angle lives in a ref, not the store: advancing a store field every
 * frame would re-render the panel sixty times a second for nothing. The store's
 * `orbit` is the hand-set bearing, and the spin adds to it.
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { groundY } from '@app/world/heightfield';
import { SHEEP_STATE_FLAG } from '@sim/FlockSim';
import { useGameStore } from '@app/state/store';
import { useLabStore } from './labStore';
import { labSubject } from './subjects';

/** Degrees per second while spinning. The beauty orbit's authored rate. */
const SPIN_RATE = (6 * Math.PI) / 180;

export function LabCamera() {
  const camera = useThree((state) => state.camera);
  const spin = useRef(0);
  const aim = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const lab = useLabStore.getState();
    const subject = labSubject(lab.subject);
    const sim = useGameStore.getState().sim;

    let targetX = 0;
    let targetZ = 0;
    if (subject.target.kind === 'fixed') {
      targetX = subject.target.x;
      targetZ = subject.target.z;
    } else if (subject.target.kind === 'dog') {
      targetX = sim.dogPositions[0] ?? 0;
      targetZ = sim.dogPositions[1] ?? 0;
    } else if (subject.target.kind === 'sheep') {
      targetX = sim.positions[0] ?? 0;
      targetZ = sim.positions[1] ?? 0;
    } else {
      // Active sheep only: penned ones sit behind the gate and would drag the
      // centroid off the flock the review is about (the beauty orbit's rule).
      let sumX = 0;
      let sumZ = 0;
      let count = 0;
      for (let i = 0; i < sim.stateFlags.length; i++) {
        if (sim.stateFlags[i] !== SHEEP_STATE_FLAG.active) continue;
        sumX += sim.positions[i * 2]!;
        sumZ += sim.positions[i * 2 + 1]!;
        count++;
      }
      if (count > 0) {
        targetX = sumX / count;
        targetZ = sumZ / count;
      }
    }

    if (lab.spinning) spin.current += delta * SPIN_RATE;
    const angle = lab.orbit + spin.current;
    const x = targetX + Math.sin(angle) * lab.distance;
    const z = targetZ + Math.cos(angle) * lab.distance;

    // Aim a little above the ground, scaled to how far back the camera stands:
    // 0.6 m reads a dog's chest, 6 m reads a treeline's crowns.
    const aimLift = Math.min(6, Math.max(0.6, lab.height * 0.25));
    camera.position.set(x, groundY(x, z) + lab.height, z);
    aim.set(targetX, groundY(targetX, targetZ) + aimLift, targetZ);
    camera.lookAt(aim);
  });

  return null;
}
