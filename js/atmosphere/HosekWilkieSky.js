import * as THREE from 'three';
import {
  hosekWilkieFragmentShader,
  hosekWilkieVertexShader,
} from './skyShader.glsl.js';
import { sunDirectionFromPreset } from './skyPresets.js';

/**
 * Analytic sky-dome backend ported from Terror in the Jungle's
 * `HosekWilkieSkyBackend.ts`. Owns a 500-unit `SphereGeometry` + a
 * `ShaderMaterial` running the Preetham analytic sky in the fragment
 * shader. Camera-following: the orchestrator keeps the dome glued to the
 * camera each frame so it never clips.
 *
 * CPU sampling is served by a small `LUT_AZIMUTH_BINS x LUT_ELEVATION_BINS`
 * table baked from the same analytic formula at preset apply. Fog tint
 * + hemisphere/ambient samplers call `sample()` per frame; the LUT only
 * re-bakes when the sun direction changes by more than ~0.5 degrees.
 *
 * Source mirrors the TitJ implementation closely; logic and constants
 * preserved so behaviour matches the original tests.
 */

const DOME_RADIUS = 500;
const DOME_WIDTH_SEGMENTS = 64;
const DOME_HEIGHT_SEGMENTS = 32;

const LUT_AZIMUTH_BINS = 32;
const LUT_ELEVATION_BINS = 8;
const DEFAULT_CLOUD_NOISE_SCALE = 1 / 900;
const DEFAULT_CLOUD_WIND_DIR_X = 0.7;
const DEFAULT_CLOUD_WIND_DIR_Z = 0.7;

/**
 * Cosine threshold for "sun moved enough to re-bake the LUT". cos(0.5deg)
 * ≈ 0.99996. At a 10-min day cycle the rebake fires every ~5 real seconds.
 */
const LUT_REBAKE_COS_THRESHOLD = Math.cos((0.5 * Math.PI) / 180);

export class HosekWilkieSky {
  constructor(options = {}) {
    const createRenderable = options.createRenderable !== false;
    /** @private */
    this.sunDirection = new THREE.Vector3(0, 1, 0);
    /** @private */
    this.groundAlbedo = new THREE.Color(0x3b4c2e);
    /** @private */
    this.turbidity = 3.0;
    /** @private */
    this.rayleigh = 2.0;
    /** @private */
    this.mieCoefficient = 0.005;
    /** @private */
    this.mieDirectionalG = 0.8;
    /** @private */
    this.exposure = 0.5;
    /** @private */
    this.cloudCoverage = 0;
    /** @private */
    this.cloudNoiseScale = DEFAULT_CLOUD_NOISE_SCALE;
    /** @private */
    this.cloudTimeSeconds = 0;
    /** @private */
    this.cloudWindDir = new THREE.Vector2(
      DEFAULT_CLOUD_WIND_DIR_X,
      DEFAULT_CLOUD_WIND_DIR_Z
    );

    /** @private */
    this.zenithColor = new THREE.Color(0x000000);
    /** @private */
    this.horizonColor = new THREE.Color(0x000000);
    /** @private */
    this.sunColor = new THREE.Color(0xffffff);

    /** @private */
    this.lut = new Float32Array(LUT_AZIMUTH_BINS * LUT_ELEVATION_BINS * 3);
    /** @private */
    this.lutDirty = true;

    /** @private */
    this.scratchDir = new THREE.Vector3();
    /** @private */
    this.scratchColor = new THREE.Color();
    /** @private */
    this.lastSunDir = new THREE.Vector3();

    this.material = null;
    this.geometry = null;
    this.mesh = null;

    if (createRenderable) {
      this.uniforms = {
        uSunDirection: { value: this.sunDirection },
        uTurbidity: { value: this.turbidity },
        uRayleigh: { value: this.rayleigh },
        uMieCoefficient: { value: this.mieCoefficient },
        uMieDirectionalG: { value: this.mieDirectionalG },
        uGroundAlbedo: { value: this.groundAlbedo },
        uExposure: { value: this.exposure },
        uCloudCoverage: { value: this.cloudCoverage },
        uCloudNoiseScale: { value: this.cloudNoiseScale },
        uCloudTimeSeconds: { value: this.cloudTimeSeconds },
        uCloudWindDir: { value: this.cloudWindDir },
      };
      const createDefaultMaterial = () => new THREE.ShaderMaterial({
        name: 'HosekWilkieSky',
        uniforms: this.uniforms,
        vertexShader: hosekWilkieVertexShader,
        fragmentShader: hosekWilkieFragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      });
      const materialResult = typeof options.factory === 'function'
        ? options.factory({
            uniforms: this.uniforms,
          })
        : null;
      this.material = materialResult?.material ?? materialResult ?? createDefaultMaterial();

      this.geometry = new THREE.SphereGeometry(
        DOME_RADIUS,
        DOME_WIDTH_SEGMENTS,
        DOME_HEIGHT_SEGMENTS
      );
      this.mesh = new THREE.Mesh(this.geometry, this.material);
      this.mesh.renderOrder = -1;
      this.mesh.frustumCulled = false;
      this.mesh.matrixAutoUpdate = true;
      this.mesh.name = 'HosekWilkieSkyDome';
    }
  }

