// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * WolfRenderer - the Three.js layer for the night wolves.
 *
 * Cycle 67 P2: SPLIT out of `js/gamestate/wolfPack.js`. The AI now lives in the
 * pure `shared/survival/wolves.js` (`WolfSim`); this class owns the `Wolf` rig
 * instances and reconciles them to a wolf-state array each frame. It is the only
 * place Three.js touches the wolves, so it is reused by BOTH:
 *   - solo (via the `WolfPack` orchestrator, fed by the local `WolfSim`), and
 *   - co-op (Cycle 67 P6, fed directly from the DO broadcast wolf array).
 *
 * The state array is `{ id, x, z, state?, dirX?, dirZ?, moved?, justKilled? }[]`.
 * Facing + gait use `dirX/dirZ/moved` when the local sim provides them; for a
 * broadcast snapshot (id/x/z only) they are derived from the position delta since
 * the last sync. `atan2` for the yaw lives here (render-only), never in `shared/`.
 */

import { Wolf, loadWolfGLTF, WOLF_MODEL_PATH } from '../Wolf.js';
import { resolveAssetUrl } from '../utils/assetUrl.js';

export class WolfRenderer {
    /**
     * @param {Object} cfg
     * @param {THREE.Scene} cfg.scene  scene to add wolf meshes to.
     * @param {(x:number,z:number)=>number} [cfg.groundY]  terrain height sampler.
     * @param {number} [cfg.targetHeight=1.35]  rig world height.
     */
    constructor({ scene, groundY, targetHeight = 1.35 } = {}) {
        this.scene = scene;
        this.groundY = typeof groundY === 'function' ? groundY : () => 0;
        this.targetHeight = targetHeight;
        this._gltf = null;
        this._ready = false;
        /** @type {Map<number, {wolf: Wolf, lastX: number, lastZ: number}>} */
        this._rendered = new Map();
    }

    get ready() { return this._ready; }

    /** Load the wolf glTF once (cloned per wolf). Idempotent. */
    async init() {
        if (this._ready) return;
        try {
            this._gltf = await loadWolfGLTF(resolveAssetUrl(WOLF_MODEL_PATH));
            this._ready = true;
        } catch (err) {
            console.warn('[WOLF] glTF load failed; wolves not rendered this scene:', err?.message || err);
            this._ready = false;
        }
    }

    /**
     * Reconcile rendered Wolf instances to a wolf-state array: create instances
     * for new ids, dispose ones gone from the array, update transforms + gait.
     * @param {Array<{id:number,x:number,z:number,state?:string,dirX?:number,dirZ?:number,moved?:number,justKilled?:boolean}>} states
     * @param {number} [dt=0.016]
     */
    sync(states, dt = 0.016) {
        if (!this._ready || !this._gltf) return;
        const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 1e-4), 0.05) : 0.016;
        const seen = new Set();

        if (Array.isArray(states)) {
            for (const st of states) {
                if (!st || st.id == null) continue;
                seen.add(st.id);
                let r = this._rendered.get(st.id);
                if (!r) {
                    const wolf = new Wolf(this._gltf, { targetHeight: this.targetHeight });
                    wolf.setPosition(st.x, this.groundY(st.x, st.z), st.z);
                    this.scene.add(wolf.getObject3D());
                    r = { wolf, lastX: st.x, lastZ: st.z };
                    this._rendered.set(st.id, r);
                }

                // Facing + gait: prefer the sim's dir/moved (solo), else derive
                // from the position delta since the last sync (co-op snapshots).
                let dirX = st.dirX, dirZ = st.dirZ, moved = st.moved;
                if (moved == null) {
                    const ddx = st.x - r.lastX, ddz = st.z - r.lastZ;
                    const d = Math.hypot(ddx, ddz);
                    moved = d / step;
                    if (d > 1e-4) { dirX = ddx / d; dirZ = ddz / d; } else { dirX = 0; dirZ = 0; }
                }

                r.wolf.setPosition(st.x, this.groundY(st.x, st.z), st.z);
                if (st.justKilled) r.wolf.triggerAttack?.();
                if (moved > 0.01 && (dirX || dirZ)) {
                    // Model forward is +Z (Quaternius rig); yaw about world Y from
                    // the planar heading. Verified in-browser (Cycle 66 P4).
                    r.wolf.setRotationY(Math.atan2(dirX, dirZ));
                    r.wolf.setSpeed(moved);
                } else {
                    r.wolf.setSpeed(0);
                }
                r.wolf.update(step);
                r.lastX = st.x; r.lastZ = st.z;
            }
        }

        // Dispose rendered wolves no longer in the state array.
        for (const [id, r] of this._rendered) {
            if (!seen.has(id)) {
                try { r.wolf.dispose(); } catch { /* noop */ }
                this._rendered.delete(id);
            }
        }
    }

    /** Remove every rendered wolf immediately. */
    clear() {
        for (const r of this._rendered.values()) {
            try { r.wolf.dispose(); } catch { /* noop */ }
        }
        this._rendered.clear();
    }

    dispose() {
        this.clear();
        this._gltf = null;
        this._ready = false;
    }
}
