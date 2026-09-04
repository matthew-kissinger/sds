// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The dog: the player's avatar and the second hero asset (spec/04).
 *
 * One lofted border collie, its inverted-hull outline, and a contact shadow on
 * the ground under it. The shape lives in dog/dogParts.ts as tables of
 * cross-sections and dog/dogGeometry.ts as the skeleton that places them, the
 * colours in dog/coatTones.ts, the markings in dog/dogMarks.ts, the coat that
 * assembles both in dog/dogMarkings.ts, the ramp in dog/dogToon.ts, the gait in
 * dog/dogMaterial.ts and how the animal carries itself in dog/dogMotion.ts; this
 * file is only the join between the sim and those modules.
 *
 * TWO TRANSFORMS, not one. Both groups take position and heading, while body
 * bob, pitch and bank are vertex deformations masked away from the paw line.
 * The shadow never tips or bobs: a decal that rolled with the body would be the
 * most obvious tell in the frame.
 *
 * The dog's transform is not in the FlockSim typed arrays (those are the sheep
 * buffer contract), so this reads `sim.state.dogs[0]` directly. That is a read
 * of pure sim state by presentation code: nothing here writes back, every sim
 * vector is read by component so no pooled vector is ever touched, and the dog
 * heading is already a unit vector the sim maintains without trig, so the atan2
 * below is presentation-only.
 *
 * Yaw remains the only Group rotation. Explicit scalar pitch and bank in the
 * material avoid the cross-backend dynamic-Euler failure and keep paws planted.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useHeightfield } from '@app/world/heightfield';
import { useGameStore } from '@app/state/store';
import {
  DOG_PAW_BASELINE,
  DOG_PAW_CONTACTS,
  buildDogGeometry,
} from './dog/dogGeometry';
import { makeDogMaterial } from './dog/dogMaterial';
import { DOG_COAT_PRESETS } from './dog/dogCustomization';
import { advanceDogMotion, createDogMotion, dogPawSwingZ } from './dog/dogMotion';
import { SHADOW_LIFT, makeContactShadow } from './dog/contactShadow';
import { DogGroundFeedback } from './juice/DogGroundFeedback';
import { footTerrainOffsetFromBasis } from './flock/terrainPlanting';
import { debugFlags } from './glFactory';
import {
  advancePositionPresentationBuffers,
  createPositionPresentationBuffers,
  PRESENTATION_DIAGNOSTIC_INTERVAL,
  resetPositionPresentationBuffers,
} from './flock/presentationBuffers';

const REPORT_PRESENTATION = import.meta.env.DEV && typeof window !== 'undefined'
  && (debugFlags().has('readout') || debugFlags().has('driver'));

/** Half of the app's 45 degree vertical fov, as a tangent (App.tsx). */
const TAN_HALF_FOV = Math.tan((45 * Math.PI) / 360);
/**
 * How thick the outline should be ON SCREEN, in CSS pixels at whatever viewport
 * the page is running. Held constant across the cameras rather than in metres:
 * at Classic (54 m) a world-constant line that looked right at Follow (20 m)
 * would be a third of a pixel, and Classic is the distance where the outline
 * has to do its job.
 */
const OUTLINE_PIXELS = 2;
/** Bounds on the hull, metres, for the frames where the camera is unusually
 *  close or far. Below the first the line breaks up on the legs, which are the
 *  thinnest thing it has to draw around; above the second it starts to inflate
 *  the tail tip into a blob. */
const OUTLINE_MIN = 0.017;
const OUTLINE_MAX = 0.055;
/** Height on the dog the outline width is measured to, metres. The shoulder. */
const OUTLINE_AIM_Y = 1.1;