  /** @returns {THREE.Mesh} */
  getMesh() {
    if (!this.mesh) {
      throw new Error('HosekWilkieSky: render mesh was not created');
    }
    return this.mesh;
  }

  /**
   * Apply sun direction, turbidity, albedo, exposure from a preset.
   * @param {import('./skyPresets.js').AtmospherePreset} preset
   */
  applyPreset(preset) {
    sunDirectionFromPreset(preset, this.sunDirection);
    this.turbidity = preset.turbidity;
    this.rayleigh = preset.rayleigh;
    this.groundAlbedo.copy(preset.groundAlbedo);
    this.exposure = preset.exposure;

    if (this.material) {
      this.uniforms.uTurbidity.value = this.turbidity;
      this.uniforms.uRayleigh.value = this.rayleigh;
      this.uniforms.uExposure.value = this.exposure;
    }

    this.lutDirty = true;
  }

  /**
   * Set the authoritative sun direction. Re-bakes the LUT when the move is
   * larger than ~0.5deg.
   * @param {THREE.Vector3} sunDirection
   */
  setSunDirection(sunDirection) {
    const len =
      Math.hypot(sunDirection.x, sunDirection.y, sunDirection.z) || 1;
    const nx = sunDirection.x / len;
    const ny = sunDirection.y / len;
    const nz = sunDirection.z / len;
    const cosDelta =
      this.lastSunDir.x * nx +
      this.lastSunDir.y * ny +
      this.lastSunDir.z * nz;
    this.sunDirection.set(nx, ny, nz);
    if (this.lutDirty || cosDelta < LUT_REBAKE_COS_THRESHOLD) {
      this.lastSunDir.set(nx, ny, nz);
      this.bakeLUT();
      this.lutDirty = false;
    }
  }

  /**
   * Per-frame update; advances cloud time so the dome cloud field drifts.
   * @param {number} deltaTime
   * @param {THREE.Vector3} sunDirection
   */
  update(deltaTime, sunDirection) {
    this.setSunDirection(sunDirection);
    if (Number.isFinite(deltaTime) && deltaTime > 0) {
      this.cloudTimeSeconds += deltaTime;
      if (this.material) {
        this.uniforms.uCloudTimeSeconds.value = this.cloudTimeSeconds;
      }
    }
  }

  /** @param {number} value */
  setCloudCoverage(value) {
    this.cloudCoverage = Math.max(0, Math.min(1, value));
    if (this.material) {
      this.uniforms.uCloudCoverage.value = this.cloudCoverage;
    }
  }

  /** @param {number} metersPerFeature */
  setCloudFeatureScaleMeters(metersPerFeature) {
    if (!Number.isFinite(metersPerFeature) || metersPerFeature <= 0) {
      return;
    }
    this.cloudNoiseScale = 1 / metersPerFeature;
    if (this.material) {
      this.uniforms.uCloudNoiseScale.value = this.cloudNoiseScale;
    }
  }

  resetCloudFeatureScale() {
    this.cloudNoiseScale = DEFAULT_CLOUD_NOISE_SCALE;
    if (this.material) {
      this.uniforms.uCloudNoiseScale.value = this.cloudNoiseScale;
    }
  }

  /** @returns {number} */
  getCloudCoverage() {
    return this.cloudCoverage;
  }

