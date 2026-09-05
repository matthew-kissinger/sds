// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useGameStore } from '@app/state/store';
import { groundY } from '@app/world/heightfield';
import { getSheepName } from '@app/game/sheepNames';
import { useSheepPicker } from './useSheepPicker';

/**
 * Static DOM badge element for the screen-space nameplate.
 * Rendered in standard React DOM outside <Canvas> to avoid R3F reconciler conflicts.
 */
export function NameplateBadge() {
  return (
    <div
      id="herd-nameplate-anchor"
      className="herd-nameplate-anchor"
      style={{ display: 'none', opacity: 0 }}
      aria-hidden="true"
    >
      <div className="herd-nameplate-badge">
        <span id="herd-nameplate-rosette-l" className="herd-nameplate-rosette" style={{ display: 'none' }}>◆</span>
        <span id="herd-nameplate-title" className="herd-nameplate-title" />
        <span id="herd-nameplate-rosette-r" className="herd-nameplate-rosette" style={{ display: 'none' }}>◆</span>
        <span id="herd-nameplate-gleam" className="herd-nameplate-gleam" />
      </div>
    </div>
  );
}

/**
 * Screen-Space Heritage Nameplate Controller.
 * Anchored to the active animal's 3D world position via camera projection.
 *
 * Delivers 100% vector-crisp, native Retina typography on mobile and desktop
 * (bypassing the WebGL DPR 1.0 limit), zero GPU texture uploads, tactile
 * harmonic spring arrival, specular gleam sweep, and graceful hover-off uplift.
 */
