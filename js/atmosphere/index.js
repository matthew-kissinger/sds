/**
 * Atmosphere module: sky + clouds + sun + day/night cycle.
 *
 * Phase A standalone module (Cycle 4 Unit J redo). Not yet wired into
 * `js/main.js` or `js/SceneManager.js`; Phase B integrates.
 *
 * Quick start:
 *   import { Atmosphere } from './js/atmosphere/index.js';
 *   const atmo = new Atmosphere(scene, { initialPreset: 'pastoral-noon' });
 *   atmo.applyPreset('dusk');
 *   atmo.update(deltaTime);
 *   atmo.startDayNightCycle({ secondsPerDay: 600 });
 *   atmo.dispose();
 */

export { Atmosphere } from './Atmosphere.js';
export { HosekWilkieSky } from './HosekWilkieSky.js';
export { CloudLayer } from './CloudLayer.js';
export { SunSystem } from './SunSystem.js';
export { DayNightCycle } from './DayNightCycle.js';
export {
  SKY_PRESETS,
  FOG_DENSITY_MULTIPLIERS,
  FOG_DARKEN_MULTIPLIERS,
  CLOUD_COVERAGE_TARGETS,
  sunDirectionFromAngles,
  sunDirectionFromPreset,
  getRequiredPresetNames,
  isKnownPreset,
} from './skyPresets.js';
export {
  hosekWilkieFragmentShader,
  hosekWilkieVertexShader,
} from './skyShader.glsl.js';
export {
  cloudFragmentShader,
  cloudVertexShader,
} from './cloudShader.glsl.js';
