// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useRef } from 'react';
import * as THREE from 'three/webgpu';
import type { FlockSim } from '@sim/FlockSim';
import { groundY } from '@app/world/heightfield';

/** Normalised device coordinate threshold for initial desktop mouse hover acquisition. */
const HOVER_ACQUISITION_NDC = 0.055;
/** Normalised device coordinate leash threshold to retain a currently hovered entity. */
const HOVER_RETENTION_LEASH_NDC = 0.110;
/** Normalised device coordinate threshold for mobile touch tap. */
const TOUCH_THRESHOLD_NDC = 0.160;
/** Duration in milliseconds to keep a sheep pinned after a touch tap. */
const TOUCH_PIN_MS = 4000;
/** Grace window in milliseconds before dropping target on brief cursor dropout. */
const DROPOUT_GRACE_MS = 250;

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

  const lastTargetRef = useRef<{ index: number | null; lostAt: number }>({
    index: null,
    lostAt: 0,
  });

  const touchStartRef = useRef<{ x: number; y: number; time: number }>({
    x: 0,
    y: 0,
    time: 0,
  });

  const isPointerActiveRef = useRef<boolean>(false);
  const tempVec = useRef(new THREE.Vector3());

  // Listen for pointer gestures and mobile touch taps on the canvas
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, input, select, textarea, a, .herd-modal, .herd-customize-dock, .herd-pause-button')) {
        return;
      }
      isPointerActiveRef.current = true;
      if (e.pointerType === 'touch') {
        touchStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          time: performance.now(),
        };
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const dx = e.clientX - touchStartRef.current.x;
        const dy = e.clientY - touchStartRef.current.y;
        const dist = Math.hypot(dx, dy);
        const duration = performance.now() - touchStartRef.current.time;

        // Treat as a deliberate tap if movement was small (<20px) and fast (<400ms).
        // This rejects camera orbit swipes and dog steering joystick drags.
        if (dist < 20 && duration < 400) {
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

            const d = Math.hypot(v.x - ndcX, v.y - ndcY);
            if (d < closestDist) {
              closestDist = d;
              closestIndex = i;
            }
          }

          if (sim.dogPositions && sim.dogPositions.length >= 2) {
            const dX = sim.dogPositions[0]!;
            const dZ = sim.dogPositions[1]!;
            const dY = groundY(dX, dZ) + 0.45;
            v.set(dX, dY, dZ).project(camera);
            if (v.z >= -1 && v.z <= 1) {
              const d = Math.hypot(v.x - ndcX, v.y - ndcY);
              if (d < closestDist) {
                closestDist = d;
                closestIndex = -1;
              }
            }
          }

          if (closestIndex !== null) {
            // Tapped an animal: pin for 4 seconds
            pinnedRef.current = {
              index: closestIndex,
              expiresAt: performance.now() + TOUCH_PIN_MS,
            };
            lastTargetRef.current = { index: closestIndex, lostAt: 0 };
            stateRef.current.hoveredIndex = closestIndex;
          } else {
            // Tapped empty pasture: immediately unpin and dismiss
            pinnedRef.current = { index: null, expiresAt: 0 };
            lastTargetRef.current = { index: null, lostAt: 0 };
            stateRef.current.hoveredIndex = null;
          }
        }
        isPointerActiveRef.current = false;
      }
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        isPointerActiveRef.current = false;
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
        lastTargetRef.current = { index: null, lostAt: 0 };
        stateRef.current.hoveredIndex = null;
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [glDom, sim, camera]);

  /** Called every frame inside useFrame. Transient and allocation-free. */
  const update = (): number | null => {
    const now = performance.now();

    // If pinned by touch tap, keep active until expiration
    if (pinnedRef.current.index !== null) {
      if (now < pinnedRef.current.expiresAt) {
        stateRef.current.hoveredIndex = pinnedRef.current.index;
        return pinnedRef.current.index;
      }
      pinnedRef.current.index = null;
      lastTargetRef.current = { index: null, lostAt: 0 };
    }

    if (!isPointerActiveRef.current) {
      stateRef.current.hoveredIndex = null;
      return null;
    }

    const count = sim.headings.length;
    const pos = sim.positions;
    const currentHovered = lastTargetRef.current.index;

    let bestIndex: number | null = null;
    let bestDist = HOVER_ACQUISITION_NDC;

    const v = tempVec.current;
    const px = pointer.x;
    const py = pointer.y;

    // Evaluate sheep distances
    for (let i = 0; i < count; i++) {
      const sx = pos[i * 2]!;
      const sz = pos[i * 2 + 1]!;
      const sy = groundY(sx, sz) + 0.6;

      v.set(sx, sy, sz).project(camera);
      if (v.z < -1 || v.z > 1) continue;

      const dist = Math.hypot(v.x - px, v.y - py);
      const isCurrent = i === currentHovered;
      const allowedThreshold = isCurrent ? HOVER_RETENTION_LEASH_NDC : HOVER_ACQUISITION_NDC;

      if (dist < allowedThreshold) {
        // Hysteresis priority: currently hovered entity stays prioritized
        const rankDist = isCurrent ? dist * 0.5 : dist;
        if (rankDist < bestDist) {
          bestDist = rankDist;
          bestIndex = i;
        }
      }
    }

    // Evaluate dog distance
    if (sim.dogPositions && sim.dogPositions.length >= 2) {
      const dX = sim.dogPositions[0]!;
      const dZ = sim.dogPositions[1]!;
      const dY = groundY(dX, dZ) + 0.45;
      v.set(dX, dY, dZ).project(camera);
      if (v.z >= -1 && v.z <= 1) {
        const dist = Math.hypot(v.x - px, v.y - py);
        const isCurrent = currentHovered === -1;
        const allowedThreshold = isCurrent ? HOVER_RETENTION_LEASH_NDC : HOVER_ACQUISITION_NDC;
        if (dist < allowedThreshold) {
          const rankDist = isCurrent ? dist * 0.5 : dist;
          if (rankDist < bestDist) {
            bestDist = rankDist;
            bestIndex = -1;
          }
        }
      }
    }

    // Handle dropout debounce grace window to eliminate movement flicker
    if (bestIndex !== null) {
      lastTargetRef.current = { index: bestIndex, lostAt: 0 };
      stateRef.current.hoveredIndex = bestIndex;
      return bestIndex;
    }

    // If cursor briefly slipped off a moving target, maintain target during grace window
    if (lastTargetRef.current.index !== null) {
      if (lastTargetRef.current.lostAt === 0) {
        lastTargetRef.current.lostAt = now;
      }
      if (now - lastTargetRef.current.lostAt < DROPOUT_GRACE_MS) {
        stateRef.current.hoveredIndex = lastTargetRef.current.index;
        return lastTargetRef.current.index;
      }
      // Grace period expired
      lastTargetRef.current = { index: null, lostAt: 0 };
    }

    stateRef.current.hoveredIndex = null;
    return null;
  };

  return { update, stateRef };
}
