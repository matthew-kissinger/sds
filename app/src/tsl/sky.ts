// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The sky, as one TSL material on one inside-out sphere: gradient, sun disc,
 * warm glow and painterly clouds in a single shader, so the whole sky is one
 * draw call and there is nowhere for a second opinion about the horizon colour
 * to live.
 *
 * Everything is a function of the view ray, not of the dome's geometry. The
 * dome sits at the world origin and the camera wanders 100 m around inside it,
 * so shading by the vertex direction would parallax; shading by
 * `normalize(positionWorld - cameraPosition)` is the true ray through that
 * pixel and is exact wherever the camera stands.
 *
 * No god rays (spec/04). The sun is a bright disc with a three-stage halo and
 * it is driven above 1.0 in linear space so the bloom in the post chain finds
 * it, which is the whole effect: a screen-space ray pass would be both more
 * expensive and less calm than a painted glow.
 *
 * Clouds are procedural rather than baked, so there is no asset to bake and no
 * manifest to commit (spec/04's recipe rule is about opaque binaries; this
 * shader is its own source). They are sampled in direction space rather than on
 * a projected deck - see CLOUD_FREQUENCY below for the measurement that decided
 * it - and they drift slowly enough that a still frame and a moving one look
 * like the same weather.
 */

import * as THREE from 'three/webgpu';
import { PALETTE, SUN_DIRECTION } from './palette';
import {
  cameraPosition,
  clamp,
  color,
  dot,
  float,
  Fn,
  mix,
  normalize,
  positionWorld,
  sin,
  smoothstep,
  time,
  uniform,
  vec3,
  type TSLNode,
} from './nodes';

/** Comfortably inside the camera's 1200 m far plane, far outside the 200 m field. */
export const SKY_DOME_RADIUS = 800;

// --- gradient ---------------------------------------------------------------

/**
 * Ray height where haze has fully given way to the pale middle band. The warm
 * band hugs the horizon: 0.12 is 7 degrees up, which is where a real golden
 * hour stops being gold.
 */
const MID_START = -0.03;
const MID_END = 0.12;
/** Ray height where the middle band has fully given way to dusty blue. */
const ZENITH_START = 0.07;
const ZENITH_END = 0.35;

// --- sun --------------------------------------------------------------------

/** cos of 0.9 and 0.7 degrees: the disc edge and its inner soft stop. */
const DISC_OUTER = 0.999877;
const DISC_INNER = 0.999925;
/** Linear intensity of the disc. Above 1 on purpose; the bloom pass reads it. */
const DISC_INTENSITY = 1.9;

/** Three halo stages: broad haze, tight halo, hot core. cos thresholds. */
const HAZE_FROM = 0.55;
const HAZE_AMOUNT = 0.1;
const HALO_FROM = 0.985;
const HALO_AMOUNT = 0.28;
const CORE_FROM = 0.999;
const CORE_TO = 0.99992;
const CORE_AMOUNT = 0.75;

// --- clouds -----------------------------------------------------------------

/**
 * Clouds are sampled in DIRECTION space, not on a projected deck, and that is a
 * deliberate art decision with a measured reason behind it.
 *
 * A physical deck (ray.xz divided by ray.y) is correct and looks wrong here.
 * All three cameras sit low and pitch down, so the visible sky is a band from
 * about 3 to 12 degrees above the horizon, and across that band 1/ray.y runs
 * from 19 to 5. A deck compresses every cloud in it into a horizontal cirrus
 * streak. Painted skies - Ghibli, Alto's Odyssey - hold a cloud's apparent size
 * wherever it sits, which is what a billboard would do; sampling the noise on
 * the ray direction gives the same result in one shader with no billboards.
 *
 * FREQUENCY is in features per unit sphere: 3.2 puts a cloud mass at roughly 18
 * degrees across. FLATTEN squashes the sample vertically so masses are wider
 * than they are tall, which is the only thing left of the deck.
 */
const CLOUD_FREQUENCY = 3.2;
const CLOUD_FLATTEN = 2.6;
/** Sphere units per second. Slow: this is a calm hour, not a weather system. */
const CLOUD_DRIFT_X = 0.0035;
const CLOUD_DRIFT_Z = 0.0014;
/** Noise range that becomes cloud. High floor = restrained coverage. */
const COVERAGE_LO = 0.04;
const COVERAGE_HI = 0.4;
/** Peak cloud opacity. Never 1: these are soft masses, not cut-outs. */
const CLOUD_OPACITY = 0.8;
/**
 * Where clouds fade out into the horizon haze. Low, because all three cameras
 * only ever see a shallow band of sky: cut the deck off at 9 degrees and the
 * playable framings show no cloud at all.
 */
const HORIZON_FADE_LO = 0.015;
const HORIZON_FADE_HI = 0.09;
/**
 * How far a cloud is dragged toward the horizon colour as it approaches it. The
 * same haze that swallows the ground swallows the bottom of the sky, and a
 * cloud that stayed lavender down to the skyline would read as a decal.
 */
