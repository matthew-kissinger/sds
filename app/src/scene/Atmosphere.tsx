// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The hour before sunset, permanently (spec/04). One component owns the sun
 * direction, the sky, the sun disc and the fog, and it is the only place any of
 * those four can be changed - which is the point, because they are one thing
 * seen from four angles and the sds failure mode was letting them drift apart.
 *
 * The fog rule is absolute: `scene.fog` is re-derived from the sky's horizon
 * colour every frame, so ground can never fade to a colour the sky is not.
 * There are no per-material fog uniforms anywhere in the app; materials that
 * opt out (the sky dome itself) do so by setting `fog = false`, not by carrying
 * their own copy of the fade.
 *
 * There are no light objects here. The toon ramp is authored lighting, not a
 * physical model: it takes the sun direction and the band tints straight from
 * tsl/palette.ts, so a DirectionalLight and an AmbientLight would be two lamps
 * nothing reads (AGENTS.md rule 10). The "key" and "ambient" of this scene are
 * `RAMP.lit` and `RAMP.shadow` + `RAMP.fill`, and they live in the palette
 * beside every other colour decision.
 *
 * PostProcessing mounts from here rather than from FieldScene because the mount
 * contract freezes FieldScene during the phase 3 fan-out, and because the post
 * chain is the last stage of the same look: sky, fog, grade. Moving it up a
 * level later is one line.
 */

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { PALETTE, SKY_HORIZON_COLOR } from '@app/tsl/palette';
import { SKY_DOME_RADIUS, makeSkyMaterial } from '@app/tsl/sky';
import { PostProcessing } from './PostProcessing';

/**
 * Where haze starts biting and where it has completely taken over. The far
 * value is deliberately closer than the ground plane's outer edge, so the world
 * dissolves into the horizon colour before it runs out of geometry: there is no
 * visible rim to the field, only distance.
 */
const FOG_NEAR = 210;
const FOG_FAR = 580;

/** Enough segments that the gradient has no banding at the horizon. */
const DOME_SEGMENTS_WIDE = 48;
const DOME_SEGMENTS_TALL = 32;

/** Drawn after everything opaque, so covered pixels never run the sky shader. */
const SKY_RENDER_ORDER = 1000;

export function Atmosphere() {
  const scene = useThree((state) => state.scene);

  const sky = useMemo(
    () => ({
      material: makeSkyMaterial(),
      geometry: new THREE.SphereGeometry(
        SKY_DOME_RADIUS,
        DOME_SEGMENTS_WIDE,
        DOME_SEGMENTS_TALL,
      ),
    }),
    [],
  );

  useEffect(() => {
    return () => {
      sky.material.dispose();
      sky.geometry.dispose();
    };
  }, [sky]);

  // Spec/04, literally: fog always matches the sky horizon. One source, copied
  // rather than duplicated, every frame, allocating nothing. A colour that only
  // agreed at construction time is a colour that can silently stop agreeing.
  useFrame(() => {
    const fog = scene.fog;
    if (fog) fog.color.copy(SKY_HORIZON_COLOR);
  });

  return (
    <>
      <color attach="background" args={[PALETTE.skyHorizon]} />
      <fog attach="fog" args={[PALETTE.skyHorizon, FOG_NEAR, FOG_FAR]} />
      {/* Shaded by view ray rather than by its own surface, so the dome never
          moves and the camera can wander anywhere inside it. */}
      <mesh args={[sky.geometry, sky.material]} renderOrder={SKY_RENDER_ORDER} frustumCulled={false} />
      <PostProcessing />
    </>
  );
}
