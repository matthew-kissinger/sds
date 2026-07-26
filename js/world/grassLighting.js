// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 123: the single authority for how much light the grass is standing in.
 *
 * Grass is a `MeshBasicNodeMaterial` on the WebGPU path and a raw
 * `ShaderMaterial` on the WebGL twin, and neither has ever read a scene light.
 * That was invisible for as long as the sun never changed. Cycle 120 made the
 * production directional light track time of day, and the gap became the
 * picture: over a ground-heavy strip on Rolling Hills the terrain floor fell to
 * roughly zero at night while the grass canopy fell 12%, taking the
 * grass-to-terrain ratio from 8:1 to 204:1. A self-lit field hanging over
 * nothing.
 *
 * One correction to the cycle plan, which said grass ignores the scene lights
 * entirely: it does not. It has taken a live, per-frame sun DIRECTION on both
 * paths since Cycle 14 and spends it on a fake-SSS backlight and a tip
 * highlight. What it never took is how much light there IS. So the direction
 * rotated all day and the brightness never moved.
 *
 * ## Noon does not move, by construction
 *
 * The cycle's first hard stop, met arithmetically rather than by eye.
 *
 * `Atmosphere` sets `rig.sun.intensity = SUN_REFERENCE_INTENSITY * gate`, where
 * `gate` is `sunDaylightGate(elevation)`: 1 through the day, 0 once the sun is
 * properly down, smoothstepped across the horizon band. So the gate is
 * RECOVERABLE EXACTLY from the rig's own sun, and the factor is a straight
 * interpolation from it. At any daylight elevation the gate is exactly 1 and
 * the factor is exactly 1, so the multiply is an identity and the shipped noon
 * look cannot shift - on any scene, under any preset, at any ambient tint.
 *
 * ## What this deliberately does NOT do, and why
 *
 * An earlier draft summed `ambient * ambientColour + sun * sunColour` and
 * divided by a reference, so the grass would also take the sun's warmth at
 * golden hour. Measured on the live build, it could not hold noon: at day-cycle
 * midday the production rig sits at sun 3.456 and ambient 2.356, which ARE its
 * references exactly, yet the per-channel factor came out (0.956, 0.929, 0.849)
 * because the ambient colour is a TINT rather than white. A formulation whose
 * identity depends on a colour being white is not an identity. Warmth is a nice
 * to have; a shipped noon that does not move is the hard stop.
 */

import { SUN_REFERENCE_INTENSITY } from './sceneLightingRig.js';

/**
 * How lit the grass is once the sun is properly down, relative to full day.
 *
 * Not a free parameter. Cycle 120 measured the terrain floor falling to roughly
 * zero at night while the grass canopy held 88% of its noon value, and the
 * earlier per-channel draft - which tracked the actual sum of the scene lights
 * - resolved to 0.10 in green at night on all three scenes. This sits just
 * above that: enough to bring the canopy down into the same world as the
 * ground it stands on, not so far that the field becomes a silhouette.
 */
const NIGHT_LEVEL = 0.12;

/**
 * The multiplier the grass shader applies to its own colour.
 *
 * Returns a per-channel triple because both shaders take a vec3, but the three
 * channels are equal by design: see the header on why colour is not carried.
 *
 * @param {object} [lights] from `lightsFromRig`.
 * @param {number} [lights.daylight] 0..1, the sun's daylight gate. Defaults to
 *   full day, so an absent or unreadable value leaves the grass unchanged.
 * @returns {{ r: number, g: number, b: number }}
 */
export function grassLightFactor(lights = {}) {
    const gate = Number.isFinite(lights?.daylight)
        ? Math.min(1, Math.max(0, lights.daylight))
        : 1;
    const level = NIGHT_LEVEL + (1 - NIGHT_LEVEL) * gate;
    return { r: level, g: level, b: level };
}

/**
 * The inputs for which `grassLightFactor` returns exactly white. Exported so
 * specs assert against one definition rather than restating it.
 */
export const GRASS_LIGHT_REFERENCE = Object.freeze({ daylight: 1 });

/**
 * Read the daylight gate off a `SceneLightingRig`.
 *
 * Returns null when there is no rig, or when the rig does not drive its sun, so
 * the caller leaves the grass at its shipped look. A missing or static rig must
 * never darken a field.
 *
 * The WebGL twin is exactly that case, and skipping it is the honest answer
 * rather than a convenient one. Measured live at three times of day: profile
 * `webgl`, `drivesSun: false`, sun intensity 2.513 at EVERY hour including 19.7
 * degrees below the horizon. Its key light never dims, so there is no sundown
 * to track - and because its terrain does not darken either, there is no
 * grass-versus-terrain mismatch there to fix. The defect this cycle closes is a
 * mismatch, not a brightness. Converging the two rigs is explicitly not this
 * cycle's job, and Cycle 120 said the same when it left the twin alone.
 *
 * @param {{ sun?: object|null, ambient?: object|null, profile?: object|null } | null | undefined} rig
 * @returns {{ daylight: number } | null}
 */
export function lightsFromRig(rig) {
    if (!rig || !rig.sun) return null;
    if (rig.profile && rig.profile.drivesSun === false) return null;
    const intensity = rig.sun.intensity;
    if (!Number.isFinite(intensity)) return null;
    // Atmosphere.js: rig.setSunIntensity(SUN_REFERENCE_INTENSITY * gate).
    // Recovering the gate from the intensity keeps this reading the rig rather
    // than re-deriving an elevation, and it is exact at both ends.
    const daylight = Math.min(1, Math.max(0, intensity / SUN_REFERENCE_INTENSITY));
    return { daylight };
}

export const GRASS_LIGHT_TUNING = Object.freeze({ NIGHT_LEVEL, SUN_REFERENCE_INTENSITY });