const CLOUD_HAZE_LO = 0.02;
const CLOUD_HAZE_HI = 0.24;
/** Thin the cloud cover toward the zenith so the sky opens up overhead. */
const ZENITH_FADE_LO = 0.45;
const ZENITH_FADE_HI = 0.95;
const ZENITH_THINNING = 0.3;
/** How far toward the sun the second sample looks, in sample units. */
const LIT_OFFSET = 0.55;
/** Density difference across that offset that counts as a fully sunlit edge. */
const LIT_CONTRAST = 0.3;

/**
 * The sky dome material. One instance; Atmosphere owns it and nothing else
 * builds a second one.
 */
export function makeSkyMaterial(): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  material.side = THREE.BackSide;
  // The dome IS the horizon that fog fades into. Fogging it would fade fog
  // into fog and flatten the whole gradient (spec/04's one-fog-owner rule).
  material.fog = false;
  material.depthWrite = false;

  const sun = uniform(SUN_DIRECTION) as TSLNode;
  const ray = normalize(positionWorld.sub(cameraPosition));
  const height = ray.y;

  const lower = mix(
    color(PALETTE.skyHorizon),
    color(PALETTE.skyMid),
    smoothstep(float(MID_START), float(MID_END), height),
  );
  const gradient = mix(
    lower,
    color(PALETTE.skyZenith),
    smoothstep(float(ZENITH_START), float(ZENITH_END), height),
  );

  // --- clouds, before the sun, so the sun burns through them ---------------

  const sample = vec3(ray.x, height.mul(float(CLOUD_FLATTEN)), ray.z)
    .mul(float(CLOUD_FREQUENCY))
    .add(vec3(time.mul(float(CLOUD_DRIFT_X)), float(0), time.mul(float(CLOUD_DRIFT_Z))));

  // Three oblique, non-harmonic waves replace MaterialX's large fractal helper
  // graph. The finest wave bends both broader strokes, which breaks their
  // parallel bands into cloud masses without changing the signed [-1, 1]
  // density contract used by the authored coverage and lighting thresholds.
  // Fn keeps this as one shader function shared by the density and sunward
  // samples rather than emitting the same graph twice.
  const cloudField = Fn(
    ([point]: TSLNode[]) => {
      const warp = sin(
        dot(point, vec3(0.71, 1.13, -0.83))
          .mul(float(1.57))
          .add(float(2.11)),
      );
      const broad = sin(
        dot(point, vec3(1.07, -0.61, 0.79))
          .add(warp.mul(float(0.64))),
      );
      const cross = sin(
        dot(point, vec3(-0.67, 0.91, 1.21))
          .mul(float(2.73))
          .sub(warp.mul(float(0.31)))
          .add(float(4.03)),
      );
      return broad
        .mul(float(0.56))
        .add(cross.mul(float(0.3)))
        .add(warp.mul(float(0.14)));
    },
    { point: 'vec3', return: 'float' },
  );
  const density = cloudField(sample);

  // Second sample, one step toward the sun. Where density falls off in that
  // direction the fragment is on the sun-facing edge of the mass, so it lights.
  // Two field samples are the whole cloud lighting model, and that is enough:
  // the eye reads "bright rim, violet underside" long before it reads physics.
  const sunward = vec3(sun.x, float(0), sun.z).normalize().mul(float(LIT_OFFSET));
  const towardSun = cloudField(sample.add(sunward));
  const litEdge = smoothstep(float(0), float(LIT_CONTRAST), density.sub(towardSun));

  const coverage = smoothstep(float(COVERAGE_LO), float(COVERAGE_HI), density);
  const horizonFade = smoothstep(float(HORIZON_FADE_LO), float(HORIZON_FADE_HI), height);
  const zenithFade = float(1).sub(
    smoothstep(float(ZENITH_FADE_LO), float(ZENITH_FADE_HI), height).mul(float(ZENITH_THINNING)),
  );
  const cloudAmount = coverage
    .mul(horizonFade)
    .mul(zenithFade)
    .mul(float(CLOUD_OPACITY));

  const cloudColor = mix(
    mix(color(PALETTE.cloudShade), color(PALETTE.cloudLit), litEdge),
    color(PALETTE.skyHorizon),
    float(1).sub(smoothstep(float(CLOUD_HAZE_LO), float(CLOUD_HAZE_HI), height)),
  );
  const clouded = mix(gradient, cloudColor, cloudAmount);

  // --- sun -----------------------------------------------------------------

  const toSun = clamp(dot(ray, sun), float(0), float(1));
  const haze = smoothstep(float(HAZE_FROM), float(1), toSun).pow(float(2)).mul(float(HAZE_AMOUNT));
  const halo = smoothstep(float(HALO_FROM), float(1), toSun).pow(float(2)).mul(float(HALO_AMOUNT));
  const core = smoothstep(float(CORE_FROM), float(CORE_TO), toSun).mul(float(CORE_AMOUNT));
  const glow = color(PALETTE.sunGlow).mul(haze.add(halo).add(core));

  const disc = smoothstep(float(DISC_OUTER), float(DISC_INNER), toSun);
  const withSun = mix(
    clouded.add(glow),
    color(PALETTE.sunDisc).mul(float(DISC_INTENSITY)),
    disc,
  );

  material.colorNode = withSun;
  return material;
}
