// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * The swing rig every gate carries (Cycle 115 Phase 3).
 *
 * WHAT THE ASSET SHIPS. `assets/models/Gate_Assembly-v1.0.0.glb` is authored
 * with both leaves ALREADY SWUNG OPEN. Its two leaf pivots are unnamed nodes -
 * the GLB carries no `name` on either - so they are located by the mesh they
 * parent: `Mesh_LeftGateWood` and `Mesh_RightGateWood`. The left pivot sits at
 * local x -3.8 with a -72 degree yaw; the right sits at x +3.8 with a 252
 * degree yaw, which three decomposes to Euler XYZ (180, -72, 180). Both leaves
 * therefore read `rotation.y === -72 degrees` in the shipped pose and both
 * close at `rotation.y === 0`. The right leaf's baked 180-degree x/z pair is a
 * fixed flip that turns its (shared, left-handed) wood mesh around to face the
 * opening: its world yaw works out to `PI - rotation.y`, so 0 lays the leaf
 * across the gap and -72 swings it to the same +Z side as its twin. Measured
 * off the shipped binary, not assumed.
 *
 * WHY A CONTROLLER AND NOT A ROTATION. Until this phase the rig lived inside
 * `StructureBuilder.buildHomesteadGate`, which only Newsheepdogland calls.
 * Every other scene cloned the asset, scaled it, rotated it and rendered it
 * exactly as baked - so Home Field's pen gate stood open forever, and nothing
 * downstream had a handle to move it. Promoting the rig into the gate builder
 * means the leaves are posed by something we own, on every scene, rather than
 * by whoever exported the GLB.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. No timer, no gameplay opinion, no
 * knowledge of sheep, distance or day phase. It moves only when a caller calls
 * `setOpenFraction`, `setTargetOpenFraction` or `step`. Deciding WHEN a gate
 * opens is the next cycle's question; an answer baked in here would have to be
 * unpicked there.
 *
 * ABSOLUTE ANGLES PER LEAF, NOT ONE SHARED DELTA. The leaves do not share a
 * closed pose (the vertical-orientation procedural leaf closes at PI/2, not 0),
 * and the authored pair only agrees by the Euler coincidence described above.
 * Each leaf carries its own `closed` and `open` yaw; the controller carries the
 * single normalised fraction between them.
 *
 * NO THREE IMPORT. The rig reads and writes `node.rotation.y` and walks
 * `traverse`, which is all it needs. Keeping three out means this module costs
 * the client bundle nothing beyond its own bytes, and lets the unit tests build
 * leaf stubs from plain objects.
 */

/** Names stamped on the two authored leaf pivots, which ship unnamed. */
export const GATE_LEAF_LEFT_NAME = 'GateLeafLeft';
export const GATE_LEAF_RIGHT_NAME = 'GateLeafRight';

/**
 * The meshes that identify each authored leaf pivot. The pivot is the mesh's
 * PARENT: the wood plank and its iron strap are siblings under one transform
 * node, and it is that node the hinge turns about.
 */
export const GATE_LEAF_PIVOT_MESH_NAMES = Object.freeze({
    left: 'Mesh_LeftGateWood',
    right: 'Mesh_RightGateWood',
});

/**
 * Exponential-ease rate, per second, inherited from the Cycle 65 day-loop
 * tween (`k = min(1, dt * 3)`). Kept as the default rather than folded into
 * `step` so a caller that wants a different swing speed does not have to
 * reimplement the ease.
 */
export const GATE_LEAF_SWING_RATE = 3;

/**
 * How open a freshly built gate is, 0 closed and 1 the asset's authored pose.
 *
 * Zero, because the whole point of the phase is that the pose is now ours: a
 * gate that builds at 1 is indistinguishable from the frozen baked-open bug it
 * replaces. One named constant rather than a literal at each call site, so the
 * cycle that decides gates should idle open has exactly one line to change.
 */
export const GATE_LEAF_INITIAL_OPEN_FRACTION = 0;

