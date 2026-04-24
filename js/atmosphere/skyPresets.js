/**
 * Atmosphere presets — sun position, turbidity, ground albedo, fog tuning,
 * and ambient light scale per scenario.
 *
 * Keys cover both the SkyDef enum from shared/scenes/types.js
 * ('noon' | 'dusk' | 'overcast' | 'dawn') and the extended Cycle 4 set
 * ('pastoral-noon', 'golden-hour'). Aliases keep older SceneDef.sky.preset
 * values usable without migration.
 *
 * Source mapping: ported from terror-in-the-jungle's
 * ScenarioAtmospherePresets + WeatherAtmosphere fog-density table.
 */

/**
 * @typedef {Object} AtmospherePreset
 * @property {number} sunElevation Radians above horizon (0 = horizon, PI/2 = zenith).
 * @property {number} sunAzimuth Radians around the up axis (0 = +Z).
 * @property {number} turbidity 1 (clear) .. 10 (hazy). Typical: 2-4.
 * @property {[number, number, number]} albedo Ground albedo per RGB.
 * @property {number} fogColor Hex color (e.g. 0x87CEEB).
 * @property {number} fogDensityMultiplier Scales the scene's base fog density.
 * @property {number} ambientIntensity Multiplier for AmbientLight intensity.
 * @property {number} [exposure] Optional sky tonemap exposure scale.
 */

const deg = (d) => (d * Math.PI) / 180;

/** @type {Record<string, AtmospherePreset>} */
export const skyPresets = {
    'pastoral-noon': {
        sunElevation: deg(70),
        sunAzimuth: deg(35),
        turbidity: 2.2,
        albedo: [0.32, 0.36, 0.28],
        fogColor: 0x9fc6e8,
        fogDensityMultiplier: 0.85,
        ambientIntensity: 1.0,
        exposure: 0.20
    },

    noon: {
        sunElevation: deg(80),
        sunAzimuth: deg(0),
        turbidity: 2.5,
        albedo: [0.30, 0.30, 0.30],
        fogColor: 0x87CEEB,
        fogDensityMultiplier: 1.0,
        ambientIntensity: 1.0,
        exposure: 0.20
    },

    'golden-hour': {
        sunElevation: deg(10),
        sunAzimuth: deg(260),
        turbidity: 4.0,
        albedo: [0.36, 0.30, 0.24],
        fogColor: 0xffb27a,
        fogDensityMultiplier: 1.1,
        ambientIntensity: 0.85,
        exposure: 0.22
    },

    dusk: {
        sunElevation: deg(4),
        sunAzimuth: deg(270),
        turbidity: 5.0,
        albedo: [0.30, 0.24, 0.20],
        fogColor: 0xc97a5a,
        fogDensityMultiplier: 1.3,
        ambientIntensity: 0.55,
        exposure: 0.18
    },

    dawn: {
        sunElevation: deg(6),
        sunAzimuth: deg(85),
        turbidity: 4.5,
        albedo: [0.30, 0.28, 0.30],
        fogColor: 0xd9b08c,
        fogDensityMultiplier: 1.25,
        ambientIntensity: 0.60,
        exposure: 0.18
    },

    overcast: {
        sunElevation: deg(45),
        sunAzimuth: deg(0),
        turbidity: 8.0,
        albedo: [0.50, 0.50, 0.52],
        fogColor: 0xb6bcc4,
        fogDensityMultiplier: 1.8,
        ambientIntensity: 1.10,
        exposure: 0.16
    }
};

/**
 * Look up a preset by name with a graceful fallback.
 * @param {string} name
 * @returns {AtmospherePreset}
 */
export function getPreset(name) {
    return skyPresets[name] || skyPresets['pastoral-noon'];
}

/**
 * List preset keys (useful for editors / pickers).
 * @returns {string[]}
 */
export function listPresetNames() {
    return Object.keys(skyPresets);
}
