import * as THREE from 'three';
import { HosekWilkieSky } from './HosekWilkieSky.js';
import { CloudLayer } from './CloudLayer.js';
import { SunSystem } from './SunSystem.js';
import { DayNightCycle } from './DayNightCycle.js';
import { log as probeLog } from '../diagnostics/glProbe.js';
import {
  SKY_PRESETS,
  FOG_DENSITY_MULTIPLIERS,
  FOG_DARKEN_MULTIPLIERS,
  CLOUD_COVERAGE_TARGETS,
  isKnownPreset,
  sunDirectionFromPreset,
} from './skyPresets.js';

/**
 * Top-level atmosphere orchestrator. Owns:
 *  - `HosekWilkieSky` (analytic sky dome shader)
 *  - `CloudLayer` (procedural planar cloud parallax)
 *  - `SunSystem` (directional light + sun-position math)
 *  - `DayNightCycle` (time-of-day controller, optional)
 *  - `THREE.Fog` (scene fog driven by horizon color)
 *
 * Phase A only: this module does NOT wire itself into `js/main.js` or
 * `js/SceneManager.js`. Phase B integrates. Smoke test for the redo PR is
 * just "imports cleanly, unit tests pass, build succeeds".
 *
 * Top-level API (intentionally narrow):
 *   const atmo = new Atmosphere(scene, { initialPreset: 'pastoral-noon' });
 *   atmo.applyPreset('dusk');
 *   atmo.update(deltaTime);
 *   atmo.startDayNightCycle({ secondsPerDay: 600 });
 *   atmo.stopDayNightCycle();
 *   atmo.setSun({ elevation, azimuth });
 *   atmo.setWeather({ fogDensityMultiplier: 1.6 });
 *   atmo.dispose();
 */

const DEFAULT_PRESET = 'pastoral-noon';

export class Atmosphere {
  /**
   * @param {THREE.Scene} scene
   * @param {Object} [options]
   * @param {import('./skyPresets.js').SkyPresetName} [options.initialPreset='pastoral-noon']
   * @param {boolean} [options.enableClouds=true]
   * @param {boolean} [options.enableDayNight=false]
   * @param {boolean} [options.attachSky=true]    Add sky dome to the scene.
   * @param {boolean} [options.attachClouds=true]
   * @param {boolean} [options.attachSunLight=false] Add directional light to scene.
   * @param {boolean} [options.attachFog=true]    Set scene.fog.
   * @param {Object} [options.sunOptions]         Forwarded to SunSystem.
   */
  constructor(scene, options = {}) {
    if (!scene) {
      throw new Error('Atmosphere: scene argument is required');
    }
    /** @type {THREE.Scene} */
    this.scene = scene;
    const enableClouds = options.enableClouds !== false;
    const enableDayNight = options.enableDayNight === true;
    const attachSky = options.attachSky !== false;
    const attachClouds = options.attachClouds !== false;
    const attachSunLight = options.attachSunLight === true;
    const attachFog = options.attachFog !== false;

    this.sky = new HosekWilkieSky();
    if (attachSky) {
      scene.add(this.sky.getMesh());
    }

    /** @type {CloudLayer | null} */
    this.cloudLayer = enableClouds ? new CloudLayer() : null;
    if (this.cloudLayer && attachClouds) {
      scene.add(this.cloudLayer.getMesh());
    }

    this.sun = new SunSystem(options.sunOptions);
    if (attachSunLight) {
      scene.add(this.sun.light);
      scene.add(this.sun.light.target);
    }

    this.dayNight = new DayNightCycle({
      secondsPerDay: options.secondsPerDay,
    });
    /** @private */
    this.dayNightEnabled = enableDayNight;

    /** @type {THREE.FogExp2 | null} */
    this.fog = null;
    if (attachFog) {
      this.fog = new THREE.FogExp2(0xcccccc, 0.0006);
      scene.fog = this.fog;
      // Cycle 9 Phase 4: log so we can confirm scene.fog is set BEFORE the
      // terrain shader's <fog_fragment> chunk is compiled. If terrain logs
      // its `terrain.created` event with `sceneFog: false`, fog uniforms
      // never bind and the terrain falls through to a default white in
      // some drivers.
      probeLog('atmosphere.fog.attached', { density: this.fog.density });
    }

    /** @type {THREE.AmbientLight | THREE.HemisphereLight | null} */
    this.ambientLight = null;
    /** @private */
    this.ambientBaseIntensity = 1.0;

    /** @private */
    this.weather = {
      fogDensityMultiplier: 1.0,
      fogDarkenMultiplier: 1.0,
      cloudCoverage: 0,
      cloudActive: false,
    };

    /** @private */
    this.cameraPosition = new THREE.Vector3();
    /** @private */
    this.terrainYAtCamera = 0;
    /** @private */
    this.scratchSunColor = new THREE.Color();
    /** @private */
    this.scratchHorizon = new THREE.Color();
    /** @private */
    this.scratchTargetSunColor = new THREE.Color();
    /** @private */
    this.scratchAlbedo = new THREE.Color();

    /** @private */
    this.currentPresetName = null;
    /** @private */
    this.baseFogDensity = 0.0006;
    /** @private */
    this.basePresetCoverage = 0;

    const initial = options.initialPreset ?? DEFAULT_PRESET;
    this.applyPreset(isKnownPreset(initial) ? initial : DEFAULT_PRESET);
  }

