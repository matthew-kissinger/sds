// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The camera. One system, once a frame: run both framings, blend between them
 * by the mode the store is in, write the result to the camera.
 *
 * NOTHING SNAPS, ANYWHERE. That is the whole design brief and it is why this
 * component holds a blend value instead of a mode:
 *
 *  - Mode toggle. Both rigs are live every frame, so neither is ever stale.
 *    The swap moves a 0..1 blend at 1 / MODE_BLEND_SECONDS and shapes it with a
 *    smoothstep, so the camera leaves and arrives at zero velocity and a second
 *    toggle mid-swap turns around instead of jumping.
 *  - Game start and reset. Both replace the sim, so the dog can move
 *    discontinuously - a reset from the gate puts it back at the spawn 160 m
 *    away. Every rig output is exponentially smoothed against the dog and held
 *    under MAX_RIG_SPEED, so that reads as a glide back rather than a whip-pan.
 *    Only the very first frame of the page seats instantly, when there is
 *    nothing to glide from.
 *  - A long frame. Position blends are capped at MAX_POSITION_K and dt is
 *    capped at MAX_FRAME_DT, so a backgrounded tab resumes without a lurch.
 *
 * Reads are transient: `getState()` inside the frame callback, never React
 * state per frame (spec/01). This component renders once and never re-renders.
 *
 * Ordering: this leaves priority at 0, so it runs after `useGameLoop` (-1) and
 * `IntentResolver` (-2) and reads a dog the sim has already stepped this frame.
 *
 * Development can force Follow through the sanctioned debug parameter. The
 * production bundle ignores that override and exposes only the in-game toggle.
 */

import { useLayoutEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { debugFlags } from '@app/scene/glFactory';
import { useGameStore } from '@app/state/store';
import { createClassicFraming } from './classicFraming';
import { createFollowFraming } from './followFraming';
import { createCustomizeFraming } from './customizeFraming';
import { MAX_FRAME_DT, MODE_BLEND_SECONDS, easeInOut } from './feel';
import { useReducedMotion } from '@app/ui/useReducedMotion';
import { cameraViewProfile } from './viewProfile';
import {
  COMPLETION_CAMERA_SECONDS,
  advanceCompletion,
  smoothArrival,
} from '@app/scene/juice/completionMotion';

const DEBUG = import.meta.env.DEV ? debugFlags() : new Set<string>();
const FORCE_FOLLOW = DEBUG.has('follow');

export function CameraRig() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const reducedMotion = useReducedMotion();
  const view = useMemo(
    () => cameraViewProfile(size.width / Math.max(1, size.height)),
    [size.height, size.width],
  );

  const rig = useMemo(
    () => ({
      classic: createClassicFraming(),
      follow: createFollowFraming(),
      customize: createCustomizeFraming(),
      // Seated from the mode the page loaded in, so the first frame is the
      // framing the player asked for rather than a transition into it.
      blend: FORCE_FOLLOW || useGameStore.getState().cameraMode === 'follow' ? 1 : 0,
      customizeBlend: 0,
      position: new THREE.Vector3(),
      aim: new THREE.Vector3(),
      completionPosition: new THREE.Vector3(),
      completionAim: new THREE.Vector3(),
      completionTargetPosition: new THREE.Vector3(),
      completionTargetAim: new THREE.Vector3(),
      completionDirection: new THREE.Vector3(),
      completion: 0,
      wasComplete: false,
    }),
    [],
  );

  useLayoutEffect(() => {
    rig.follow.setView(view.follow);
  }, [rig, view]);

  useFrame((_, delta) => {
    const {
      sim,
      cameraMode,
      gamePhase,
      uiPanel,
      customizeTab,
      customizeDogAngle,
      customizeOrbitAngle,
      customizeSelectedSheep,
    } = useGameStore.getState();

    const dog = sim.state.dogs[0];
    if (!dog) return;
    const dt = Math.min(delta, MAX_FRAME_DT);

    rig.classic.update(dt, dog);
    rig.follow.update(dt, dog);
    rig.customize.update(
      dt,
      customizeTab,
      customizeDogAngle,
      customizeOrbitAngle,
      customizeSelectedSheep,
      dog,
      sim.state.sheep,
    );

    const target = FORCE_FOLLOW || cameraMode === 'follow' ? 1 : 0;
    const step = dt / MODE_BLEND_SECONDS;
    const remaining = target - rig.blend;
    rig.blend += Math.max(-step, Math.min(step, remaining));

    const isCustomize = uiPanel === 'customize';
    const customizeTarget = isCustomize ? 1 : 0;
    const customizeStep = dt / 0.4;
    const customizeRemaining = customizeTarget - rig.customizeBlend;
    rig.customizeBlend += Math.max(-customizeStep, Math.min(customizeStep, customizeRemaining));

    const weight = easeInOut(rig.blend);
    const cWeight = easeInOut(rig.customizeBlend);

    if (camera instanceof THREE.PerspectiveCamera) {
      const baseFov = 45 + (view.fov - 45) * weight;
      const targetFov = baseFov + (38 - baseFov) * cWeight;
      if (Math.abs(camera.fov - targetFov) > 0.01) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
    }
    rig.position.lerpVectors(rig.classic.position, rig.follow.position, weight);
    rig.aim.lerpVectors(rig.classic.aim, rig.follow.aim, weight);

    if (cWeight > 0) {
      rig.position.lerpVectors(rig.position, rig.customize.position, cWeight);
      rig.aim.lerpVectors(rig.aim, rig.customize.aim, cWeight);
    }

    const complete = gamePhase === 'complete';
    if (complete && !rig.wasComplete) {
      rig.completionPosition.copy(rig.position);
      rig.completionAim.copy(rig.aim);
      rig.completionDirection
        .subVectors(rig.completionPosition, rig.completionAim)
        .normalize();
      const pull = reducedMotion ? 0 : 11;
      rig.completionTargetPosition
        .copy(rig.completionPosition)
        .addScaledVector(rig.completionDirection, pull);
      rig.completionTargetPosition.y += reducedMotion ? 0 : 3.5;
      rig.completionTargetAim.copy(rig.completionAim);
      if (!reducedMotion) {
        rig.completionTargetAim.x += (0 - rig.completionTargetAim.x) * 0.2;
        rig.completionTargetAim.z += (106 - rig.completionTargetAim.z) * 0.2;
      }
    }
    if (!complete && rig.wasComplete) rig.completion = 0;
    rig.wasComplete = complete;

    if (complete) {
      rig.completion = advanceCompletion(
        rig.completion,
        true,
        dt,
        COMPLETION_CAMERA_SECONDS,
        reducedMotion,
      );
      const settle = smoothArrival(rig.completion);
      rig.position.lerpVectors(
        rig.completionPosition,
        rig.completionTargetPosition,
        settle,
      );
      rig.aim.lerpVectors(rig.completionAim, rig.completionTargetAim, settle);
    }

    camera.position.copy(rig.position);
    camera.lookAt(rig.aim);
  });

  return null;
}
