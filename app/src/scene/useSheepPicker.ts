// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import type { FlockSim } from '@sim/FlockSim';
import { cameraViewProfile } from '@app/camera/viewProfile';
import { groundY } from '@app/world/heightfield';

/**
 * Picking reaches a fixed distance in world metres, not a fixed share of the
 * screen, and the region it reaches over is a circle in pixels rather than one
 * in normalised device coordinates.
 *
 * The thresholds shipped as NDC radii: 0.055 to acquire a hover, 0.110 to keep
 * one, 0.160 for a touch tap. An NDC radius is angular, so the world it covers
 * is `hypot(back, up) * tan(fov / 2)` per unit, and the comfort rig moves both
 * terms. Shipped landscape sat hypot(20, 7.5) = 21.36 m from the dog behind a
 * 45 degree lens and covered 8.848 m per unit; 26 / 14 sits 29.53 m back and
 * covers 12.232 m. Shipped portrait covered 20.379 m; 32.5 / 17.5 covers
 * 28.713 m. Held fixed the thresholds would swallow 38% more field in landscape
 * and 41% more in portrait purely because the camera moved back, which is the
 * opposite of what a player reaching for one named sheep wants. So each
 * threshold is kept as the world radius it covered on the shipped rig at the
 * same aspect and converted back against whichever profile is live.
 *
 * Comparing that radius in NDC was the other half of the problem. `hypot(dx, dy)`
 * on NDC mixes two axes that span different pixel counts: on a 390x844 phone one
 * NDC unit is 195 px across but 422 px down, so an NDC circle reaches only 46%
 * as far sideways as it does vertically, and the portrait tap covered 48 px up
 * for 22 px across. A perspective projection covers the same world metres per
 * pixel on both axes, so scaling the NDC delta by half the canvas width and half
 * the canvas height before the hypot is what makes the hit region a true world
 * radius. The thresholds are therefore pixel radii.
 *
 * Acquire / retain / tap, on the two canvases that matter:
 *   1440x900 landscape desktop  17.9 / 35.8 / 52.1 px  (0.487 / 0.973 / 1.416 m)
 *   390x844 portrait phone      16.5 / 32.9 / 47.9 px  (1.121 / 2.242 / 3.261 m)
 * Both taps clear the 44 px minimum spec/06 asks for. Hover does not, and should
 * not: SHEEP_BODY_RADIUS is 0.78 m, so acquire at 0.487 m puts the cursor on the
 * animal and retain lets go just outside it. Flooring hover at 44 px would
 * stretch desktop retention to 1.20 m and leave the nameplate clinging.
 */
const ACQUISITION_NDC_AT_SHIPPED = 0.055;
const RETENTION_NDC_AT_SHIPPED = 0.110;
const TAP_NDC_AT_SHIPPED = 0.160;

/**
 * A thumb is the same size on every canvas, but a radius derived from the world
 * follows canvas height, so short canvases fall under the target: 38.0 px on a
 * 375x667 phone, 22.6 px on a 844x390 phone held landscape. Only the touch path
 * reads `tap`, so flooring it costs desktop hover nothing. The 44 px is read as
 * a radius rather than a target width, which is the conservative reading.
 */
const MIN_TAP_RADIUS_PX = 44;

export interface PickRadiiPx {
  readonly acquire: number;
  readonly retain: number;
  readonly tap: number;
}

/** World metres one NDC unit spans at the subject, for a rig sat `distance` back
 *  and `height` up behind a `fov` degree vertical lens. */