  /**
   * Partial tunable update for day/night interpolation. Any subset of
   * (turbidity, rayleigh, exposure, groundAlbedo) may be supplied; each
   * supplied field is pushed to the matching uniform and marks the LUT
   * dirty so the next sample matches.
   * @param {{ turbidity?: number, rayleigh?: number, exposure?: number, groundAlbedo?: THREE.Color }} t
   */
  setTunables(t) {
    if (t.turbidity !== undefined) {
      this.turbidity = t.turbidity;
      if (this.material) {
        this.uniforms.uTurbidity.value = t.turbidity;
      }
    }
    if (t.rayleigh !== undefined) {
      this.rayleigh = t.rayleigh;
      if (this.material) {
        this.uniforms.uRayleigh.value = t.rayleigh;
      }
    }
    if (t.exposure !== undefined) {
      this.exposure = t.exposure;
      if (this.material) {
        this.uniforms.uExposure.value = t.exposure;
      }
    }
    if (t.groundAlbedo) {
      this.groundAlbedo.copy(t.groundAlbedo);
    }
    this.lutDirty = true;
  }

  /**
   * Sky color along an arbitrary view direction. Uses the LUT.
   * @param {THREE.Vector3} dir
   * @param {THREE.Color} out
   * @returns {THREE.Color}
   */
  sample(dir, out) {
    this.ensureLUT();
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const nx = dir.x / len;
    const ny = dir.y / len;
    const nz = dir.z / len;

    if (ny >= 0.999) {
      return out.copy(this.zenithColor);
    }

    const elevT = (Math.asin(Math.max(-1, Math.min(1, ny))) + Math.PI / 2) / Math.PI;
    const row = Math.max(
      0,
      Math.min(LUT_ELEVATION_BINS - 1, Math.floor(elevT * LUT_ELEVATION_BINS))
    );

    let az = Math.atan2(nz, nx);
    if (az < 0) az += Math.PI * 2;
    const col =
      Math.floor((az / (Math.PI * 2)) * LUT_AZIMUTH_BINS) % LUT_AZIMUTH_BINS;

    const idx = (row * LUT_AZIMUTH_BINS + col) * 3;
    out.setRGB(this.lut[idx], this.lut[idx + 1], this.lut[idx + 2]);
    return out;
  }

  /** @param {THREE.Color} out */
  getSun(out) {
    this.ensureLUT();
    return out.copy(this.sunColor);
  }

  /** @param {THREE.Color} out */
  getZenith(out) {
    this.ensureLUT();
    return out.copy(this.zenithColor);
  }

  /** @param {THREE.Color} out */
  getHorizon(out) {
    this.ensureLUT();
    return out.copy(this.horizonColor);
  }

  /** @returns {THREE.Vector3} */
  getSunDirection() {
    return this.sunDirection;
  }

  dispose() {
    this.material?.dispose();
    this.geometry?.dispose();
  }

  /** @private */
  ensureLUT() {
    if (this.lutDirty) {
      this.bakeLUT();
      this.lutDirty = false;
    }
  }

  /**
   * @private
   * Bake the CPU sample LUT + cache zenith/horizon/sun color from the same
   * analytic formula the shader runs. Cheap (32*8=256 directions), only
   * runs when sun direction changes.
   */
  bakeLUT() {
    for (let row = 0; row < LUT_ELEVATION_BINS; row++) {
      const elevT = (row + 0.5) / LUT_ELEVATION_BINS;
      const elev = elevT * Math.PI - Math.PI / 2;
      const cosE = Math.cos(elev);
      const sinE = Math.sin(elev);
      for (let col = 0; col < LUT_AZIMUTH_BINS; col++) {
        const az = ((col + 0.5) / LUT_AZIMUTH_BINS) * Math.PI * 2;
        this.scratchDir.set(cosE * Math.cos(az), sinE, cosE * Math.sin(az));
        this.evaluateAnalytic(this.scratchDir, this.scratchColor);
        const idx = (row * LUT_AZIMUTH_BINS + col) * 3;
        this.lut[idx] = this.scratchColor.r;
        this.lut[idx + 1] = this.scratchColor.g;
        this.lut[idx + 2] = this.scratchColor.b;
      }
    }

    this.scratchDir.set(0, 1, 0);
    this.evaluateAnalytic(this.scratchDir, this.zenithColor);

    let hr = 0;
    let hg = 0;
    let hb = 0;
    const ringSamples = 16;
    for (let i = 0; i < ringSamples; i++) {
      const a = (i / ringSamples) * Math.PI * 2;
      this.scratchDir.set(Math.cos(a), 0.0, Math.sin(a));
      this.evaluateAnalytic(this.scratchDir, this.scratchColor);
      hr += this.scratchColor.r;
      hg += this.scratchColor.g;
      hb += this.scratchColor.b;
    }
    this.horizonColor.setRGB(hr / ringSamples, hg / ringSamples, hb / ringSamples);

    // Sun color = direct-sunlight transmittance through the atmosphere
    // along the sun's optical path. At noon Fex is near 1 -> near-white;
    // at dawn the longer path attenuates blue -> warm amber.
    this.scratchDir.copy(this.sunDirection);
    this.scratchDir.normalize();
    this.computeTransmittance(this.scratchDir, this.sunColor);
    const peak = Math.max(
      this.sunColor.r,
      this.sunColor.g,
      this.sunColor.b,
      1e-4
    );
    this.sunColor.setRGB(
      this.sunColor.r / peak,
      this.sunColor.g / peak,
      this.sunColor.b / peak
    );
    const luma =
      0.2126 * this.sunColor.r +
      0.7152 * this.sunColor.g +
      0.0722 * this.sunColor.b;
    if (luma < 0.1) {
      this.sunColor.setRGB(
        Math.max(this.sunColor.r, 0.2),
        Math.max(this.sunColor.g, 0.1),
        Math.max(this.sunColor.b, 0.05)
      );
    }
  }

