// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The ground: one displaced mesh built from the baked heightfield, plus the
 * flat skirt that carries it to the horizon (see world/terrainGeometry.ts).
 *
 * The relief is VISUAL ONLY (spec/04). The sim is flat 2D and never reads a
 * height; what the roll buys is a ground that catches golden-hour light, a
 * horizon that is not a straight line, and a gate approach that reads as
 * downhill. It is gently rolling by a checked number: the bake refuses to
 * commit a grid whose gradient exceeds 0.18, roughly 10 degrees, which cannot
 * put a sheep behind a rise at the Classic camera's 50 degree look-down.
 *
 * The pasture is exactly HOME_FIELD.bounds, so the fence, the sim's boundary
 * force and the colour change are the same line. Beyond it the same surface
 * continues in a duller tone, which is what keeps the eye in the field.
 *
 * Colour is the phase 2 two-tone breakup carried forward - low-frequency noise
 * mixing two greens so large flats never read as vector-flat (spec/05) - with
 * one addition the flat field could not have: a slight warm lift on the high
 * ground and a cool settle in the hollows, so the relief reads as light rather
 * than only as silhouette.
 */

import { useMemo } from 'react';
import { HOME_FIELD } from '@sim/field';
import {
  color,
  float,
  mix,
  positionWorld,
  sin,
  smoothstep,
  type TSLNode,
} from '@app/tsl/nodes';
import { makeToonMaterial } from '@app/tsl/toon';
import { useHeightfield } from '@app/world/heightfield';
import { buildTerrainGeometry } from '@app/world/terrainGeometry';
import { PALETTE } from '@app/tsl/palette';

const { bounds } = HOME_FIELD;

/** Two octaves: ~14 m patches broken up by ~4 m mottling. One octave alone
 *  reads as camouflage blobs from the classic camera. */
const PATCH_SCALE = 0.07;
const MOTTLE_SCALE = 0.26;
const MOTTLE_WEIGHT = 0.45;
const TAU = Math.PI * 2;

/** Metres of blend at the fence line. Short: the fence is a hard edge. */
const FIELD_EDGE = 1.5;

/** Height in metres at which the warm lift and cool settle saturate. */
const RELIEF_TINT_RANGE = 2;
/** How far the tint travels. Small on purpose; light, not a second palette. */
const RELIEF_TINT = 0.07;

/**
 * A compact deterministic field in roughly [-1, 1]. Two crossed strokes and
 * an inner warp preserve broad painterly patches without importing the large
 * MaterialX gradient-noise helper graph into the terrain's first-frame shader.
 */
function paintedField(
  root: TSLNode,
  frequency: number,
  angle: number,
  phase: number,
): TSLNode {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = root.x.mul(float(c)).add(root.y.mul(float(s))).mul(float(frequency * TAU));
  const z = root.y.mul(float(c)).sub(root.x.mul(float(s))).mul(float(frequency * TAU));
  const cross = sin(
    z.mul(float(1.31))
      .sub(x.mul(float(0.47)))
      .add(float(phase * 1.71 + 0.39)),
  );
  return sin(x.add(z.mul(float(0.63))).add(float(phase)).add(cross.mul(float(0.7))));
}

export function Terrain() {
  const field = useHeightfield();

  const geometry = useMemo(() => buildTerrainGeometry(field), [field]);

  const material = useMemo(() => {
    const patches = paintedField(positionWorld.xz, PATCH_SCALE, 0.38, 0.7);
    const mottle = paintedField(positionWorld.xz, MOTTLE_SCALE, -1.13, 2.4);
    const blend = smoothstep(
      float(-0.35),
      float(0.35),
      patches.add(mottle.mul(float(MOTTLE_WEIGHT))),
    );

    const pasture = mix(color(PALETTE.grassDark), color(PALETTE.grassLight), blend);
    // The surround keeps the same breakup at a duller amplitude, so the ground
    // outside the fence reads as the same material rather than a flat backdrop.
    const surround = color(PALETTE.surround).mul(mix(float(0.94), float(1.06), blend));

    const insideX = smoothstep(
      float(bounds.minX - FIELD_EDGE),
      float(bounds.minX + FIELD_EDGE),
      positionWorld.x,
    ).mul(
      float(1).sub(
        smoothstep(
          float(bounds.maxX - FIELD_EDGE),
          float(bounds.maxX + FIELD_EDGE),
          positionWorld.x,
        ),
      ),
    );
    const insideZ = smoothstep(
      float(bounds.minZ - FIELD_EDGE),
      float(bounds.minZ + FIELD_EDGE),
      positionWorld.z,
    ).mul(
      float(1).sub(
        smoothstep(
          float(bounds.maxZ - FIELD_EDGE),
          float(bounds.maxZ + FIELD_EDGE),
          positionWorld.z,
        ),
      ),
    );

    const ground = mix(surround, pasture, insideX.mul(insideZ));

    // Relief tint: crests take a little of the horizon's warmth, hollows a
    // little of the zenith's cool. Both come from the sky, which is where the
    // light comes from, and both come from PALETTE rather than a hex invented
    // here (spec/05: nothing hardcodes colour outside the palette module).
    const elevation = smoothstep(
      float(-RELIEF_TINT_RANGE),
      float(RELIEF_TINT_RANGE),
      positionWorld.y,
    );
    const crest = ground.mul(color(PALETTE.skyHorizon));
    const hollow = ground.mul(color(PALETTE.skyZenith));
    return makeToonMaterial(mix(ground, mix(hollow, crest, elevation), float(RELIEF_TINT)));
  }, []);

  return <mesh geometry={geometry} material={material} />;
}