/**
 * Fraction-space settle threshold. On the authored leaf the full swing is 1.257
 * rad, so this lands within ~1.3e-4 rad of the target - the same tolerance the
 * day-loop tween used in angle space before the promotion.
 */
const SETTLE_EPSILON = 1e-4;

/** Frame time assumed when a caller hands `step` something non-finite. */
const FALLBACK_STEP_SECONDS = 0.016;

const clamp01 = (value) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * @typedef {Object} GateLeaf
 * @property {{rotation: {y: number}, name?: string}} node Pivot the hinge turns.
 * @property {number} closed Yaw, radians, with the leaf across the opening.
 * @property {number} open   Yaw, radians, with the leaf swung clear.
 */

/**
 * One gate's leaves and the single fraction that poses them.
 *
 * A controller with zero leaves is legal and is what a gate built without the
 * authored asset's wood meshes gets. Callers therefore never need a null
 * branch: `controller.setOpenFraction(1)` on a leafless gate is a no-op, not a
 * crash.
 */
export class GateLeafController {
    /**
     * @param {GateLeaf[]} [leaves]
     * @param {number} [openFraction] Initial pose, 0 closed to 1 open.
     */
    constructor(leaves = [], openFraction = GATE_LEAF_INITIAL_OPEN_FRACTION) {
        /**
         * Public and readable so a consumer can inspect `closed` / `open` per
         * leaf without reaching through a private field. Entries without a
         * usable node are dropped at construction rather than guarded on every
         * apply.
         */
        this.leaves = (Array.isArray(leaves) ? leaves : [])
            .filter((leaf) => leaf?.node?.rotation && Number.isFinite(leaf.closed) && Number.isFinite(leaf.open));
        this._openFraction = clamp01(openFraction);
        this._targetOpenFraction = this._openFraction;
        this.apply();
    }

    /** The pose currently written into the leaves. */
    get openFraction() {
        return this._openFraction;
    }

    /** Where {@link step} is easing toward. Equal to `openFraction` when idle. */
    get targetOpenFraction() {
        return this._targetOpenFraction;
    }

    /** True when the rendered pose has reached the target and `step` is a no-op. */
    get isSettled() {
        return Math.abs(this._targetOpenFraction - this._openFraction) <= SETTLE_EPSILON;
    }

    /** Yaw for one leaf at `fraction`, defaulting to the current pose. */
    angleFor(leaf, fraction = this._openFraction) {
        return leaf.closed + (leaf.open - leaf.closed) * fraction;
    }

    /**
     * Snap. Sets the rendered pose AND the target, so a following `step` has
     * nothing to do. This is the reduced-motion path and the build-time path.
     * @param {number} fraction
     */
    setOpenFraction(fraction) {
        this._openFraction = clamp01(fraction);
        this._targetOpenFraction = this._openFraction;
        this.apply();
    }

    /**
     * Aim. Leaves the rendered pose alone; `step` walks it over. Idempotent, so
     * a per-frame caller can restate the same target every frame.
     * @param {number} fraction
     */
    setTargetOpenFraction(fraction) {
        this._targetOpenFraction = clamp01(fraction);
    }

    /**
     * Ease the rendered pose one frame toward the target. Caller-driven on
     * purpose: nothing in this module subscribes to a clock.
     *
     * The step factor is capped at 1 so a long frame lands exactly on the
     * target instead of overshooting past it, and the pose snaps to the target
     * once inside {@link SETTLE_EPSILON} so it does not creep asymptotically.
     *
     * @param {number} deltaTime seconds
     * @param {number} [rate] per-second ease rate
     * @returns {boolean} true when this call moved the leaves
     */
    step(deltaTime, rate = GATE_LEAF_SWING_RATE) {
        if (this.leaves.length === 0 || this.isSettled) return false;
        const dt = Number.isFinite(deltaTime) ? deltaTime : FALLBACK_STEP_SECONDS;
        const k = Math.min(1, Math.max(0, dt * rate));
        this._openFraction += (this._targetOpenFraction - this._openFraction) * k;
        if (Math.abs(this._targetOpenFraction - this._openFraction) <= SETTLE_EPSILON) {
            this._openFraction = this._targetOpenFraction;
        }
        this.apply();
        return true;
    }

