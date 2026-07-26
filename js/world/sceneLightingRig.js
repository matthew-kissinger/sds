// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * The single scene-lighting authority: the lights that are actually IN the
 * rendered scene, and the one place that decides what they do.
 *
 * WHY THIS EXISTS
 *
 * Before this module there were two disjoint sets of lights. The production
 * WebGPU scene held an `AmbientLight` at 0.75*PI and a `DirectionalLight` at
 * 1.1*PI (= 3.45575), both constructed by the boot bridge and both constant
 * forever. `Atmosphere` meanwhile drove `SceneManager.ambientLight` and its own
 * `SunSystem.light`, and on the WebGPU path NEITHER of those is in any scene
 * (`SceneManager.setupLighting` returns before the `scene.add`, and
 * `attachSunLight` is off). So every preset ambient hint, every sun colour and
 * every sun angle landed on an object nothing renders, and the production
 * directional read 3.456 white at every time of day including full night.
 *
 * Nothing failed. Binding a light that is not in the scene was a silent no-op,
 * which is exactly how the defect survived. `bindSceneLights` therefore ASSERTS
 * scene membership and throws, so the next mis-wiring is loud at the moment it
 * is introduced rather than a year later in a screenshot.
 *
 * WHAT IT OWNS
 *
 * Direction and shadow-frustum placement are two meanings that used to fight
 * over one vector: `light.position`. The day-loop shadow follow wrote it to
 * move the shadow box, and the sun direction is `position - target.position`,
 * so whichever wrote last won. Here they are separate inputs -
 * `setSunDirection` and `setShadowFocus` - and `position`/`target` are DERIVED
 * from both. Neither can clobber the other.
 *
 * @see js/world/foliageLightingRig.js - the same "one authority" shape for the
 *      foliage relight, and the module that consumes SUN_REFERENCE_INTENSITY.
 */

/**
 * The production directional's reference intensity.
 *
 * This is the value the whole foliage calibration is derived from: Cycle 104 P3
 * retired a magic `brightness = 6` on the far-tree impostor in favour of
 * "the intensity the LOD0 leaf is lit by, times a canopy residual", and this is
 * that intensity. `js/webgpuKilnImpostorNodeMaterial.js` imports it from here
 * rather than restating `1.1 * Math.PI`, so there is one source and a moving sun
 * cannot silently decouple the impostor from the leaf it replaces.
 */
export const SUN_REFERENCE_INTENSITY = 1.1 * Math.PI;

/** The production ambient's reference intensity (the scene's boot value). */
export const AMBIENT_REFERENCE_INTENSITY = 0.75 * Math.PI;

/**
 * The ambient hint of the preset the two references above were tuned at:
 * `pastoral-noon`, sun at +70 degrees, ambient hint 0.55. Every other hour is
 * expressed relative to it, so the reference frame keeps exactly the look it
 * shipped with.
 */
export const REFERENCE_AMBIENT_HINT = 0.55;

/**
 * How far out the sun light sits from the shadow focus. Not a lighting value -
 * a directional light's shading is angle-only - but the shadow camera's
 * near/far (0.5 .. 600) has to contain it.
 */
export const SUN_RIG_DISTANCE = 260;

/**
 * Floor on the light's world Y. Below the horizon a directional light would
 * shine UP through the terrain and light every underside; the intensity gate
 * has already taken the sun to zero by then, so the transform just parks it
 * overhead rather than inverting the scene. Mirrors `SunSystem.MIN_SUN_Y`.
 */
const SUN_RIG_MIN_Y = 20;

/**
 * The angle the production directional shipped frozen at, kept as the rig's
 * boot direction so a scene renders sanely between construction and the first
 * atmosphere push.
 */
export const BOOT_SUN_DIRECTION = Object.freeze({ x: 1.5, y: 2.2, z: 3.0 });

/**
 * Sun elevations bounding the horizon gate, in sin(elevation).
 *
 * The sun's RADIANCE is very nearly elevation-independent - what falls off
 * through a day is the irradiance on the ground, and `N dot L` already does
 * that once the direction is honest. So the intensity curve is not a cosine
 * ramp; it is a gate that holds the reference through the day and closes it
 * across the horizon. Atmospheric extinction rides the sun COLOUR, which
 * `HosekWilkieSky.getSun` already derives physically.
 */
const SUN_GATE_DARK_SIN = -0.10;
const SUN_GATE_FULL_SIN = 0.10;

