// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';

/**
 * Cycle 52 P2: the in-engine scene-reveal layer.
 *
 * A fullscreen quad textured with the armed world's entrance backdrop (the
 * same webp the menu just showed), drawn last over the freshly built scene.
 * main.js holds it at full opacity while the scene comes up, then ramps its
 * opacity 1 -> 0 (the RevealLayer contract) so the still backdrop dissolves
 * into the living scene in one continuous in-engine motion.
 *
 * Opacity-and-render-order based, per docs/entrance-loading-spec.md: no noise
 * shader, no DOM crossfade of a frozen canvas. A plain MeshBasicMaterial works
 * identically on WebGL and WebGPU, so the dissolve survives the WebGPU
 * migration with no TSL port.
 *
 * Implements the RevealLayer contract main.js's reveal scaffold expects:
 *   beginCrossfade() / setOpacity(a) / update(dt, camera) / dispose()
 */
export class BackdropReveal {
    /**
     * @param {THREE.Scene} scene    the live scene to overlay.
     * @param {THREE.Texture} texture the decoded backdrop texture (owned: disposed here).
     */
    constructor(scene, texture) {
        this._scene = scene;
        this._geometry = new THREE.PlaneGeometry(1, 1);
        this._material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            fog: false,
        });
        this._mesh = new THREE.Mesh(this._geometry, this._material);
        // Draw last so it composites on top of the entire scene render.
        this._mesh.renderOrder = 100000;
        this._mesh.frustumCulled = false;
        this._dir = new THREE.Vector3();
        scene.add(this._mesh);
    }

    /** RevealLayer: arm the dissolve. No-op for a static image (no spin-up). */
    beginCrossfade() {}

    /** RevealLayer: set the layer opacity (1 = fully covering, 0 = gone). */
    setOpacity(a) {
        this._material.opacity = a < 0 ? 0 : a > 1 ? 1 : a;
    }

    /**
     * RevealLayer: keep the quad filling the camera frustum. Positioned just in
     * front of the near plane and sized to the vertical FOV, so it covers the
     * frame regardless of camera motion during the dissolve. Allocation-free
     * (the direction vector is cached).
     *
     * @param {number} _dt unused (the image is static).
     * @param {THREE.PerspectiveCamera} camera
     */
    update(_dt, camera) {
        if (!camera) return;
        const near = camera.near ?? 0.1;
        const dist = near + 0.05;
        camera.getWorldDirection(this._dir);
        this._mesh.position.copy(camera.position).addScaledVector(this._dir, dist);
        this._mesh.quaternion.copy(camera.quaternion);
        const vFov = THREE.MathUtils.degToRad(camera.fov ?? 75);
        const h = 2 * Math.tan(vFov / 2) * dist;
        const aspect = camera.aspect ?? (window.innerWidth / window.innerHeight);
        this._mesh.scale.set(h * aspect, h, 1);
    }

    /** RevealLayer: remove from the scene and free GPU resources. */
    dispose() {
        try { this._scene.remove(this._mesh); } catch { /* already gone */ }
        try { this._geometry.dispose(); } catch { /* noop */ }
        try { this._material.map?.dispose(); } catch { /* noop */ }
        try { this._material.dispose(); } catch { /* noop */ }
    }
}
