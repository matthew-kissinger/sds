// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useRef } from 'react';
import * as THREE from 'three/webgpu';
import type { FlockSim } from '@sim/FlockSim';
import { groundY } from '@app/world/heightfield';

/** Normalised device coordinate threshold for desktop mouse hover. */
const HOVER_THRESHOLD_NDC = 0.055;
/** Normalised device coordinate threshold for mobile touch tap. */
const TOUCH_THRESHOLD_NDC = 0.12;
/** Duration in milliseconds to keep a sheep pinned after a touch tap. */
const TOUCH_PIN_MS = 3500;
/** Hysteresis factor: makes currently hovered sheep stickier against jitter. */
const HYSTERESIS_FACTOR = 0.65;

export interface SheepPickerState {
  hoveredIndex: number | null;
  /** Screen distance in NDC to the currently selected sheep. */
  screenDistance: number;
}

export function useSheepPicker(
  sim: FlockSim,
  camera: THREE.Camera,
  pointer: THREE.Vector2,
  glDom: HTMLElement,
) {
  const stateRef = useRef<SheepPickerState>({
    hoveredIndex: null,
    screenDistance: Infinity,
  });

  const pinnedRef = useRef<{ index: number | null; expiresAt: number }>({
    index: null,
    expiresAt: 0,
  });

  const isPointerActiveRef = useRef<boolean>(false);
  const tempVec = useRef(new THREE.Vector3());

  // Listen for touch taps on the canvas
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      isPointerActiveRef.current = true;
      if (e.pointerType === 'touch') {
        const rect = glDom.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

        const count = sim.headings.length;
        const pos = sim.positions;
        let closestIndex: number | null = null;
        let closestDist = TOUCH_THRESHOLD_NDC;

        const v = tempVec.current;
        for (let i = 0; i < count; i++) {
          const sx = pos[i * 2]!;
          const sz = pos[i * 2 + 1]!;
          const sy = groundY(sx, sz) + 0.6;

          v.set(sx, sy, sz).project(camera);
          if (v.z < -1 || v.z > 1) continue;

          const dx = v.x - ndcX;
          const dy = v.y - ndcY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < closestDist) {
            closestDist = dist;
            closestIndex = i;
          }
        }

        if (closestIndex !== null) {
          pinnedRef.current = {
            index: closestIndex,
            expiresAt: performance.now() + TOUCH_PIN_MS,
          };
          stateRef.current.hoveredIndex = closestIndex;
        } else {
          pinnedRef.current.index = null;
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        isPointerActiveRef.current = true;
      }
    };

    const handlePointerLeave = () => {
      isPointerActiveRef.current = false;
      if (performance.now() > pinnedRef.current.expiresAt) {
        stateRef.current.hoveredIndex = null;
      }
    };

    glDom.addEventListener('pointerdown', handlePointerDown);
    glDom.addEventListener('pointermove', handlePointerMove);
    glDom.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      glDom.removeEventListener('pointerdown', handlePointerDown);
      glDom.removeEventListener('pointermove', handlePointerMove);
      glDom.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [glDom, sim, camera]);

  /** Called every frame inside useFrame. Transient and allocation-free. */
  const update = (): number | null => {
    const now = performance.now();

    // If pinned by touch, keep active until expiration
    if (pinnedRef.current.index !== null) {
      if (now < pinnedRef.current.expiresAt) {
        stateRef.current.hoveredIndex = pinnedRef.current.index;
        return pinnedRef.current.index;
      }
      pinnedRef.current.index = null;
    }

    if (!isPointerActiveRef.current) {
      stateRef.current.hoveredIndex = null;
      return null;
    }

    const count = sim.headings.length;
    const pos = sim.positions;
    const currentHovered = stateRef.current.hoveredIndex;

    let bestIndex: number | null = null;
    let bestDist = HOVER_THRESHOLD_NDC;

    const v = tempVec.current;
    const px = pointer.x;
    const py = pointer.y;

    for (let i = 0; i < count; i++) {
      const sx = pos[i * 2]!;
      const sz = pos[i * 2 + 1]!;
      const sy = groundY(sx, sz) + 0.6;

      v.set(sx, sy, sz).project(camera);
      // Behind near plane or past far plane
      if (v.z < -1 || v.z > 1) continue;

      const dx = v.x - px;
      const dy = v.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Apply hysteresis to prevent rapid flickering in dense flocks
      const effectiveDist = i === currentHovered ? dist * HYSTERESIS_FACTOR : dist;

      if (effectiveDist < bestDist) {
        bestDist = effectiveDist;
        bestIndex = i;
      }
    }

    stateRef.current.hoveredIndex = bestIndex;
    return bestIndex;
  };

  return { update, stateRef };
}
