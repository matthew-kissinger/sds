// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { sunDirectionFromAngles } from './skyPresets.js';

/**
 * Wraps a `THREE.DirectionalLight` and exposes sun direction state in the
 * (elevation, azimuth) space the rest of the atmosphere module uses. The
 * shadow camera is tuned for SDS's ±220m playfield (per the cycle plan),
 * so when a future Phase B wires this into the renderer it lights the
 * whole field cleanly without the directional light needing further setup.
 *
 * Atmosphere ports from Terror in the Jungle drove the directional light
 * via `IGameRenderer.moonLight`; SDS uses a thinner abstraction — this
 * class owns the light directly so callers can either add it to the scene
 * themselves or read its world transform for shadow mapping.
 */

const DEFAULT_SUN_DISTANCE = 500;
const DEFAULT_SHADOW_HALF_EXTENT = 220;
const SHADOW_NEAR = 0.5;
const SHADOW_FAR = 1500;
const MIN_SUN_Y = 20;

export class SunSystem {
  /**
   * @param {Object} [options]
   * @param {number} [options.distance=500]   World-units between sun light and origin.
   * @param {number} [options.shadowHalfExtent=220]
   * @param {boolean} [options.castShadow=true]
   * @param {number} [options.shadowMapSize=2048]
   */
  constructor(options = {}) {
    const distance = options.distance ?? DEFAULT_SUN_DISTANCE;
    const halfExtent = options.shadowHalfExtent ?? DEFAULT_SHADOW_HALF_EXTENT;
    const castShadow = options.castShadow ?? true;
    const shadowMapSize = options.shadowMapSize ?? 2048;

    /** @private */
    this.distance = distance;
    /** Direction unit vector pointing FROM origin TOWARD the sun. */
    this.dirVec = new THREE.Vector3(0, 1, 0);
    /** @private */
    this.elevation = Math.PI / 2;
    /** @private */
    this.azimuth = 0;

    /** @type {THREE.DirectionalLight} */
    this.light = new THREE.DirectionalLight(0xffffff, 1.0);
    this.light.name = 'AtmosphereSun';
    this.light.position.set(0, distance, 0);
    this.light.target.position.set(0, 0, 0);

    if (castShadow) {
      this.light.castShadow = true;
      this.light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      this.light.shadow.camera.near = SHADOW_NEAR;
      this.light.shadow.camera.far = SHADOW_FAR;
      this.light.shadow.camera.left = -halfExtent;
      this.light.shadow.camera.right = halfExtent;
      this.light.shadow.camera.top = halfExtent;
      this.light.shadow.camera.bottom = -halfExtent;
      this.light.shadow.bias = -0.0005;
      this.light.shadow.normalBias = 0.04;
    }

    // World units per shadow-map texel; the follow target snaps to this grid
    // so a moving target doesn't shimmer the whole map every step (Cycle 90).
    /** @private */
    this.shadowTexelWorld = castShadow ? (2 * halfExtent) / shadowMapSize : 0;
  }

  /**
   * Set sun direction by angles. Direction vector is stored normalized.
   * @param {number} elevationRad   -PI/2 (under horizon) to PI/2 (zenith).
   * @param {number} azimuthRad     -PI to PI.
   */
  setAngles(elevationRad, azimuthRad) {
    this.elevation = elevationRad;
    this.azimuth = azimuthRad;
    sunDirectionFromAngles(elevationRad, azimuthRad, this.dirVec);
    this.applyTransformToLight();
  }

  /** @returns {number} */
  getElevation() {
    return this.elevation;
  }

  /** @returns {number} */
  getAzimuth() {
    return this.azimuth;
  }

  /** @returns {THREE.Vector3} */
  getDirection() {
    return this.dirVec;
  }

  /**
   * Override the sun's RGB color (drives the directional light). Atmosphere
   * orchestrator can compute this from `HosekWilkieSky.getSun(out)`.
   * @param {THREE.Color} color
   */
  setColor(color) {
    this.light.color.copy(color);
  }

  /** @param {number} intensity */
  setIntensity(intensity) {
    this.light.intensity = Math.max(0, intensity);
  }

  /**
   * Smoothly interpolate sun color toward `target` over `dt` seconds with
   * a time constant `tau`. Useful for the day/night cycle's preset blend.
   * @param {THREE.Color} target
   * @param {number} dt
   * @param {number} [tau=0.5]
   */
  lerpColor(target, dt, tau = 0.5) {
    const alpha = tauToAlpha(dt, tau);
    this.light.color.lerp(target, alpha);
  }

  /**
   * Smoothly interpolate intensity toward `target` over `dt` seconds.
   * @param {number} target
   * @param {number} dt
   * @param {number} [tau=0.5]
   */
  lerpIntensity(target, dt, tau = 0.5) {
    const alpha = tauToAlpha(dt, tau);
    this.light.intensity = this.light.intensity * (1 - alpha) + target * alpha;
  }

  /**
   * Recenter the shadow frustum on a follow target's XZ so shadows stay
   * sharp near the player regardless of sun angle. Pass `undefined` to
   * recenter on the world origin.
   * @param {THREE.Object3D | undefined} target
   */
  setShadowFollowTarget(target) {
    /** @private */
    this.shadowFollowTarget = target;
    this.applyTransformToLight();
  }

  /**
   * Place the directional light's position + target so it shines along
   * `-dirVec` and re-runs the shadow frustum follow.
   * @private
   */
  applyTransformToLight() {
    const dir = this.dirVec;
    let posX = dir.x * this.distance;
    let posY = dir.y * this.distance;
    let posZ = dir.z * this.distance;
    if (posY < MIN_SUN_Y) posY = MIN_SUN_Y;

    let targetX = 0;
    let targetY = 0;
    let targetZ = 0;

    if (this.shadowFollowTarget) {
      // Only x/z are read, so a 2D sim entity (position {x, z}) works as a
      // follow target directly - no render-object dependency (Cycle 90).
      const t = this.shadowFollowTarget.position;
      let tx = Number.isFinite(t.x) ? t.x : 0;
      let tz = Number.isFinite(t.z) ? t.z : 0;
      if (this.shadowTexelWorld > 0) {
        tx = Math.round(tx / this.shadowTexelWorld) * this.shadowTexelWorld;
        tz = Math.round(tz / this.shadowTexelWorld) * this.shadowTexelWorld;
      }
      posX += tx;
      posZ += tz;
      targetX = tx;
      targetZ = tz;
    }

    this.light.position.set(posX, posY, posZ);
    this.light.target.position.set(targetX, targetY, targetZ);
    this.light.target.updateMatrixWorld();
    this.light.updateMatrixWorld();
  }

  dispose() {
    this.light.dispose();
  }
}

/**
 * Frame-rate-independent smoothing factor for an exponential lerp:
 * a value `alpha` such that `value = lerp(value, target, alpha)` reaches
 * `1 - 1/e` of the way to target after `tau` seconds.
 * @param {number} dt
 * @param {number} tau
 * @returns {number}
 */
function tauToAlpha(dt, tau) {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  if (!Number.isFinite(tau) || tau <= 1e-4) return 1;
  return 1 - Math.exp(-dt / tau);
}