export function Dog() {
  const sim = useGameStore((state) => state.sim);
  const field = useHeightfield();
  const bodyRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Group>(null);

  const geometry = useMemo(() => buildDogGeometry(), []);
  const dogMaterial = useMemo(() => makeDogMaterial(), []);
  const shadow = useMemo(() => makeContactShadow(), []);
  const motion = useMemo(() => createDogMotion(), []);
  const position = useMemo(() => createPositionPresentationBuffers(1), []);
  const diagnostics = useMemo(() => ({
    elapsed: 0,
    turnStepMax: 0,
    receipt: { dogTurnStep: 0 },
  }), []);

  const dogCoatPreset = useGameStore((state) => state.dogCoatPreset);

  useLayoutEffect(() => {
    resetPositionPresentationBuffers(position, sim.dogPositions, sim.tick);
    diagnostics.elapsed = 0;
    diagnostics.turnStepMax = 0;
  }, [diagnostics, position, sim]);

  useLayoutEffect(() => {
    const preset = DOG_COAT_PRESETS[dogCoatPreset] ?? DOG_COAT_PRESETS.classic;
    dogMaterial.coatUniforms.shadow.value.set(preset.shadow);
    dogMaterial.coatUniforms.mid.value.set(preset.mid);
    dogMaterial.coatUniforms.lit.value.set(preset.lit);
    dogMaterial.coatUniforms.outline.value.set(preset.outline);
  }, [dogCoatPreset, dogMaterial]);

  useFrame((state, delta) => {
    const body = bodyRef.current;
    const patch = shadowRef.current;
    const dog = sim.state.dogs[0];
    if (!body || !patch || !dog) return;

    // Components only. `Math.sqrt` rather than `Math.hypot` for the same reason
    // sim/ bans hypot: it is implementation-approximated, and there is no
    // reason for the renderer to hold a looser standard than the tick.
    const vx = dog.velocity.x;
    const vz = dog.velocity.z;
    const store = useGameStore.getState();
    const secondaryMotion = store.reduceMotion ? 0.25 : 1;
    const headingStep = advanceDogMotion(
      motion,
      delta,
      Math.sqrt(vx * vx + vz * vz),
      dog.heading.x,
      dog.heading.z,
      secondaryMotion,
    );
    if (REPORT_PRESENTATION) {
      diagnostics.turnStepMax = Math.max(
        diagnostics.turnStepMax,
        Math.abs(headingStep),
      );
      diagnostics.elapsed += Math.max(0, delta);
      if (diagnostics.elapsed >= PRESENTATION_DIAGNOSTIC_INTERVAL) {
        diagnostics.elapsed %= PRESENTATION_DIAGNOSTIC_INTERVAL;
        diagnostics.receipt.dogTurnStep = diagnostics.turnStepMax;
        diagnostics.turnStepMax = 0;
        store.reportRuntimeDiagnostics(diagnostics.receipt);
      }
    }

    const isCustomize = store.uiPanel === 'customize';
    if (isCustomize) {
      motion.idleSeconds = 0;
      motion.sit = 0;
      motion.headTilt = 0;
    }

    dogMaterial.gaitPhase.value = motion.gaitPhase;
    dogMaterial.effort.value = motion.effort;
    dogMaterial.sit.value = isCustomize ? 0 : motion.sit;
    dogMaterial.headTilt.value = isCustomize ? 0 : motion.headTilt;
    dogMaterial.motionScale.value = secondaryMotion;
    dogMaterial.bodyBob.value = motion.bob;
    dogMaterial.bodyLean.value = isCustomize ? 0 : motion.lean;
    dogMaterial.bodyRoll.value = isCustomize ? 0 : motion.roll;

    // The sim is flat 2D (spec/04). Presentation reconstructs the fixed loop's
    // remainder and draws between its two latest ticks.
    const interpolatePosition = true;
    advancePositionPresentationBuffers(
      position,
      sim.dogPositions,
      sim.tick,
      delta,
      interpolatePosition,
    );
    const alpha = position.interpolationAlpha;
    const x = interpolatePosition
      ? position.previousPositions[0]!
        + (position.currentPositions[0]! - position.previousPositions[0]!) * alpha
      : dog.position.x;
    const z = interpolatePosition
      ? position.previousPositions[1]!
        + (position.currentPositions[1]! - position.previousPositions[1]!) * alpha
      : dog.position.z;
    // Ground and every paw sample use the interpolated XZ, so the animal cannot
    // glide between tick endpoints while its vertical placement stays behind.
    const ground = field.groundY(x, z);
    const yaw = Math.PI / 2 - Math.atan2(motion.headingZ, motion.headingX);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);

    const offsets = dogMaterial.terrainOffsets.value as THREE.Vector4;
    // Diagonal gait pairs: front +x / hind -x oppose front -x / hind +x.
    const pairA = dogPawSwingZ(motion, -1, secondaryMotion);
    const pairB = dogPawSwingZ(motion, 1, secondaryMotion);
    offsets.set(
      footTerrainOffsetFromBasis(field, ground, x, z, cosYaw, sinYaw, 1, 1, 1, DOG_PAW_CONTACTS[0], pairA),
      footTerrainOffsetFromBasis(field, ground, x, z, cosYaw, sinYaw, 1, 1, 1, DOG_PAW_CONTACTS[1], pairB),
      footTerrainOffsetFromBasis(field, ground, x, z, cosYaw, sinYaw, 1, 1, 1, DOG_PAW_CONTACTS[2], pairB),
      footTerrainOffsetFromBasis(field, ground, x, z, cosYaw, sinYaw, 1, 1, 1, DOG_PAW_CONTACTS[3], pairA),
    );

    // The authored sole is 2 cm above local zero. Body-only bob, lean and roll live
    // in the vertex material, masked away from the paw contact line.
    body.position.set(x, ground - DOG_PAW_BASELINE, z);
    body.rotation.set(0, yaw, 0);

    patch.position.set(x, ground + SHADOW_LIFT, z);
    patch.rotation.y = yaw;

    // One uniform write, no allocation: the hull thickness that puts the
    // outline at OUTLINE_PIXELS from wherever the camera happens to be.
    const camera = state.camera;
    const dx = camera.position.x - x;
    const dy = camera.position.y - (ground + OUTLINE_AIM_Y);
    const dz = camera.position.z - z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const width = (OUTLINE_PIXELS * 2 * TAN_HALF_FOV * distance) / state.size.height;
    dogMaterial.outlineWidth.value = Math.min(OUTLINE_MAX, Math.max(OUTLINE_MIN, width));
  });

  return (
    <>
      <DogGroundFeedback />
      <group ref={shadowRef}>
        <mesh geometry={shadow.geometry} material={shadow.material} />
      </group>
      <group ref={bodyRef}>
        <mesh geometry={geometry} material={dogMaterial.outlineMaterial} />
        <mesh geometry={geometry} material={dogMaterial.material} />
      </group>
    </>
  );
}
