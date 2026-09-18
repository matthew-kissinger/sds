// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The camera the player looks through, driven from a test: the SHIPPED
 * pipeline, the store's own actions, and one `lookAt`.
 *
 * THIS FILE USED TO BE A MIRROR, AND THAT WAS THE DEFECT. `CameraRig`'s frame
 * body lived inside the component, where a node test could not reach it, so
 * this file restated it - the stages, their order, and four of the rig's
 * private constants. A mirror is prone to exactly one failure, being wrong in
 * the way the thing it mirrors is not, and it failed that way twice in a row.
 * It pinned `customizeTab` to 'dog' and modelled no orbit reset, so the
 * `VERTICAL_FLOOR` assertion could not have seen the singularity that lived in
 * `customizeFraming`'s own approach pair: that one is reached by clicking a tab
 * or a preset, which is the moment the store resets `customizeOrbitAngle` to 0,
 * and this file had no way to express either. Then the rig grew a composed
 * rotation budget and the mirror kept the per-stage ceilings it replaced, so
 * the suite went red against arithmetic the shipped rig no longer contains.
 *
 * `composedRig` is now a plain module - no React, no store, no camera - so
 * there is nothing left to mirror. This file IMPORTS it. Every stage, every
 * order and every constant is the shipped one by construction, and drift is
 * not something a reviewer has to check for because there is no second copy to
 * drift from.
 *
 * WHAT IS LEFT HERE is the two things `CameraRig` does that `composedRig` does
 * not, plus the store:
 *
 *  - the camera. `camera.position.copy(...)` then `camera.lookAt(...)`, which
 *    is the line the whole file exists to measure: `lookAt` against a world up
 *    is degenerate at the poles, and the composed view direction is the only
 *    place that can be seen.
 *  - the sim's IDENTITY. The rig treats a new `sim` object as a run start or a
 *    reset and re-arms Follow's bearing on it. `simChanged` on a request swaps
 *    the token, so the identity comparison the rig makes is the real one.
 *  - the store's Customize actions, below, which carry the resets the panel's
 *    buttons cause. They are the only way to move the Studio's tab, preset or
 *    orbit from here, so a scenario cannot reach a Studio state the panel
 *    cannot: clicking a tab or a preset zeroes the orbit because
 *    `setCustomizeTab` and `setCustomizeDogAngle` do, and there is no setter
 *    that skips it.
 *
 * WHAT THIS STILL DOES NOT COVER, stated plainly because the gaps are the part
 * of a harness that misleads:
 *
 *  - `createCameraSubject`. The rig interpolates its dog out of the sim's tick
 *    buffers; the caller here hands a dog over directly. Nothing about the
 *    subject's own interpolation is measured.
 *  - the projection. `CameraRig` ramps the field of view with the two blend
 *    weights and slides the Studio's subject clear of the panel with
 *    `camera.setViewOffset`. Both write the projection matrix only, and no
 *    quantity this file reports - the world direction, the right vector, the
 *    pose - can see either. Restating their arithmetic here would be a mirror
 *    again, for no measurement.
 *  - a canvas that changes size. `useThree`'s size feeds `setFollowView` and
 *    `setStudioDistance`, and the caller here picks one size for the life of
 *    the rig. An orientation flip mid-run is not driven by anything below.
 *  - the rest of the store. Everything else arrives as a field on a request.
 */

import * as THREE from 'three/webgpu';
import type { Dog } from '@sim/types';
import type { DogCameraAngle } from '@app/camera/customizeFraming';
import type { FollowTurning } from '@app/camera/followFraming';
import { createComposedRig, type ComposedRigInput } from '@app/camera/composedRig';
import { studioLayout } from '@app/camera/studioLayout';
import { cameraViewProfile } from '@app/camera/viewProfile';

export type CustomizeTab = 'dog' | 'flock' | 'sheep';

/** What the Studio's flock and sheep tabs read. The sim's sheep, narrowed. */
export interface SheepLike {
  readonly position: { readonly x: number; readonly z: number };
}

/** What the store would be telling the rig this frame, less the Studio state,
 *  which moves through the actions on `ComposedCamera` instead. */
export interface FrameRequest {
  dt: number;
  dog: Dog;
  /** `cameraMode === 'follow'`. The mode blend's target. */
  follow: boolean;
  /** `uiPanel === 'customize'`. The Studio blend's target. Prefer
   *  `openCustomize()`, which is what the button does; this is the raw flag,
   *  for a close, which resets nothing. */
  customize?: boolean;
  /** `gamePhase === 'complete'`. */
  complete?: boolean;
  /**
   * Replace the sim on this frame: a run start, a reset, or a flock-size
   * change. The rig compares object identity, so this swaps the token it is
   * comparing against, and the rig re-arms Follow's bearing exactly when the
   * shipped one would.
   */
  simChanged?: boolean;
  /** The sim's sheep. Only the flock and sheep tabs read them. */
  sheep?: readonly SheepLike[];
}

export interface ComposedCamera {
  /** The camera the player looks through, after `lookAt`. */
  readonly camera: THREE.PerspectiveCamera;
  /** The eased Classic <-> Follow weight, what `cameraModeBlend` publishes. */
  readonly weight: number;
  /** The eased Studio weight. 0 is gameplay, 1 is Customize. */
  readonly customizeWeight: number;
  /** The committed pose, before `lookAt`. */
  readonly position: THREE.Vector3;
  readonly aim: THREE.Vector3;
  readonly classic: { readonly position: THREE.Vector3; readonly aim: THREE.Vector3 };
  readonly follow: { readonly position: THREE.Vector3; readonly aim: THREE.Vector3 };

