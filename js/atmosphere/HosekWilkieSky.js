import * as THREE from 'three';
import { vertexShader, fragmentShader } from './skyShader.glsl.js';

/**
 * Hosek-Wilkie analytic sky dome.
 *
 * Inside-out sphere with a ShaderMaterial implementing the Hosek-Wilkie 2012
 * radiance distribution. Per-channel coefficients (A..I) are computed JS-side
 * and pushed as uniforms; the closed-form fit replaces the paper's dataset
 * table with a compact polynomial accurate enough for real-time use.
 *
 * Ported from terror-in-the-jungle's HosekWilkieSkyBackend.
 *
 * @example
 *   const sky = new HosekWilkieSky({ radius: 500 });
 *   sky.addToScene(scene);
 *   sky.updateSun(THREE.MathUtils.degToRad(45), 0);
 */
export class HosekWilkieSky {
    /**
     * @param {Object} [options]
     * @param {number} [options.radius=500] Dome radius in world units.
     * @param {number} [options.turbidity=3] Atmospheric haze (1 clear .. 10 hazy).
     * @param {[number, number, number]} [options.albedo=[0.3, 0.3, 0.3]] Ground albedo per RGB.
     * @param {number} [options.exposure=0.18] Linear scale before tonemap.
     */
    constructor({ radius = 500, turbidity = 3, albedo = [0.3, 0.3, 0.3], exposure = 0.18 } = {}) {
        this.radius = radius;
        this.turbidity = turbidity;
        this.albedo = [...albedo];
        this.exposure = exposure;

        this.sunElevation = Math.PI / 4;
        this.sunAzimuth = 0;

        const geometry = new THREE.SphereGeometry(radius, 32, 16);
        const uniforms = {
            uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
            uA: { value: new THREE.Vector3() },
            uB: { value: new THREE.Vector3() },
            uC: { value: new THREE.Vector3() },
            uD: { value: new THREE.Vector3() },
            uE: { value: new THREE.Vector3() },
            uF: { value: new THREE.Vector3() },
            uG: { value: new THREE.Vector3() },
            uH: { value: new THREE.Vector3() },
            uI: { value: new THREE.Vector3() },
            uZenithRadiance: { value: new THREE.Vector3(1, 1, 1) },
            uExposure: { value: exposure },
            uGroundAlbedo: { value: new THREE.Vector3(...albedo) }
        };

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms,
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,
            fog: false
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = -1000;
        this.mesh.name = 'HosekWilkieSkyDome';

        this._scene = null;
        this._recomputeCoefficients();
        this._updateSunUniform();
    }

    /**
     * Add the dome to a scene.
     * @param {THREE.Scene} scene
     * @param {Object} [options]
     * @param {boolean} [options.setBackground=false] If true, clears scene.background so the dome is the sole sky.
     */
    addToScene(scene, { setBackground = false } = {}) {
        if (this._scene === scene) return;
        scene.add(this.mesh);
        this._scene = scene;
        if (setBackground) scene.background = null;
    }

    /**
     * Remove the dome from its current scene without disposing GPU resources.
     */
    removeFromScene() {
        if (this._scene) {
            this._scene.remove(this.mesh);
            this._scene = null;
        }
    }

    /**
     * Update sun direction and recompute Hosek-Wilkie coefficients.
     * @param {number} elevation Radians above horizon (0 = horizon, PI/2 = zenith).
     * @param {number} azimuth Radians around the up axis (0 = +Z).
     */
    updateSun(elevation, azimuth) {
        this.sunElevation = elevation;
        this.sunAzimuth = azimuth;
        this._updateSunUniform();
        this._recomputeCoefficients();
    }

    /**
     * Set atmospheric turbidity and recompute coefficients.
     * @param {number} t Range 1 (very clear) .. 10 (very hazy). Typical: 2-4.
     */
    setTurbidity(t) {
        this.turbidity = Math.max(1, Math.min(10, t));
        this._recomputeCoefficients();
    }

    /**
     * Set ground albedo and recompute coefficients.
     * @param {[number, number, number]} rgb
     */
    setAlbedo(rgb) {
        this.albedo = [rgb[0], rgb[1], rgb[2]];
        this.material.uniforms.uGroundAlbedo.value.set(rgb[0], rgb[1], rgb[2]);
        this._recomputeCoefficients();
    }

