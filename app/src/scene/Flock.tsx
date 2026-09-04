// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The flock: three InstancedMeshes sharing one instance matrix, written
 * imperatively from the FlockSim typed arrays every frame. drei <Instances> is
 * forbidden on this path (spec/01); the component renders no React per sheep and
 * re-renders only when the sim itself is replaced.
 *
 * The renderer reads `positions`, `headings` and `stateFlags` and nothing else,
 * so it cannot tell CpuDeterministicSim from the GpuComputeSim that lands in
 * phase 7. Agitation is derived here, in presentation land, from how far a sheep
 * moved this frame: nothing written here is ever read back by the sim.
 *
 * THREE DRAW CALLS FOR THE WHOLE FLOCK AND ONE MATRIX WRITE PER SHEEP, at 25 or
 * at 5000: the shaded body, the inverted-hull outline spec/05 asks for on hero
 * assets, and the contact decal that puts the animals in the grass rather than
 * over it. All three draw from the SAME instance matrix buffer, possible only
 * because that matrix holds nothing but position, heading and size - the
 * breathing bob and the bolt lean live in the vertex shader
 * (flock/sheepMotion.ts), so the decal shares the matrix without tipping.
 *
 * Every per-sheep difference a player can see - size, build, stance, place in the
 * group, fleece tint, wool creases, gait phase, how far its nose is into the
 * grass - comes from that matrix and three instanced attributes, never from a
 * per-sheep object. The third is the CPU path's four terrain contact samples;
 * GPU scale presentation supplies placement separately. The frame loop allocates nothing.
 *
 * THE FLOCK MUST NOT READ AS A LATTICE. The sim's separation force settles a
 * gathered group onto a near-regular grid, and twenty identical animals on a grid
 * facing one way is a rectangular array of clones. Three seeded per-instance
 * offsets break it - a lateral scatter up to 0.32 m off the sim position, 26
 * degrees of yaw either side of the heading, and the size and build spread below.
 * All presentation only: the sim never sees them, and the decal shares the
 * matrix, so a scattered sheep takes its shadow with it.
 *
 * The loop owns THREE derived quantities, all presentation-only. Agitation is how
 * fast a sheep moved this frame, normalised and smoothed. The gait phase is that
 * agitation integrated: phase must be advanced by rate times delta rather than
 * reconstructed as `time * rate`, because a per-instance rate that changes makes
 * that product jump by `time` times the change, and forty seconds in the jump is
 * thousands of radians. The third is the outline width, solved from this sheep's
 * camera distance so the ink holds constant width in SCREEN space; see
 * flock/sheepMaterial.ts for why that cannot be done in the shader.
 *
 * Size, build, yaw jitter, scatter, tint, starting phase and noise seed are
 * drawn once from a seeded rng, so the same flock comes back on every reload and
 * a capture can be re-shot.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { SHEEP_STATE_FLAG } from '@sim/FlockSim';
import { TICK_HZ } from '@sim/tuning';
import { useHeightfield } from '@app/world/heightfield';
import { useGameStore } from '@app/state/store';
import { buildSheepGeometry } from './flock/sheepGeometry';
import { buildSheepOutlineGeometry } from './flock/sheepOutlineGeometry';
import {
  SHEEP_HOOF_BASELINE,
} from './flock/sheepParts';
import { makeSheepMaterial, makeSheepOutlineMaterial } from './flock/sheepMaterial';
import { FLOCK_VARIETY_MODE_VALUES } from './flock/sheepVariety';
import { makeSheepShadow } from './flock/sheepShadow';
import { uniform } from '@app/tsl/nodes';
import { advanceSheepResponse } from './flock/sheepResponse';
import {
  AGITATION_TAU,
  OUTLINE_FAR_METRES, OUTLINE_FAR_PIXELS, OUTLINE_MAX, OUTLINE_MIN, OUTLINE_NEAR_METRES,
  OUTLINE_NEAR_PIXELS, SHAPE_STRIDE, SHEEP_HEADING_STEP_LIMIT, SHEEP_HEADING_TAU,
  SHEEP_MAX_SPEED_MPS, TAU, sheepGaitRateForAgitation, sheepLegPose,
  sheepStrideForAgitation,
} from './flock/flockTuning';
import { smoothHeadingInto } from './flock/headingSmoothing';
import {
  measureSheepStanceContact,
  writeSheepTerrainOffsets,
} from './flock/terrainPlanting';
import { debugFlags } from './glFactory';
import {
  advancePositionPresentationBuffers,
  CPU_FLOCK_CAPACITY,
  createFlockPresentationBuffers,
  initializeFlockFirstDraw,
  PRESENTATION_DIAGNOSTIC_INTERVAL,
  resetFlockPresentationBuffers,
} from './flock/presentationBuffers';