function metresPerNdc(distance: number, height: number, fov: number): number {
  return Math.hypot(distance, height) * Math.tan((fov * Math.PI) / 360);
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/** The same span on the rig that shipped: 20 m back and 7.5 m up in landscape,
 *  24 / 10.5 in portrait, behind the lens the profile still uses. */
function shippedMetresPerNdc(blend: number): number {
  return metresPerNdc(mix(20, 24, blend), mix(7.5, 10.5, blend), mix(45, 76, blend));
}

/** Hover and tap thresholds as screen pixel radii, for the profile this aspect
 *  selects on a canvas `canvasHeightPx` CSS pixels tall. */
export function pickRadiiPx(aspect: number, canvasHeightPx: number): PickRadiiPx {
  const view = cameraViewProfile(aspect);
  // `threshold * shipped` is the target radius in metres; dividing by the live
  // span puts that same radius back on screen, and half the canvas height is the
  // pixels one NDC unit spans vertically.
  const shipped = shippedMetresPerNdc(view.portraitBlend);
  const live = metresPerNdc(view.follow.distance, view.follow.height, view.fov);
  const pxPerShippedNdc = ((shipped / live) * canvasHeightPx) / 2;
  return {
    acquire: ACQUISITION_NDC_AT_SHIPPED * pxPerShippedNdc,
    retain: RETENTION_NDC_AT_SHIPPED * pxPerShippedNdc,
    tap: Math.max(TAP_NDC_AT_SHIPPED * pxPerShippedNdc, MIN_TAP_RADIUS_PX),
  };
}

type RadiiCache = { aspect: number; height: number; px: PickRadiiPx };

/** The profile only moves on resize, so thresholds are held against the aspect
 *  and canvas height that produced them rather than rebuilt every frame. */
function radiiFor(
  camera: THREE.Camera,
  canvasHeightPx: number,
  cache: RadiiCache,
): PickRadiiPx {
  const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1;
  if (aspect !== cache.aspect || canvasHeightPx !== cache.height) {
    cache.aspect = aspect;
    cache.height = canvasHeightPx;
    cache.px = pickRadiiPx(aspect, canvasHeightPx);
  }
  return cache.px;
}

/** Duration in milliseconds to keep a sheep pinned after a touch tap. */
const TOUCH_PIN_MS = 4000;
/** Grace window in milliseconds before dropping target on brief cursor dropout. */
const DROPOUT_GRACE_MS = 250;

export interface SheepPickerState {
  hoveredIndex: number | null;
}

export function useSheepPicker(
  sim: FlockSim,
  camera: THREE.Camera,
  pointer: THREE.Vector2,
  glDom: HTMLElement,
) {
  // Canvas size in CSS pixels, from the renderer store rather than a per-frame
  // layout read. It changes only on resize.
  const size = useThree((state) => state.size);

  const stateRef = useRef<SheepPickerState>({
    hoveredIndex: null,
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
  const mouseNdcRef = useRef(pointer.clone());
  const tempVec = useRef(new THREE.Vector3());
  const radiiRef = useRef<RadiiCache>({
    aspect: Number.NaN,
    height: Number.NaN,
    px: { acquire: 0, retain: 0, tap: 0 },
  });

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
          // Half extents turn an NDC delta into pixels, one axis at a time, so
          // the tap region is a circle on the glass and not on a unit square.
          const halfW = rect.width / 2;
          const halfH = rect.height / 2;

          const count = sim.headings.length;
          const pos = sim.positions;
          let closestIndex: number | null = null;
          let closestDist = radiiFor(camera, rect.height, radiiRef.current).tap;

          const v = tempVec.current;
          for (let i = 0; i < count; i++) {
            const sx = pos[i * 2]!;
            const sz = pos[i * 2 + 1]!;
            const sy = groundY(sx, sz) + 0.6;

            v.set(sx, sy, sz).project(camera);
            if (v.z < -1 || v.z > 1) continue;

            const d = Math.hypot((v.x - ndcX) * halfW, (v.y - ndcY) * halfH);
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
              const d = Math.hypot((v.x - ndcX) * halfW, (v.y - ndcY) * halfH);
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
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        const target = e.target as HTMLElement | null;
        const rect = glDom.getBoundingClientRect();
        if (target?.closest('button, input, select, textarea, a, .herd-modal, .herd-customize-dock, .herd-customize-hud')
          || rect.width <= 0 || rect.height <= 0
          || e.clientX < rect.left || e.clientX > rect.right
          || e.clientY < rect.top || e.clientY > rect.bottom) {
          isPointerActiveRef.current = false;
          return;
        }
        // Studio's orbit overlay receives mouse events instead of the canvas.
        // Project the real cursor locally so it cannot leave R3F's pointer stale.
        mouseNdcRef.current.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((e.clientY - rect.top) / rect.height) * 2,
        );
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
    const radii = radiiFor(camera, size.height, radiiRef.current);

    let bestIndex: number | null = null;
    let bestDist = radii.acquire;

    const v = tempVec.current;
    const px = mouseNdcRef.current.x;
    const py = mouseNdcRef.current.y;
    // Same pixel conversion the tap path uses: both envelopes are pixel radii.
    const halfW = size.width / 2;
    const halfH = size.height / 2;

    // Evaluate sheep distances
    for (let i = 0; i < count; i++) {
      const sx = pos[i * 2]!;
      const sz = pos[i * 2 + 1]!;
      const sy = groundY(sx, sz) + 0.6;

      v.set(sx, sy, sz).project(camera);
      if (v.z < -1 || v.z > 1) continue;

      const dist = Math.hypot((v.x - px) * halfW, (v.y - py) * halfH);
      const isCurrent = i === currentHovered;
      const allowedThreshold = isCurrent ? radii.retain : radii.acquire;

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
        const dist = Math.hypot((v.x - px) * halfW, (v.y - py) * halfH);
        const isCurrent = currentHovered === -1;
        const allowedThreshold = isCurrent ? radii.retain : radii.acquire;
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