  /**
   * Snap to a preset. Resets sun angles + sky tunables + fog density, but
   * does NOT reset day/night cycle progress.
   * @param {import('./skyPresets.js').SkyPresetName} name
   * @returns {boolean}
   */
  applyPreset(name) {
    if (!isKnownPreset(name)) {
      // eslint-disable-next-line no-console
      console.warn(`Atmosphere: unknown preset '${name}'; ignoring.`);
      return false;
    }
    const preset = SKY_PRESETS[name];
    this.currentPresetName = name;

    this.sky.applyPreset(preset);
    this.sun.setAngles(preset.sunElevationRad, preset.sunAzimuthRad);

    // Sun color hint takes effect immediately so a cold-start frame
    // doesn't paint a white sun on a warm-toned preset.
    if (preset.sunColor) {
      this.sun.setColor(preset.sunColor);
    } else {
      this.sky.getSun(this.scratchSunColor);
      this.sun.setColor(this.scratchSunColor);
    }

    this.baseFogDensity = preset.fogDensity;
    this.applyFogDensity();
    if (this.fog && preset.fogColor) {
      this.fog.color.copy(preset.fogColor);
    }
    probeLog('atmosphere.preset.applied', {
      preset: name,
      fogDensity: this.fog?.density ?? null,
      fogColor: this.fog ? `#${this.fog.color.getHexString()}` : null,
    });

    const coverage = preset.cloudCoverageDefault ?? 0;
    this.basePresetCoverage = coverage;
    if (this.cloudLayer) {
      this.cloudLayer.setCoverage(coverage);
      if (preset.cloudScaleMetersPerFeature !== undefined) {
        this.cloudLayer.setFeatureScaleMeters(preset.cloudScaleMetersPerFeature);
      } else {
        this.cloudLayer.resetFeatureScale();
      }
    }
    this.sky.setCloudCoverage(coverage);
    if (preset.cloudScaleMetersPerFeature !== undefined) {
      this.sky.setCloudFeatureScaleMeters(preset.cloudScaleMetersPerFeature);
    } else {
      this.sky.resetCloudFeatureScale();
    }

    if (this.ambientLight) {
      const target = preset.ambientIntensity ?? this.ambientBaseIntensity;
      this.ambientLight.intensity = target;
      if (preset.ambientColor) {
        this.ambientLight.color.copy(preset.ambientColor);
      }
    }

    // Force LUT bake immediately so downstream samplers see real numbers.
    this.sky.update(0, this.sun.dirVec);
    return true;
  }

  /**
   * Per-frame update. Drives sky uniforms, cloud drift, day/night cycle.
   * @param {number} deltaTime
   */
  update(deltaTime) {
    const dt = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;

    if (this.dayNightEnabled && this.dayNight.isRunning()) {
      const sample = this.dayNight.update(dt);
      this.applyDayNightSample(sample, dt);
    }

    this.sky.update(dt, this.sun.dirVec);
    this.applyFogColor();

    if (this.cloudLayer) {
      this.sky.getSun(this.scratchSunColor);
      this.cloudLayer.update(
        this.cameraPosition,
        this.terrainYAtCamera,
        this.sun.dirVec,
        this.scratchSunColor,
        dt
      );
    }
  }

  /**
   * Update the cached camera position so the cloud layer rides above the
   * camera. Atmosphere-internal — orchestrator caller pushes the camera
   * world position each frame BEFORE `update`.
   * @param {THREE.Vector3} cameraPosition
   */
  syncCamera(cameraPosition) {
    this.cameraPosition.copy(cameraPosition);
    this.sky.getMesh().position.copy(cameraPosition);
  }

