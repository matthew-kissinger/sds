// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { HosekWilkieSky } from './HosekWilkieSky.js';
import { CloudLayer } from './CloudLayer.js';
import { SunSystem } from './SunSystem.js';
import { DayNightCycle } from './DayNightCycle.js';
import { fogColorMatchingSky } from './paintedHorizon.js';
import { duskLampFactor } from './duskLamp.js';
import { log as probeLog } from '../diagnostics/glProbe.js';
import {
  SKY_PRESETS,
  FOG_DENSITY_MULTIPLIERS,
  FOG_DARKEN_MULTIPLIERS,
  CLOUD_COVERAGE_TARGETS,
  isKnownPreset,
  sunDirectionFromPreset,
} from './skyPresets.js';
import { sampleSkyFogPacketFromSky } from './skyFogSamplePacket.js';
import {
  REFERENCE_AMBIENT_HINT,
  SUN_REFERENCE_INTENSITY,
  ambientIntensityForHint,
  sunDaylightGate,
} from '../world/sceneLightingRig.js';

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
   * @param {Function} [options.skyFactory]       Forwarded to HosekWilkieSky.
   * @param {Function} [options.cloudFactory]     Forwarded to CloudLayer.
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

    this.sky = new HosekWilkieSky({
      factory: options.skyFactory,
    });
    if (attachSky) {
      scene.add(this.sky.getMesh());
    }

    /** @type {CloudLayer | null} */
    this.cloudLayer = enableClouds ? new CloudLayer({
      factory: options.cloudFactory,
    }) : null;
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

    /**
     * The lights that are actually in the rendered scene. Bound once per scene
     * load via `bindSceneLights`; null until then and in headless tests.
     * @type {import('../world/sceneLightingRig.js').SceneLightingRig | null}
     */
    this.sceneLights = null;

    /**
     * The active preset's ambient hint, held here rather than read back off a
     * light. Consumers that need "how bright is the sky right now" in preset
     * units (the far-tree impostor tint) read these, so they stay decoupled
     * from whichever rig this scene happens to be rendering through.
     * @type {number}
     */
    this.ambientHintIntensity = REFERENCE_AMBIENT_HINT;
    /** @type {THREE.Color} */
    this.ambientHintColor = new THREE.Color(0xffffff);

    /**
     * Materials that light up after sundown. Bound by the scene body once the
     * geometry that carries them exists; see `bindDuskLamps`. Declared before
     * the `applyPreset` call below, which drives them.
     * @private
     * @type {Array<{ emissiveIntensity: number, userData?: object }>}
     */
    this.duskLamps = [];

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
    this.scratchZenith = new THREE.Color();
    // The renderer's tone curve, needed because applyFogColor solves for the
    // pre-tone-map fog value. Defaults match configureRenderer's non-Apple
    // choice; main.js passes the real operator from the live renderer.
    /** @private */
    this.toneMappingMode = options.toneMapping?.mode ?? 'aces';
    /** @private */
    this.toneMappingExposure = options.toneMapping?.exposure ?? 1.0;
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

    // Cycle 23 Phase A1: optional scene-level fog override. When sceneDef.fog
    // is supplied (Field/RH/OC each ship explicit `{ color, near, far }`), we
    // replace the FogExp2 default with a linear THREE.Fog whose color is
    // primed from the preset. Per-frame applyFogColor() still drives the
    // color from the horizon LUT so fog color tracks ToD even with linear fog.
    if (options.sceneFog && this.fog) {
      const { color, near, far } = options.sceneFog;
      const cur = this.fog.color.clone();
      this.scene.fog = null;
      this.fog = new THREE.Fog(color ?? '#cccccc', near ?? 200, far ?? 700);
      this.scene.fog = this.fog;
      // Prefer the just-applied preset color (warm-tinted at sun=0.4) over
      // the scene-level static color when both are available — keeps
      // atmospheric coherence with sky tone.
      this.fog.color.copy(cur);
    }
    // Cycle 23 Phase A1: prime fog color from horizon on first frame so the
    // initial paint doesn't read 0xcccccc grey before the first update().
    this.applyFogColor();
  }

  /**
   * Snap to a preset. Resets sun angles + sky tunables + fog density, but
   * does NOT reset day/night cycle progress.
   * @param {import('./skyPresets.js').SkyPresetName} name
   * @returns {boolean}
   */
  applyPreset(name) {
    if (!isKnownPreset(name)) {
      console.warn(`Atmosphere: unknown preset '${name}'; ignoring.`);
      return false;
    }
    const preset = SKY_PRESETS[name];
    this.currentPresetName = name;

    this.sky.applyPreset(preset);
    this.sun.setAngles(preset.sunElevationRad, preset.sunAzimuthRad);

    // Cycle 39 Phase C: single source of truth for sun chromaticity is
    // `HosekWilkieSky.getSun()`, which derives RGB from the analytic
    // atmospheric model (turbidity + path length at elevation). The
    // previous `preset.sunColor` short-circuit was an ad-hoc override
    // that bypassed the physical source. `getSun()` triggers `ensureLUT`
    // internally, so calling it immediately after `sky.applyPreset()`
    // returns the correct cold-start value.
    this.sky.getSun(this.scratchSunColor);
    this.sun.setColor(this.scratchSunColor);

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

    this.ambientHintIntensity = preset.ambientIntensity ?? REFERENCE_AMBIENT_HINT;
    if (preset.ambientColor) {
      this.ambientHintColor.copy(preset.ambientColor);
    }

    // Force LUT bake immediately so downstream samplers see real numbers.
    this.sky.update(0, this.sun.dirVec);
    // A preset IS a time of day for the three scenes with no day/night cycle.
    // Home Field's `pastoral-noon` puts the sun at +70 deg and the lamp out;
    // Rolling Hills' `dusk` puts it at +8 deg and a lamp part way up. Without
    // this line a static scene would sit on whatever the last sample left
    // behind, which for a fresh Atmosphere is nothing at all.
    this.applyDuskLamps();
    this.applySceneLighting();
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
    const nextElevation = Number.isFinite(elevation)
      ? elevation
      : this.sun.getElevation();
    const nextAzimuth = Number.isFinite(azimuth)
      ? azimuth
      : this.sun.getAzimuth();
    this.sun.setAngles(nextElevation, nextAzimuth);
    this.applyDuskLamps();
    this.applySceneLighting();
  }

  /**
   * Snap the whole atmosphere to a day/night time-of-day NOW, independent of
   * whether the cycle is running. The per-frame `update()` only re-bakes the
   * sky when the cycle is enabled+running and is driven by the game loop; the
   * cinematic capture path runs with the loop short-circuited (cinema.paused),
   * so `dayNight.setT()` alone would store the time without ever re-baking the
   * dome — freezing the sky at the pre-pause state. This applies the sampled
   * keyframe and re-bakes the sky LUT, sun color, and fog color in one call.
   * @param {number} t Time of day in [0, 1) (0=midnight, 0.5=noon, 0.75=sunset).
   * @returns {boolean} true if applied (a day/night cycle exists).
   */
  setTimeOfDay(t) {
    if (!this.dayNight) return false;
    this.dayNight.setT(t);
    const sample = this.dayNight.sampleAt(this.dayNight.getT());
    // dt=0: applyDayNightSample sets angles/tunables/coverage/fog-density
    // immediately; its sun-color lerp is a no-op at dt=0, so snap the sun
    // color from the freshly-baked sky right after.
    this.applyDayNightSample(sample, 0);
    this.sky.update(0, this.sun.dirVec);
    this.sky.getSun(this.scratchSunColor);
    this.sun.setColor(this.scratchSunColor);
    this.applyFogColor();
    // After the colour snap above, not before: the scene's sun takes the
    // freshly-baked chromaticity rather than the pre-jump one.
    this.applySceneLighting();
    return true;
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
   * Bind the lights that are actually in the rendered scene.
   *
   * ONE bind, not one per light. The defect this replaced was two
   * `bindAmbientLight(sceneManager.ambientLight)` call sites pointed at an
   * `AmbientLight` that, on the production WebGPU path, `setupLighting` never
   * added to any scene - so the preset drive landed nowhere while the lights the
   * renderer used sat at their boot constants. `SceneLightingRig`'s constructor
   * asserts scene membership and throws, so handing this the wrong light is loud
   * now instead of invisible.
   *
   * @param {import('../world/sceneLightingRig.js').SceneLightingRig | null} rig
   * @returns {boolean} whether anything is bound.
   */
  bindSceneLights(rig) {
    this.sceneLights = rig ?? null;
    this.applySceneLighting();
    return !!this.sceneLights;
  }

  /**
   * Bind the materials that light up after sundown, replacing any previous set.
   *
   * Cycle 115 Phase 5. Same shape as `bindAmbientLight` directly above, and for
   * the same reason: the orchestrator already knows where the sun is on every
   * frame that matters, so a consumer that wants to react to sundown should
   * hand itself over rather than poll. The scene body binds once per load
   * (`js/boot/initWorld.js`), and `Atmosphere` is rebuilt per scene load, so a
   * torn-down scene's materials cannot outlive their binding.
   *
   * A bound material opts in by carrying `userData.duskLampPeakIntensity`, the
   * `emissiveIntensity` it wants at full dark. Materials without it are left
   * alone, so this cannot accidentally light something that only wanted to be
   * in the list. The curve and its numbers live in
   * [`duskLamp.js`](duskLamp.js), which also records why this is an emissive
   * fake and not a real light.
   *
   * @param {Array<{ emissiveIntensity: number, userData?: object }>} [materials]
   * @returns {number} how many materials are now bound
   */
  bindDuskLamps(materials) {
    this.duskLamps = Array.isArray(materials) ? materials.filter(Boolean) : [];
    this.applyDuskLamps();
    return this.duskLamps.length;
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

  getFrame({ sunBillboard = null } = {}) {
    const fogNear = this.fog && 'near' in this.fog ? this.fog.near : 18;
    const fogFar = this.fog && 'far' in this.fog ? this.fog.far : 74;
    const sunBillboardFrame = sunBillboard?.getDiagnostics?.() ?? null;
    return sampleSkyFogPacketFromSky({
      sky: this.sky,
      presetName: this.currentPresetName ?? DEFAULT_PRESET,
      fogDarkenMultiplier: this.weather.fogDarkenMultiplier ?? 1.0,
      fogNear,
      fogFar,
      cloudCoverage: this.sky.getCloudCoverage(),
      sunPhysicalDirection: this.sun.dirVec.toArray(),
      sunVisualDirection: sunBillboardFrame?.visualDirection ?? null,
      sunBillboard: sunBillboardFrame,
      skyMaterialMode: this.sky.material?.isNodeMaterial ? 'webgpu-node' : 'webgl-shader',
      cloudAlpha: this.cloudLayer?.getCoverage?.() ?? null,
      cloudHorizonFade: this.cloudLayer?.getEdgeFade?.() ?? null,
      atmosphereDrawCount: [
        this.sky?.getMesh ? 1 : 0,
        this.cloudLayer && this.cloudLayer.getCoverage() > 0.001 ? 1 : 0,
        sunBillboardFrame ? 1 : 0,
      ].reduce((sum, value) => sum + value, 0),
    });
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
    // The materials belong to the scene body, which disposes itself. Drop the
    // references so a disposed Atmosphere cannot keep a torn-down scene's
    // materials alive. The lighting rig belongs to the SceneManager and outlives
    // every scene swap, so this drops the reference and leaves the lights alone.
    this.duskLamps = [];
    this.sceneLights = null;
  }

  /** @private */
  applyFogDensity() {
    if (!this.fog) return;
    this.fog.density =
      this.baseFogDensity * (this.weather.fogDensityMultiplier ?? 1.0);
  }

  /**
   * Drive scene fog from what the sky actually paints at the horizon.
   *
   * Cycle 112 Phase 6. This used to assign the raw horizon LUT value, which no
   * sky renderer paints: the dome shades its horizon from that value, and the
   * terrain is tone mapped while the dome is not. The result was a bright band
   * where terrain met sky in every scene (near-white against blue at noon).
   * js/atmosphere/paintedHorizon.js owns both halves of the reconciliation.
   *
   * @private
   */
  applyFogColor() {
    if (!this.fog) return;
    this.sky.getHorizon(this.scratchHorizon);
    this.sky.getZenith(this.scratchZenith);
    fogColorMatchingSky(this.fog.color, {
      horizon: this.scratchHorizon,
      zenith: this.scratchZenith,
      presetName: this.currentPresetName,
      toneMapping: this.toneMappingMode,
      exposure: this.toneMappingExposure,
      darken: this.weather.fogDarkenMultiplier ?? 1.0,
    });
  }

  /**
   * Push the current sun elevation at every bound lamp.
   *
   * Runs from `applyPreset` (static scenes), `applyDayNightSample` (which is
   * both the per-frame cycle tick and what `setTimeOfDay` calls) and `setSun`,
   * which is every path that can move the sun. Early-outs on the empty list so
   * the scenes with no lamp (Rolling Hills and Open Country ship no farmhouse
   * at all) pay nothing per frame.
   *
   * @private
   */
  applyDuskLamps() {
    if (this.duskLamps.length === 0) return;
    const factor = duskLampFactor(this.sun.getElevation());
    for (const material of this.duskLamps) {
      const peak = material.userData?.duskLampPeakIntensity;
      if (!Number.isFinite(peak)) continue;
      material.emissiveIntensity = peak * factor;
    }
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

    this.ambientHintIntensity = lerp(
      a.ambientIntensity ?? REFERENCE_AMBIENT_HINT,
      b.ambientIntensity ?? REFERENCE_AMBIENT_HINT,
      m
    );
    if (a.ambientColor && b.ambientColor) {
      this.ambientHintColor.copy(a.ambientColor).lerp(b.ambientColor, m);
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

    // Last, because they read the sun angles this method set at the top. This is
    // the day-loop path (Newsheepdogland) and the `setTimeOfDay` path (the
    // cinematic capture rig, the skip-to-dusk cutscene).
    this.applyDuskLamps();
    this.applySceneLighting();
  }

  /**
   * Push the current sky state at the lights that are actually in the scene.
   *
   * Runs from every path that can move the sun or change the preset - the same
   * set `applyDuskLamps` runs from, for the same reason. The rig owns the
   * transform, so writing a direction here cannot disturb a day-loop scene's
   * shadow frustum, and recentring that frustum cannot disturb the sun's angle.
   *
   * @private
   */
  applySceneLighting() {
    const rig = this.sceneLights;
    if (!rig) return;

    rig.setAmbientIntensity(ambientIntensityForHint(this.ambientHintIntensity, rig.profile));
    rig.setAmbientColor(this.ambientHintColor);

    if (rig.profile?.drivesSun !== true) return;
    const gate = sunDaylightGate(this.sun.getElevation());
    // The same gate rides `SunSystem.light.intensity`, which is not in any scene
    // and never was - it is the value `setImpostorTint` reads to keep the
    // far-tree impostor on the same sun footing as the LOD0 leaf it replaces.
    this.sun.setIntensity(gate);
    rig.setSunIntensity(SUN_REFERENCE_INTENSITY * gate);
    rig.setSunColor(this.sun.light.color);
    rig.setSunDirection(this.sun.dirVec);
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
