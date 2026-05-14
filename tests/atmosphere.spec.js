/**
 * Behavior tests for the atmosphere module (Cycle 4 Unit J).
 *
 * Module is intentionally unwired from the renderer — the tests assert the
 * standalone surface: preset registry, sun-position math, day/night
 * interpolation, sky LUT outputs, fog plumbing.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import {
  Atmosphere,
  HosekWilkieSky,
  CloudLayer,
  SunSystem,
  DayNightCycle,
  SKY_PRESETS,
  FOG_DENSITY_MULTIPLIERS,
  CLOUD_COVERAGE_TARGETS,
  sunDirectionFromAngles,
  sunDirectionFromPreset,
  getRequiredPresetNames,
  isKnownPreset,
} from '../js/atmosphere/index.js';

const REQUIRED = ['pastoral-noon', 'dusk', 'overcast', 'dawn', 'golden-hour'];

describe('skyPresets', () => {
  it('exposes every preset name required by the SkyDef enum', () => {
    for (const name of REQUIRED) {
      expect(SKY_PRESETS[name], `missing preset ${name}`).toBeDefined();
      expect(isKnownPreset(name)).toBe(true);
    }
    expect(getRequiredPresetNames()).toEqual(REQUIRED);
  });

  it('rejects unknown preset names', () => {
    expect(isKnownPreset('not-a-real-preset')).toBe(false);
  });

  it('every preset has finite numeric tunables', () => {
    for (const name of REQUIRED) {
      const p = SKY_PRESETS[name];
      expect(Number.isFinite(p.sunAzimuthRad)).toBe(true);
      expect(Number.isFinite(p.sunElevationRad)).toBe(true);
      expect(p.turbidity).toBeGreaterThan(0);
      expect(p.rayleigh).toBeGreaterThan(0);
      expect(p.exposure).toBeGreaterThan(0);
      expect(p.fogDensity).toBeGreaterThan(0);
      expect(p.groundAlbedo).toBeInstanceOf(THREE.Color);
    }
  });

  it('weather modulator tables cover the expected states', () => {
    for (const state of ['CLEAR', 'LIGHT_RAIN', 'HEAVY_RAIN', 'STORM']) {
      expect(FOG_DENSITY_MULTIPLIERS[state]).toBeGreaterThan(0);
      expect(CLOUD_COVERAGE_TARGETS[state]).toBeGreaterThanOrEqual(0);
    }
    // Ordering sanity: storms cloud the sky more than rain.
    expect(CLOUD_COVERAGE_TARGETS.STORM).toBeGreaterThan(
      CLOUD_COVERAGE_TARGETS.LIGHT_RAIN
    );
    expect(FOG_DENSITY_MULTIPLIERS.STORM).toBeGreaterThan(
      FOG_DENSITY_MULTIPLIERS.LIGHT_RAIN
    );
  });
});

describe('sun-position math', () => {
  it('sunDirectionFromAngles returns a unit vector pointing toward zenith for elevation=PI/2', () => {
    const v = sunDirectionFromAngles(Math.PI / 2, 0);
    expect(v.length()).toBeCloseTo(1, 5);
    expect(v.y).toBeCloseTo(1, 5);
  });

  it('sunDirectionFromAngles returns a unit vector at the horizon for elevation=0', () => {
    const v = sunDirectionFromAngles(0, 0);
    expect(v.length()).toBeCloseTo(1, 5);
    expect(v.y).toBeCloseTo(0, 5);
    expect(v.x).toBeCloseTo(1, 5);
  });

  it('sunDirectionFromPreset agrees with sunDirectionFromAngles', () => {
    const preset = SKY_PRESETS['pastoral-noon'];
    const a = sunDirectionFromPreset(preset);
    const b = sunDirectionFromAngles(preset.sunElevationRad, preset.sunAzimuthRad);
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(a.y).toBeCloseTo(b.y, 5);
    expect(a.z).toBeCloseTo(b.z, 5);
  });

  it('SunSystem.setAngles updates dirVec and exposes the directional light position above the origin', () => {
    const sun = new SunSystem({ castShadow: false });
    sun.setAngles(Math.PI / 4, 0);
    expect(sun.dirVec.length()).toBeCloseTo(1, 5);
    expect(sun.light.position.y).toBeGreaterThan(0);
  });

  it('SunSystem clamps shadow-light Y above MIN_SUN_Y when sun is below horizon', () => {
    const sun = new SunSystem({ castShadow: false });
    sun.setAngles(-Math.PI / 4, 0);
    expect(sun.light.position.y).toBeGreaterThanOrEqual(20);
  });

  it('SunSystem.setShadowFollowTarget recenters the shadow target on the follow XZ', () => {
    const sun = new SunSystem({ castShadow: false });
    const follow = new THREE.Object3D();
    follow.position.set(50, 5, -30);
    sun.setShadowFollowTarget(follow);
    expect(sun.light.target.position.x).toBeCloseTo(50, 3);
    expect(sun.light.target.position.z).toBeCloseTo(-30, 3);
  });
});

describe('HosekWilkieSky', () => {
  it('produces non-zero zenith and horizon colors after applying a preset', () => {
    const sky = new HosekWilkieSky();
    sky.applyPreset(SKY_PRESETS['pastoral-noon']);
    sky.update(0, sunDirectionFromPreset(SKY_PRESETS['pastoral-noon']));
    const zenith = sky.getZenith(new THREE.Color());
    const horizon = sky.getHorizon(new THREE.Color());
    const sun = sky.getSun(new THREE.Color());
    for (const c of [zenith, horizon, sun]) {
      const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      expect(luma).toBeGreaterThan(0);
    }
  });

  it('sample(straight up) approximately equals zenith color', () => {
    const sky = new HosekWilkieSky();
    sky.applyPreset(SKY_PRESETS['pastoral-noon']);
    sky.update(0, sunDirectionFromPreset(SKY_PRESETS['pastoral-noon']));
    const zenith = sky.getZenith(new THREE.Color());
    const sample = sky.sample(new THREE.Vector3(0, 1, 0), new THREE.Color());
    expect(Math.abs(sample.r - zenith.r)).toBeLessThan(0.02);
    expect(Math.abs(sample.g - zenith.g)).toBeLessThan(0.02);
    expect(Math.abs(sample.b - zenith.b)).toBeLessThan(0.02);
  });

  it('cloud coverage uniform tracks setCloudCoverage clamped into [0,1]', () => {
    const sky = new HosekWilkieSky();
    sky.setCloudCoverage(2.5);
    expect(sky.getCloudCoverage()).toBe(1);
    sky.setCloudCoverage(-1);
    expect(sky.getCloudCoverage()).toBe(0);
    sky.setCloudCoverage(0.42);
    expect(sky.getCloudCoverage()).toBeCloseTo(0.42, 5);
  });

  it('warm-sun preset is redder than blue (sunset look)', () => {
    const sky = new HosekWilkieSky();
    sky.applyPreset(SKY_PRESETS.dusk);
    sky.update(0, sunDirectionFromPreset(SKY_PRESETS.dusk));
    const sun = sky.getSun(new THREE.Color());
    expect(sun.r).toBeGreaterThan(sun.b);
  });
});

describe('DayNightCycle', () => {
  it('all default keyframes reference known presets', () => {
    const cycle = new DayNightCycle();
    for (const kf of cycle.getKeyframes()) {
      expect(isKnownPreset(kf.preset)).toBe(true);
    }
  });

  it('throws if constructed with a keyframe pointing to an unknown preset', () => {
    expect(() => {
      new DayNightCycle({
        keyframes: [
          { t: 0, preset: 'definitely-not-real', elevation: 0, azimuth: 0 },
          { t: 0.5, preset: 'pastoral-noon', elevation: 1, azimuth: 0 },
        ],
      });
    }).toThrow(/unknown preset/);
  });

  it('sampleAt clamps t into [0,1) and returns finite angles', () => {
    const cycle = new DayNightCycle();
    const sample = cycle.sampleAt(1.42);
    expect(sample.t).toBeGreaterThanOrEqual(0);
    expect(sample.t).toBeLessThan(1);
    expect(Number.isFinite(sample.elevation)).toBe(true);
    expect(Number.isFinite(sample.azimuth)).toBe(true);
  });

  it('elevation interpolates monotonically between sunrise and noon', () => {
    const cycle = new DayNightCycle();
    const sunrise = cycle.sampleAt(0.25).elevation;
    const midmorning = cycle.sampleAt(0.40).elevation;
    const noon = cycle.sampleAt(0.50).elevation;
    expect(midmorning).toBeGreaterThan(sunrise);
    expect(noon).toBeGreaterThan(midmorning);
  });

  it('update advances t by dt/secondsPerDay only when running', () => {
    const cycle = new DayNightCycle({ secondsPerDay: 100, initialT: 0 });
    cycle.update(10);
    expect(cycle.getT()).toBe(0); // not running
    cycle.setRunning(true);
    cycle.update(25);
    expect(cycle.getT()).toBeCloseTo(0.25, 5);
  });

  it('mix is in [0,1] across the cycle', () => {
    const cycle = new DayNightCycle();
    for (let i = 0; i < 24; i++) {
      const t = i / 24;
      const s = cycle.sampleAt(t);
      expect(s.mix).toBeGreaterThanOrEqual(0);
      expect(s.mix).toBeLessThanOrEqual(1);
    }
  });
});

describe('Atmosphere orchestrator', () => {
  it('throws when constructed without a scene', () => {
    expect(() => new Atmosphere()).toThrow();
  });

  it('attaches a sky dome and (by default) a cloud mesh to the scene', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene);
    const childNames = scene.children.map((c) => c.name);
    expect(childNames).toContain('HosekWilkieSkyDome');
    expect(childNames).toContain('CloudLayer');
    atmo.dispose();
  });

  it('sets scene.fog by default', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene);
    expect(scene.fog).toBeTruthy();
    atmo.dispose();
    expect(scene.fog).toBeNull();
  });

  it('applyPreset returns true for known presets and false for unknown', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene);
    expect(atmo.applyPreset('dusk')).toBe(true);
    expect(atmo.getCurrentPresetName()).toBe('dusk');
    expect(atmo.applyPreset('not-a-preset')).toBe(false);
    expect(atmo.getCurrentPresetName()).toBe('dusk'); // unchanged
    atmo.dispose();
  });

  it('falls back to pastoral-noon when given an unknown initialPreset', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene, { initialPreset: 'bogus' });
    expect(atmo.getCurrentPresetName()).toBe('pastoral-noon');
    atmo.dispose();
  });

  it('setSun overrides angles and updates the sun system', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene);
    atmo.setSun({ elevation: 0.3, azimuth: 1.2 });
    expect(atmo.sun.getElevation()).toBeCloseTo(0.3, 5);
    expect(atmo.sun.getAzimuth()).toBeCloseTo(1.2, 5);
    atmo.dispose();
  });

  it('setWeather raises fog density and cloud coverage when applying STORM', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene, { initialPreset: 'pastoral-noon' });
    const baselineDensity = atmo.fog.density;
    const baselineCoverage = atmo.sky.getCloudCoverage();

    atmo.setWeather({ weatherState: 'STORM' });
    expect(atmo.fog.density).toBeGreaterThan(baselineDensity);
    expect(atmo.sky.getCloudCoverage()).toBeGreaterThan(baselineCoverage);

    atmo.setWeather({ weatherState: 'CLEAR' });
    expect(atmo.fog.density).toBeCloseTo(baselineDensity, 8);
    atmo.dispose();
  });

  it('update drives fog color from the sky horizon with weather darkening applied', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene, { initialPreset: 'dawn' });
    const horizon = atmo.sky.getHorizon(new THREE.Color());

    atmo.update(0);
    expect(atmo.fog.color.r).toBeCloseTo(horizon.r, 5);
    expect(atmo.fog.color.g).toBeCloseTo(horizon.g, 5);
    expect(atmo.fog.color.b).toBeCloseTo(horizon.b, 5);

    atmo.setWeather({ fogDarkenMultiplier: 0.5 });
    atmo.update(0);
    expect(atmo.fog.color.r).toBeCloseTo(horizon.r * 0.5, 5);
    expect(atmo.fog.color.g).toBeCloseTo(horizon.g * 0.5, 5);
    expect(atmo.fog.color.b).toBeCloseTo(horizon.b * 0.5, 5);
    atmo.dispose();
  });

  it('scene fog overrides keep distance parameters while horizon owns fog color', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene, {
      initialPreset: 'golden-hour',
      sceneFog: { color: '#123456', near: 40, far: 680 },
    });
    const horizon = atmo.sky.getHorizon(new THREE.Color());

    expect(scene.fog.near).toBe(40);
    expect(scene.fog.far).toBe(680);
    expect(scene.fog.color.r).toBeCloseTo(horizon.r, 5);
    expect(scene.fog.color.g).toBeCloseTo(horizon.g, 5);
    expect(scene.fog.color.b).toBeCloseTo(horizon.b, 5);
    atmo.dispose();
  });

  it('cloud layer consumes the sky-derived sun color during update', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene, { initialPreset: 'dusk' });

    atmo.update(0.016);
    const skySun = atmo.sky.getSun(new THREE.Color());
    const cloudSun = atmo.cloudLayer.material.uniforms.uSunColor.value;
    expect(cloudSun.r).toBeCloseTo(skySun.r, 5);
    expect(cloudSun.g).toBeCloseTo(skySun.g, 5);
    expect(cloudSun.b).toBeCloseTo(skySun.b, 5);
    atmo.dispose();
  });

  it('startDayNightCycle advances the sun direction when update() is called', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene, { initialPreset: 'pastoral-noon' });
    atmo.startDayNightCycle({ secondsPerDay: 100, initialT: 0.5 });
    const beforeY = atmo.sun.dirVec.y;
    // Advance ~1/10 of the cycle.
    atmo.update(10);
    const afterY = atmo.sun.dirVec.y;
    expect(Math.abs(afterY - beforeY)).toBeGreaterThan(0.01);
    expect(atmo.isDayNightRunning()).toBe(true);
    atmo.stopDayNightCycle();
    expect(atmo.isDayNightRunning()).toBe(false);
    atmo.dispose();
  });

  it('update() does not throw when called repeatedly', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene);
    expect(() => {
      for (let i = 0; i < 5; i++) atmo.update(0.016);
    }).not.toThrow();
    atmo.dispose();
  });

  it('bindAmbientLight applies the current preset ambient hint', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene, { initialPreset: 'overcast' });
    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    atmo.bindAmbientLight(ambient);
    expect(ambient.intensity).toBeCloseTo(SKY_PRESETS.overcast.ambientIntensity, 5);
    atmo.dispose();
  });

  it('syncCamera positions the sky dome at the camera', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene);
    atmo.syncCamera(new THREE.Vector3(123, 4, -56));
    expect(atmo.sky.getMesh().position.x).toBe(123);
    expect(atmo.sky.getMesh().position.z).toBe(-56);
    atmo.dispose();
  });
});

describe('CloudLayer', () => {
  it('starts hidden and becomes visible only with non-zero coverage and edge-fade', () => {
    const layer = new CloudLayer();
    expect(layer.getMesh().visible).toBe(false);
    layer.setCoverage(0.5);
    layer.update(
      new THREE.Vector3(0, 10, 0),
      0,
      new THREE.Vector3(0, 1, 0),
      new THREE.Color(1, 1, 1),
      0.016
    );
    expect(layer.getMesh().visible).toBe(true);
    layer.dispose();
  });

  it('clamps coverage to [0,1]', () => {
    const layer = new CloudLayer();
    layer.setCoverage(2);
    expect(layer.getCoverage()).toBe(1);
    layer.setCoverage(-1);
    expect(layer.getCoverage()).toBe(0);
    layer.dispose();
  });
});