  /** @param {number} y */
  setTerrainYAtCamera(y) {
    if (Number.isFinite(y)) this.terrainYAtCamera = y;
  }

  /**
   * Override sun angles directly (skip the day/night cycle).
   * @param {{ elevation: number, azimuth: number }} angles
   */
  setSun({ elevation, azimuth }) {
    if (!Number.isFinite(elevation) || !Number.isFinite(azimuth)) return;
    this.sun.setAngles(elevation, azimuth);
  }

  /**
   * World-space sun direction (unit vector pointing toward the sun).
   * Consumers (anime water shader sparkles, etc.) should call per frame.
   * @returns {import('three').Vector3}
   */
  getSunDirection() {
    return this.sun.dirVec;
  }

  /**
   * Apply weather-derived modulators on top of the preset baselines.
   * Caller passes whichever fields it cares about; the rest stay sticky.
   * @param {Object} intent
   * @param {number} [intent.fogDensityMultiplier]
   * @param {number} [intent.fogDarkenMultiplier]
   * @param {number} [intent.cloudCoverage]      Override target [0..1].
   * @param {boolean} [intent.cloudActive]       True to apply override.
   * @param {keyof typeof FOG_DENSITY_MULTIPLIERS} [intent.weatherState] Convenience
   */
  setWeather(intent) {
    if (!intent) return;
    if (intent.weatherState) {
      this.weather.fogDensityMultiplier =
        FOG_DENSITY_MULTIPLIERS[intent.weatherState] ?? 1.0;
      this.weather.fogDarkenMultiplier =
        FOG_DARKEN_MULTIPLIERS[intent.weatherState] ?? 1.0;
      this.weather.cloudCoverage =
        CLOUD_COVERAGE_TARGETS[intent.weatherState] ?? 0;
      this.weather.cloudActive = this.weather.cloudCoverage > 0;
    }
    if (intent.fogDensityMultiplier !== undefined) {
      this.weather.fogDensityMultiplier = Math.max(0, intent.fogDensityMultiplier);
    }
    if (intent.fogDarkenMultiplier !== undefined) {
      this.weather.fogDarkenMultiplier = Math.max(
        0,
        Math.min(1, intent.fogDarkenMultiplier)
      );
    }
    if (intent.cloudCoverage !== undefined) {
      this.weather.cloudCoverage = Math.max(0, Math.min(1, intent.cloudCoverage));
      this.weather.cloudActive = intent.cloudActive !== false;
    } else if (intent.cloudActive !== undefined) {
      this.weather.cloudActive = intent.cloudActive;
    }

    this.applyFogDensity();
    this.applyEffectiveCoverage();
  }

  /**
   * Bind an ambient/hemisphere light so the orchestrator can modulate its
   * intensity from preset state. Optional — if your scene already drives
   * an ambient light, just don't call this.
   * @param {THREE.AmbientLight | THREE.HemisphereLight} light
   */
  bindAmbientLight(light) {
    this.ambientLight = light;
    this.ambientBaseIntensity = light.intensity ?? 1.0;
    if (this.currentPresetName) {
      const preset = SKY_PRESETS[this.currentPresetName];
      if (preset.ambientIntensity !== undefined) {
        light.intensity = preset.ambientIntensity;
      }
      if (preset.ambientColor) {
        light.color.copy(preset.ambientColor);
      }
    }
  }

  /**
   * Convenience: enable + start the day/night cycle.
   * @param {{ secondsPerDay?: number, initialT?: number }} [options]
   */
  startDayNightCycle(options = {}) {
    if (options.secondsPerDay !== undefined) {
      this.dayNight.setSecondsPerDay(options.secondsPerDay);
    }
    if (options.initialT !== undefined) {
      this.dayNight.setT(options.initialT);
    }
    this.dayNightEnabled = true;
    this.dayNight.setRunning(true);
  }

  stopDayNightCycle() {
    this.dayNight.setRunning(false);
  }

  /** @returns {boolean} */
  isDayNightRunning() {
    return this.dayNightEnabled && this.dayNight.isRunning();
  }

  /** @returns {string | null} */
  getCurrentPresetName() {
    return this.currentPresetName;
  }

