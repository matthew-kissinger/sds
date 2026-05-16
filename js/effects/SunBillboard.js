import * as THREE from 'three';
import { createKonveyorEffectMaterial } from './konveyorEffectMaterialAdapter.js';

/**
 * Cycle 7 Phase 2e: a billboarded sun disc placed in the sky direction
 * supplied by the atmosphere. Sits at a fixed offset from the camera so
 * parallax is zero (the sun appears infinitely far away from any vantage
 * point), and writes no depth so it doesn't gate transparent passes.
 *
 * Anchors the water sun-glint perceptually — without a visible disc the
 * reflection on water reads as ambient shimmer rather than a sun reflection.
 */

const SUN_DISTANCE = 3000;
const SUN_QUAD_SIZE = 110;
const KONVEYOR_SUN_QUAD_SIZE = 620;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uCoreColor;
  uniform vec3 uHaloColor;
  uniform float uIntensity;
  varying vec2 vUv;

  void main() {
    // Distance from quad center, 0 at center → 1 at corner
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;

    // Core disc: bright, sharp inner cutoff with a soft outer falloff
    float core = 1.0 - smoothstep(0.12, 0.22, r);
    // Halo: large, gentle gradient. Earlier this used smoothstep(0, 0.95)
    // which left a 5% hard-clip ring at the quad boundary — readable as
    // a soft horizontal line near the sun. Smoothstep range now matches
    // the quad's full radius and the alpha is squared at the edge so
    // there's no detectable transition before the fragment is discarded.
    float haloFalloff = 1.0 - smoothstep(0.0, 1.0, r);
    float halo = pow(haloFalloff, 2.5) * 0.45;

    vec3 color = uCoreColor * core + uHaloColor * halo;
    float alpha = (core + halo * 0.7) * uIntensity * haloFalloff;
    if (alpha <= 0.0005) discard;
    gl_FragColor = vec4(color * uIntensity, alpha);
  }
`;

function makeSunBillboardMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uCoreColor: { value: new THREE.Color(1.0, 0.97, 0.88) },
            uHaloColor: { value: new THREE.Color(1.0, 0.82, 0.55) },
            uIntensity: { value: 1.0 }
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending
    });
}

export class SunBillboard {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} [options]
     * @param {number} [options.distance=3000]
     * @param {number} [options.size=110]
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
        // Render after sky dome but before transparent water; terrain will
        // still occlude the disc via depth-test from the prior opaque pass.
        this.mesh.renderOrder = this.konveyorMaterialSummary?.applied ? 999 : 5;
        this.mesh.frustumCulled = false;

        scene.add(this.mesh);

        this._tmpDir = new THREE.Vector3();
        this._visualDir = new THREE.Vector3();
        this._cameraForward = new THREE.Vector3();
        this._cameraRight = new THREE.Vector3();
        this._cameraUp = new THREE.Vector3();
        this._lastIntensity = 0;
        this._lastSunColor = new THREE.Color(1, 1, 1);
    }

    /**
     * Position the disc at `cameraPosition + sunDirection * distance`,
     * orient it to face the camera, and tint it with the sun's current
     * color. Call once per frame after the atmosphere updates.
     *
     * @param {THREE.Camera} camera
     * @param {THREE.Vector3} sunDirection  Unit vector from origin toward sun.
     * @param {THREE.Color} [sunColor]      Optional warm-tone tint.
     */
    update(camera, sunDirection, sunColor) {
        if (!sunDirection) return;

        this._tmpDir.copy(sunDirection).normalize();
        this._visualDir.copy(this._tmpDir);
        if (this.konveyorMaterialSummary?.applied && camera?.getWorldDirection) {
            camera.getWorldDirection(this._cameraForward).normalize();
            this._cameraUp.copy(camera.up).normalize();
            this._cameraRight.crossVectors(this._cameraForward, this._cameraUp).normalize();
            const facing = this._cameraForward.dot(this._tmpDir);
            if (facing < 0.92) {
                const side = this._cameraRight.dot(this._tmpDir) < 0 ? -1 : 1;
                this._visualDir.copy(this._cameraForward)
                    .multiplyScalar(0.80)
                    .addScaledVector(this._cameraRight, side * 0.34)
                    .addScaledVector(this._cameraUp, 0.38)
                    .normalize();
            }
        }
        this.mesh.position.copy(camera.position).addScaledVector(this._visualDir, this.distance);
        this.mesh.lookAt(camera.position);

        // Fade the disc as the sun drops below the horizon so it doesn't
        // sit dimly visible underground in dusk presets.
        const elevation = Math.max(0, this._tmpDir.y);
        const intensity = this.konveyorMaterialSummary?.applied
            ? Math.max(1.28, Math.min(1.62, 1.10 + elevation * 1.75))
            : Math.min(1, elevation * 4.0);
        this._lastIntensity = intensity;

        if (sunColor) {
            // Bias the halo slightly warmer than the core so the disc reads
            // as warm without losing the cleaner near-white center.
            if (this.materialControls?.update) {
                const coreBlend = this.konveyorMaterialSummary?.applied ? 0.72 : 0.4;
                this._lastSunColor.copy(sunColor);
                this.materialControls.update({
                    haloColor: sunColor,
                    coreColor: new THREE.Color().copy(sunColor).lerp(new THREE.Color(1.0, 1.0, 1.0), coreBlend),
                    intensity,
                });
            } else if (this.material.uniforms) {
                this.material.uniforms.uHaloColor.value.copy(sunColor);
                this.material.uniforms.uCoreColor.value.copy(sunColor).lerp(new THREE.Color(1.0, 1.0, 1.0), 0.4);
            }
        }

        if (this.materialControls?.update && !sunColor) {
            this.materialControls.update({ intensity });
        } else if (this.material.uniforms) {
            this.material.uniforms.uIntensity.value = intensity;
        }
    }

    getDiagnostics() {
        return {
            size: this.size,
            distance: this.distance,
            intensity: this._lastIntensity,
            materialName: this.material?.name ?? null,
            applied: this.konveyorMaterialSummary?.applied ?? false,
            physicalDirection: this._tmpDir.toArray().map((value) => Number(value.toFixed(4))),
            visualDirection: this._visualDir.toArray().map((value) => Number(value.toFixed(4))),
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
