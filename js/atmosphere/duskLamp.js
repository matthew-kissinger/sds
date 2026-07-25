// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * When a lamp is lit, as a function of where the sun is.
 *
 * Cycle 115 asked whether the homestead lantern should be a real light. It is
 * not, and the reason is a measurement rather than a taste call. The census
 * below was taken against the shipping tree on 2026-07-25 and is what decided
 * it; `tests/homestead-dusk-lamp.spec.js` re-runs the parts of it that can be
 * re-run, so this stops being true loudly rather than quietly.
 *
 * WHAT LIGHTS EXIST TODAY
 *
 * Six constructions in `js/`, resolving to three lights in a live WebGL scene
 * and two in a live WebGPU one:
 *
 *   js/SceneManager.js:196,201,222   AmbientLight + 2x DirectionalLight. Added
 *                                    to the scene only on the WebGL path; :197
 *                                    returns early on WebGPU, where they would
 *                                    be warning spam and nothing else.
 *   js/rendering/productionWebGpuBoot.js:256,257
 *                                    AmbientLight + DirectionalLight, the
 *                                    WebGPU lighting bridge. The WebGPU pair.
 *   js/atmosphere/SunSystem.js:49    a DirectionalLight that only enters the
 *                                    scene under `attachSunLight`, which no
 *                                    production caller passes. In no scene.
 *
 * There is no `PointLight`, `SpotLight`, `RectAreaLight` or `LightProbe`
 * anywhere in `js/`. The lantern would be the first one.
 *
 * WHY THE FIRST ONE WOULD NOT WORK
 *
 * A lamp reads because of the pool it throws, not because of the bulb. The two
 * surfaces that pool would land on are the ground and the grass standing in it,
 * and neither one is wired to the scene's light graph the way a lamp needs:
 *
 *   surface     WebGL                              WebGPU
 *   ground      ShaderMaterial, no `lights`        MeshLambertNodeMaterial
 *               (js/TerrainBuilder.js:976)         (lit)
 *   grass       ShaderMaterial, no `lights`        MeshBasicNodeMaterial, whose
 *               (js/GrassSystem.js:814)            BasicLightingModel takes
 *                                                  baked indirect only
 *   sheep       ShaderMaterial (OptimizedSheep)    MeshStandardNodeMaterial
 *   water       ShaderMaterial (AnimeWater)        MeshBasicNodeMaterial
 *   impostors   ShaderMaterial (kiln-impostor)     MeshBasicNodeMaterial
 *
 * `grep -rn "lights\s*:" js/` returns nothing, so not one hand-written WebGL
 * shader in the repo opts into Three's light uniforms. A `PointLight` at the
 * lantern would therefore paint a pool on the WebGPU ground, paint nothing at
 * all on the WebGL ground, and leave every blade of grass standing in that pool
 * dark on both. That is not a lamp. That is a defect only one renderer shows,
 * which is the exact failure mode the dual-path rule exists to prevent.
 *
 * Cost, second, and it is the smaller half of the argument. Three counts lights
 * into the shader program key on both backends (WebGL:
 * `WebGLPrograms.getProgramCacheKeyParameters` pushes `numPointLights`;
 * WebGPU: `NodeMaterial.setupLighting` builds the lights node from the scene's
 * light list). Switching a light on at sundown recompiles every lit material in
 * the scene at the exact moment the light level is changing, which is the worst
 * frame in the day to spend a compile on. Leaving it in the scene all day and
 * animating only its intensity dodges the recompile and pays the per-fragment
 * term through a noon that never uses it.
 *
 * So: emissive. Three's standard material carries `emissive` and
 * `emissiveIntensity` as plain uniforms on the WebGL path, and as
 * `materialReference` nodes resolved against the rendered object's ORIGINAL
 * material on the WebGPU path (`nodes/accessors/MaterialNode.js` EMISSIVE scope
 * -> `getColor`/`getFloat` -> `materialReference`, resolved per render object in
 * `MaterialReferenceNode.updateReference`). Writing the two properties lands on
 * both paths with no node code at all, which is the same reason Cycle 114's
 * roof/wall/trim split needed no WebGPU twin.
 *
 * WHAT THIS FILE OWNS
 *
 * Only WHEN. `js/world/farmhouseMaterialRoles.js` owns which mesh lights up and
 * how hot it goes; this owns the curve between the two, keyed on sun elevation
 * rather than on the raw time-of-day t. Elevation is the honest signal: a scene
 * with no day/night cycle never advances t (Atmosphere seeds `DayNightCycle` at
 * t=0.5 and `applyPreset` does not move it), but every scene sets a real sun
 * elevation from its preset. Keying on t would light the lamp on a static noon
 * pasture and leave it dark on a static dusk island.
 */

const DEG = Math.PI / 180;

/**
 * Sun elevation at which the lamp is fully out, and at which it is fully lit.
 *
 * Read against `js/atmosphere/DayNightCycle.js`'s keyframes, which is where
 * these two numbers come from:
 *
 *   t=0.50 noon         +70 deg   0.000  out
 *   t=0.65 golden hour  +30 deg   0.000  out
 *   t=0.75 sunset       + 8 deg   0.376  coming up
 *   t=0.80 NIGHT_T      - 8 deg   1.000  lit
 *   t=0.00 midnight     -22 deg   1.000  lit
 *   t=0.25 sunrise      + 7 deg   0.438  going out
 *
 * The band deliberately opens ABOVE the horizon. A lamp that waits for the sun
 * to actually set lights up after the scene has already gone blue, and reads as
 * a switch being thrown rather than as somebody lighting a wick while there is
 * still light to do it by. The game's own dusk phase opens at
 * `DUSK_START_T = 0.66` (+29 deg, still 0.000 here) and closes at
 * `NIGHT_T = 0.80`, so the lamp comes up across the dusk phase and is full by
 * the time the phase calls it night.
 */
export const DUSK_LAMP_OFF_ELEVATION_RAD = 18 * DEG;
export const DUSK_LAMP_FULL_ELEVATION_RAD = -6 * DEG;

/**
 * How lit a dusk lamp is, in [0, 1].
 *
 * Smoothstep rather than a linear ramp so the lamp neither pops at the top of
 * the band nor crawls at the bottom. Same easing `DayNightCycle.sampleAt` uses
 * between keyframes, so the two curves compose without a visible kink.
 *
 * @param {number} sunElevationRad - sun elevation in radians, 0 at the horizon.
 * @returns {number} 0 at full daylight, 1 once the sun is well down.
 */
export function duskLampFactor(sunElevationRad) {
    if (!Number.isFinite(sunElevationRad)) return 0;
    const span = DUSK_LAMP_OFF_ELEVATION_RAD - DUSK_LAMP_FULL_ELEVATION_RAD;
    const u = (DUSK_LAMP_OFF_ELEVATION_RAD - sunElevationRad) / span;
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return u * u * (3 - 2 * u);
}
