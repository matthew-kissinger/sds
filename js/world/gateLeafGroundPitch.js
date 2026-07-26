// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';

/**
 * Hang a pen gate's leaves on the ground they actually swing over.
 *
 * THE DEFECT THIS EXISTS FOR. `js/StructureBuilder.js` grounds the whole gate
 * sub-assembly as ONE rigid unit, sampled once at the gate's own (x, z). That is
 * right for the posts and the arch, which have to stay coplanar, and it is the
 * reason the group is tagged rather than its children (tagging both double-lifts
 * them, which was the old floating-wings bug). But the leaves are the one part
 * of that assembly that LEAVES the sample point: an open leaf reaches 5.3 m into
 * the pen, and on Rolling Hills the ground under that reach falls 1.55 m. The
 * leaf bottom stayed at a constant world Y, so from inside the pen you saw grass
 * and daylight under its whole length, and the fence rail behind it passed
 * underneath. Measured on the shipped bake: 1.85 m of daylight at the free end.
 *
 * Home Field could never show it (`public/terrain/field.bin` has peakHeight 0)
 * and Newsheepdogland's homestead sits on 10 cm of relief, which is why five
 * cycles of fence work never surfaced it. Phase 4 fixed exactly this class of
 * bug for the posts and the rails; the gate did not get the same treatment.
 *
 * THE RULE. The assembly is grounded once, at the gate's anchor. Each leaf then
 * pitches about its own hinge so that its free end holds the SAME height above
 * the ground below it that the assembly holds above the anchor. Two heightfield
 * samples per leaf, and on flat ground the two are equal, so the pitch is
 * identically zero and nothing moves. That last property is the whole reason the
 * rule is stated against the anchor rather than against the hinge: a hinge-
 * relative rule would also have to decide what to do about the assembly's own
 * cross-slope, and it would leave the leaf's authored ground clearance drifting
 * with whichever post the terrain happened to favour.
 *
 * WHY A PITCH NODE AND NOT A ROTATION ON THE PIVOT. The leaf pivots carry a
 * pose written by `gateLeafController.js`, which sets `rotation.y` and nothing
 * else, and the authored asset's right pivot carries a baked 180-degree x/z pair
 * that the pose write deliberately preserves. Composing a pitch onto that pivot
 * writes back through the quaternion into the Euler, so the next pose write
 * would set `rotation.y` on an x/z pair that is no longer the asset's. Inserting
 * a parent instead keeps the two authorities disjoint: the controller owns the
 * swing, this owns the tilt, and neither can corrupt the other's representation.
 * A stale pitch node is a stale tilt, never a broken leaf.
 *
 * WHY IT IS RESOLVED PER POSE AND NOT BAKED ONCE. Newsheepdogland closes its
 * homestead gate every night through `setPenGateOpen` / `updateGate`, and a
 * closed leaf lies over completely different ground from an open one. A pitch
 * baked for the open pose is simply wrong for half of that scene's clock.
 */

/**
 * The steepest tilt a leaf is allowed, radians.
 *
 * Rolling Hills, the only shipped site with real relief under a gate, asks for
 * 14.5 degrees on its left leaf and 13.4 on its right, so this does not bind
 * today and is here as a floor under how bad a future site can look. Past 30
 * degrees a gate stops reading as a gate and starts reading as a ramp, and the
 * honest fix at that point is to move the pen rather than to tilt harder.
 */
export const GATE_LEAF_MAX_GROUND_PITCH_RAD = Math.PI / 6;

/** Below this the leaf has no measurable reach, so there is no axis to tilt about. */
const MIN_LEAF_REACH_M = 0.05;

/** Marks a group this module inserted, so a second call cannot stack another. */
const PITCH_NODE_KEY = 'gateLeafGroundPitch';

const _hinge = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _flat = new THREE.Vector3();
const _tilted = new THREE.Vector3();
const _parentQuat = new THREE.Quaternion();
const _worldPitch = new THREE.Quaternion();
const _localPitch = new THREE.Quaternion();

/**
 * The point on a leaf that is horizontally farthest from its hinge, in the
 * pivot's own local frame, so it survives every later pose change.
 *
 * Taken off the geometry rather than off a width constant because the two
 * shipped leaves are not the same shape: the authored `Gate_Assembly` hangs a
 * half-width leaf from each post, and the no-asset fallback hangs one leaf
 * across the whole opening. The extreme CORNER is used rather than a centreline
 * end because it is the point that floats most, so pinning it pins everything
 * inboard of it too.
 *
 * @param {THREE.Object3D} pivot
 * @returns {THREE.Vector3|null} null when the leaf carries no geometry at all.
 */
