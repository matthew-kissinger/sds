// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The post chain: gentle bloom, one warm colour grade, a subtle vignette, in
 * that order, and nothing else. Post is seasoning, not the dish (spec/05). If a
 * frame only looks good with post on, the frame is not good.
 *
 * three's own TSL post stack (RenderPipeline + pass + bloom), not
 * @react-three/postprocessing: the effect graph is TSL like every other shader
 * in this project, so it crosses to the WebGL2 backend from the same source
 * with no fork (spec/01, hard rule 3). Both backends run this identical chain;
 * `?debug=webgl` is the check.
 *
 * Taking over the render loop: a `useFrame` at any priority above zero makes
 * R3F stop calling `gl.render` itself, and this pipeline renders instead. The
 * priority is the highest in the app, so the sim (-1), input (-2), the camera
 * rig (0) and every instance write (0) have all finished before the frame is
 * drawn.
 *
 * The chain works in the linear working space, before tone mapping and the sRGB
 * transform - RenderPipeline appends those itself. That is why the grade tints
 * and the luminance thresholds look small: they are linear, not display,
 * numbers, and it is why the sun disc can be authored above 1.0 and still have
 * somewhere to go.
 */

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { GRADE } from '@app/tsl/palette';
import {
  bloom,
  float,
  length,
  luminance,
  mix,
  pass,
  screenUV,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
  type TSLNode,
} from '@app/tsl/nodes';
import { useGameStore } from '@app/state/store';
import { useReducedMotion } from '@app/ui/useReducedMotion';
import {
  COMPLETION_BLOOM_SECONDS,
  advanceCompletion,
  smoothArrival,
} from './juice/completionMotion';
import { resolvedRenderTier } from '@app/quality/autoTier';

/** After every other useFrame in the app. Also what disables R3F's own render. */
const RENDER_PRIORITY = 1;

/**
 * Bloom. Low strength and a high threshold on purpose: this exists to make the
 * sun disc glow and to let sunlit wool bleed a little at its edge, not to fog
 * the field. Above about 0.4 strength the flock stops reading as individuals at
 * Classic distance, which is a spec/05 hard rule.
 */
const BLOOM_STRENGTH = 0.18;
const BLOOM_RADIUS = 0.6;
/** Linear luminance. Lit grass sits near 0.6; the sun disc is above 1.8. */
const BLOOM_THRESHOLD = 1.05;

/**
 * Vignette. A fifth of a stop at the corners, starting past the halfway mark,
 * so it shapes the frame without ever being the thing you notice. Measured on
 * the diagonal, so it is round rather than aspect-stretched.
 */
const VIGNETTE_START = 0.55;
const VIGNETTE_DEPTH = 0.12;

/** Half the screen diagonal in UV space: 0 at centre, 1 at every corner. */
const DIAGONAL = Math.SQRT1_2;

export function PostProcessing() {
  const quality = useGameStore((state) => state.quality);
  const autoTierReceipt = useGameStore((state) => state.autoTierReceipt);
  const renderTier = resolvedRenderTier(quality, autoTierReceipt);
  return renderTier === 'high' ? <HighPostProcessing /> : null;
}

function HighPostProcessing() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const reducedMotion = useReducedMotion();

  const pipeline = useMemo(() => {
    // R3F types `gl` as the WebGL renderer; this app's factory always builds a
    // WebGPURenderer (scene/glFactory.ts), which is what RenderPipeline needs.
    const renderer = gl as unknown as THREE.Renderer;

    const scenePass = pass(scene, camera);
    const sceneColor: TSLNode = scenePass.getTextureNode('output');

    const bloomStrength = uniform(BLOOM_STRENGTH);
    const completionWarmth = uniform(0);
    const lit: TSLNode = sceneColor.add(
      bloom(sceneColor, bloomStrength, BLOOM_RADIUS, BLOOM_THRESHOLD),
    );

    // The grade: shadows drift cool, highlights drift warm, everything gains a
    // little saturation. One expression, no lookup table, no film grain.
    const level = luminance(lit.rgb);
    const warmth = mix(
      vec3(...GRADE.shadowTint),
      vec3(...GRADE.highlightTint),
      smoothstep(float(GRADE.shadowLuminance), float(GRADE.highlightLuminance), level),
    );
    const tinted = lit.rgb.mul(warmth);
    const graded = mix(vec3(level), tinted, float(GRADE.saturation)).mul(
      mix(vec3(1, 1, 1), vec3(1.045, 1.018, 0.975), completionWarmth),
    );

    const radius = length(screenUV.sub(vec2(0.5, 0.5))).div(float(DIAGONAL));
    const falloff = smoothstep(float(VIGNETTE_START), float(1), radius);
    const vignette = float(1).sub(falloff.mul(float(VIGNETTE_DEPTH)));

    const built = new THREE.RenderPipeline(renderer);
    built.outputNode = vec4(graded.mul(vignette), float(1));
    return { built, bloomStrength, completionWarmth, completion: 0 };
  }, [gl, scene, camera]);

  useEffect(() => () => pipeline.built.dispose(), [pipeline]);

  useFrame((_, delta) => {
    const active = useGameStore.getState().gamePhase === 'complete';
    pipeline.completion = advanceCompletion(
      pipeline.completion,
      active,
      delta,
      COMPLETION_BLOOM_SECONDS,
      reducedMotion,
    );
    const warmth = smoothArrival(pipeline.completion);
    pipeline.completionWarmth.value = warmth * (reducedMotion ? 0.25 : 1);
    pipeline.bloomStrength.value = BLOOM_STRENGTH + warmth * (reducedMotion ? 0.025 : 0.1);
    pipeline.built.render();
  }, RENDER_PRIORITY);

  return null;
}