  /**
   * @private
   * RGB extinction factor (Fex) at a given direction's optical path.
   * @param {THREE.Vector3} direction
   * @param {THREE.Color} out
   */
  computeTransmittance(direction, out) {
    const dy = Math.max(-1, Math.min(1, direction.y));
    const upDot = Math.max(0, dy);
    const zenithAngle = Math.acos(upDot);
    const invDenom =
      Math.cos(zenithAngle) +
      0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253);
    const invLen = 1 / Math.max(1e-3, invDenom);
    const sunfade = 1 - Math.max(0, Math.min(1, 1 - Math.exp(this.sunDirection.y)));
    const rayleighCoeff = this.rayleigh - (1 - sunfade);
    const totalRayleigh = [
      5.804542996261093e-6,
      1.3562911419845635e-5,
      3.0265902468824876e-5,
    ];
    const MieConst = [
      1.8399918514433978e14,
      2.7798023919660528e14,
      4.0790479543861094e14,
    ];
    const totalMieScale = 0.434 * (0.2 * this.turbidity) * 1e-17;
    const sR = 8.4e3 * invLen;
    const sM = 1.25e3 * invLen;
    const r = Math.exp(
      -(totalRayleigh[0] * rayleighCoeff * sR +
        MieConst[0] * totalMieScale * this.mieCoefficient * sM)
    );
    const g = Math.exp(
      -(totalRayleigh[1] * rayleighCoeff * sR +
        MieConst[1] * totalMieScale * this.mieCoefficient * sM)
    );
    const b = Math.exp(
      -(totalRayleigh[2] * rayleighCoeff * sR +
        MieConst[2] * totalMieScale * this.mieCoefficient * sM)
    );
    out.setRGB(r, g, b);
  }

  /**
   * @private
   * CPU mirror of the fragment shader's radiance computation. Same Preetham
   * math so LUT samples agree with what the dome paints.
   * @param {THREE.Vector3} direction
   * @param {THREE.Color} out
   */
  evaluateAnalytic(direction, out) {
    const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const dx = direction.x / len;
    const dy = direction.y / len;
    const dz = direction.z / len;

    const sun = this.sunDirection;
    const sunY = Math.max(-1, Math.min(1, sun.y));

    const cutoffAngle = 1.6110731556870734;
    const steepness = 1.5;
    const EE = 1000.0;
    const sunZenithCos = sunY;
    const sunE =
      EE *
      Math.max(0, 1 - Math.exp(-((cutoffAngle - Math.acos(sunZenithCos)) / steepness)));

    const sunfade = 1 - Math.max(0, Math.min(1, 1 - Math.exp(sunY)));
    const rayleighCoeff = this.rayleigh - (1 - sunfade);

    const totalRayleigh = [
      5.804542996261093e-6,
      1.3562911419845635e-5,
      3.0265902468824876e-5,
    ];
    const MieConst = [
      1.8399918514433978e14,
      2.7798023919660528e14,
      4.0790479543861094e14,
    ];

    const betaR = [
      totalRayleigh[0] * rayleighCoeff,
      totalRayleigh[1] * rayleighCoeff,
      totalRayleigh[2] * rayleighCoeff,
    ];
    const totalMieScale = 0.434 * (0.2 * this.turbidity) * 1e-17;
    const betaM = [
      MieConst[0] * totalMieScale * this.mieCoefficient,
      MieConst[1] * totalMieScale * this.mieCoefficient,
      MieConst[2] * totalMieScale * this.mieCoefficient,
    ];

    const upDot = Math.max(0, dy);
    const zenithAngle = Math.acos(upDot);
    const inverseDenom =
      Math.cos(zenithAngle) +
      0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253);
    const inverseLen = 1 / Math.max(1e-3, inverseDenom);
    const sR = 8.4e3 * inverseLen;
    const sM = 1.25e3 * inverseLen;

    const fexR = Math.exp(-(betaR[0] * sR + betaM[0] * sM));
    const fexG = Math.exp(-(betaR[1] * sR + betaM[1] * sM));
    const fexB = Math.exp(-(betaR[2] * sR + betaM[2] * sM));

    const cosTheta = dx * sun.x + dy * sun.y + dz * sun.z;
    const rayleighPhase =
      (3 / (16 * Math.PI)) * (1 + Math.pow(cosTheta * 0.5 + 0.5, 2));
    const g = this.mieDirectionalG;
    const g2 = g * g;
    const hgDenom = Math.pow(Math.max(1e-4, 1 - 2 * g * cosTheta + g2), 1.5);
    const hgPhase = (1 / (4 * Math.PI)) * ((1 - g2) / hgDenom);

    const betaRThetaR = betaR[0] * rayleighPhase;
    const betaRThetaG = betaR[1] * rayleighPhase;
    const betaRThetaB = betaR[2] * rayleighPhase;
    const betaMThetaR = betaM[0] * hgPhase;
    const betaMThetaG = betaM[1] * hgPhase;
    const betaMThetaB = betaM[2] * hgPhase;

    const sumR = betaR[0] + betaM[0] || 1e-9;
    const sumG = betaR[1] + betaM[1] || 1e-9;
    const sumB = betaR[2] + betaM[2] || 1e-9;

    const linR = Math.pow(
      sunE * ((betaRThetaR + betaMThetaR) / sumR) * (1 - fexR),
      1.5
    );
    const linG = Math.pow(
      sunE * ((betaRThetaG + betaMThetaG) / sumG) * (1 - fexG),
      1.5
    );
    const linB = Math.pow(
      sunE * ((betaRThetaB + betaMThetaB) / sumB) * (1 - fexB),
      1.5
    );

    const horizonMix = Math.pow(Math.max(0, 1 - sunY), 5);
    const lowR = Math.pow(
      sunE * ((betaRThetaR + betaMThetaR) / sumR) * fexR,
      0.5
    );
    const lowG = Math.pow(
      sunE * ((betaRThetaG + betaMThetaG) / sumG) * fexG,
      0.5
    );
    const lowB = Math.pow(
      sunE * ((betaRThetaB + betaMThetaB) / sumB) * fexB,
      0.5
    );
    const blendR = 1 + (lowR - 1) * Math.min(1, horizonMix);
    const blendG = 1 + (lowG - 1) * Math.min(1, horizonMix);
    const blendB = 1 + (lowB - 1) * Math.min(1, horizonMix);
    const linRb = linR * blendR;
    const linGb = linG * blendG;
    const linBb = linB * blendB;

    const l0R = 0.1 * fexR;
    const l0G = 0.1 * fexG;
    const l0B = 0.1 * fexB;

    let r = (linRb + l0R) * 0.04;
    let g2c = (linGb + l0G) * 0.04 + 0.0003;
    let b = (linBb + l0B) * 0.04 + 0.00075;

    const bounce = Math.max(0, -dy);
    const bounceK = bounce * 0.35 * (0.5 + sunfade);
    r += this.groundAlbedo.r * bounceK;
    g2c += this.groundAlbedo.g * bounceK;
    b += this.groundAlbedo.b * bounceK;

    r *= this.exposure;
    g2c *= this.exposure;
    b *= this.exposure;

    out.setRGB(
      Math.max(0, Math.min(8, r)),
      Math.max(0, Math.min(8, g2c)),
      Math.max(0, Math.min(8, b))
    );
  }
}