function resolveLeafTipLocal(pivot) {
    pivot.updateWorldMatrix(true, true);
    _hinge.setFromMatrixPosition(pivot.matrixWorld);
    let bestReach = MIN_LEAF_REACH_M;
    let bestWorld = null;
    pivot.traverse((node) => {
        const geometry = node.geometry;
        if (!geometry) return;
        if (!geometry.boundingBox) geometry.computeBoundingBox?.();
        const box = geometry.boundingBox;
        if (!box) return;
        for (let corner = 0; corner < 8; corner++) {
            _corner.set(
                (corner & 1) ? box.max.x : box.min.x,
                (corner & 2) ? box.max.y : box.min.y,
                (corner & 4) ? box.max.z : box.min.z,
            ).applyMatrix4(node.matrixWorld);
            const reach = Math.hypot(_corner.x - _hinge.x, _corner.z - _hinge.z);
            if (reach > bestReach) {
                bestReach = reach;
                bestWorld = (bestWorld ?? new THREE.Vector3()).copy(_corner);
            }
        }
    });
    return bestWorld ? pivot.worldToLocal(bestWorld) : null;
}

/**
 * Put a fresh group between `pivot` and its parent, at the pivot's own position,
 * so the hinge point is unmoved and the pivot's local frame is untouched.
 * @param {THREE.Object3D} pivot
 * @returns {THREE.Object3D|null}
 */
function insertPitchNode(pivot) {
    const parent = pivot.parent;
    if (!parent) return null;
    if (parent.userData?.[PITCH_NODE_KEY]) return parent;
    const pitchNode = new THREE.Group();
    pitchNode.name = `${pivot.name || 'GateLeaf'}Pitch`;
    pitchNode.userData[PITCH_NODE_KEY] = true;
    pitchNode.position.copy(pivot.position);
    parent.remove(pivot);
    pivot.position.set(0, 0, 0);
    pitchNode.add(pivot);
    parent.add(pitchNode);
    return pitchNode;
}

/**
 * Rig a built gate's leaves for terrain pitch.
 *
 * Call once, after the gate group is in the scene and after the assembly has
 * been lifted onto the terrain, then call the returned `solve` again on every
 * pose change. Returns null for a gate with no leaves (a legal outcome: an
 * assembly that shipped without its wood meshes yields an empty controller),
 * which lets every caller stay branchless with `rig?.solve(...)`.
 *
 * @param {import('./gateLeafController.js').GateLeafController|null} controller
 * @param {{x: number, z: number}} anchor
 *   The (x, z) the whole assembly was grounded at. Every leaf holds its free end
 *   at the same height above the ground that the assembly holds above this.
 * @returns {{anchor: {x: number, z: number}, leaves: Array<{pivot: THREE.Object3D, pitchNode: THREE.Object3D, tipLocal: THREE.Vector3}>, solve: (groundY: (x: number, z: number) => number) => void}|null}
 */
export function createGateLeafGroundPitch(controller, anchor) {
    if (!controller || !Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.z)) return null;
    const leaves = [];
    for (const leaf of controller.leaves) {
        const pivot = leaf.node;
        if (typeof pivot?.traverse !== 'function') continue;
        const tipLocal = resolveLeafTipLocal(pivot);
        if (!tipLocal) continue;
        const pitchNode = insertPitchNode(pivot);
        if (!pitchNode) continue;
        leaves.push({ pivot, pitchNode, tipLocal });
    }
    if (leaves.length === 0) return null;

    return {
        anchor: { x: anchor.x, z: anchor.z },
        leaves,
        /**
         * Re-solve every leaf against the terrain at its current pose.
         * @param {(x: number, z: number) => number} groundY
         */
        solve(groundY) {
            if (typeof groundY !== 'function') return;
            const anchorY = groundY(anchor.x, anchor.z);
            if (!Number.isFinite(anchorY)) return;
            for (const { pivot, pitchNode, tipLocal } of leaves) {
                // Measure the leaf FLAT. Clearing the node first is what makes
                // this idempotent: the tilt is always solved from the pose, never
                // accumulated onto the tilt already there.
                pitchNode.quaternion.identity();
                pivot.updateWorldMatrix(true, true);
                _hinge.setFromMatrixPosition(pivot.matrixWorld);
                _tip.copy(tipLocal).applyMatrix4(pivot.matrixWorld);
                _flat.set(_tip.x - _hinge.x, 0, _tip.z - _hinge.z);
                const reach = _flat.length();
                if (reach < MIN_LEAF_REACH_M) continue;
                const tipGround = groundY(_tip.x, _tip.z);
                if (!Number.isFinite(tipGround)) continue;
                const limit = reach * Math.tan(GATE_LEAF_MAX_GROUND_PITCH_RAD);
                const rise = Math.max(-limit, Math.min(limit, tipGround - anchorY));
                if (rise === 0) continue;
                _flat.divideScalar(reach);
                _tilted.copy(_flat).multiplyScalar(reach);
                _tilted.y = rise;
                _tilted.normalize();
                _worldPitch.setFromUnitVectors(_flat, _tilted);
                // The tilt is a world-frame statement ("this end goes down"), and
                // the node it is written on lives under the gate's own yaw. Move
                // it into that frame rather than assuming the chain is a plain
                // rotation about Y, which is true today and is not a contract.
                pitchNode.parent.getWorldQuaternion(_parentQuat);
                _localPitch.copy(_parentQuat).invert().multiply(_worldPitch).multiply(_parentQuat);
                pitchNode.quaternion.copy(_localPitch);
            }
        },
    };
}