export function SheepHoverLabel() {
  const sim = useGameStore((state) => state.sim);
  const { camera, pointer, gl, size } = useThree();

  const domRefs = useRef<{
    anchor: HTMLElement | null;
    title: HTMLElement | null;
    rosetteL: HTMLElement | null;
    rosetteR: HTMLElement | null;
    gleam: HTMLElement | null;
  }>({
    anchor: null,
    title: null,
    rosetteL: null,
    rosetteR: null,
    gleam: null,
  });

  // Animation & tracking state
  const activeEntityRef = useRef<number | null>(null);
  const scaleRef = useRef<number>(0.0);
  const velocityRef = useRef<number>(0.0);
  const opacityRef = useRef<number>(0.0);
  const timeRef = useRef<number>(0);
  const lastActiveNameRef = useRef<string>('');

  const lastTargetPos = useRef<{ x: number; z: number; baseY: number }>({
    x: 0,
    z: 0,
    baseY: 0,
  });
  const currentPos = useRef(new THREE.Vector3());
  const isPosInitialized = useRef<boolean>(false);
  const projVec = useRef(new THREE.Vector3());

  // Pick sheep or dog by cursor/touch with dual-envelope hysteresis
  const { update } = useSheepPicker(sim, camera, pointer, gl.domElement);

  useFrame((_, delta) => {
    // Lazy element discovery
    if (!domRefs.current.anchor) {
      domRefs.current = {
        anchor: document.getElementById('herd-nameplate-anchor'),
        title: document.getElementById('herd-nameplate-title'),
        rosetteL: document.getElementById('herd-nameplate-rosette-l'),
        rosetteR: document.getElementById('herd-nameplate-rosette-r'),
        gleam: document.getElementById('herd-nameplate-gleam'),
      };
    }

    const { anchor, title, rosetteL, rosetteR, gleam } = domRefs.current;
    if (!anchor) return;

    const safeDelta = Math.min(delta, 0.05);
    timeRef.current += safeDelta;

    // Pick hovered entity
    const activeIndex = update();
    const hasTarget = activeIndex !== null;
    const state = useGameStore.getState();

    // Target change detection & DOM text update
    if (activeIndex !== null && activeIndex !== activeEntityRef.current) {
      activeEntityRef.current = activeIndex;
      scaleRef.current = 0.55;
      velocityRef.current = 4.4;

      let name = '';
      let isDog = false;
      if (activeIndex === -1) {
        name = state.dogName || 'Pip';
        isDog = true;
      } else if (activeIndex < sim.headings.length) {
        name = getSheepName(activeIndex, state.customSheepNames);
        isDog = false;
      }

      lastActiveNameRef.current = name;

      if (title) {
        title.textContent = name;
      }
      if (rosetteL && rosetteR) {
        const rosetteDisplay = isDog ? 'inline-block' : 'none';
        rosetteL.style.display = rosetteDisplay;
        rosetteR.style.display = rosetteDisplay;
      }

      // Re-trigger specular light sweep
      if (gleam) {
        gleam.style.animation = 'none';
        void gleam.offsetWidth;
        gleam.style.animation = 'herd-plaque-gleam 850ms cubic-bezier(.2,.8,.3,1) forwards';
      }
    }

    // Target animation parameters
    const targetOpacity = hasTarget ? 1.0 : 0.0;
    const targetScale = hasTarget ? 1.0 : 0.82;

    // Smooth opacity fade (crisp entry, graceful exit)
    opacityRef.current = THREE.MathUtils.damp(opacityRef.current, targetOpacity, hasTarget ? 24 : 14, safeDelta);

    // Fully faded out: hide and reset
    if (!hasTarget && opacityRef.current < 0.008) {
      anchor.style.display = 'none';
      scaleRef.current = 0.0;
      velocityRef.current = 0.0;
      activeEntityRef.current = null;
      isPosInitialized.current = false;
      return;
    }

    // Determine target 3D world position
    let targetX = lastTargetPos.current.x;
    let targetZ = lastTargetPos.current.z;
    let targetBaseY = lastTargetPos.current.baseY;

    if (activeIndex === -1) {
      if (sim.dogPositions && sim.dogPositions.length >= 2) {
        targetX = sim.dogPositions[0]!;
        targetZ = sim.dogPositions[1]!;
        // Anchor above the standing dog's head, not through its shoulder.
        targetBaseY = groundY(targetX, targetZ) + 2.0;
      }
    } else if (activeIndex !== null && activeIndex < sim.headings.length) {
      const pos = sim.positions;
      targetX = pos[activeIndex * 2]!;
      targetZ = pos[activeIndex * 2 + 1]!;
      targetBaseY = groundY(targetX, targetZ) + 1.22;
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

    // Damped harmonic oscillator for tactile spring arrival and hover-off settle
    const stiffness = 260;
    const damping = 18;
    const springForce = (targetScale - scaleRef.current) * stiffness;
    const dampingForce = -velocityRef.current * damping;
    velocityRef.current += (springForce + dampingForce) * safeDelta;
    scaleRef.current += velocityRef.current * safeDelta;

    // Gentle organic breathing bobbing while hovered
    const bobY = Math.sin(timeRef.current * 2.4) * 0.025;

    // Hover-off graceful uplift: floats upwards into the air while fading out
    const hoverOffLift = hasTarget ? 0.0 : (1.0 - opacityRef.current) * 0.35;

    // Project 3D world position to screen NDC coordinates
    projVec.current.set(
      currentPos.current.x,
      currentPos.current.y + bobY + hoverOffLift,
      currentPos.current.z,
    );
    projVec.current.project(camera);

    // Clip if behind the camera
    if (projVec.current.z > 1.0) {
      anchor.style.display = 'none';
      return;
    }

    // Convert NDC (-1..1) to CSS pixels
    const screenX = (projVec.current.x * 0.5 + 0.5) * size.width;
    // World-height clearance collapses in the distant Classic camera. Keep
    // a small screen-space gap too so the badge cannot cover the player.
    const screenY = (-projVec.current.y * 0.5 + 0.5) * size.height
      - (activeEntityRef.current === -1 ? 20 : 0);

    // Subtle distance-compensated scaling
    const dist = camera.position.distanceTo(currentPos.current);
    const distScale = THREE.MathUtils.clamp(1.0 - (dist - 20) * 0.004, 0.85, 1.15);
    const effectiveScale = Math.max(scaleRef.current * distScale, 0.001);

    // Direct GPU compositor style update (zero layout reflow)
    anchor.style.display = 'block';
    anchor.style.opacity = opacityRef.current.toFixed(3);
    anchor.style.transform = `translate3d(${screenX.toFixed(1)}px, ${screenY.toFixed(1)}px, 0) translate(-50%, -100%) scale(${effectiveScale.toFixed(3)})`;
  });

  return null;
}
