import * as THREE from 'three';

/**
 * Atmosphere presets. Ported from Terror in the Jungle's
 * `ScenarioAtmospherePresets.ts`, but renamed to match the SkyDef enum
 * declared by the SDS scene schema (`shared/scenes/types.js`):
 *   'pastoral-noon' | 'dusk' | 'overcast' | 'dawn' | 'golden-hour'.
 *
 * Each preset chooses sun angles + Hosek-Wilkie analytic-sky tunables
 * (turbidity, rayleigh, exposure, ground albedo), a fog density (linear
 * fog uses near/far in scene defs; this number is a `THREE.FogExp2`
 * density that the orchestrator falls back to when no scene fog is set),
 * and an optional cloud-coverage default + per-feature scale.
 *
 * Auxiliary fields:
 * - `sunColor` / `ambientColor`: hint colors used by SunSystem and the
 *   Atmosphere orchestrator's optional ambient-light binding. They are
 *   independent of the analytic-sky transmittance computation, which the
 *   sky backend derives from sun angle + atmosphere state.
 * - `fogColor`: optional override hint. The runtime usually pulls fog
 *   color from the live sky horizon, but presets carry a fallback so the
 *   orchestrator can stamp something reasonable before the LUT is baked.
 *
 * `todCycle` (when present) lets a preset participate in the day/night
 * controller's keyframe interpolation.
 */

/**
 * @typedef {Object} AtmosphereTodCycle
 * @property {number} dayLengthSeconds  Real seconds per simulated day.
 * @property {number} startHour         Initial simulated hour in [0, 24).
 * @property {number} [minSunElevationDeg]
 * @property {number} [maxSunElevationDeg]
 */

/**
 * @typedef {Object} AtmospherePreset
 * @property {string} label
 * @property {number} sunAzimuthRad   Sun azimuth in radians around world Y.
 * @property {number} sunElevationRad Sun elevation in radians (0 = horizon).
 * @property {number} turbidity       Atmospheric turbidity [1..10].
 * @property {number} rayleigh        Rayleigh scale [0.5..4]. Higher = bluer.
 * @property {THREE.Color} groundAlbedo Ground-bounce hue.
 * @property {number} exposure        Linear exposure multiplier on dome out.
 * @property {number} fogDensity      `THREE.FogExp2` density fallback.
 * @property {THREE.Color} [fogColor] Optional fog color hint.
 * @property {THREE.Color} [sunColor] Hint sun-light tint.
 * @property {THREE.Color} [ambientColor] Hint ambient/hemisphere tint.
 * @property {number} [ambientIntensity] Hint ambient multiplier in [0..1].
 * @property {number} [cloudCoverageDefault] Per-preset cloud coverage [0..1].
 * @property {number} [cloudScaleMetersPerFeature] Cloud feature scale, meters.
 * @property {AtmosphereTodCycle} [todCycle]
 */

/** Preset key used by the SkyDef enum + runtime lookups. */
/** @typedef {'pastoral-noon'|'dusk'|'overcast'|'dawn'|'golden-hour'} SkyPresetName */

const DEG = Math.PI / 180;

