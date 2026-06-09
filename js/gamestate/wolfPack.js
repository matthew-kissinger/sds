// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * WolfPack - the SOLO night-wolf orchestrator.
 *
 * Cycle 67 P2: the Cycle 66 monolith was split. The wolf AI is now the pure
 * `shared/survival/wolves.js` (`WolfSim`, runnable on the Worker for co-op) and
 * the Three.js layer is `js/gamestate/wolfRenderer.js` (`WolfRenderer`). This
 * class composes the two for SOLO survival: it owns a local `WolfSim`, ticks it
 * each frame, and feeds the resulting wolf-state array to the renderer. Its
 * public surface is unchanged from Cycle 66 (init / spawnNight / update / repel /
 * retreatAll / dispose / .wolves / .count), so the solo wiring in initWorld.js +
 * main.js is untouched and solo survival behaves exactly as before.
 *
 * Co-op (Cycle 67 P6) does NOT use this class: the DO runs the `WolfSim` and the
 * client renders the broadcast wolf array through a standalone `WolfRenderer`.
 */

import { WolfSim } from '../../shared/survival/wolves.js';
import { WolfRenderer } from './wolfRenderer.js';

export class WolfPack {
    /**
     * @param {Object} cfg
     * @param {THREE.Scene} cfg.scene
     * @param {(x:number,z:number)=>number} cfg.groundY
     * @param {{_isInside:Function,_keepOut:Function,cx:number,cz:number}|null} cfg.pen
     * @param {(sheep:any)=>void} [cfg.onKill]
     * @param {Object} [cfg.tuning]
     * @param {number} [cfg.seed=0x5eed]
     */
    constructor({ scene, groundY, pen, onKill, tuning = {}, seed = 0x5eed }) {
        this._sim = new WolfSim({ pen, onKill, tuning, seed });
        this._renderer = new WolfRenderer({ scene, groundY, targetHeight: 1.35 });
        this._lastDt = 0.016;
    }

    /** The live wolf-state array (read by the minimap). */
    get wolves() { return this._sim.wolves; }
    get count() { return this._sim.count; }
    get night() { return this._sim.night; }

    /** Load the wolf glTF once (idempotent). */
    async init() { await this._renderer.init(); }

    /**
     * Nightfall. Gated on the renderer being ready so solo keeps the Cycle 66
     * behavior (no model loaded => no wolves at all, never invisible hunters).
     * @param {number} day
     * @param {Array} sheep
     */
    spawnNight(day, sheep) {
        if (!this._renderer.ready) return;
        this._sim.spawnNight(day, sheep);
        // Render immediately so the pack appears at nightfall before the next tick.
        this._renderer.sync(this._sim.wolves, 0.016);
    }

    /**
     * Per-frame: tick the AI, then render. Call AFTER the sheep sim + pen
     * containment so positions + pen membership are final this frame.
     * @param {number} dt
     * @param {Array} sheep
     * @param {{position:{x:number,z:number}}|null} dog
     */
    update(dt, sheep, dog) {
        this._lastDt = Number.isFinite(dt) ? dt : 0.016;
        this._sim.update(dt, sheep, dog);
        this._renderer.sync(this._sim.wolves, this._lastDt);
    }

    /** A bark scares wolves in range into a flee (breaks pursuit). */
    repel(x, z, radius, secs) { return this._sim.repel(x, z, radius, secs); }

    /** Dawn: wolves retreat and despawn over the next few seconds of ticks. */
    retreatAll() { this._sim.retreatAll(); }

    dispose() {
        this._renderer.dispose();
        this._sim.clear();
    }
}