    /** Write the current fraction into every leaf pivot. */
    apply() {
        for (const leaf of this.leaves) {
            leaf.node.rotation.y = this.angleFor(leaf);
        }
    }
}

/**
 * The pivot node that parents `meshName`, or null. Returns the FIRST match:
 * a gate carries one left and one right leaf, and a scene that clones several
 * gates searches each clone separately.
 */
function findPivotOfMesh(root, meshName) {
    let found = null;
    root.traverse((node) => {
        if (found || node.name !== meshName) return;
        found = node.parent ?? null;
    });
    return found;
}

/**
 * Build the leaf descriptors for an authored gate asset, naming the two pivots
 * on the way through.
 *
 * The authored yaw IS the open angle (the asset ships swung open, see the file
 * header) and closed is the pivot's zero. Reading `open` off the asset rather
 * than hardcoding -72 degrees means a re-baked gate with a different swing
 * still rigs correctly.
 *
 * @param {{traverse: Function}} root Cloned gate asset.
 * @returns {GateLeaf[]} Empty when the asset carries no leaf meshes; that is a
 *   legal outcome, not an error - see {@link GateLeafController}.
 */
export function buildAuthoredGateLeaves(root) {
    if (typeof root?.traverse !== 'function') return [];
    const left = findPivotOfMesh(root, GATE_LEAF_PIVOT_MESH_NAMES.left);
    const right = findPivotOfMesh(root, GATE_LEAF_PIVOT_MESH_NAMES.right);
    // Same node for both means a flattened export (a material-merged bake does
    // exactly this, which is why Cycle 105 kept the hierarchy-preserving GLB).
    // Renaming it twice and hinging it twice would be worse than not rigging it.
    if (!left || !right || left === right) return [];

    left.name = GATE_LEAF_LEFT_NAME;
    right.name = GATE_LEAF_RIGHT_NAME;
    return [
        { node: left, closed: 0, open: left.rotation.y },
        { node: right, closed: 0, open: right.rotation.y },
    ];
}

/**
 * Hang a controller off a gate group so consumers can find it by object rather
 * than by threading a return value through five call sites.
 *
 * @param {{userData?: Object}} host Usually the group `createGateStructure` returns.
 * @param {GateLeaf[]} leaves
 * @param {number} [openFraction]
 * @returns {GateLeafController}
 */
export function attachGateLeafController(host, leaves, openFraction = GATE_LEAF_INITIAL_OPEN_FRACTION) {
    const controller = new GateLeafController(leaves, openFraction);
    if (host) {
        if (!host.userData) host.userData = {};
        host.userData.gateLeafController = controller;
    }
    return controller;
}

/**
 * The controller attached directly to `object`, or null. Deliberately NOT a
 * subtree search - see {@link collectGateLeafControllers} for that - so a
 * caller holding a gate group cannot accidentally pick up a neighbour's gate.
 * @param {{userData?: Object}} object
 * @returns {GateLeafController|null}
 */
export function getGateLeafController(object) {
    const controller = object?.userData?.gateLeafController;
    return controller instanceof GateLeafController ? controller : null;
}

/**
 * Every controller in a subtree, in traversal order. Competitive layouts build
 * up to four gates under one fence group, so a scene-level consumer needs the
 * list rather than the first hit.
 * @param {{traverse: Function}} root
 * @param {GateLeafController[]} [out]
 * @returns {GateLeafController[]}
 */
export function collectGateLeafControllers(root, out = []) {
    if (typeof root?.traverse !== 'function') return out;
    root.traverse((node) => {
        const controller = getGateLeafController(node);
        if (controller && !out.includes(controller)) out.push(controller);
    });
    return out;
}
