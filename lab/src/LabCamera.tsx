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
import {
  advancePositionPresentationBuffers,
  createPositionPresentationBuffers,
  resetPositionPresentationBuffers,
} from '@app/scene/flock/presentationBuffers';
import { useGameStore } from '@app/state/store';
import { useLabStore } from './labStore';
import { labSubject } from './subjects';

/** Degrees per second while spinning. The beauty orbit's authored rate. */
const SPIN_RATE = (6 * Math.PI) / 180;

export function LabCamera() {
  const camera = useThree((state) => state.camera);
  const spin = useRef(0);
  const aim = useMemo(() => new THREE.Vector3(), []);
  // THE SAME INTERPOLATION CONTRACT THE RENDERER USES, and the lab was the one
  // place not honouring it. `sim.positions` advances once per tick; the flock
  // and the dog are DRAWN at previous + (current - previous) * alpha, somewhere
  // between two ticks. Aiming at the stepped position while the subject glides
  // means the subject slides back and forth inside the frame every tick - 0.12 m
  // at full sheep speed, about ten pixels at review distance - and on frames
  // where no tick landed the camera does not move at all, so it is a stutter
  // rather than a lag. It looked exactly like the animals were jittering, and
  // it looked that way for the dog too, which is what gave it away: one camera
  // fault reads as every subject in the lab having the same twitch.
  //
  // `app/src/camera/subject.ts` has done this correctly all along.
  //
  // One capacity-1 buffer, fed the TARGET POINT rather than the whole flock
  // array, because the interpolation is linear and a centroid is a mean: the
  // centroid of the interpolated positions and the interpolation of the stepped
  // centroid are the same point, and this way the camera carries two floats
  // instead of four hundred.
  const track = useMemo(() => createPositionPresentationBuffers(1), []);
  const stepped = useMemo(() => new Float32Array(2), []);
  const tracked = useRef<{ sim: unknown; tick: number; target: string } | null>(null);

  useFrame((_, delta) => {
    const lab = useLabStore.getState();
    const subject = labSubject(lab.subject);
    const sim = useGameStore.getState().sim;

    // The target at the latest TICK. Interpolation happens below, once, so
    // every subject kind gets it rather than only the ones that remembered to.
    if (subject.target.kind === 'fixed') {
      stepped[0] = subject.target.x;
      stepped[1] = subject.target.z;
    } else if (subject.target.kind === 'dog') {
      stepped[0] = sim.dogPositions[0] ?? 0;
      stepped[1] = sim.dogPositions[1] ?? 0;
    } else if (subject.target.kind === 'sheep') {
      stepped[0] = sim.positions[0] ?? 0;
      stepped[1] = sim.positions[1] ?? 0;
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
        stepped[0] = sumX / count;
        stepped[1] = sumZ / count;
      }
    }

    // A restart swaps the sim and rewinds the tick, and changing subject moves
    // the target somewhere unrelated. Reset on all three rather than lerping
    // across a discontinuity.
    if (
      tracked.current?.sim !== sim
      || sim.tick < tracked.current.tick
      || tracked.current.target !== subject.target.kind
    ) {
      resetPositionPresentationBuffers(track, stepped, sim.tick);
    }
    tracked.current = { sim, tick: sim.tick, target: subject.target.kind };
    advancePositionPresentationBuffers(track, stepped, sim.tick, delta, true);

    const alpha = track.interpolationAlpha;
    const targetX = track.previousPositions[0]!
      + (track.currentPositions[0]! - track.previousPositions[0]!) * alpha;
    const targetZ = track.previousPositions[1]!
      + (track.currentPositions[1]! - track.previousPositions[1]!) * alpha;

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
