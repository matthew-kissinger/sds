/**
 * DepthPrePass — single shared scene-depth render-target.
 *
 * Renders the THREE scene WITHOUT the water plane into a depth texture
 * each frame. AnimeWater samples it for shoreline foam + depth-tinted color.
 *
 * Why a pre-pass: water is part of the main render target, so we can't
 * read its own depth buffer mid-pass. We need scene-without-water depth
 * to compare against the water fragment's view-Z.
 *
 * Cost: ~one extra render of all opaque scene objects per frame.
 * Half-res on mobile to stay in budget.
 *
 * Usage:
 *   const depth = new DepthPrePass({ renderer, scene, camera, isMobile });
 *   // each frame:
 *   waterMesh.visible = false;
 *   depth.render();
 *   waterMesh.visible = true;
 *   waterMaterial.uniforms.uDepthTex.value = depth.texture;
 *   renderer.render(scene, camera);
 */
import * as THREE from 'three';

export class DepthPrePass {
    /**
     * @param {Object} input
     * @param {THREE.WebGLRenderer} input.renderer
     * @param {THREE.Scene} input.scene
     * @param {THREE.PerspectiveCamera} input.camera
     * @param {boolean} [input.isMobile=false]    Half-res on mobile (~50% cost)
     * @param {number} [input.scale=1.0]          Render-target scale; mobile defaults to 0.5
     */
    constructor({ renderer, scene, camera, isMobile = false, scale }) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.scale = scale ?? (isMobile ? 0.5 : 1.0);

        const dpr = renderer.getPixelRatio();
        const drawSize = renderer.getDrawingBufferSize(new THREE.Vector2());

        const w = Math.max(1, Math.floor(drawSize.x * this.scale));
        const h = Math.max(1, Math.floor(drawSize.y * this.scale));

        // DepthTexture must be highp on iOS to match desktop foam thickness.
        // depthTexture types are limited; UNSIGNED_INT_24_8 with DEPTH_STENCIL works
        // across WebGL2 + iOS Safari without the precision issues of UNSIGNED_SHORT.
        this.depthTexture = new THREE.DepthTexture(w, h);
        this.depthTexture.type = THREE.UnsignedInt248Type;
        this.depthTexture.format = THREE.DepthStencilFormat;
        this.depthTexture.minFilter = THREE.NearestFilter;
        this.depthTexture.magFilter = THREE.NearestFilter;

        this.target = new THREE.WebGLRenderTarget(w, h, {
            depthTexture: this.depthTexture,
            depthBuffer: true,
            stencilBuffer: false,
        });
        this.target.texture.minFilter = THREE.NearestFilter;
        this.target.texture.magFilter = THREE.NearestFilter;

        this._dpr = dpr;
        this._lastSize = { w, h };
    }

    /** The scene-depth texture; bind to AnimeWater's `uDepthTex` uniform. */
    get texture() {
        return this.depthTexture;
    }

    /**
     * Render the scene into the depth target. Caller is responsible for
     * temporarily hiding the water plane before calling render().
     * The renderer's current target is restored on exit.
     */
    render() {
        const prev = this.renderer.getRenderTarget();
        const prevAuto = this.renderer.autoClear;
        this.renderer.setRenderTarget(this.target);
        this.renderer.autoClear = true;
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(prev);
        this.renderer.autoClear = prevAuto;
    }

    /**
     * Resize the depth target to match the renderer's drawing buffer.
     * Call from window resize handler.
     */
    resize() {
        const drawSize = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        const w = Math.max(1, Math.floor(drawSize.x * this.scale));
        const h = Math.max(1, Math.floor(drawSize.y * this.scale));
        if (w === this._lastSize.w && h === this._lastSize.h) return;
        this.target.setSize(w, h);
        this.depthTexture.image = { width: w, height: h };
        this._lastSize = { w, h };
    }

    /**
     * Free GPU resources. Call from HMR teardown / scene-switch / page-leave.
     */
    dispose() {
        this.target.dispose();
        this.depthTexture.dispose();
    }
}
