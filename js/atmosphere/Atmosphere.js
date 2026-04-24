import * as THREE from 'three';
import { HosekWilkieSky } from './HosekWilkieSky.js';
import { getPreset, skyPresets } from './skyPresets.js';

/**
 * Top-level atmosphere coordinator.
 *
 * Wraps a HosekWilkieSky dome plus scene-level fog and ambient-light tuning.
 * Designed to be constructed once per scene and reused via applyPreset() when
 * the active scenario changes.
 *
 * Phase A (this unit): standalone — constructed but not wired into the
 * render path. Phase B will replace SceneManager's hardcoded scene.background
 * and scene.fog with this module.
 *
 * @example
 *   const atmosphere = new Atmosphere(scene);
 *   atmosphere.applyPreset('pastoral-noon');
 */
export class Atmosphere {
    /**
     * @param {THREE.Scene} scene Target scene; sky dome is added on first applyPreset().
     * @param {Object} [options]
     * @param {number} [options.fogNear=200] Linear fog near distance.
     * @param {number} [options.fogFar=600] Linear fog far distance.
     * @param {number} [options.skyRadius=500] Sky dome radius.
     */
    constructor(scene, { fogNear = 200, fogFar = 600, skyRadius = 500 } = {}) {
        if (!scene) throw new Error('Atmosphere requires a THREE.Scene');
        this.scene = scene;
        this.fogNear = fogNear;
        this.fogFar = fogFar;

        this.sky = new HosekWilkieSky({ radius: skyRadius });

        this._currentPresetName = null;
        this._ownedFog = null;
        this._ambientLight = null;
        this._baseAmbientIntensity = 1.0;
    }

    /**
     * Apply a named preset: updates sky uniforms, scene fog, and ambient light.
     * Adds the sky dome to the scene on first call.
     *
     * Fog model: linear THREE.Fog. fogDensityMultiplier scales the (far - near)
     * interval — higher multiplier = thicker fog (smaller far distance).
     *
     * @param {string} presetName Key from skyPresets (e.g. 'pastoral-noon').
     * @returns {import('./skyPresets.js').AtmospherePreset} The resolved config.
     */
    applyPreset(presetName) {
        const preset = getPreset(presetName);
        this._currentPresetName = skyPresets[presetName] ? presetName : 'pastoral-noon';

        this.sky.setState({
            elevation: preset.sunElevation,
            azimuth: preset.sunAzimuth,
            turbidity: preset.turbidity,
            albedo: preset.albedo
        });
        if (typeof preset.exposure === 'number') {
            this.sky.setExposure(preset.exposure);
        }

        if (!this.sky.mesh.parent) {
            this.sky.addToScene(this.scene);
        }

        const fogColor = new THREE.Color(preset.fogColor);
        const span = (this.fogFar - this.fogNear) / Math.max(0.01, preset.fogDensityMultiplier);
        const far = this.fogNear + span;
        if (this._ownedFog) {
            this._ownedFog.color.copy(fogColor);
            this._ownedFog.near = this.fogNear;
            this._ownedFog.far = far;
        } else {
            this._ownedFog = new THREE.Fog(fogColor.getHex(), this.fogNear, far);
        }
        this.scene.fog = this._ownedFog;

        if (this._ambientLight) {
            this._ambientLight.intensity = this._baseAmbientIntensity * preset.ambientIntensity;
        }

        return preset;
    }

    /**
     * Bind an existing AmbientLight so applyPreset can scale it.
     * Captures the current intensity as the baseline.
     * @param {THREE.AmbientLight} ambientLight
     */
    bindAmbientLight(ambientLight) {
        this._ambientLight = ambientLight;
        this._baseAmbientIntensity = ambientLight.intensity;
        if (this._currentPresetName) {
            const preset = getPreset(this._currentPresetName);
            ambientLight.intensity = this._baseAmbientIntensity * preset.ambientIntensity;
        }
    }

    /**
     * Get the name of the active preset, or null if none applied yet.
     * @returns {string|null}
     */
    getCurrentPreset() {
        return this._currentPresetName;
    }

    /**
     * Direct access to the sky dome for advanced tuning (e.g. exposure).
     * @returns {HosekWilkieSky}
     */
    getSky() {
        return this.sky;
    }

    /**
     * Free GPU resources and detach from the scene.
     */
    dispose() {
        this.sky.dispose();
        if (this._ownedFog && this.scene.fog === this._ownedFog) {
            this.scene.fog = null;
        }
        this._ownedFog = null;
        this._ambientLight = null;
        this._currentPresetName = null;
    }
}
