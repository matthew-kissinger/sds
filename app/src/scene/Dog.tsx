// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** One owned skinned collie: coat and outline share the same22-bone pose. */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useHeightfield } from '@app/world/heightfield';
import { useGameStore } from '@app/state/store';
import { DOG_PAW_BASELINE, buildDogGeometry } from './dog/dogGeometry';
import { makeDogMaterial } from './dog/dogMaterial';
import { DOG_COAT_PRESETS } from './dog/dogCustomization';
import { advanceDogMotion, createDogMotion, resetDogMotion } from './dog/dogMotion';
import { DogRig } from './dog/dogRig';
import { dogOutlineWidth } from './dog/outlineWidth';
import { SHADOW_LIFT, makeContactShadow } from './dog/contactShadow';
import { DogGroundFeedback } from './juice/DogGroundFeedback';
import { BarkEdgeTracker } from './juice/barkPulse';
import { debugFlags } from './glFactory';
import {
  advancePositionPresentationBuffers, createPositionPresentationBuffers,
  PRESENTATION_DIAGNOSTIC_INTERVAL, resetPositionPresentationBuffers,
} from './flock/presentationBuffers';
const REPORT_PRESENTATION = import.meta.env.DEV && typeof window !== 'undefined'
  && (debugFlags().has('readout') || debugFlags().has('driver'));

export function Dog() {
  const sim = useGameStore((state) => state.sim);
  const field = useHeightfield();
  const bodyRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => buildDogGeometry(), []);
  const material = useMemo(() => makeDogMaterial(), []);
  const rig = useMemo(() => new DogRig(geometry, material), [geometry, material]);
  const shadow = useMemo(() => makeContactShadow(), []);
  const motion = useMemo(() => createDogMotion(), []);
  const position = useMemo(() => createPositionPresentationBuffers(1), []);
  const bark = useMemo(() => new BarkEdgeTracker(), [sim]);
  const diagnostics = useMemo(() => ({ elapsed: 0, turnStepMax: 0, receipt: { dogTurnStep: 0 } }), []);
  const coat = useGameStore((state) => state.dogCoatPreset);
  useLayoutEffect(() => {
    resetPositionPresentationBuffers(position, sim.dogPositions, sim.tick);
    resetDogMotion(motion);
    rig.reset();
    diagnostics.elapsed = 0;
    diagnostics.turnStepMax = 0;
  }, [diagnostics, position, sim, motion, rig]);
  useLayoutEffect(() => {
    const preset = DOG_COAT_PRESETS[coat] ?? DOG_COAT_PRESETS.classic;
    material.coatUniforms.shadow.value.set(preset.shadow);
    material.coatUniforms.mid.value.set(preset.mid);
    material.coatUniforms.lit.value.set(preset.lit);
    material.coatUniforms.outline.value.set(preset.outline);
  }, [coat, material]);
  useEffect(() => () => {
    rig.dispose();
    geometry.dispose();
    material.material.dispose();
    material.outlineMaterial.dispose();
    shadow.geometry.dispose();
    shadow.material.dispose();
  }, [rig, geometry, material, shadow]);

  useFrame((state, delta) => {
    const body = bodyRef.current;
    const patch = shadowRef.current;
    const dog = sim.state.dogs[0];
    if (!body || !patch || !dog) return;
    const store = useGameStore.getState();
    const customize = store.uiPanel === 'customize';
    const paused = store.gamePhase === 'paused' && !customize;
    const secondary = store.reduceMotion ? 0.25 : 1;
    const acceptedBark = bark.sample(store.acceptedBark) !== null;
    const speed = customize ? 0 : Math.sqrt(dog.velocity.x ** 2 + dog.velocity.z ** 2);
    const headingStep = advanceDogMotion(motion, delta, speed, dog.heading.x, dog.heading.z,
      secondary, paused, acceptedBark);
    if (customize) { motion.idleSeconds = 0; motion.sit = 0; motion.headTilt = 0; motion.bob = 0; }
    if (REPORT_PRESENTATION) {
      diagnostics.turnStepMax = Math.max(diagnostics.turnStepMax, Math.abs(headingStep));
      diagnostics.elapsed += Math.max(0, delta);
      if (diagnostics.elapsed >= PRESENTATION_DIAGNOSTIC_INTERVAL) {
        diagnostics.elapsed %= PRESENTATION_DIAGNOSTIC_INTERVAL;
        diagnostics.receipt.dogTurnStep = diagnostics.turnStepMax;
        diagnostics.turnStepMax = 0;
        store.reportRuntimeDiagnostics(diagnostics.receipt);
      }
    }
    advancePositionPresentationBuffers(position, sim.dogPositions, sim.tick, delta, true);
    const alpha = position.interpolationAlpha;
    const x = position.previousPositions[0]! + (position.currentPositions[0]! - position.previousPositions[0]!) * alpha;
    const z = position.previousPositions[1]! + (position.currentPositions[1]! - position.previousPositions[1]!) * alpha;
    const ground = field.groundY(x, z);
    const yaw = Math.PI / 2 - Math.atan2(motion.headingZ, motion.headingX);
    body.position.set(x, ground - DOG_PAW_BASELINE, z);
    body.rotation.set(0, yaw, 0);
    body.updateMatrixWorld(true);
    if (!paused) rig.pose(motion, field, x, z, ground, yaw, secondary);
    patch.position.set(x, ground + SHADOW_LIFT, z);
    patch.rotation.y = yaw;
    const camera = state.camera;
    const distance = Math.hypot(camera.position.x - x, camera.position.y - ground - 1.1, camera.position.z - z);
    material.outlineWidth.value = dogOutlineWidth(camera.projectionMatrix.elements[5]!, distance,
      state.size.height, camera instanceof THREE.PerspectiveCamera);
  });
  return (
    <>
      <DogGroundFeedback />
      <group ref={shadowRef}><mesh geometry={shadow.geometry} material={shadow.material} /></group>
      <group ref={bodyRef}>
        <primitive object={rig.outline} />
        <primitive object={rig.coat} />
      </group>
    </>
  );
}
