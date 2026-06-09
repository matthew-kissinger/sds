// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { createKonveyorEffectMaterial } from './konveyorEffectMaterialAdapter.js';

/**
 * Cycle 39 (scorched-earth): the sun billboard is *just* the disc. A small
 * soft-edged radial falloff with a single core color. The broad warm glow
 * around the sun is owned by the sky shader (Mie aureole, Phase B);
 * the visible "warm halo" the player sees is what bloom paints over an
 * HDR-bright disc through the tonemapped pipeline.
 *
 * Anchors the water sun-glint perceptually. Without a visible disc the
 * reflection on water reads as ambient shimmer rather than a sun reflection.
 */

const SUN_DISTANCE = 3000;
const SUN_QUAD_SIZE = 360;
const KONVEYOR_SUN_QUAD_SIZE = 720;
const SUN_CORE_RADIUS = 0.065;
const SUN_CORE_FEATHER = 0.13;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uCoreColor;
  uniform float uIntensity;
  uniform float uCoreRadius;
  uniform float uCoreFeather;
  varying vec2 vUv;

  void main() {
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;
    float disc = 1.0 - smoothstep(uCoreRadius, uCoreFeather, r);
    if (disc <= 0.0005) discard;
    gl_FragColor = vec4(uCoreColor * uIntensity, disc);
  }
`;

function makeSunBillboardMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uCoreColor: { value: new THREE.Color(1.0, 0.97, 0.88) },
            uIntensity: { value: 1.0 },
            uCoreRadius: { value: SUN_CORE_RADIUS },
            uCoreFeather: { value: SUN_CORE_FEATHER }
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending
    });
}

function sunIntensityAtElevation(elevation) {
    if (elevation <= 0) return 0;
    const horizonFade = Math.min(1, elevation / 0.08);
    return horizonFade * Math.min(2.2, 0.65 + elevation * 3.1);
}

export class SunBillboard {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} [options]
     * @param {number} [options.distance=3000]
     * @param {number} [options.size]
     */
    constructor(scene, options = {}) {
        const distance = options.distance ?? SUN_DISTANCE;
        this.distance = distance;

        const materialResult = createKonveyorEffectMaterial('sun-billboard', 'createSunBillboardMaterial', {
            createDefaultMaterial: makeSunBillboardMaterial,
            search: options.search,
            factories: options.konveyorEffectFactories
        });
        const size = options.size ?? (materialResult.summary?.applied ? KONVEYOR_SUN_QUAD_SIZE : SUN_QUAD_SIZE);
        this.size = size;
        const geometry = new THREE.PlaneGeometry(size, size);

        this.material = materialResult.material;
        this.materialControls = materialResult.controls;
        this.konveyorMaterialSummary = materialResult.summary;
        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.name = 'SunBillboard';
        this.mesh.renderOrder = this.konveyorMaterialSummary?.applied ? 999 : 5;
        this.mesh.frustumCulled = false;

        scene.add(this.mesh);

        this._sunDir = new THREE.Vector3();
        this._lastIntensity = 0;
        this._lastSunColor = new THREE.Color(1, 1, 1);
        this._lastElevation = 0;
    }

    /**
     * Position the disc at `cameraPosition + sunDirection * distance`,
     * orient it to face the camera, and tint it with the sun's current
     * color. Call once per frame after the atmosphere updates.
     *
     * @param {THREE.Camera} camera
     * @param {THREE.Vector3} sunDirection  Unit vector from origin toward sun.
     * @param {THREE.Color} [sunColor]      Optional tint.
     */
    update(camera, sunDirection, sunColor) {
        if (!sunDirection) return;

        this._sunDir.copy(sunDirection).normalize();
        this.mesh.position.copy(camera.position).addScaledVector(this._sunDir, this.distance);
        this.mesh.lookAt(camera.position);

        const elevation = this._sunDir.y;
        const intensity = sunIntensityAtElevation(elevation);
        this._lastIntensity = intensity;
        this._lastElevation = elevation;

        if (sunColor) {
            this._lastSunColor.copy(sunColor);
            if (this.materialControls?.update) {
                this.materialControls.update({ coreColor: sunColor, intensity });
            } else if (this.material.uniforms) {
                this.material.uniforms.uCoreColor.value.copy(sunColor);
                this.material.uniforms.uIntensity.value = intensity;
            }
            return;
        }

        if (this.materialControls?.update) {
            this.materialControls.update({ intensity });
        } else if (this.material.uniforms) {
            this.material.uniforms.uIntensity.value = intensity;
        }
    }

    getDiagnostics() {
        const dir = this._sunDir.toArray().map((value) => Number(value.toFixed(4)));
        const coreRadius = this.material?.userData?.konveyorSunBillboardShape?.coreRadius
            ?? this.material?.uniforms?.uCoreRadius?.value
            ?? null;
        const coreFeather = this.material?.userData?.konveyorSunBillboardShape?.coreFeather
            ?? this.material?.uniforms?.uCoreFeather?.value
            ?? null;
        const angularDiameter = (radius) => Number((2 * Math.atan((this.size * radius * 0.5) / this.distance) * 180 / Math.PI).toFixed(3));
        return {
            size: this.size,
            distance: this.distance,
            intensity: this._lastIntensity,
            elevation: Number(this._lastElevation.toFixed(4)),
            disc: {
                coreRadius,
                coreFeather,
                angularCoreDiameterDeg: Number.isFinite(coreRadius) ? angularDiameter(coreRadius) : null,
            },
            materialName: this.material?.name ?? null,
            applied: this.konveyorMaterialSummary?.applied ?? false,
            physicalDirection: dir,
            visualDirection: dir,
            sunColor: this._lastSunColor.toArray().map((value) => Number(value.toFixed(4))),
            renderOrder: this.mesh.renderOrder,
        };
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.material.dispose();
        this.mesh.removeFromParent();
    }
}