  dispose() {
    if (this.sky) {
      const mesh = this.sky.getMesh();
      if (mesh.parent) mesh.parent.remove(mesh);
      this.sky.dispose();
    }
    if (this.cloudLayer) {
      const mesh = this.cloudLayer.getMesh();
      if (mesh.parent) mesh.parent.remove(mesh);
      this.cloudLayer.dispose();
    }
    if (this.sun) {
      if (this.sun.light.parent) this.sun.light.parent.remove(this.sun.light);
      if (this.sun.light.target.parent) {
        this.sun.light.target.parent.remove(this.sun.light.target);
      }
      this.sun.dispose();
    }
    if (this.scene && this.scene.fog === this.fog) {
      this.scene.fog = null;
    }
    this.fog = null;
  }

  /** @private */
  applyFogDensity() {
    if (!this.fog) return;
    this.fog.density =
      this.baseFogDensity * (this.weather.fogDensityMultiplier ?? 1.0);
  }

  /** @private */
  applyFogColor() {
    if (!this.fog) return;
    this.sky.getHorizon(this.scratchHorizon);
    const f = this.weather.fogDarkenMultiplier ?? 1.0;
    this.fog.color.setRGB(
      this.scratchHorizon.r * f,
      this.scratchHorizon.g * f,
      this.scratchHorizon.b * f
    );
  }

  /** @private */
  applyEffectiveCoverage() {
    const baseline = this.basePresetCoverage;
    const target = this.weather.cloudActive
      ? Math.max(baseline, this.weather.cloudCoverage)
      : baseline;
    this.sky.setCloudCoverage(target);
    if (this.cloudLayer) {
      this.cloudLayer.setCoverage(target);
    }
  }

  /**
   * @private
   * @param {{ elevation: number, azimuth: number, fromPreset: import('./skyPresets.js').SkyPresetName, toPreset: import('./skyPresets.js').SkyPresetName, mix: number }} sample
   * @param {number} dt
   */
  applyDayNightSample(sample, dt) {
    // Drive sun direction from the cycle.
    this.sun.setAngles(sample.elevation, sample.azimuth);

    // Blend sky tunables between the from/to preset for a smooth transition.
    const a = SKY_PRESETS[sample.fromPreset];
    const b = SKY_PRESETS[sample.toPreset];
    const m = sample.mix;

    this.scratchAlbedo.copy(a.groundAlbedo).lerp(b.groundAlbedo, m);
    this.sky.setTunables({
      turbidity: lerp(a.turbidity, b.turbidity, m),
      rayleigh: lerp(a.rayleigh, b.rayleigh, m),
      exposure: lerp(a.exposure, b.exposure, m),
      groundAlbedo: this.scratchAlbedo,
    });

    // Smoothly transition sun color toward whichever preset is dominant.
    const dominantName = m < 0.5 ? sample.fromPreset : sample.toPreset;
    const dominant = SKY_PRESETS[dominantName];
    if (dominant.sunColor) {
      this.scratchTargetSunColor.copy(dominant.sunColor);
    } else {
      this.sky.getSun(this.scratchTargetSunColor);
    }
    this.sun.lerpColor(this.scratchTargetSunColor, dt, 0.6);

    if (this.ambientLight) {
      const ambIntensity = lerp(
        a.ambientIntensity ?? 1.0,
        b.ambientIntensity ?? 1.0,
        m
      );
      this.ambientLight.intensity = ambIntensity;
      if (a.ambientColor && b.ambientColor) {
        this.ambientLight.color.copy(a.ambientColor).lerp(b.ambientColor, m);
      }
    }

    // Cloud coverage interpolated between preset baselines so a 'dusk'
    // -> 'dawn' transition doesn't pop coverage at a keyframe boundary.
    const baseline = lerp(
      a.cloudCoverageDefault ?? 0,
      b.cloudCoverageDefault ?? 0,
      m
    );
    this.basePresetCoverage = baseline;
    this.applyEffectiveCoverage();

    // Fog density also interpolates so transitions feel continuous.
    const baseDensity = lerp(a.fogDensity, b.fogDensity, m);
    this.baseFogDensity = baseDensity;
    this.applyFogDensity();

    // Hold currentPresetName at the dominant side for diagnostics.
    this.currentPresetName = dominantName;
  }
}

/** @param {number} a @param {number} b @param {number} m */
function lerp(a, b, m) {
  return a + (b - a) * m;
}

// Re-export so callers don't need to dig through skyPresets.js.
export {
  SKY_PRESETS,
  FOG_DENSITY_MULTIPLIERS,
  FOG_DARKEN_MULTIPLIERS,
  CLOUD_COVERAGE_TARGETS,
  sunDirectionFromPreset,
};
