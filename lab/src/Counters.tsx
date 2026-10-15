// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Cost on screen, beside the look. Every polish pass has to report what it
 * spent, and the quickest way to stop a pass from quietly tripling a draw count
 * is to put the draw count where the artist is already looking.
 *
 * SAMPLED ON A TIMER, NOT IN THE FRAME, for two reasons, both learned here:
 *
 *  - Three resets `info.render` when a render begins, so a `useFrame` at the
 *    default priority reads the counters back as zero - which looks exactly
 *    like a scene that is not drawing at all, and cost an hour of chasing the
 *    wrong bug.
 *  - Moving that `useFrame` later would be worse: in R3F any subscriber with a
 *    priority above zero takes rendering away from the canvas, and the medium
 *    and low tiers have no post chain standing by to do it. A read-only
 *    diagnostic must not be able to decide whether the game draws.
 *
 * The frame interval here is NOT performance evidence. This machine is the
 * functional lane; timings come from the hub (AGENTS.md, measurement lanes).
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { detectRendererBackend } from '@app/scene/glFactory';
import { useLabStore } from './labStore';

/** Twice a second: legible, and far away from the render loop. */
const SAMPLE_MS = 500;

export function Counters() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const drawn = useRef(0);

  // Counting frames is the one thing the timer cannot do: this renderer leaves
  // `info.render.frame` at zero, which made the interval read 0.0 ms. Priority
  // zero is deliberate - anything above it would take rendering away from the
  // canvas, and the medium and low tiers have no post chain to pick it up.
  useFrame(() => {
    drawn.current += 1;
  });

  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    useLabStore.getState().reportBackend(detectRendererBackend(renderer));

    let lastAt = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const frames = drawn.current;
      drawn.current = 0;
      useLabStore.getState().reportCounters({
        drawCalls: renderer.info.render.drawCalls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        frameMs: frames > 0 ? (now - lastAt) / frames : 0,
        camera: [camera.position.x, camera.position.y, camera.position.z],
      });
      lastAt = now;
    }, SAMPLE_MS);

    return () => window.clearInterval(timer);
  }, [camera, gl]);

  return null;
}
