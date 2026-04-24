import * as THREE from 'three';
import { cloudFragmentShader, cloudVertexShader } from './cloudShader.glsl.js';

/**
 * High-altitude cloud layer rendered as a single horizontal plane with a
 * procedural fragment shader. Ported from Terror in the Jungle's
 * `CloudLayer.ts`. The planar approach is intentionally simple — billboards
 * break under fly-through, and a true volumetric raymarch is out of budget.
 *
 * The TitJ planar layer was rated 2/5 portability in the redo brief because
 * its single-tile edge could read as a hard divider at low altitude. Two
 * structural fixes here:
 *  1. Footprint and horizon-fade ranges in the shader are widened so the
 *     plane never shows a hard edge at any view angle.
 *  2. The mesh is wider than tall (3:2 aspect) and rotated 12deg around the
 *     camera axis so the rectangular tile boundary spreads across multiple
 *     horizon directions instead of aligning with one cardinal.
 *
 * The dome `HosekWilkieSky` also paints its own integrated cloud field;
 * this layer adds parallax (clouds drift overhead as the camera moves)
 * which the dome alone can't deliver.
 */

const BASE_ALTITUDE = 1200;
const PLANE_LENGTH = 36000;
const PLANE_WIDTH = 24000;
const EDGE_FADE_HALF_WIDTH = 100;
const DEFAULT_NOISE_SCALE = 1 / 900;
const DEFAULT_WIND_DIR_X = 0.7;
const DEFAULT_WIND_DIR_Z = 0.7;

export class CloudLayer {
  constructor() {
    /** @private */
    this.sunDirection = new THREE.Vector3(0, 1, 0);
    /** @private */
    this.sunColor = new THREE.Color(1, 1, 1);
    /** @private */
    this.windDir = new THREE.Vector2(DEFAULT_WIND_DIR_X, DEFAULT_WIND_DIR_Z);
    /** @private */
    this.coverage = 0;
    /** @private */
    this.edgeFade = 1;
    /** @private */
    this.elapsedSeconds = 0;

    this.material = new THREE.ShaderMaterial({
      name: 'CloudLayer',
      uniforms: {
        uSunDirection: { value: this.sunDirection },
        uSunColor: { value: this.sunColor },
        uCoverage: { value: 0 },
        uEdgeFade: { value: 1 },
        uNoiseScale: { value: DEFAULT_NOISE_SCALE },
        uTimeSeconds: { value: 0 },
        uWindDir: { value: this.windDir },
      },
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });

    this.geometry = new THREE.PlaneGeometry(PLANE_LENGTH, PLANE_WIDTH, 1, 1);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    // Authored XY -> world XZ. The extra Y rotation breaks the cardinal
    // alignment so the rectangular tile edge no longer coincides with any
    // single horizon view direction.
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.rotation.z = (12 * Math.PI) / 180;
    this.mesh.renderOrder = -2;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'CloudLayer';
    this.mesh.visible = false;
  }

  /** @returns {THREE.Mesh} */
  getMesh() {
    return this.mesh;
  }

  /** @returns {number} */
  getBaseAltitude() {
    return BASE_ALTITUDE;
  }

  /**
   * @param {THREE.Vector3} cameraPosition
   * @param {number} terrainYAtCamera
   * @param {THREE.Vector3} sunDirection
   * @param {THREE.Color} sunColor
   * @param {number} [deltaSeconds]
   */
  update(cameraPosition, terrainYAtCamera, sunDirection, sunColor, deltaSeconds = 0) {
    const planeY = (terrainYAtCamera || 0) + BASE_ALTITUDE;
    this.mesh.position.set(cameraPosition.x, planeY, cameraPosition.z);

    this.sunDirection.copy(sunDirection);
    const len = this.sunDirection.length();
    if (len > 1e-6) {
      this.sunDirection.multiplyScalar(1 / len);
    } else {
      this.sunDirection.set(0, 1, 0);
    }
    this.sunColor.copy(sunColor);

    const dy = Math.abs(cameraPosition.y - planeY);
    this.edgeFade = smoothstep01(dy / EDGE_FADE_HALF_WIDTH);
    this.material.uniforms.uCoverage.value = this.coverage;
    this.material.uniforms.uEdgeFade.value = this.edgeFade;

    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      this.elapsedSeconds += deltaSeconds;
      this.material.uniforms.uTimeSeconds.value = this.elapsedSeconds;
    }

    this.mesh.visible = this.coverage > 0.001 && this.edgeFade > 0.001;
  }

  /** @param {number} v */
  setCoverage(v) {
    this.coverage = Math.max(0, Math.min(1, v));
    this.material.uniforms.uCoverage.value = this.coverage;
  }

  /** @returns {number} */
  getCoverage() {
    return this.coverage;
  }

  /** @param {number} metersPerFeature */
  setFeatureScaleMeters(metersPerFeature) {
    if (!Number.isFinite(metersPerFeature) || metersPerFeature <= 0) return;
    this.material.uniforms.uNoiseScale.value = 1 / metersPerFeature;
  }

  resetFeatureScale() {
    this.material.uniforms.uNoiseScale.value = DEFAULT_NOISE_SCALE;
  }

  /** @returns {number} */
  getEdgeFade() {
    return this.edgeFade;
  }

  dispose() {
    this.material.dispose();
    this.geometry.dispose();
  }
}

/**
 * @param {number} x
 * @returns {number}
 */
function smoothstep01(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}
