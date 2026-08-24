// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * One system, once a frame: sample every device, merge them, project through
 * the camera basis, write the single intent the loop consumes. This is the only
 * writer of movement intent in a shipped page; devices own their own raw state
 * and nothing else. Production and test tooling drive these same device paths;
 * there is no player-page input override or scripted runtime controller.
 *
 * ORDER. It subscribes at priority -2, below `useGameLoop`'s -1, so intent is
 * fresh before the sim steps on it. R3F sorts subscribers ascending and only
 * takes rendering into its own hands above zero, so a negative priority is
 * purely an ordering statement.
 *
 * MERGE. Keyboard is the base. A gamepad stick with any deflection replaces it
 * outright: a stick already carries an angle, and summing a digital key into it
 * would corrupt that angle rather than add to it. A stick at rest contributes
 * zero, which is the additive result anyway, so the two rules agree everywhere
 * they overlap. Touch, when a thumb is down, is last and wins: a device you are
 * physically holding is never ambiguous. Sprint is the OR of all three.
 *
 * CAMERA BASIS. Follow reads the live camera's ground-plane forward straight off
 * the camera object inside useFrame - a transient read, no React state, no
 * subscription. Classic passes the constant world forward instead, because
 * camera-relative input from a top-down camera disorients (spec/06). One
 * mapping function, two forward vectors, no mode branch downstream.
 */

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { barkPressed, toggleCameraMode } from './actions';
import {
  axisMagnitude,
  worldFromAxis,
  CLASSIC_FORWARD_X,
  CLASSIC_FORWARD_Z,
  type MoveAxis,
  type WorldMove,
} from './axis';
import { pollGamepad } from './gamepad';
import { installKeyboard, keyboardAxis, keyboardSprint } from './keyboard';
import { setMoveDirection, setSprint } from './intent';
import { touchActive, touchAxis, touchSprint } from './touch';
import { useGameStore } from '@app/state/store';

/** Below useGameLoop's -1: intent is resolved before the sim reads it. */
const RESOLVE_PRIORITY = -2;

export function IntentResolver() {
  useEffect(() => installKeyboard(), []);

  // Stable scratch, allocated once: this runs every frame and allocates nothing.
  const scratch = useMemo(
    () => ({
      axis: { right: 0, forward: 0 } as MoveAxis,
      pad: { right: 0, forward: 0 } as MoveAxis,
      world: { x: 0, z: 0 } as WorldMove,
      forward: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((state) => {
    const reading = pollGamepad(scratch.pad);
    keyboardAxis(scratch.axis);
    let sprint = keyboardSprint();

    if (reading.present) {
      sprint = sprint || reading.sprint;
      if (axisMagnitude(scratch.pad) > 0) {
        scratch.axis.right = scratch.pad.right;
        scratch.axis.forward = scratch.pad.forward;
      }
      if (reading.barkPressed) barkPressed();
      if (reading.cameraPressed) toggleCameraMode();
    }

    if (touchActive()) {
      const thumb = touchAxis();
      scratch.axis.right = thumb.right;
      scratch.axis.forward = thumb.forward;
      sprint = sprint || touchSprint();
    }

    let forwardX = CLASSIC_FORWARD_X;
    let forwardZ = CLASSIC_FORWARD_Z;
    if (useGameStore.getState().cameraMode === 'follow') {
      state.camera.getWorldDirection(scratch.forward);
      forwardX = scratch.forward.x;
      forwardZ = scratch.forward.z;
    }

    worldFromAxis(scratch.axis, forwardX, forwardZ, scratch.world);
    setMoveDirection(scratch.world.x, scratch.world.z);
    setSprint(sprint);
  }, RESOLVE_PRIORITY);

  return null;
}
