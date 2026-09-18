// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The camera, as a component: turn the store into one frame of input, run
 * `composedRig`, and write what comes back to the camera.
 *
 * Everything the picture is made of lives in `composedRig`, which is a plain
 * module with no React, no store and no camera in it, so a node test can drive
 * the pipeline the player actually looks through instead of a copy of it. What
 * is left here is the three things only a component can do: read the store
 * transiently, follow the canvas size, and own the projection.
 *
 * Reads are transient: `getState()` inside the frame callback, never React
 * state per frame (spec/01). Renders are rare and discrete rather than absent:
 * `useReducedMotion` is a store subscription, and `useThree`'s size changes on
 * a resize or an orientation change. Neither can happen per frame, and the rig
 * itself is memoized across both, so no state it holds is lost to one.
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
import { studioLayout } from './studioLayout';
import { createComposedRig, type ComposedRigInput } from './composedRig';
import { useReducedMotion } from '@app/ui/useReducedMotion';
import { cameraViewProfile } from './viewProfile';
import { createCameraSubject } from './subject';

const DEBUG = import.meta.env.DEV ? debugFlags() : new Set<string>();
const FORCE_FOLLOW = DEBUG.has('follow');

/**
 * How far through a Classic -> Follow swap the camera is, published at module
 * scope. 0 is fully Classic, 1 fully Follow, and it is the eased weight the
 * picture is actually framed at rather than the linear ramp behind it.
 *
 * MODULE-SCOPE MUTABLE, and the same sanctioned exception `followFraming`
 * documents for the rig bearing, for the same reason and with the same cost.
 * The input layer has to move its movement basis across the same interval the
 * camera does, or the player's controls change meaning in one frame while the
 * view is still half-way between two framings. A per-frame value cannot go
 * through the store, and a window global or a bridge singleton is not allowed,
 * so a named module-scope value behind an accessor is what is left. The app
 * renders exactly one CameraRig; if a second existed they would fight over it.
 */
let publishedModeBlend = 0;

/** The eased Classic <-> Follow blend weight. 0 is Classic, 1 is Follow. */
export function cameraModeBlend(): number {
  return publishedModeBlend;
}

export function CameraRig() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const reducedMotion = useReducedMotion();
  const studio = useMemo(() => studioLayout(size.width, size.height), [size.width, size.height]);
  const view = useMemo(
    () => cameraViewProfile(size.width / Math.max(1, size.height)),
    [size.height, size.width],
  );

  const rig = useMemo(() => {
    const state = useGameStore.getState();
    // Seated from the mode the page loaded in and the sim it was built against,
    // so the first frame is the framing the player asked for rather than a
    // transition into it, and a rig built on this sim has not had it replaced.
    const follow = FORCE_FOLLOW || state.cameraMode === 'follow';
    const input: ComposedRigInput = {
      sim: state.sim,
      follow,
      reducedMotion: false,
      turning: state.followTurning,
      complete: false,
      customize: false,
      customizeTab: state.customizeTab,
      customizeDogAngle: state.customizeDogAngle,
      customizeOrbitAngle: state.customizeOrbitAngle,
      customizeSelectedSheep: state.customizeSelectedSheep,
      sheep: state.sim.state.sheep,
    };
    // Built once and told about the canvas through the effect below, which
    // runs before the first frame; rebuilding it on a resize would throw away
    // every blend in flight.
    return {
      subject: createCameraSubject(),
      pipeline: createComposedRig({ follow, sim: state.sim }),
      input,
    };
  }, []);

  useLayoutEffect(() => {
    rig.pipeline.setFollowView(view.follow);
    rig.pipeline.setStudioDistance(studio.distanceScale);
  }, [rig, studio, view]);

  // The resolver reads the published weight at priority -2, ahead of this rig,
  // so a page that loads in Follow would spend its first frame being told it
  // was in Classic. Seating it here rather than in the frame callback costs a
  // line and removes that frame.
  useLayoutEffect(() => {
    publishedModeBlend = rig.pipeline.modeWeight;
  }, [rig]);

  useFrame((_, delta) => {
    const {
      sim,
      cameraMode,
      gamePhase,
      uiPanel,
      followTurning,
      customizeTab,
      customizeDogAngle,
      customizeOrbitAngle,
      customizeSelectedSheep,
    } = useGameStore.getState();

    const dog = rig.subject.sample(sim, delta);
    if (!dog) return;

    // One object, written in place: a fresh one per frame would allocate.
    const input = rig.input;
    input.sim = sim;
    input.follow = FORCE_FOLLOW || cameraMode === 'follow';
    input.reducedMotion = reducedMotion;
    input.turning = followTurning;
    input.complete = gamePhase === 'complete';
    input.customize = uiPanel === 'customize';
    input.customizeTab = customizeTab;
    input.customizeDogAngle = customizeDogAngle;
    input.customizeOrbitAngle = customizeOrbitAngle;
    input.customizeSelectedSheep = customizeSelectedSheep;
    input.sheep = sim.state.sheep;

    rig.pipeline.frame(delta, dog, input);

    const weight = rig.pipeline.modeWeight;
    const cWeight = rig.pipeline.customizeWeight;
    publishedModeBlend = weight;

    if (camera instanceof THREE.PerspectiveCamera) {
      const baseFov = 45 + (view.fov - 45) * weight;
      const targetFov = baseFov + (38 - baseFov) * cWeight;
      if (Math.abs(camera.fov - targetFov) > 0.01) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
      if (cWeight > 0) {
        const x = studio.offsetX * cWeight, y = studio.offsetY * cWeight;
        if (!camera.view?.enabled || camera.view.offsetX !== x || camera.view.offsetY !== y
          || camera.view.fullWidth !== size.width || camera.view.fullHeight !== size.height) {
          camera.setViewOffset(size.width, size.height, x, y, size.width, size.height);
        }
      } else if (camera.view?.enabled) camera.clearViewOffset();
    }

    camera.position.copy(rig.pipeline.position);
    camera.lookAt(rig.pipeline.aim);
  });

  return null;
}