    /**
     * Atomically update sun, turbidity, and albedo with a single coefficient
     * recompute. Use this when applying a preset to avoid 3x redundant work.
     * @param {Object} state
     * @param {number} state.elevation
     * @param {number} state.azimuth
     * @param {number} state.turbidity
     * @param {[number, number, number]} state.albedo
     */
    setState({ elevation, azimuth, turbidity, albedo }) {
        this.sunElevation = elevation;
        this.sunAzimuth = azimuth;
        this.turbidity = Math.max(1, Math.min(10, turbidity));
        this.albedo = [albedo[0], albedo[1], albedo[2]];
        this.material.uniforms.uGroundAlbedo.value.set(albedo[0], albedo[1], albedo[2]);
        this._updateSunUniform();
        this._recomputeCoefficients();
    }

    /**
     * Set exposure scale applied before tonemapping.
     * @param {number} value
     */
    setExposure(value) {
        this.exposure = value;
        this.material.uniforms.uExposure.value = value;
    }

    /**
     * Free GPU resources. Removes the dome from its scene first.
     */
    dispose() {
        this.removeFromScene();
        this.mesh.geometry.dispose();
        this.material.dispose();
    }

    /** @private */
    _updateSunUniform() {
        const thetaS = Math.PI / 2 - this.sunElevation;
        const sinT = Math.sin(thetaS);
        this.material.uniforms.uSunDirection.value.set(
            sinT * Math.sin(this.sunAzimuth),
            Math.cos(thetaS),
            sinT * Math.cos(this.sunAzimuth)
        ).normalize();
    }

    /**
     * Evaluate the per-channel polynomial fit for current turbidity, albedo,
     * and sun elevation, then write all nine coefficient uniforms plus a
     * Preetham-style zenith radiance.
     * @private
     */
    _recomputeCoefficients() {
        const T = this.turbidity;
        const elev = Math.max(0.001, Math.min(Math.PI / 2, this.sunElevation));
        const cosTheta = Math.cos(Math.PI / 2 - elev);
        const u = this.material.uniforms;

        for (let ch = 0; ch < 3; ch++) {
            const c = computeChannelCoefficients(T, this.albedo[ch], elev);
            u.uA.value.setComponent(ch, c.A);
            u.uB.value.setComponent(ch, c.B);
            u.uC.value.setComponent(ch, c.C);
            u.uD.value.setComponent(ch, c.D);
            u.uE.value.setComponent(ch, c.E);
            u.uF.value.setComponent(ch, c.F);
            u.uG.value.setComponent(ch, c.G);
            u.uH.value.setComponent(ch, c.H);
            u.uI.value.setComponent(ch, c.I);
        }

        // Preetham zenith luminance (Y of xyY) modulated by turbidity & sun
        // zenith angle, with a per-channel temperature tint biasing zenith blue
        // and horizon warm.
        const thetaS = Math.PI / 2 - elev;
        const chi = (4 / 9 - T / 120) * (Math.PI - 2 * thetaS);
        const Yz = (4.0453 * T - 4.9710) * Math.tan(chi) - 0.2155 * T + 2.4192;
        const luminance = Math.max(0.05, Yz * 0.06);
        const warmth = 1 - cosTheta;
        u.uZenithRadiance.value.set(
            luminance * (0.8 + warmth * 1.4),
            luminance * (0.9 + warmth * 0.6),
            luminance * (1.6 - warmth * 0.6)
        );
    }
}

/**
 * Per-channel polynomial fit for the Hosek-Wilkie A..I coefficients.
 * Mirrors the published structure (low-order in elevation, 1st-order in
 * turbidity and albedo) with empirically tuned constants for RGB-space
 * rendering — no spectral upsampling needed.
 *
 * @param {number} T turbidity
 * @param {number} albedo channel albedo
 * @param {number} elev sun elevation in radians
 * @returns {{A:number,B:number,C:number,D:number,E:number,F:number,G:number,H:number,I:number}}
 */
function computeChannelCoefficients(T, albedo, elev) {
    const e = elev;
    const e2 = e * e;
    const e3 = e2 * e;
    const t = T;
    const cosE = Math.cos(e);
    const sinE = Math.sin(e);

    return {
        A: -0.7 - 0.05 * t + 0.05 * albedo - 0.2 * cosE,
        B: -0.4 - 0.04 * t - 0.1 * sinE,
        C: 4.0 + 0.5 * t - 1.5 * cosE - 0.6 * albedo,
        D: -2.5 - 0.2 * t + 0.5 * e + 1.2 * albedo,
        E: -0.05 - 0.005 * t - 0.02 * e2,
        F: 0.5 + 0.1 * t + 0.4 * sinE,
        G: 0.02 + 0.005 * t,
        H: 0.85 - 0.04 * t + 0.04 * e,   // Mie phase asymmetry, kept in (0,1)
        I: 0.5 + 0.05 * t - 0.3 * e3 + 0.5 * albedo
    };
}