/**
 * The two rigs. Both renderers put lights in their scene; they are balanced
 * differently and converging them is explicitly not this cycle's job.
 *
 * - WebGL has stamped the raw preset hint and the raw preset colour on its
 *   ambient since Cycle 9, and its static key plus warm fill (0.8*PI and
 *   0.3*PI, neither driven) are balanced against that. `ambientAnchor:
 *   REFERENCE_AMBIENT_HINT` reproduces `intensity = hint` exactly, so nothing
 *   about the WebGL twin moves.
 * - Production anchors on the intensity that is in the scene today and splits
 *   hue from luminance (`normalizeAmbientHue`). The preset ambient colours are
 *   authored as sky TINTS, and `night`'s 0x101728 is 0.008 relative luminance
 *   once three converts it to the linear working space. Multiplying that in raw
 *   would double-count the darkness the hint already carries and take the
 *   island to black; normalising the hue keeps the colour and lets the hint own
 *   the level. At the reference preset this reproduces today's white 0.75*PI
 *   luminance exactly, so the frame everything else is calibrated against holds.
 */
export const WEBGL_SCENE_LIGHT_PROFILE = Object.freeze({
    name: 'webgl',
    ambientAnchor: REFERENCE_AMBIENT_HINT,
    normalizeAmbientHue: false,
    drivesSun: false,
});

export const PRODUCTION_SCENE_LIGHT_PROFILE = Object.freeze({
    name: 'webgpu-production',
    ambientAnchor: AMBIENT_REFERENCE_INTENSITY,
    normalizeAmbientHue: true,
    drivesSun: true,
});