  /** The Studio's live tab, preset, orbit and selection, for an assertion that
   *  wants to state what the scenario was actually in. Read only. */
  readonly studio: {
    readonly tab: CustomizeTab;
    readonly dogAngle: DogCameraAngle;
    readonly orbitAngle: number;
    readonly selectedSheep: number;
  };

  // --- the store's Customize actions, copied in behaviour from `store.ts` ---
  /** `openCustomize`: the panel opens on the dog tab at the hero preset with
   *  the orbit at zero, whatever it was left at. Sets `customize` from here on
   *  until a request says otherwise. */
  openCustomize(): void;
  /** `setCustomizeTab`: a tab click. RESETS THE ORBIT TO ZERO, which is the
   *  step that made the pose the panel asks for jump to the far side of the
   *  subject while the live pose was still on this side. */
  setTab(tab: CustomizeTab): void;
  /** `setCustomizeDogAngle`: a preset click. Resets the orbit to zero too. */
  setDogAngle(angle: DogCameraAngle): void;
  /** `setCustomizeSelectedSheep`: the sheep tab's arrows. Clamped at zero and
   *  NOT an orbit reset - the store has none here. */
  selectSheep(index: number): void;
  /** `setCustomizeOrbitAngle` as the panel calls it: a DIFFERENCE. The drag is
   *  `prev - deltaX * 0.007` and the buttons are `prev +/- PI/6`, so the angle
   *  accumulates without bound and is never wrapped. */
  orbitBy(delta: number): void;

  frame(request: FrameRequest): void;
}

export interface ComposedOptions {
  /** Canvas size, which picks the view profile and the Studio layout. */
  width?: number;
  height?: number;
  turning?: FollowTurning;
  reducedMotion?: boolean;
  /** Which framing the page loaded in, seated the way the rig seats it. */
  startInFollow?: boolean;
}

const NO_SHEEP: readonly SheepLike[] = [];

export function createComposedCamera(options: ComposedOptions = {}): ComposedCamera {
  const width = options.width ?? 1440;
  const height = options.height ?? 900;
  const reducedMotion = options.reducedMotion ?? false;
  const turning = options.turning ?? 'gentle';
  const follow = options.startInFollow !== false;

  const studio = studioLayout(width, height);
  const view = cameraViewProfile(width / Math.max(1, height));
  const camera = new THREE.PerspectiveCamera(view.fov, width / height, 0.1, 2000);

  // The token the rig compares for identity. It stands for the sim; nothing
  // here reads anything off it, because the rig does not either.
  let sim: object = { run: 0 };
  let runs = 0;

  const pipeline = createComposedRig({ follow, sim, view: view.follow, turning });
  pipeline.setFollowView(view.follow);
  pipeline.setStudioDistance(studio.distanceScale);

  // The Studio's store state. Written only by the actions below.
  let tab: CustomizeTab = 'dog';
  let dogAngle: DogCameraAngle = 'hero';
  let orbitAngle = 0;
  let selectedSheep = 0;
  let panelOpen = false;

  // One input object, written in place, because that is what the component
  // does and a fresh one per frame would allocate in a `useFrame` path.
  const input: ComposedRigInput = {
    sim,
    follow,
    reducedMotion,
    turning,
    complete: false,
    customize: false,
    customizeTab: tab,
    customizeDogAngle: dogAngle,
    customizeOrbitAngle: orbitAngle,
    customizeSelectedSheep: selectedSheep,
    sheep: NO_SHEEP,
  };

  const studioState = {
    get tab(): CustomizeTab {
      return tab;
    },
    get dogAngle(): DogCameraAngle {
      return dogAngle;
    },
    get orbitAngle(): number {
      return orbitAngle;
    },
    get selectedSheep(): number {
      return selectedSheep;
    },
  };

  return {
    camera,
    position: pipeline.position,
    aim: pipeline.aim,
    classic: pipeline.classic,
    follow: pipeline.follow,
    studio: studioState,
    get weight(): number {
      return pipeline.modeWeight;
    },
    get customizeWeight(): number {
      return pipeline.customizeWeight;
    },

    openCustomize(): void {
      panelOpen = true;
      tab = 'dog';
      dogAngle = 'hero';
      orbitAngle = 0;
    },
    setTab(next: CustomizeTab): void {
      tab = next;
      orbitAngle = 0;
    },
    setDogAngle(next: DogCameraAngle): void {
      dogAngle = next;
      orbitAngle = 0;
    },
    selectSheep(index: number): void {
      selectedSheep = Math.max(0, index);
    },
    orbitBy(delta: number): void {
      orbitAngle += delta;
    },

    frame(request: FrameRequest): void {
      if (request.customize !== undefined) panelOpen = request.customize;
      if (request.simChanged) {
        runs += 1;
        sim = { run: runs };
      }
      input.sim = sim;
      input.follow = request.follow;
      input.reducedMotion = reducedMotion;
      input.turning = turning;
      input.complete = request.complete === true;
      input.customize = panelOpen;
      input.customizeTab = tab;
      input.customizeDogAngle = dogAngle;
      input.customizeOrbitAngle = orbitAngle;
      input.customizeSelectedSheep = selectedSheep;
      input.sheep = request.sheep ?? NO_SHEEP;

      pipeline.frame(request.dt, request.dog, input);

      camera.position.copy(pipeline.position);
      camera.lookAt(pipeline.aim);
      camera.updateMatrixWorld(true);
    },
  };
}