const REPORT_PRESENTATION = import.meta.env.DEV && typeof window !== 'undefined'
  && (debugFlags().has('readout') || debugFlags().has('driver'));
/** Capture-only material isolation through the one sanctioned debug parameter. */
const SHEEP_OUTLINE_ONLY = import.meta.env.DEV
  && typeof window !== 'undefined'
  && debugFlags().has('sheep-outline');
const SHEEP_RAMP_ONLY = import.meta.env.DEV
  && typeof window !== 'undefined'
  && debugFlags().has('sheep-ramp');

export function Flock() {
  const sim = useGameStore((state) => state.sim);
  const flockVarietyMode = useGameStore((state) => state.flockVarietyMode);
  const field = useHeightfield();
  const count = sim.headings.length;

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const outlineRef = useRef<THREE.InstancedMesh>(null);
  const shadowRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // These buffers and the material graphs that read them keep one identity for
  // 25, 75 and 200 sheep. Only mesh.count and the active seeded range change.
  const buffers = useMemo(() => createFlockPresentationBuffers(), []);
  const { style, shape, motion, terrain, headings: presentationHeadings } = buffers;
  const diagnostics = useMemo(() => ({
    elapsed: 0,
    turnStepMax: 0,
    contact: { footErrorMax: 0, stanceContacts: 0 },
    receipt: { sheepFootErrorMax: 0, sheepAirborne: 0, sheepTurnStepMax: 0 },
  }), []);

  /** One shared accessibility gain, not one flag in every instance record. */
  const motionScale = useMemo(() => uniform(1), []);
  const varietyModeUniform = useMemo(
    () => uniform(FLOCK_VARIETY_MODE_VALUES[flockVarietyMode] ?? 0),
    [],
  );

  useLayoutEffect(() => {
    varietyModeUniform.value = FLOCK_VARIETY_MODE_VALUES[flockVarietyMode] ?? 0;
  }, [flockVarietyMode, varietyModeUniform]);

  /**
   * One packed style buffer serves body and outline: tint, seed, then the X and
   * Z ratios needed to cancel nonuniform instance scale. Replacing the original
   * vec2 style binding rather than adding an attribute holds the complete sheep
   * at WebGPU's eight-vertex-buffer floor.
   */
  const packedStyle = useMemo(() => new THREE.InstancedBufferAttribute(
    new Float32Array(CPU_FLOCK_CAPACITY * 4),
    4,
  ), []);
  /** Fixed-tick endpoints, shared by positional interpolation and gait speed. */
  const previousPositions = buffers.previousPositions;
  const currentPositions = buffers.currentPositions;

  const geometry = useMemo(() => buildSheepGeometry(), []);
  const outlineGeometry = useMemo(() => buildSheepOutlineGeometry(geometry), [geometry]);
  const material = useMemo(
    () => makeSheepMaterial(packedStyle, motion, motionScale, terrain, varietyModeUniform),
    [motion, motionScale, packedStyle, terrain, varietyModeUniform],
  );
  const outlineMaterial = useMemo(
    () => makeSheepOutlineMaterial(packedStyle, motion, motionScale, terrain),
    [motion, motionScale, packedStyle, terrain],
  );
  const shadow = useMemo(() => makeSheepShadow(), []);

  // The outline and the decal are the same instances seen differently, so they
  // read the same matrix rather than a second copy of it: one write per sheep
  // per frame, one upload, whatever the flock size grows to. Done in a layout
  // effect, which is after all three meshes exist and before the first frame is
  // drawn - a later swap would leave the renderer holding the buffer it bound.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    const outline = outlineRef.current;
    const decal = shadowRef.current;
    if (mesh === null || outline === null || decal === null) return;
    resetFlockPresentationBuffers(buffers, sim);
    const sourceStyle = style.array as Float32Array;
    const packed = packedStyle.array as Float32Array;
    packed.fill(0);
    for (let i = 0; i < count; i++) {
      const shapeAt = i * SHAPE_STRIDE;
      const styleAt = i * 2;
      const packedAt = i * 4;
      const scaleY = shape[shapeAt + 1]!;
      packed[packedAt] = sourceStyle[styleAt]!;
      packed[packedAt + 1] = sourceStyle[styleAt + 1]!;
      packed[packedAt + 2] = scaleY / shape[shapeAt]!;
      packed[packedAt + 3] = scaleY / shape[shapeAt + 2]!;
    }
    packedStyle.needsUpdate = true;
    initializeFlockFirstDraw(mesh, buffers, sim, field, dummy);
    diagnostics.elapsed = 0;
    diagnostics.turnStepMax = 0;
    outline.instanceMatrix = mesh.instanceMatrix;
    decal.instanceMatrix = mesh.instanceMatrix;
    outline.count = count;
    decal.count = count;
  }, [buffers, count, diagnostics, dummy, field, packedStyle, shape, sim, style]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { positions, headings, stateFlags } = sim;
    const motionValues = motion.array as Float32Array;
    const terrainValues = terrain.array as Float32Array;
    const store = useGameStore.getState();
    motionScale.value = store.reduceMotion ? 0.2 : 1;
    const blend = delta > 0 ? 1 - Math.exp(-delta / AGITATION_TAU) : 0;
    const interpolatePositions = true;
    const tickDelta = advancePositionPresentationBuffers(
      buffers,
      positions,
      sim.tick,
      delta,
      interpolatePositions,
    );
    const sampledMotion = tickDelta > 0;
    const sampleDelta = sampledMotion ? tickDelta / TICK_HZ : 0;
    const positionAlpha = buffers.interpolationAlpha;
    let reportPresentation = false;
    if (REPORT_PRESENTATION) {
      diagnostics.elapsed += Math.max(0, delta);
      if (diagnostics.elapsed >= PRESENTATION_DIAGNOSTIC_INTERVAL) {
        diagnostics.elapsed %= PRESENTATION_DIAGNOSTIC_INTERVAL;
        reportPresentation = true;
      }
    }

    // World metres per screen pixel, per metre of distance. One trig call a
    // frame rather than one per sheep, and read off the live camera so the
    // phone aspect and the desktop aspect both get the same drawn line.
    const camera = state.camera as THREE.PerspectiveCamera;
    const perPixel = (2 * Math.tan((camera.fov * Math.PI) / 360)) / state.size.height;
    const inkFall = 1 / (OUTLINE_FAR_METRES - OUTLINE_NEAR_METRES);
    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;
    const gateZ = sim.state.field.gate.position.z;
    let sheepFootErrorMax = 0;
    let sheepAirborne = 0;

    for (let i = 0; i < count; i++) {
      const at = i * SHAPE_STRIDE;
      const positionAt = i * 2;
      const simX = currentPositions[positionAt]!;
      const simZ = currentPositions[positionAt + 1]!;
      const renderX = interpolatePositions
        ? previousPositions[positionAt]!
          + (simX - previousPositions[positionAt]!) * positionAlpha
        : positions[positionAt]!;
      const renderZ = interpolatePositions
        ? previousPositions[positionAt + 1]!
          + (simZ - previousPositions[positionAt + 1]!) * positionAlpha
        : positions[positionAt + 1]!;
      const x = renderX + shape[at + 4]!;
      const z = renderZ + shape[at + 5]!;

      const motionAt = i * 4;
      let target = motionValues[motionAt + 1]!;
      if (sampledMotion) {
        target = 0;
        if (stateFlags[i] === SHEEP_STATE_FLAG.active) {
          const dx = simX - previousPositions[positionAt]!;
          const dz = simZ - previousPositions[positionAt + 1]!;
          target = Math.min(Math.sqrt(dx * dx + dz * dz) / sampleDelta / SHEEP_MAX_SPEED_MPS, 1);
        }
      }
      const level = motionValues[motionAt + 1]! + (target - motionValues[motionAt + 1]!) * blend;
      const rate = sheepGaitRateForAgitation(level);
      motionValues[motionAt] = (motionValues[motionAt]! + rate * delta) % TAU;
      motionValues[motionAt + 1] = level;
      const velocityX = sampledMotion ? (simX - previousPositions[positionAt]!) / sampleDelta : 0;
      const velocityZ = sampledMotion ? (simZ - previousPositions[positionAt + 1]!) / sampleDelta : 0;
      const crossedGate = sampledMotion
        && previousPositions[positionAt + 1]! < gateZ
        && simZ >= gateZ;
      motionValues[motionAt + 3] = advanceSheepResponse(
        buffers.response,
        i,
        velocityX,
        velocityZ,
        delta,
        crossedGate,
        sampledMotion,
        sampleDelta,
      );
      // The mesh origin is between the hooves, so the ground height IS the
      // instance height (spec/04: one groundY for everything that stands on it).
      const groundY = field.groundY(x, z);

      const headingAt = i * 2;
      const headingStep = smoothHeadingInto(
        presentationHeadings,
        headingAt,
        presentationHeadings[headingAt]!,
        presentationHeadings[headingAt + 1]!,
        Math.cos(headings[i]!),
        Math.sin(headings[i]!),
        delta,
        SHEEP_HEADING_TAU,
        SHEEP_HEADING_STEP_LIMIT,
      );
      if (REPORT_PRESENTATION) {
        diagnostics.turnStepMax = Math.max(diagnostics.turnStepMax, Math.abs(headingStep));
      }
      const yaw = Math.PI / 2
        - Math.atan2(presentationHeadings[headingAt + 1]!, presentationHeadings[headingAt]!)
        + shape[at + 3]!;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);

      const stride = sheepStrideForAgitation(level);
      const positiveSwing = sheepLegPose(motionValues[motionAt]!, 1).travel * stride;
      const negativeSwing = sheepLegPose(motionValues[motionAt]!, -1).travel * stride;
      const scaleX = shape[at]!;
      const scaleY = shape[at + 1]!;
      const scaleZ = shape[at + 2]!;
      const terrainAt = i * 4;
      writeSheepTerrainOffsets(
        terrainValues, terrainAt, field, groundY, x, z, cosYaw, sinYaw,
        scaleX, scaleY, scaleZ, positiveSwing, negativeSwing,
      );

      if (reportPresentation) {
        const phase = motionValues[motionAt]!;
        measureSheepStanceContact(
          diagnostics.contact, field, terrainValues, terrainAt, groundY, x, z, cosYaw, sinYaw,
          scaleX, scaleY, scaleZ, phase, stride,
        );
        sheepFootErrorMax = Math.max(sheepFootErrorMax, diagnostics.contact.footErrorMax);
        if (diagnostics.contact.stanceContacts === 0) sheepAirborne += 1;
      }

      // Width is normalised to local Y. The packed style's scaleY/scaleX and
      // scaleY/scaleZ ratios cancel the other two instance axes in the shader,
      // producing the same world-metre reach in every direction.
      const toCamX = camX - x;
      const toCamY = camY - groundY;
      const toCamZ = camZ - z;
      const distance = Math.sqrt(toCamX * toCamX + toCamY * toCamY + toCamZ * toCamZ);
      // Wide when the animal is near enough for the line to be read as a line,
      // narrowing to hold the silhouette at gameplay height. Clamped rather than
      // smoothstepped: this is a straight run between two authored widths and a
      // curve here would cost a multiply to describe nothing anyone can see.
      const far = Math.min(Math.max((distance - OUTLINE_NEAR_METRES) * inkFall, 0), 1);
      const pixels = OUTLINE_NEAR_PIXELS + (OUTLINE_FAR_PIXELS - OUTLINE_NEAR_PIXELS) * far;
      const ink = Math.min(Math.max(distance * perPixel * pixels, OUTLINE_MIN), OUTLINE_MAX);
      motionValues[motionAt + 2] = ink / scaleY;

      dummy.position.set(x, groundY - SHEEP_HOOF_BASELINE * scaleY, z);
      // heading is atan2(z, x); a Y rotation of PI/2 - heading turns the mesh's
      // +Z forward onto it. Nothing else rides in this matrix: the decal reads
      // it too, and a shadow must not tip, bob or lean.
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(scaleX, scaleY, scaleZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    motion.needsUpdate = true;
    terrain.needsUpdate = true;
    if (reportPresentation) {
      diagnostics.receipt.sheepFootErrorMax = sheepFootErrorMax;
      diagnostics.receipt.sheepAirborne = sheepAirborne;
      diagnostics.receipt.sheepTurnStepMax = diagnostics.turnStepMax;
      diagnostics.turnStepMax = 0;
      store.reportRuntimeDiagnostics(diagnostics.receipt);
    }
  });

  return (
    <>
      <instancedMesh
        ref={shadowRef}
        args={[shadow.geometry, shadow.material, CPU_FLOCK_CAPACITY]}
        frustumCulled={false}
        visible={!SHEEP_OUTLINE_ONLY}
      />
      <instancedMesh
        ref={outlineRef}
        args={[outlineGeometry, outlineMaterial, CPU_FLOCK_CAPACITY]}
        frustumCulled={false}
        renderOrder={-1}
        visible={!SHEEP_RAMP_ONLY}
      />
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, CPU_FLOCK_CAPACITY]}
        frustumCulled={false}
        visible={!SHEEP_OUTLINE_ONLY}
      />
    </>
  );
}