/** @type {Record<SkyPresetName, AtmospherePreset>} */
export const SKY_PRESETS = {
  // High noon over English countryside — soft pastoral palette, gentle
  // turbidity, modest fog. Default for Home Field.
  'pastoral-noon': {
    label: 'Pastoral noon',
    sunAzimuthRad: Math.PI * 0.25,        // ~45deg, side-lit
    sunElevationRad: 70 * DEG,
    turbidity: 3.2,
    rayleigh: 2.0,
    groundAlbedo: new THREE.Color(0x4d6638),
    // Cycle 11: lowered from 0.22 -> 0.08. Hosek-Wilkie zenith luminance at
    // 70deg sun elevation crushed to near-white through ACES tone-mapping at
    // the higher value. 0.08 keeps the soft pastoral palette without
    // saturating the dome.
    exposure: 0.08,
    fogDensity: 0.0006,
    fogColor: new THREE.Color(0xcfd9e8),
    sunColor: new THREE.Color(0xfff0d8),
    ambientColor: new THREE.Color(0xc8d4e0),
    ambientIntensity: 0.55,
    cloudCoverageDefault: 0.30,
    cloudScaleMetersPerFeature: 1400,
  },
  // Warm low sun, deep haze. Good for Rolling Hills.
  dusk: {
    label: 'Dusk',
    sunAzimuthRad: Math.PI * 1.10,        // ~198deg, west-southwest
    sunElevationRad: 8 * DEG,
    turbidity: 7.0,
    rayleigh: 2.6,
    groundAlbedo: new THREE.Color(0x3a3022),
    exposure: 0.18,
    fogDensity: 0.0014,
    fogColor: new THREE.Color(0xd8b888),
    sunColor: new THREE.Color(0xff9a55),
    ambientColor: new THREE.Color(0xb88a66),
    ambientIntensity: 0.42,
    cloudCoverageDefault: 0.50,
    cloudScaleMetersPerFeature: 1200,
  },
  // Diffuse grey overcast. Sun is up but heavily obscured.
  overcast: {
    label: 'Overcast',
    sunAzimuthRad: Math.PI * 0.40,
    sunElevationRad: 40 * DEG,
    turbidity: 9.5,
    rayleigh: 1.4,
    groundAlbedo: new THREE.Color(0x44483a),
    exposure: 0.20,
    fogDensity: 0.0011,
    fogColor: new THREE.Color(0xbac2c8),
    sunColor: new THREE.Color(0xd8d8d0),
    ambientColor: new THREE.Color(0xb4b8be),
    ambientIntensity: 0.65,
    cloudCoverageDefault: 1.00,
    cloudScaleMetersPerFeature: 800,
  },
  // Cool early-morning sun rising in the east.
  dawn: {
    label: 'Dawn',
    sunAzimuthRad: Math.PI * 0.10,        // ~18deg, east
    sunElevationRad: 7 * DEG,
    turbidity: 5.0,
    rayleigh: 2.4,
    groundAlbedo: new THREE.Color(0x33402a),
    exposure: 0.18,
    fogDensity: 0.0009,
    fogColor: new THREE.Color(0xc8c2c0),
    sunColor: new THREE.Color(0xffc89a),
    ambientColor: new THREE.Color(0x9aa4b4),
    ambientIntensity: 0.45,
    cloudCoverageDefault: 0.45,
    cloudScaleMetersPerFeature: 1000,
  },
  // Late-afternoon warm oblique light. Open Country default.
  'golden-hour': {
    label: 'Golden hour',
    sunAzimuthRad: Math.PI * 0.78,        // ~140deg, south-southeast
    sunElevationRad: 22 * DEG,
    turbidity: 4.5,
    rayleigh: 2.2,
    groundAlbedo: new THREE.Color(0x3e4a2c),
    exposure: 0.20,
    fogDensity: 0.0009,
    fogColor: new THREE.Color(0xe8d8b8),
    sunColor: new THREE.Color(0xffd8a0),
    ambientColor: new THREE.Color(0xc4b08c),
    ambientIntensity: 0.50,
    cloudCoverageDefault: 0.40,
    cloudScaleMetersPerFeature: 1300,
  },
};

/**
 * Per-weather-state fog density multipliers, ported from
 * `WeatherAtmosphere.ts`. Consumers fold this into the live density via
 * `Atmosphere.setWeather({ fogDensityMultiplier })` so weather code can
 * stay a pure intent forwarder.
 */
export const FOG_DENSITY_MULTIPLIERS = {
  CLEAR: 1.0,
  LIGHT_RAIN: 1.5,
  HEAVY_RAIN: 2.4,
  STORM: 3.5,
};

/**
 * Per-weather-state fog darken multipliers (apply on horizon-derived fog
 * color so storms read as dim grey rather than bright blue). 1.0 is
 * unchanged; lower values are darker.
 */
export const FOG_DARKEN_MULTIPLIERS = {
  CLEAR: 1.0,
  LIGHT_RAIN: 0.88,
  HEAVY_RAIN: 0.7,
  STORM: 0.45,
};

/**
 * Per-weather-state cloud coverage targets [0..1]. STORM fills the sky;
 * CLEAR releases to the per-preset baseline. Mirrors the TitJ table.
 */
export const CLOUD_COVERAGE_TARGETS = {
  CLEAR: 0.0,
  LIGHT_RAIN: 0.6,
  HEAVY_RAIN: 0.85,
  STORM: 1.0,
};

/**
 * Build a unit sun-direction vector from azimuth (around +Y) + elevation.
 * @param {number} elevationRad
 * @param {number} azimuthRad
 * @param {THREE.Vector3} [out]
 * @returns {THREE.Vector3}
 */
export function sunDirectionFromAngles(elevationRad, azimuthRad, out) {
  const target = out ?? new THREE.Vector3();
  const cosE = Math.cos(elevationRad);
  target.set(
    cosE * Math.cos(azimuthRad),
    Math.sin(elevationRad),
    cosE * Math.sin(azimuthRad)
  );
  return target.normalize();
}

/**
 * Sun direction for a preset (static angle, ignores `todCycle`).
 * @param {AtmospherePreset} preset
 * @param {THREE.Vector3} [out]
 * @returns {THREE.Vector3}
 */
export function sunDirectionFromPreset(preset, out) {
  return sunDirectionFromAngles(preset.sunElevationRad, preset.sunAzimuthRad, out);
}

/**
 * Validate that all required SkyDef enum names exist in `SKY_PRESETS`.
 * Tests + the orchestrator call this on boot to fail fast if a refactor
 * drops a preset.
 * @returns {SkyPresetName[]}
 */
export function getRequiredPresetNames() {
  return ['pastoral-noon', 'dusk', 'overcast', 'dawn', 'golden-hour'];
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isKnownPreset(name) {
  return Object.prototype.hasOwnProperty.call(SKY_PRESETS, name);
}