/** BT.709 relative luminance of a THREE.Color-shaped `{ r, g, b }`. */
export function lightLuminance(color) {
    if (!color) return 0;
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

/**
 * How much of the reference sun reaches the scene at a given elevation.
 * 1 through the day, 0 once the sun is properly down, smoothstepped across the
 * horizon band so sundown is a fade and not a switch.
 *
 * @param {number} elevationRad sun elevation, 0 at the horizon.
 * @returns {number} in [0, 1].
 */
export function sunDaylightGate(elevationRad) {
    if (!Number.isFinite(elevationRad)) return 1;
    const s = Math.sin(elevationRad);
    const u = (s - SUN_GATE_DARK_SIN) / (SUN_GATE_FULL_SIN - SUN_GATE_DARK_SIN);
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return u * u * (3 - 2 * u);
}

/**
 * The ambient intensity a rig takes for a given preset hint, in the rig's own
 * units: the hint expressed against the rig's anchor.
 *
 * @param {number} hint the preset's `ambientIntensity`.
 * @param {{ ambientAnchor: number }} profile
 * @returns {number}
 */
export function ambientIntensityForHint(hint, profile) {
    const anchor = profile?.ambientAnchor ?? AMBIENT_REFERENCE_INTENSITY;
    const safeHint = Number.isFinite(hint) ? Math.max(0, hint) : REFERENCE_AMBIENT_HINT;
    return anchor * (safeHint / REFERENCE_AMBIENT_HINT);
}

/**
 * Throw unless `light` is in `scene`. The whole point of this module.
 *
 * @param {{ children?: Array<unknown> } | null} scene
 * @param {object | null} light
 * @param {string} role for the message.
 * @returns {object | null} the light, so call sites can assign through it.
 */
function assertLightInScene(scene, light, role) {
    if (!light) return null;
    const children = scene?.children;
    if (!Array.isArray(children) || !children.includes(light)) {
        throw new Error(
            `SceneLightingRig: the ${role} light is not in the scene it is meant to light. `
            + 'Driving it would be a silent no-op - bind the light the renderer actually '
            + 'has in its scene graph (SceneManager.getSceneLights()).',
        );
    }
    return light;
}

/**
 * The lights in one rendered scene, plus the composition of sun direction and
 * shadow focus into the light transform.
 */
export class SceneLightingRig {
    /**
     * @param {object} options
     * @param {{ children: Array<unknown> }} options.scene
     * @param {object | null} [options.ambient]
     * @param {object | null} [options.sun]
     * @param {typeof PRODUCTION_SCENE_LIGHT_PROFILE} [options.profile]
     * @param {number} [options.sunDistance]
     */
    constructor({ scene, ambient = null, sun = null, profile = PRODUCTION_SCENE_LIGHT_PROFILE, sunDistance = SUN_RIG_DISTANCE }) {
        if (!scene) throw new Error('SceneLightingRig: scene argument is required');
        /** @type {{ children: Array<unknown> }} */
        this.scene = scene;
        this.ambient = assertLightInScene(scene, ambient, 'ambient');
        this.sun = assertLightInScene(scene, sun, 'sun');
        this.profile = profile;
        this.sunDistance = sunDistance;

        const boot = normalizeDirection(BOOT_SUN_DIRECTION);
        /** @private Unit vector pointing FROM the scene TOWARD the sun. */
        this._dirX = boot.x;
        this._dirY = boot.y;
        this._dirZ = boot.z;
        /** @private Shadow-frustum centre in world XZ. Independent of direction. */
        this._focusX = 0;
        this._focusZ = 0;
        /** @private */
        this._transformApplied = false;
        this.applySunTransform();
    }

    /** @returns {{ x: number, y: number, z: number }} unit vector toward the sun. */
    getSunDirection() {
        return { x: this._dirX, y: this._dirY, z: this._dirZ };
    }

    /** @returns {{ x: number, z: number }} the shadow frustum centre. */
    getShadowFocus() {
        return { x: this._focusX, z: this._focusZ };
    }

    /**
     * Where the sun is. Does not touch the shadow frustum's centre.
     * @param {{ x: number, y: number, z: number }} dir any vector toward the sun.
     */
    setSunDirection(dir) {
        const n = normalizeDirection(dir);
        if (!n) return;
        if (n.x === this._dirX && n.y === this._dirY && n.z === this._dirZ) return;
        this._dirX = n.x;
        this._dirY = n.y;
        this._dirZ = n.z;
        this.applySunTransform();
    }

    /**
     * Where the shadow box is centred. Does not touch the sun's direction.
     * @param {number} x
     * @param {number} z
     */
    setShadowFocus(x, z) {
        const fx = Number.isFinite(x) ? x : 0;
        const fz = Number.isFinite(z) ? z : 0;
        if (fx === this._focusX && fz === this._focusZ) return;
        this._focusX = fx;
        this._focusZ = fz;
        this.applySunTransform();
    }

    /** Recentre the shadow box on the world origin. */
    clearShadowFocus() {
        this.setShadowFocus(0, 0);
    }

    /**
     * @param {boolean} on
     * @returns {boolean} whether the sun is configured to cast at all.
     */
    setShadowCasting(on) {
        if (!this.sun?.userData?.shadowConfigured) return false;
        this.sun.castShadow = on === true;
        return true;
    }

    /** @param {number} intensity absolute, in the rig's units. */
    setSunIntensity(intensity) {
        if (!this.sun || !Number.isFinite(intensity)) return;
        this.sun.intensity = Math.max(0, intensity);
    }

    /** @param {{ r: number, g: number, b: number }} color */
    setSunColor(color) {
        if (!this.sun || !color) return;
        this.sun.color.setRGB(color.r, color.g, color.b);
    }

    /** @param {number} intensity absolute, in the rig's units. */
    setAmbientIntensity(intensity) {
        if (!this.ambient || !Number.isFinite(intensity)) return;
        this.ambient.intensity = Math.max(0, intensity);
    }

    /**
     * @param {{ r: number, g: number, b: number }} color the preset ambient tint.
     *   Normalised to unit luminance first when the profile asks for it, so the
     *   tint carries hue and the intensity carries level.
     */
    setAmbientColor(color) {
        if (!this.ambient || !color) return;
        if (this.profile?.normalizeAmbientHue !== true) {
            this.ambient.color.setRGB(color.r, color.g, color.b);
            return;
        }
        const luma = lightLuminance(color);
        if (luma <= 1e-6) {
            this.ambient.color.setRGB(1, 1, 1);
            return;
        }
        this.ambient.color.setRGB(color.r / luma, color.g / luma, color.b / luma);
    }

    /**
     * Compose direction and shadow focus into the light's transform. This is
     * the ONLY writer of `sun.position` and `sun.target.position`.
     * @private
     */
    applySunTransform() {
        const sun = this.sun;
        if (!sun?.position || !sun.target?.position) return;
        const d = this.sunDistance;
        const y = Math.max(this._dirY * d, SUN_RIG_MIN_Y);
        sun.position.set(this._focusX + this._dirX * d, y, this._focusZ + this._dirZ * d);
        sun.target.position.set(this._focusX, 0, this._focusZ);
        sun.target.updateMatrixWorld?.();
        sun.updateMatrixWorld?.();
        this._transformApplied = true;
    }
}

/**
 * @param {{ x: number, y: number, z: number } | null} dir
 * @returns {{ x: number, y: number, z: number } | null}
 */
function normalizeDirection(dir) {
    if (!dir) return null;
    const { x, y, z } = dir;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    const len = Math.hypot(x, y, z);
    if (len < 1e-6) return null;
    return { x: x / len, y: y / len, z: z / len };
}
