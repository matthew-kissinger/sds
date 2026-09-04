// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { texture, uniform } from 'three/tsl';
import { useGameStore } from '@app/state/store';
import { groundY } from '@app/world/heightfield';
import { getSheepName } from '@app/game/sheepNames';
import { useSheepPicker } from './useSheepPicker';
import {
  drawHeritagePlaque,
  PLAQUE_CANVAS_WIDTH,
  PLAQUE_CANVAS_HEIGHT,
  PLAQUE_ASPECT,
} from './ui/plaqueDrawing';

/** Physical height in 3D world units. */
const PLAQUE_WORLD_HEIGHT = 0.44;

/**
 * 3D Heritage Name Plaque Billboard.
 * Displays the active sheep or dog's name with artisan wooden framing,
 * eggshell parchment, tactile spring arrival, animated specular gleam sweep,
 * distance-compensated scaling, and a graceful uplift-dissolve on hover-off.
 *
 * Fully compliant with AGENTS.md Rule 3: Single TSL NodeMaterial across genuine
 * WebGPU and forced WebGL2 backends.
 */
export function SheepHoverLabel() {
  const sim = useGameStore((state) => state.sim);
  const { camera, pointer, gl } = useThree();

  const groupRef = useRef<THREE.Group>(null);
  const pillRef = useRef<THREE.Mesh>(null);

  // Dynamic animation states for tactile AAA feel
  const activeEntityRef = useRef<number | null>(null);
  const scaleRef = useRef<number>(0.0);
  const velocityRef = useRef<number>(0.0);
  const opacityRef = useRef<number>(0.0);
  const timeRef = useRef<number>(0);
  const gleamProgressRef = useRef<number>(2.0); // > 1.2 means inactive
  const lastActiveNameRef = useRef<string>('');
  const lastTargetPos = useRef<{ x: number; z: number; baseY: number }>({
    x: 0,
    z: 0,
    baseY: 0,
  });
  const currentPos = useRef(new THREE.Vector3());
  const isPosInitialized = useRef<boolean>(false);

  // Dedicated high-DPI canvas texture for the billboard plaque
  const { ctx, canvasTexture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = PLAQUE_CANVAS_WIDTH;
    c.height = PLAQUE_CANVAS_HEIGHT;
    const context = c.getContext('2d', { willReadFrequently: false });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (gl.capabilities?.getMaxAnisotropy) {
      tex.anisotropy = Math.min(gl.capabilities.getMaxAnisotropy(), 8);
    }
    return { ctx: context, canvasTexture: tex };
  }, [gl]);

  // Material using TSL texture and opacity nodes
  const opacityUniform = useMemo(() => uniform(0), []);
  const pillMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    mat.colorNode = texture(canvasTexture);
    mat.opacityNode = texture(canvasTexture).a.mul(opacityUniform);
    return mat;
  }, [canvasTexture, opacityUniform]);

  const pillGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  // Ensure Alice font is preloaded in document
  useEffect(() => {
    const fontFace = new FontFace('Alice', 'url(/fonts/Alice-Regular.ttf)');
    fontFace
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
      })
      .catch(() => {
        // Fallback serif available via CSS
      });
  }, []);

  // Pick sheep or dog by cursor/touch
  const { update } = useSheepPicker(sim, camera, pointer, gl.domElement);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const safeDelta = Math.min(delta, 0.05);
    timeRef.current += safeDelta;

    // Pick hovered entity or fallback to customized sheep in studio
    let activeIndex = update();
    const state = useGameStore.getState();
    const isCustomizeStudio = state.uiPanel === 'customize';

    if (activeIndex === null && isCustomizeStudio) {
      if (state.customizeTab === 'sheep') {
        activeIndex = state.customizeSelectedSheep;
      } else if (state.customizeTab === 'dog') {
        activeIndex = -1;
      }
    }

    const hasTarget = activeIndex !== null;

    // Detect target transition (hover-on or target change)
    if (hasTarget && activeIndex !== activeEntityRef.current) {
      activeEntityRef.current = activeIndex;
      // Trigger tactile entrance bounce & specular gleam sweep
      scaleRef.current = 0.6;
      velocityRef.current = 4.2;
      gleamProgressRef.current = 0.0;
    }

    // Determine target 3D world position
    let targetX = lastTargetPos.current.x;
    let targetZ = lastTargetPos.current.z;
    let targetBaseY = lastTargetPos.current.baseY;

    if (activeIndex === -1) {
      if (sim.dogPositions && sim.dogPositions.length >= 2) {
        targetX = sim.dogPositions[0]!;
        targetZ = sim.dogPositions[1]!;
        targetBaseY = groundY(targetX, targetZ) + 1.05;
      }
    } else if (activeIndex !== null) {
      const pos = sim.positions;
      if (activeIndex < sim.headings.length) {
        targetX = pos[activeIndex * 2]!;
        targetZ = pos[activeIndex * 2 + 1]!;
        targetBaseY =
          groundY(targetX, targetZ) + (isCustomizeStudio ? 1.25 : 1.45);
      }
    }

    lastTargetPos.current.x = targetX;
    lastTargetPos.current.z = targetZ;
    lastTargetPos.current.baseY = targetBaseY;

    // Smooth exponential position tracking to eliminate physics tick micro-stutter
    if (!isPosInitialized.current || (hasTarget && activeIndex !== activeEntityRef.current)) {
      currentPos.current.set(targetX, targetBaseY, targetZ);
      isPosInitialized.current = true;
    } else {
      currentPos.current.x = THREE.MathUtils.damp(currentPos.current.x, targetX, 26, safeDelta);
      currentPos.current.y = THREE.MathUtils.damp(currentPos.current.y, targetBaseY, 26, safeDelta);
      currentPos.current.z = THREE.MathUtils.damp(currentPos.current.z, targetZ, 26, safeDelta);
    }

    // Target animation parameters
    const targetOpacity = hasTarget ? 1.0 : 0.0;
    const targetScale = hasTarget ? 1.0 : 0.85;

    // Smooth opacity fade (crisp entry, graceful exit)
    opacityRef.current = THREE.MathUtils.damp(opacityRef.current, targetOpacity, hasTarget ? 24 : 14, safeDelta);
    opacityUniform.value = opacityRef.current;

    // When fully faded out, hide group and reset state
    if (!hasTarget && opacityRef.current < 0.008) {
      group.visible = false;
      scaleRef.current = 0.0;
      velocityRef.current = 0.0;
      activeEntityRef.current = null;
      gleamProgressRef.current = 2.0;
      isPosInitialized.current = false;
      return;
    }

    // Damped harmonic oscillator for tactile spring arrival and hover-off settle
    const stiffness = 260;
    const damping = 18;
    const springForce = (targetScale - scaleRef.current) * stiffness;
    const dampingForce = -velocityRef.current * damping;
    velocityRef.current += (springForce + dampingForce) * safeDelta;
    scaleRef.current += velocityRef.current * safeDelta;

    // Figure out display name and entity kind
    let currentName = '';
    let isDog = false;
    if (activeEntityRef.current === -1) {
      currentName = state.dogName || 'Pip';
      isDog = true;
    } else if (activeEntityRef.current !== null && activeEntityRef.current < sim.headings.length) {
      currentName = getSheepName(activeEntityRef.current, state.customSheepNames);
      isDog = false;
    }

    // Animate specular light sweep on entrance
    let needsRedraw = false;
    if (gleamProgressRef.current <= 1.25) {
      gleamProgressRef.current += safeDelta * 2.6;
      needsRedraw = true;
    }

    // Draw plaque onto canvas only when text changed or during the entrance gleam
    if (currentName && (needsRedraw || lastActiveNameRef.current !== currentName) && ctx) {
      lastActiveNameRef.current = currentName;
      drawHeritagePlaque(ctx, {
        name: currentName,
        isDog,
        gleamProgress: gleamProgressRef.current <= 1.2 ? gleamProgressRef.current : undefined,
      });
      canvasTexture.needsUpdate = true;
    }

    // Gentle organic breathing bobbing while hovered
    const bobY = Math.sin(timeRef.current * 2.4) * 0.02;

    // Hover-off graceful uplift: floats upwards into the air while fading out
    const hoverOffLift = hasTarget ? 0.0 : (1.0 - opacityRef.current) * 0.22;

    group.position.set(
      currentPos.current.x,
      currentPos.current.y + bobY + hoverOffLift,
      currentPos.current.z,
    );

    // Billboard alignment facing the active camera
    group.quaternion.copy(camera.quaternion);

    // Distance-compensated scaling:
    // Clamped linear distance scaling keeps plaque legible from 4.5m studio to 54m classic view.
    const dist = camera.position.distanceTo(group.position);
    const k = isCustomizeStudio
      ? PLAQUE_WORLD_HEIGHT
      : THREE.MathUtils.clamp(dist * 0.055, 1.0, 2.8);

    const effectiveScale = Math.max(k * scaleRef.current, 0.001);
    group.scale.set(effectiveScale, effectiveScale, effectiveScale);

    // Update billboard quad aspect
    if (pillRef.current) {
      pillRef.current.scale.set(PLAQUE_ASPECT, 1, 1);
    }

    group.visible = true;
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={pillRef} geometry={pillGeometry} material={pillMaterial} renderOrder={200} />
    </group>
  );
}
