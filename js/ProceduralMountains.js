// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shaders/proceduralMountainsShader.js';

/**
 * ProceduralMountains - Standalone procedural mountain backdrop.
 *
 * Builds a flat ring (annulus) BufferGeometry and displaces it via a ridged-FBM
 * shader to form a mountain silhouette around the player. Aerial perspective
 * blends distant peaks toward the fog color.
 *
 * Not yet wired into TerrainBuilder — caller manages add/remove via
 * `addToScene(scene)` and `dispose()`.
 */
export class ProceduralMountains {
    /**
     * @param {Object} [options]
     * @param {number} [options.innerRadius=600]
     * @param {number} [options.outerRadius=1500]
     * @param {number} [options.peakHeight=80]
     * @param {number} [options.segmentsRadial=64]
     * @param {number} [options.segmentsCircumferential=128]
     * @param {{x:number,y:number,z:number}|THREE.Vector3} [options.sunDir]
     * @param {number|THREE.Color} [options.fogColor=0xcfd9e8]
     */
    constructor(options = {}) {
        this.innerRadius = options.innerRadius ?? 600;
        this.outerRadius = options.outerRadius ?? 1500;
        this.peakHeight = options.peakHeight ?? 80;
        this.segmentsRadial = options.segmentsRadial ?? 64;
        this.segmentsCircumferential = options.segmentsCircumferential ?? 128;

        const s = options.sunDir ?? { x: 0.5, y: 0.7, z: 0.3 };
        this.sunDir = new THREE.Vector3(s.x, s.y, s.z).normalize();

        this.fogColor = new THREE.Color(options.fogColor ?? 0xcfd9e8);

        this.mesh = null;
        this.geometry = null;
        this.material = null;
    }

    /**
     * Build the ring mesh and add it to the given scene.
     * @param {THREE.Scene} scene
     * @returns {THREE.Mesh}
     */
    addToScene(scene) {
        this.geometry = this._buildRingGeometry();
        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                time: { value: 0 },
                peakHeight: { value: this.peakHeight },
                sunDir: { value: this.sunDir },
                fogColor: { value: this.fogColor }
            },
            side: THREE.DoubleSide,
            depthWrite: true,
            depthTest: true
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false; // ring spans full backdrop; let shader handle culling via depth
        this.mesh.name = 'ProceduralMountains';
        scene.add(this.mesh);
        return this.mesh;
    }

    /**
     * Build a flat ring (annulus) on the XZ plane.
     * Vertex shader handles displacement; geometry stays cheap and y=0.
     * @returns {THREE.BufferGeometry}
     * @private
     */
    _buildRingGeometry() {
        const radial = this.segmentsRadial;
        const circ = this.segmentsCircumferential;
        const dr = (this.outerRadius - this.innerRadius) / radial;
        const dTheta = (Math.PI * 2) / circ;

        const vertCount = (radial + 1) * circ;
        const positions = new Float32Array(vertCount * 3);
        const uvs = new Float32Array(vertCount * 2);
        // Uint16 holds up to 65535; default segments yield ~8320 verts — well within range.
        // Bumped segments could overflow; guard with Uint32 fallback.
        const useUint32 = vertCount > 65535;
        const indices = useUint32
            ? new Uint32Array(radial * circ * 6)
            : new Uint16Array(radial * circ * 6);

        let v = 0;
        for (let r = 0; r <= radial; r++) {
            const radius = this.innerRadius + r * dr;
            const u = r / radial;
            for (let c = 0; c < circ; c++) {
                const theta = c * dTheta;
                positions[v * 3]     = Math.cos(theta) * radius;
                positions[v * 3 + 1] = 0;
                positions[v * 3 + 2] = Math.sin(theta) * radius;
                uvs[v * 2]     = u;
                uvs[v * 2 + 1] = c / circ;
                v++;
            }
        }

        let i = 0;
        for (let r = 0; r < radial; r++) {
            for (let c = 0; c < circ; c++) {
                const cNext = (c + 1) % circ; // wrap circumferentially
                const a = r * circ + c;
                const b = r * circ + cNext;
                const d = (r + 1) * circ + c;
                const e = (r + 1) * circ + cNext;
                indices[i++] = a; indices[i++] = d; indices[i++] = b;
                indices[i++] = b; indices[i++] = d; indices[i++] = e;
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        // Bounding sphere covers the displaced volume so culling (when re-enabled) is correct.
        geometry.boundingSphere = new THREE.Sphere(
            new THREE.Vector3(0, this.peakHeight * 0.5, 0),
            this.outerRadius + this.peakHeight
        );
        return geometry;
    }

    /** Release GPU resources. Caller should remove the mesh from its scene first if desired. */
    dispose() {
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
        if (this.geometry) {
            this.geometry.dispose();
            this.geometry = null;
        }
        if (this.material) {
            this.material.dispose();
            this.material = null;
        }
        this.mesh = null;
    }
}
