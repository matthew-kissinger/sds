// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { FencePresets, FenceConfigBuilder } from './FencePresets.js';
import { sumObjectTreeTriangles } from './utils/TriangleCount.js';
import { isPointInPolygon } from './gamestate/polygonSpawn.js';
import { collectGateLeafControllers, getGateLeafController } from './world/gateLeafController.js';
import { createGateLeafGroundPitch } from './world/gateLeafGroundPitch.js';
import { applyRailSag } from './world/fenceWear.js';

/**
 * A pen descriptor's four edges, whichever way it was declared.
 *
 * `PenDef` comes in two forms: a square as `{center, radius}` (radius is the
 * half-side - Newsheepdogland's homestead) or an arbitrary rect as
 * `{minX, maxX, minZ, maxZ}` (Rolling Hills' island pasture). Every consumer
 * downstream wants the edges, so resolve once here.
 *
 * The twin of `shared/PenBarrier.js`'s constructor, deliberately duplicated
 * rather than imported: the barrier is dynamically imported so it stays out of
 * the eager chunk, and this builder is not. `tests/island-pasture.spec.js` pins
 * the two against each other on the real scenes so they cannot drift.
 *
 * @param {{center?: {x:number, z:number}, radius?: number, minX?: number, maxX?: number, minZ?: number, maxZ?: number} | null | undefined} pen
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number} | null}
 */
export function resolvePenBox(pen) {
    if (Number.isFinite(pen?.minX) && Number.isFinite(pen?.maxX)
        && Number.isFinite(pen?.minZ) && Number.isFinite(pen?.maxZ)) {
        return {
            minX: Math.min(pen.minX, pen.maxX), maxX: Math.max(pen.minX, pen.maxX),
            minZ: Math.min(pen.minZ, pen.maxZ), maxZ: Math.max(pen.minZ, pen.maxZ),
        };
    }
    if (pen?.center && pen.radius > 1) {
        const { x, z } = pen.center;
        return { minX: x - pen.radius, maxX: x + pen.radius, minZ: z - pen.radius, maxZ: z + pen.radius };
    }
    return null;
}

/**
 * The enclosure a scene builds for itself: its pen box plus the one gate in it,
 * or null for a scene that declares no pen.
 *
 * `pen.gate` first, then the top-level `gate`. Rolling Hills nests its gate
 * inside the pen because a top-level `gate` is load-bearing in the sim (see
 * `PenDef` in `shared/scenes/types.js`); Newsheepdogland's homestead gate IS
 * top-level and has no nested one, so a nested-only resolver would silently
 * drop its enclosure. Same order, for the same reason, as the gate cue's
 * `resolveGateDescriptor`.
 *
 * The gate comes back FLAT because both consumers want it flat: this builder
 * positions a group at (x, z), and `PenBarrier` takes `{x, z, width}`. The
 * scene declares it as a `GateDef` so there is one gate shape in the data.
 *
 * @param {{pen?: object, gate?: {position?: {x: number, z: number}, width?: number, facingDeg?: number}} | null | undefined} sceneDef
 * @returns {{pen: object, gate: {x: number, z: number, width: number|undefined, facingDeg: number|undefined}} | null}
 */
export function resolveSceneEnclosure(sceneDef) {
    const pen = sceneDef?.pen;
    if (!resolvePenBox(pen)) return null;
    const g = pen.gate ?? sceneDef.gate;
    const p = g?.position;
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z)) return null;
    return { pen, gate: { x: p.x, z: p.z, width: g.width, facingDeg: g.facingDeg } };
}

/**
 * StructureBuilder - Structure builder with modular fence system
 *
 * Features:
 * - Uses modular FencePresets for reusable components
 * - Properly handles 3-4 player configurations
 * - Supports polygon-shaped fields
 * - Optimized geometry with instancing support
 */
export class StructureBuilder {
    constructor(scene) {
        this.scene = scene;
        this.structures = {
            fences: [],
            gates: [],
            pastures: [],
            decorations: []
        };

        // Initialize modular fence system
        this.fencePresets = new FencePresets();
        this.fenceConfigBuilder = new FenceConfigBuilder(this.fencePresets);
        this.modelsLoaded = false;

        // Optional heightfield. When set, surfaceToTerrain() lifts each
        // tagged structure piece to sit on the displaced terrain instead of
        // the y=0 baseline (where it would be buried in heightmapped scenes).
        /** @type {import('../shared/terrain/Heightfield.js').Heightfield | null} */
        this.heightfield = null;
        this._tmpWorldPos = new THREE.Vector3();

        // The pen enclosure's gate. Set by buildPenEnclosure, cleared by
        // clearAllStructures. Every OTHER scene's gate controller is reached
        // through getGateLeafControllers() rather than a named field, because
        // nothing in this builder decides when those gates move.
        /** @type {import('./world/gateLeafController.js').GateLeafController | null} */
        this._penGateController = null;
        this._penGateOpen = false;
        // The pen gate's terrain rig. Separate from the controller because the
        // two own different things: the controller owns WHERE the leaf is swung
        // to, this owns how far the ground under that swing has fallen away.
        /** @type {ReturnType<typeof createGateLeafGroundPitch>} */
        this._penGateLeafPitch = null;
    }

    /**
     * Provide (or clear) the scene's heightfield. Called from main.js after
     * the heightmap loads. Pieces marked with `userData.surfaceToTerrain`
     * are offset by `_groundY(worldX, worldZ)` so fence posts, gates, and
     * corner flags rise/fall with the terrain.
     * @param {import('../shared/terrain/Heightfield.js').Heightfield | null} heightfield
     */
    setHeightfield(heightfield) {
        this.heightfield = heightfield ?? null;
    }

    /**
     * Visible ground Y at (x, z) - the surface `TerrainBuilder._groundY`
     * reports, not the raw bake. Both come off the same Heightfield, but
     * `sample()` reads the heightmap texels (Rolling Hills: 500m / 1024) while
     * the terrain the player actually sees is that heightmap resampled onto the
     * terrain mesh (4000m / 384 segments). On the island pasture the two differ
     * by up to 0.48m - a post sunk past its bottom rail - where on flat Home
     * Field and Newsheepdogland's lowland homestead they differ by under 7cm,
     * which is why nothing caught it before there was a fence on a hillside.
     * Measured: `cycle117-validation/pasture-grounding-probe.mjs`.
     *
     * This is `scene-and-render.md`'s heightfield contract: visible geometry
     * grounds on the visible surface. Falls back to the raw sample when no mesh
     * grid is bound, because `meshSampleY` throws rather than guessing and the
     * diagnostics harnesses and the specs hand this builder a bare sampler.
     *
     * @param {number} x
     * @param {number} z
     * @returns {number} metres
     * @private
     */
    _groundY(x, z) {
        const hf = this.heightfield;
        if (!hf) return 0;
        return hf.displacedHeights ? hf.meshSampleY(x, z) : hf.sample(x, z);
    }

    /**
     * Walk a structure subtree and lift each tagged node onto the terrain.
     * Tags must be set by the structure builders (FencePresets, corner flags)
     * before the parent group is committed to the scene. We tag at the
     * granularity of "rigid pieces": individual posts/rails ride terrain
     * independently, but a gate group rides as one unit so its two posts
     * stay coplanar on slopes.
     *
     * Call AFTER the group is added to the scene so getWorldPosition reports
     * the correct world (x,z). Idempotent — re-running on an already-surfaced
     * group is a no-op for siblings since each tagged node samples once.
     * @param {THREE.Object3D} root
     * @private
     */
    _surfaceToTerrain(root) {
        if (!root) return;
        root.updateMatrixWorld(true);
        this._instanceFenceSegments(root);
        if (!this.heightfield) return;
        root.updateMatrixWorld(true);
        const liftSamples = [];
        const slopeSamples = [];
        root.traverse(node => {
            if (!node.userData?.surfaceToTerrain) return;
            // Rails get the slope-along-terrain treatment so they actually
            // span the height difference between adjacent posts. Everything
            // else (posts, gate group, corner flags) just rides the terrain
            // height at its own (x,z).
            if (node.userData.railSpan && node.parent) {
                slopeSamples.push(node);
            } else {
                node.getWorldPosition(this._tmpWorldPos);
                const dy = this._groundY(this._tmpWorldPos.x, this._tmpWorldPos.z);
                liftSamples.push({ node, dy });
            }
        });

        // Lift posts/gates first so any rail's parent matrix already reflects
        // its surfaced state if the parent itself was tagged (defensive — in
        // practice the parent isn't tagged when rails are).
        for (const { node, dy } of liftSamples) {
            node.position.y += dy;
        }

        // Slope rails to span between their two posts.
        for (const node of slopeSamples) {
            this._slopeRailToTerrain(node);
        }
    }

    _instanceFenceSegments(root) {
        const segments = [];
        const hasTerrain = !!this.heightfield;
        root.traverse(node => {
            const spec = node.userData?.fenceInstancingSpec;
            if (!spec) return;
            if (node.userData.fenceInstanced && node.userData.fenceInstancedWithTerrain === hasTerrain) return;
            segments.push(node);
        });

        for (const segment of segments) {
            this._buildInstancedFenceSegment(segment);
        }
    }

    _buildInstancedFenceSegment(segment) {
        const spec = segment.userData?.fenceInstancingSpec;
        const postMesh = spec?.postSource?.mesh;
        const railMesh = spec?.railSource?.mesh;
        if (!spec || !postMesh?.geometry || !railMesh?.geometry) return;

        for (const child of [...segment.children]) {
            child.traverse?.(node => {
                if (node.geometry) node.geometry.dispose();
            });
            segment.remove(child);
        }

        segment.updateMatrixWorld(true);
        const parentMatrix = segment.matrixWorld;
        const parentInv = new THREE.Matrix4().copy(parentMatrix).invert();
        const postInstances = new THREE.InstancedMesh(
            postMesh.geometry.clone(),
            postMesh.material,
            spec.postCount
        );
        postInstances.name = 'Fence_Post_Instances';
        postInstances.castShadow = true;
        postInstances.receiveShadow = true;

        const railCount = (spec.postCount - 1) * spec.railHeights.length;
        // Sag the rails (Cycle 115 P2). Every rail in a segment spans the same
        // `actualSpacing`, so ONE geometry carries the whole segment's droop
        // and the instanced draw is unchanged. This is the only place the kit's
        // rail geometry is cloned, which is what makes deforming it safe: the
        // source in FencePresets.models stays straight for the next segment.
        //
        // `metresPerUnit` comes off the mesh's own node scale because the baked
        // kit ships Draco-quantised: its positions are normalised shorts and
        // that scale is what puts them back into metres. See applyRailSag.
        const railGeometry = railMesh.geometry.clone();
        const railUnitScale = new THREE.Vector3();
        spec.railSource.localMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), railUnitScale);
        applyRailSag(railGeometry, spec.actualSpacing, {
            longAxis: 'x',
            metresPerUnit: railUnitScale.y || 1,
        });
        const railInstances = new THREE.InstancedMesh(
            railGeometry,
            railMesh.material,
            railCount
        );
        railInstances.name = 'Fence_Rail_Instances';
        railInstances.castShadow = true;
        railInstances.receiveShadow = true;

        // Posts carry a seeded per-instance yaw, lean and height scale
        // (createFencePostJitter in js/FencePresets.js) so a run reads as dug
        // fence rather than as a picket line. The run-axis yaw folds into the
        // jitter's yaw; the GLB post wrapper's origin is authored at ground
        // contact, so both the lean and the Y scale pivot about the post's foot
        // and leave the buried end where the terrain put it. Rails are NOT
        // jittered: they span between post centres at fixed heights, and the
        // lean cap in FencePresets keeps every post's cross-section over its
        // rail attachment points.
        const baseYaw = spec.orientation === 'vertical' ? Math.PI / 2 : 0;
        const postEuler = new THREE.Euler();
        const postRotation = new THREE.Quaternion();
        const postScale = new THREE.Vector3(1, 1, 1);
        const baseRailAxis = new THREE.Vector3(1, 0, 0);
        const matrix = new THREE.Matrix4();
        const instanceMatrix = new THREE.Matrix4();
        const local = new THREE.Vector3();
        const world = new THREE.Vector3();
        const liftedLocal = new THREE.Vector3();
        const aLocal = new THREE.Vector3();
        const bLocal = new THREE.Vector3();
        const aWorld = new THREE.Vector3();
        const bWorld = new THREE.Vector3();
        const aLifted = new THREE.Vector3();
        const bLifted = new THREE.Vector3();
        const mid = new THREE.Vector3();
        const dir = new THREE.Vector3();
        const railRotation = new THREE.Quaternion();
        const railScale = new THREE.Vector3();

        const setSegmentPoint = (target, offset, y = 0) => {
            if (spec.orientation === 'horizontal') {
                target.set(offset, y, 0);
            } else {
                target.set(0, y, offset);
            }
        };
        const terrainLocalPoint = (target, sourceLocal, baseY = 0) => {
            if (!this.heightfield) {
                target.copy(sourceLocal);
                target.y = baseY;
                return target;
            }
            world.copy(sourceLocal).applyMatrix4(parentMatrix);
            world.y = this._groundY(world.x, world.z) + baseY;
            return target.copy(world).applyMatrix4(parentInv);
        };

        for (let i = 0; i < spec.postCount; i++) {
            const offset = i * spec.actualSpacing - spec.length / 2;
            setSegmentPoint(local, offset);
            terrainLocalPoint(liftedLocal, local);
            // Optional so a spec built before the jitter existed (or by a test
            // that hand-rolls one) still composes the old uniform post.
            const jitter = spec.postJitter?.[i];
            postEuler.set(
                jitter?.leanX ?? 0,
                baseYaw + (jitter?.yaw ?? 0),
                jitter?.leanZ ?? 0
            );
            postRotation.setFromEuler(postEuler);
            postScale.set(1, jitter?.heightScale ?? 1, 1);
            matrix.compose(liftedLocal, postRotation, postScale);
            instanceMatrix.multiplyMatrices(matrix, spec.postSource.localMatrix);
            postInstances.setMatrixAt(i, instanceMatrix);
        }

        let railIndex = 0;
        for (const height of spec.railHeights) {
            for (let i = 0; i < spec.postCount - 1; i++) {
                const aOffset = i * spec.actualSpacing - spec.length / 2;
                const bOffset = aOffset + spec.actualSpacing;
                setSegmentPoint(aLocal, aOffset);
                setSegmentPoint(bLocal, bOffset);

                if (this.heightfield) {
                    aWorld.copy(aLocal).applyMatrix4(parentMatrix);
                    bWorld.copy(bLocal).applyMatrix4(parentMatrix);
                    aWorld.y = this._groundY(aWorld.x, aWorld.z) + height;
                    bWorld.y = this._groundY(bWorld.x, bWorld.z) + height;
                    aLifted.copy(aWorld).applyMatrix4(parentInv);
                    bLifted.copy(bWorld).applyMatrix4(parentInv);
                } else {
                    aLifted.copy(aLocal);
                    bLifted.copy(bLocal);
                    aLifted.y = height;
                    bLifted.y = height;
                }

                mid.copy(aLifted).add(bLifted).multiplyScalar(0.5);
                dir.copy(bLifted).sub(aLifted).normalize();
                railRotation.setFromUnitVectors(baseRailAxis, dir);
                // Cycle 117 P4: scale to the SLOPED distance between the two
                // posts, not to the flat `actualSpacing`. Once the rail is
                // rotated onto the slope, a rail cut to the horizontal spacing
                // is short by the hypotenuse and leaves a gap at each post. On
                // flat ground the two are equal to the bit (Home Field's bake is
                // peakHeight 0) and Newsheepdogland's worst post pair differs by
                // 0.5mm; the island pasture drops 1.57m across one 5m span,
                // which is a 24cm hole.
                railScale.set(aLifted.distanceTo(bLifted) / spec.railModelLength, 1, 1);
                matrix.compose(mid, railRotation, railScale);
                instanceMatrix.multiplyMatrices(matrix, spec.railSource.localMatrix);
                railInstances.setMatrixAt(railIndex++, instanceMatrix);
            }
        }

        postInstances.instanceMatrix.needsUpdate = true;
        railInstances.instanceMatrix.needsUpdate = true;
        postInstances.computeBoundingBox?.();
        postInstances.computeBoundingSphere?.();
        railInstances.computeBoundingBox?.();
        railInstances.computeBoundingSphere?.();
        segment.add(postInstances, railInstances);
        segment.userData.fenceInstanced = true;
        segment.userData.fenceInstancedWithTerrain = !!this.heightfield;
        segment.userData.fenceInstanceCounts = {
            posts: spec.postCount,
            rails: railCount
        };
    }

    /**
     * Re-orient a tagged rail so its long axis spans the slope between the
     * two posts it sits between. Reads `userData.railSpan` for span metadata,
     * samples the heightfield at both endpoints, and rebuilds the rail's
     * position + quaternion so it lands flush on both posts.
     *
     * Replaces (not composes with) any prior rotation, so the rail's geometry
     * long axis must be tagged via `geomAxis` ('x' for GLB rails and procedural
     * horizontal segments, 'z' for procedural vertical segments).
     *
     * @param {THREE.Object3D} rail
     * @private
     */
    _slopeRailToTerrain(rail) {
        const span = rail.userData.railSpan;
        if (!span || !rail.parent) return;
        const { halfLen, axis, geomAxis, baseY } = span;
        rail.parent.updateMatrixWorld(true);
        const parentMatrix = rail.parent.matrixWorld;

        // Local-frame endpoints of the rail (relative to parent group).
        // The rail's current local position is its midpoint between two posts
        // — but we recompute from the post-pair offsets because subsequent
        // calls would otherwise double-apply.
        const midLocal = rail.position.clone();
        const dxLocal = axis === 'horizontal' ? halfLen : 0;
        const dzLocal = axis === 'horizontal' ? 0 : halfLen;
        const aLocal = new THREE.Vector3(midLocal.x - dxLocal, 0, midLocal.z - dzLocal);
        const bLocal = new THREE.Vector3(midLocal.x + dxLocal, 0, midLocal.z + dzLocal);

        // World-space endpoints (parent transform applied).
        const aWorld = aLocal.clone().applyMatrix4(parentMatrix);
        const bWorld = bLocal.clone().applyMatrix4(parentMatrix);

        // Sample terrain at each post's world (x, z).
        const hA = this._groundY(aWorld.x, aWorld.z);
        const hB = this._groundY(bWorld.x, bWorld.z);
        aWorld.y = hA + baseY;
        bWorld.y = hB + baseY;

        // Convert lifted endpoints back to parent-local space.
        const parentInv = parentMatrix.clone().invert();
        const aLocalLifted = aWorld.clone().applyMatrix4(parentInv);
        const bLocalLifted = bWorld.clone().applyMatrix4(parentInv);

        // Rail at midpoint, oriented to span A→B in parent-local space. The
        // rail mesh's geometry long axis is `geomAxis` (+x or +z), so the
        // base unit vector for the quaternion picks the right axis.
        rail.position.copy(aLocalLifted).add(bLocalLifted).multiplyScalar(0.5);
        const dir = bLocalLifted.clone().sub(aLocalLifted).normalize();
        const baseAxis = geomAxis === 'z'
            ? new THREE.Vector3(0, 0, 1)
            : new THREE.Vector3(1, 0, 0);
        rail.quaternion.setFromUnitVectors(baseAxis, dir);
    }

    /**
     * Load GLB fence models (call this before building structures)
     */
    async loadModels() {
        if (this.modelsLoaded) return;

        console.log('[BUILD] Loading fence GLB models...');
        await this.fencePresets.loadModels();
        this.modelsLoaded = true;
        console.log('[BUILD] Fence models loaded');
    }
    
    /**
     * Clear all structures from scene
     */
    clearAllStructures() {
        console.log('[BUILD] Clearing all structures');

        // Cycle 11 Phase 1 A8: structures mix per-call geometries (BoxGeometry
        // / CylinderGeometry built each invocation, must be disposed) with
        // GLB-cloned meshes that share materials/textures with the fenceModels
        // cache (must NOT be disposed, or next clone forces texture re-upload).
        // Strategy: dispose only the geometries; leave material refs alive.
        Object.values(this.structures).forEach(structureArray => {
            structureArray.forEach(element => {
                if (element.parent) {
                    element.parent.remove(element);
                }
                element.traverse?.(child => {
                    if (child.geometry) child.geometry.dispose();
                });
            });
            structureArray.length = 0;
        });

        // The pen gate's controller holds direct refs into the subtree we
        // just detached. Dropping it here stops the day loop from easing a gate
        // that is no longer in the scene after a swap (loadScene clears before
        // initWorld rebuilds).
        this._penGateController = null;
        this._penGateLeafPitch = null;
    }
    
    /**
     * Build structures for single player mode.
     * @param {Object} bounds
     * @param {Object} gate
     * @param {Object} pasture
     * @param {Object} [opts]
     * @param {boolean} [opts.perimeterFence=true] When false, only the gate
     *  + pen are built (no four border segments). For "no fences" scenes
     *  like Open Country.
     * @param {ReturnType<typeof resolveSceneEnclosure>} [opts.enclosure=null]
     *  The scene's own fenced pen + gate, from {@link resolveSceneEnclosure}.
     */
    buildSinglePlayerStructures(bounds, gate, pasture, opts = {}) {
        const { perimeterFence = true, corral = null, enclosure = null } = opts;
        console.log(`[BUILD] Building single player structures (perimeterFence=${perimeterFence}, corral=${!!corral}, enclosure=${!!enclosure})`);

        this.clearAllStructures();

        // Cycle 117 P4: a scene that declares its own fenced enclosure builds
        // THAT and nothing else. Laying FieldConfig's default gate + pen ring on
        // top of it strands a second gate at the origin - out in the water on
        // Newsheepdogland, and 100m INSIDE the disc on the Rolling Hills island.
        // (This was Cycle 8X's `homesteadGate` suppression flag, which suppressed
        // without building because the homestead was built separately under the
        // day-loop branch. One call site now does both, so local 2-player - which
        // rebuilds structures from scratch - stops being a way to lose the fence.)
        if (enclosure) {
            this.buildPenEnclosure(enclosure);
            return;
        }

        // Cycle 5+ corral scene: the corral disc replaces the perimeter pen+gate.
        // Even if FieldConfig still surfaces a legacy gate object, corral wins -
        // no fence ring, no pen at the perimeter. Open Country is the only one
        // left and it owns its own visual (PortalEffect, built in
        // js/boot/initWorld.js); Cycle 117 P4 retired the flag-pillar marker
        // along with the island corral it was built for (D15).
        if (corral) {
            console.log('[OK] Corral scene: default gate+pen skipped');
            return;
        }

        const fenceGroup = perimeterFence
            ? this.fenceConfigBuilder.buildSinglePlayerFences(bounds, gate, pasture)
            : this.fenceConfigBuilder.buildGateAndPenOnly(bounds, gate, pasture);
        this.scene.add(fenceGroup);
        this.structures.fences.push(fenceGroup);
        this._surfaceToTerrain(fenceGroup);

        // Decorative corner flags only make sense with a perimeter; skip for
        // fence-less scenes to avoid floating flags in the middle of nowhere.
        if (perimeterFence) {
            this.addFieldDecorations(bounds);
        }

        console.log('[OK] Single player structures built');
    }

    /**
     * A scene's fenced enclosure: a full fence ring around the pen box with one
     * swing gate (posts + arch from the fence kit + a hinged door) as the only
     * opening. Newsheepdogland's homestead (Cycle 65) and, since Cycle 117 P4,
     * Rolling Hills' island pasture. A day loop, where there is one, swings the
     * door shut at night via `setPenGateOpen` + `updateGate`; a scene without a
     * clock leaves it standing open, which is the state it builds in.
     *
     * Rect-capable since Cycle 117 P4: `resolvePenBox` accepts either the square
     * `{center, radius}` the homestead declares or the `{minX, maxX, minZ, maxZ}`
     * rect the island pasture declares, and the ring is laid out from the four
     * edges either way. On a square the two forms produce the same segments to
     * the bit, so the homestead's geometry is unchanged.
     *
     * Grounding: the outer group is deliberately NOT tagged surfaceToTerrain.
     * Every fence post + rail self-grounds per-piece (createBorderSegment tags
     * its own children) and the gate sub-assembly is tagged as one coplanar
     * unit. Tagging both a group AND its already-tagged children double-lifts
     * the children to ~2x terrain height - that was the old "floating wings"
     * bug (locked as known behavior in structure-builder.spec.js).
     *
     * The leaves are the one part of that assembly the single lift cannot serve,
     * because an open leaf reaches metres away from the point it was sampled at.
     * They are hung on the terrain separately by `js/world/gateLeafGroundPitch.js`,
     * which tilts each leaf about its own hinge and is re-solved on every pose
     * change. On flat ground it resolves to zero, so Home Field cannot move.
     *
     * @param {{ gate: {x:number, z:number, width?:number, facingDeg?:number}, pen?: object }} enclosure
     * @returns {THREE.Group}
     */
    buildPenEnclosure(enclosure) {
        const g = enclosure?.gate;
        if (!g) return null;
        const width = g.width ?? 10;
        const box = resolvePenBox(enclosure?.pen);

        const group = new THREE.Group();
        group.name = 'PenEnclosure';

        // Snap rather than tween when the user prefers reduced motion.
        this._reducedMotion = typeof window !== 'undefined'
            && window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Which pen edge holds the gate? east/west edges run along z (vertical);
        // north/south edges run along x. Drives both the gate rotation and which
        // edge gets split into flanks.
        //
        // This is `PenBarrier`'s nearest-face rule verbatim, not the Cycle 66
        // raw-offset rule it replaced, because the VISIBLE gap and the PASSABLE
        // gap have to be the same gap. On a square the two rules agree (see the
        // proof in PenBarrier's constructor), so the homestead does not move;
        // on a long thin rect the old rule gaps the wrong edge and the fence
        // would have a hole where the barrier does not.
        let onVertical = true;
        if (box) {
            const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
            onVertical = ((box.maxX - cx) - Math.abs(g.x - cx))
                <= ((box.maxZ - cz) - Math.abs(g.z - cz));
        }
        const facingDeg = g.facingDeg ?? (onVertical ? 90 : 0);

        // --- The swing-gate assembly, grounded as ONE unit so the posts, arch,
        //     and hinged door stay coplanar on a slope. ---
        const gate = new THREE.Group();
        gate.name = 'PenGateAssembly';
        // Cycle 115 P3: the leaf rig used to be built HERE, which is why only
        // this scene's gate could move. It now comes back on the gate group
        // itself from createGateStructure, on both the authored-asset and the
        // no-asset branch, so there is nothing left to branch on.
        const gateStructure = this.fencePresets.createGateStructure(width, 'horizontal');
        gate.add(gateStructure);
        this._penGateController = getGateLeafController(gateStructure);
        this._penGateOpen = true;
        // A pen gate builds OPEN: the day loop starts at dawn, and a scene with
        // no day loop never closes it. Every other gate keeps the builder's
        // default; this is the one place that states an opinion, out loud.
        this._penGateController?.setOpenFraction(1);
        gate.position.set(g.x, 0, g.z);
        gate.rotation.y = (facingDeg * Math.PI) / 180;
        gate.userData.surfaceToTerrain = true; // single lift for the whole gate
        group.add(gate);

        // --- The ring: all four edges of the pen box, with the gate's edge split
        //     into two flanks that meet the opening. Each segment self-grounds
        //     per-piece (no group-level tag, so no double-lift). ---
        if (box) {
            const { minX, maxX, minZ, maxZ } = box;
            const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
            const half = width / 2;
            const seg = (a, b) => { const f = this.buildFenceSegment(a, b); if (f) group.add(f); };

            if (onVertical) {
                const gx = (g.x < cx) ? minX : maxX;      // x of the gate edge
                const fx = (g.x < cx) ? maxX : minX;      // x of the far edge
                seg({ x: minX, z: maxZ }, { x: maxX, z: maxZ });          // north
                seg({ x: minX, z: minZ }, { x: maxX, z: minZ });          // south
                seg({ x: fx, z: maxZ }, { x: fx, z: minZ });              // far edge
                seg({ x: gx, z: maxZ }, { x: gx, z: g.z + half });        // gate flank
                seg({ x: gx, z: g.z - half }, { x: gx, z: minZ });        // gate flank
            } else {
                const gz = (g.z < cz) ? minZ : maxZ;      // z of the gate edge
                const fz = (g.z < cz) ? maxZ : minZ;      // z of the far edge
                seg({ x: minX, z: maxZ }, { x: minX, z: minZ });          // west
                seg({ x: maxX, z: maxZ }, { x: maxX, z: minZ });          // east
                seg({ x: minX, z: fz }, { x: maxX, z: fz });              // far edge
                seg({ x: minX, z: gz }, { x: g.x - half, z: gz });        // gate flank
                seg({ x: g.x + half, z: gz }, { x: maxX, z: gz });        // gate flank
            }
        }

        this.scene.add(group);
        this.structures.gates.push(group);
        this._surfaceToTerrain(group);
        // AFTER the lift, because the rig measures the leaves where they ended
        // up. The anchor is the same (x, z) the assembly was grounded at, which
        // is what makes a flat scene an exact no-op rather than a small tilt.
        this._penGateLeafPitch = createGateLeafGroundPitch(this._penGateController, { x: g.x, z: g.z });
        this._pitchPenGateLeaves();
        console.log(`[BUILD] Pen enclosure ${box ? `[${box.minX}..${box.maxX}] x [${box.minZ}..${box.maxZ}]` : '(gate only)'}, gate w${width} at (${g.x}, ${g.z})`);
        return group;
    }

    /**
     * Every gate leaf controller across the structures this builder currently
     * owns, in build order. The seam a consumer that wants to pose gates by
     * scene reaches for; this builder itself never decides when a gate opens.
     * @returns {import('./world/gateLeafController.js').GateLeafController[]}
     */
    getGateLeafControllers() {
        const controllers = [];
        for (const element of Object.values(this.structures).flat()) {
            collectGateLeafControllers(element, controllers);
        }
        return controllers;
    }

    /**
     * Cycle 65: command the pen gate open or closed. The actual swing is
     * tweened in `updateGate`; if the scene has no pen gate this is a
     * no-op. Idempotent.
     * @param {boolean} open
     */
    setPenGateOpen(open) {
        const controller = this._penGateController;
        if (!controller) return;
        this._penGateOpen = !!open;
        const target = this._penGateOpen ? 1 : 0;
        // Reduced motion snaps; everything else aims and lets updateGate ease.
        if (this._reducedMotion) {
            controller.setOpenFraction(target);
            // The snap moved the leaves, and the ground under a closed leaf is
            // not the ground under an open one. `updateGate` returns early under
            // reduced motion, so this is the only chance to re-hang them.
            this._pitchPenGateLeaves();
        } else {
            controller.setTargetOpenFraction(target);
        }
    }

    /**
     * Re-hang the pen gate's leaves on the terrain at their current pose.
     * No-op without a rig (no pen gate, or a gate with no leaves) and without a
     * heightfield, where `_groundY` is flat 0 and the pitch resolves to zero.
     * @private
     */
    _pitchPenGateLeaves() {
        this._penGateLeafPitch?.solve((x, z) => this._groundY(x, z));
    }

    /**
     * Cycle 65: tween the pen gate door toward its target each frame.
     * Driven by the day loop's per-frame runner because StructureBuilder.update
     * is not on the main loop. No-op without a gate or under reduced motion
     * (where setPenGateOpen has already snapped it).
     * @param {number} deltaTime
     */
    updateGate(deltaTime) {
        if (this._reducedMotion) return;
        // Only when the swing actually moved. `step` reports that for us, and a
        // settled gate is the common case: Newsheepdogland calls this every
        // frame of every day and the leaves are in motion for a second of it.
        if (this._penGateController?.step(deltaTime)) this._pitchPenGateLeaves();
    }

    /**
     * Build structures for sandbox mode with custom fences
     * @param {Object} bounds - Field boundaries
     * @param {Object} gate - Gate configuration
     * @param {Object} pasture - Pasture configuration
     * @param {Array} customFences - Array of custom fence segments
     * @param {Array} borderPoints - Optional polygon border points for custom shapes
     * @param {string} fieldShape - The field shape type ('square', 'custom', etc.)
     */
    buildSandboxStructures(bounds, gate, pasture, customFences = [], borderPoints = null, fieldShape = 'square') {
        console.log('[BUILD] Building sandbox structures');
        console.log(`[BUILD] Shape: ${fieldShape}, Bounds: ${JSON.stringify(bounds)}`);
        console.log(`[BUILD] Gate: ${JSON.stringify(gate?.position)}, edgeAngle: ${gate?.edgeAngle}`);

        this.clearAllStructures();

        let fenceGroup;

        // Determine which fence building approach to use:
        // - Rectangular shapes (square, wide, tall): use simple buildSinglePlayerFences
        // - Polygon shapes (hexagon, octagon, diamond, lShape, custom): use buildPolygonBorderFences
        const isRectangularShape = ['square', 'wide', 'tall'].includes(fieldShape);

        if (!isRectangularShape && borderPoints && borderPoints.length >= 3) {
            console.log(`[BUILD] Using polygon fence building for ${fieldShape} shape`);
            fenceGroup = this.buildPolygonBorderFences(borderPoints, gate, pasture);
        } else {
            console.log('[BUILD] Using simplified rectangular fence building');
            fenceGroup = this.fenceConfigBuilder.buildSinglePlayerFences(bounds, gate, pasture);
        }

        this.scene.add(fenceGroup);
        this.structures.fences.push(fenceGroup);
        this._surfaceToTerrain(fenceGroup);

        // Build custom internal fences
        if (customFences && customFences.length > 0) {
            const customFenceGroup = this.buildCustomFences(customFences);
            this.scene.add(customFenceGroup);
            this.structures.fences.push(customFenceGroup);
            this._surfaceToTerrain(customFenceGroup);
        }

        // Add decorative elements
        this.addFieldDecorations(bounds);

        console.log('[OK] Sandbox structures built');
    }

    /**
     * Build border fences from polygon points
     * Uses a perimeter-based approach for accurate gate placement
     * @param {Array} points - Array of {x, z} points defining the polygon
     * @param {Object} gate - Gate configuration
     * @param {Object} pasture - Pasture configuration
     * @returns {THREE.Group} - Group containing all border fences
     */
    buildPolygonBorderFences(points, gate, pasture) {
        const group = new THREE.Group();
        group.name = 'PolygonBorderFences';

        const gateWidth = gate?.width || 8;
        const gateHalfWidth = gateWidth / 2;
        const gateX = gate?.position?.x ?? 0;
        const gateZ = gate?.position?.z ?? gate?.position?.y ?? 0;

        console.log(`[BUILD] Polygon border: ${points.length} points, gate at (${gateX}, ${gateZ})`);

        // STEP 1: Calculate cumulative perimeter distances for each vertex
        const edgeLengths = [];
        const cumulativeDistances = [0]; // Distance from start to each vertex
        let totalPerimeter = 0;

        for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];
            const length = Math.sqrt(
                Math.pow(end.x - start.x, 2) + Math.pow(end.z - start.z, 2)
            );
            edgeLengths.push(length);
            totalPerimeter += length;
            cumulativeDistances.push(totalPerimeter);
        }

        console.log(`[BUILD] Total perimeter: ${totalPerimeter.toFixed(1)}, edges: ${edgeLengths.map(l => l.toFixed(1)).join(', ')}`);

        // STEP 2: Find where the gate center projects onto the perimeter
        let gatePerimeterDist = 0;
        let gapStartPoint = null;
        let gapEndPoint = null;

        // Find the closest point on the perimeter to the gate position
        let minDist = Infinity;
        for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];
            const result = this.closestPointOnSegment(gateX, gateZ, start, end);
            const dist = Math.sqrt(Math.pow(gateX - result.x, 2) + Math.pow(gateZ - result.z, 2));

            if (dist < minDist) {
                minDist = dist;
                // Calculate perimeter distance to this point
                gatePerimeterDist = cumulativeDistances[i] + result.t * edgeLengths[i];
            }
        }

        // STEP 3: Calculate gap start and end as perimeter distances
        let gapStartDist = gatePerimeterDist - gateHalfWidth;
        let gapEndDist = gatePerimeterDist + gateHalfWidth;

        // Handle wrap-around (gap might cross the start/end point)
        if (gapStartDist < 0) gapStartDist += totalPerimeter;
        if (gapEndDist > totalPerimeter) gapEndDist -= totalPerimeter;

        console.log(`[BUILD] Gate perimeter: ${gatePerimeterDist.toFixed(1)}, gap: [${gapStartDist.toFixed(1)}, ${gapEndDist.toFixed(1)}]`);

        // Helper function to get point at a given perimeter distance
        const getPointAtDistance = (dist) => {
            // Normalize distance to [0, totalPerimeter)
            while (dist < 0) dist += totalPerimeter;
            while (dist >= totalPerimeter) dist -= totalPerimeter;

            for (let i = 0; i < points.length; i++) {
                if (dist <= cumulativeDistances[i + 1]) {
                    const start = points[i];
                    const end = points[(i + 1) % points.length];
                    const t = (dist - cumulativeDistances[i]) / edgeLengths[i];
                    return {
                        x: start.x + (end.x - start.x) * t,
                        z: start.z + (end.z - start.z) * t,
                        edgeIndex: i,
                        t: t
                    };
                }
            }
            return { ...points[0], edgeIndex: 0, t: 0 };
        };

        // Helper to check if a perimeter distance is inside the gap
        const isInGap = (dist) => {
            // Normalize
            while (dist < 0) dist += totalPerimeter;
            while (dist >= totalPerimeter) dist -= totalPerimeter;

            if (gapStartDist <= gapEndDist) {
                // Normal case: gap doesn't wrap around
                return dist >= gapStartDist && dist <= gapEndDist;
            } else {
                // Gap wraps around the start/end point
                return dist >= gapStartDist || dist <= gapEndDist;
            }
        };

        // Get actual gap endpoints
        gapStartPoint = getPointAtDistance(gapStartDist);
        gapEndPoint = getPointAtDistance(gapEndDist);

        console.log(`[BUILD] Gap start: (${gapStartPoint.x.toFixed(1)}, ${gapStartPoint.z.toFixed(1)}) on edge ${gapStartPoint.edgeIndex}`);
        console.log(`[BUILD] Gap end: (${gapEndPoint.x.toFixed(1)}, ${gapEndPoint.z.toFixed(1)}) on edge ${gapEndPoint.edgeIndex}`);

        // STEP 4: Build fence segments for each edge, excluding the gap
        for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];
            const edgeStartDist = cumulativeDistances[i];
            const edgeEndDist = cumulativeDistances[i + 1];
            const edgeLength = edgeLengths[i];

            if (edgeLength < 1) continue;

            // Determine what portions of this edge are outside the gap
            const segments = [];

            if (gapStartDist <= gapEndDist) {
                // Normal case: gap doesn't wrap
                if (edgeEndDist <= gapStartDist || edgeStartDist >= gapEndDist) {
                    // Edge is entirely outside gap
                    segments.push({ start: 0, end: 1 });
                } else if (edgeStartDist >= gapStartDist && edgeEndDist <= gapEndDist) {
                    // Edge is entirely inside gap - no fence
                } else if (edgeStartDist < gapStartDist && edgeEndDist > gapEndDist) {
                    // Gap is entirely within this edge - two segments
                    segments.push({ start: 0, end: (gapStartDist - edgeStartDist) / edgeLength });
                    segments.push({ start: (gapEndDist - edgeStartDist) / edgeLength, end: 1 });
                } else if (edgeStartDist < gapStartDist) {
                    // Gap starts within this edge
                    segments.push({ start: 0, end: (gapStartDist - edgeStartDist) / edgeLength });
                } else {
                    // Gap ends within this edge
                    segments.push({ start: (gapEndDist - edgeStartDist) / edgeLength, end: 1 });
                }
            } else {
                // Gap wraps around - more complex logic
                const inGapAtStart = isInGap(edgeStartDist);
                const inGapAtEnd = isInGap(edgeEndDist);

                if (!inGapAtStart && !inGapAtEnd) {
                    // Check if gap passes through this edge
                    if (edgeStartDist <= gapStartDist && edgeEndDist >= gapStartDist) {
                        // Gap starts in this edge
                        segments.push({ start: 0, end: (gapStartDist - edgeStartDist) / edgeLength });
                    } else if (edgeStartDist <= gapEndDist && edgeEndDist >= gapEndDist) {
                        // Gap ends in this edge
                        segments.push({ start: (gapEndDist - edgeStartDist) / edgeLength, end: 1 });
                    } else {
                        // Edge entirely outside gap
                        segments.push({ start: 0, end: 1 });
                    }
                } else if (inGapAtStart && inGapAtEnd) {
                    // Edge entirely in gap - no fence
                } else if (inGapAtStart) {
                    // Starts in gap, ends outside
                    segments.push({ start: (gapEndDist - edgeStartDist) / edgeLength, end: 1 });
                } else {
                    // Starts outside, ends in gap
                    segments.push({ start: 0, end: (gapStartDist - edgeStartDist) / edgeLength });
                }
            }

            // Build fence segments
            for (const seg of segments) {
                if (seg.end - seg.start < 0.02) continue; // Skip tiny segments

                const segStart = {
                    x: start.x + (end.x - start.x) * seg.start,
                    z: start.z + (end.z - start.z) * seg.start
                };
                const segEnd = {
                    x: start.x + (end.x - start.x) * seg.end,
                    z: start.z + (end.z - start.z) * seg.end
                };

                const fence = this.buildFenceSegment(segStart, segEnd);
                if (fence) group.add(fence);
            }
        }

        // STEP 5: Place the gate structure
        const gapCenter = {
            x: (gapStartPoint.x + gapEndPoint.x) / 2,
            z: (gapStartPoint.z + gapEndPoint.z) / 2
        };
        const actualGateAngle = Math.atan2(
            gapEndPoint.z - gapStartPoint.z,
            gapEndPoint.x - gapStartPoint.x
        );

        const gateStructure = this.fencePresets.createGateStructure(gateWidth, 'horizontal');
        gateStructure.position.set(gapCenter.x, 0, gapCenter.z);
        gateStructure.rotation.y = -actualGateAngle;
        group.add(gateStructure);

        console.log(`[BUILD] Gate placed at (${gapCenter.x.toFixed(1)}, ${gapCenter.z.toFixed(1)}), angle=${(actualGateAngle * 180 / Math.PI).toFixed(1)}°`);

        // STEP 6: Build pasture fencing - SIMPLE approach like classic mode
        // The pasture attaches directly at the gate gap - NO front fence needed
        // Just 3 sides: two extending outward from gate, one back fence
        if (pasture) {
            const pastureDepth = pasture.maxZ - pasture.minZ;
            const pastureWidth = pasture.maxX - pasture.minX;

            // Calculate the direction perpendicular to the gate edge (pointing outward)
            // The gate edge goes from gapStartPoint to gapEndPoint
            const gateEdgeDx = gapEndPoint.x - gapStartPoint.x;
            const gateEdgeDz = gapEndPoint.z - gapStartPoint.z;
            const gateEdgeLength = Math.sqrt(gateEdgeDx * gateEdgeDx + gateEdgeDz * gateEdgeDz);

            // Perpendicular direction (outward from field)
            // Rotate 90 degrees: (dx, dz) -> (dz, -dx)
            let perpDx = gateEdgeDz / gateEdgeLength;
            let perpDz = -gateEdgeDx / gateEdgeLength;

            // Determine which direction is "outward" by testing if a point in that direction
            // is inside or outside the polygon
            const testDist = 5;
            const testX = gapCenter.x + perpDx * testDist;
            const testZ = gapCenter.z + perpDz * testDist;

            // If test point is INSIDE the polygon, we're pointing inward - flip it
            if (isPointInPolygon(testX, testZ, points)) {
                perpDx = -perpDx;
                perpDz = -perpDz;
                console.log(`[BUILD] Flipped pasture direction - was pointing into polygon`);
            }

            // Calculate the gate edge direction (normalized)
            const edgeDirX = gateEdgeDx / gateEdgeLength;
            const edgeDirZ = gateEdgeDz / gateEdgeLength;

            // Use FULL pasture width, centered on gate center
            const halfPastureWidth = pastureWidth / 2;

            // Calculate front corners based on full pasture width, centered on gate
            const frontLeft = {
                x: gapCenter.x - edgeDirX * halfPastureWidth,
                z: gapCenter.z - edgeDirZ * halfPastureWidth
            };
            const frontRight = {
                x: gapCenter.x + edgeDirX * halfPastureWidth,
                z: gapCenter.z + edgeDirZ * halfPastureWidth
            };

            // Calculate back corners by extending perpendicular from front corners
            const backLeft = {
                x: frontLeft.x + perpDx * pastureDepth,
                z: frontLeft.z + perpDz * pastureDepth
            };
            const backRight = {
                x: frontRight.x + perpDx * pastureDepth,
                z: frontRight.z + perpDz * pastureDepth
            };

            // Left side fence: from front left to back left
            const leftSide = this.buildFenceSegment(frontLeft, backLeft);
            if (leftSide) group.add(leftSide);

            // Right side fence: from front right to back right
            const rightSide = this.buildFenceSegment(frontRight, backRight);
            if (rightSide) group.add(rightSide);

            // Back fence: connects the two back corners
            const back = this.buildFenceSegment(backLeft, backRight);
            if (back) group.add(back);

            console.log(`[BUILD] Pasture built: 3-sided pen, width=${pastureWidth}, depth=${pastureDepth}`);
        }

        console.log(`[BUILD] Built polygon border with ${points.length} edges`);
        return group;
    }

    /**
     * Build a single fence segment between two points
     */
    buildFenceSegment(start, end) {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dz * dz);

        if (length < 1) return null;

        // Calculate angle from start to end
        const angle = Math.atan2(dz, dx);

        // Always create as horizontal segment (oriented along X axis)
        // Then rotate to match the actual angle
        const segment = this.fencePresets.createBorderSegment(length, 'horizontal');

        // Position at midpoint
        const midX = (start.x + end.x) / 2;
        const midZ = (start.z + end.z) / 2;
        segment.position.set(midX, 0, midZ);

        // Rotate to match the actual angle
        // The horizontal segment is along the X axis, so we rotate by the angle
        segment.rotation.y = -angle;

        return segment;
    }

    /**
     * Find closest point on a line segment
     */
    closestPointOnSegment(x, z, start, end) {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dz * dz);

        if (length === 0) {
            return { x: start.x, z: start.z, t: 0 };
        }

        const t = Math.max(0, Math.min(1,
            ((x - start.x) * dx + (z - start.z) * dz) / (length * length)
        ));

        return {
            x: start.x + t * dx,
            z: start.z + t * dz,
            t: t
        };
    }

    /**
     * Build custom fence segments from sandbox configuration
     * @param {Array} fenceSegments - Array of fence segment definitions
     * @returns {THREE.Group} - Group containing all custom fences
     */
    buildCustomFences(fenceSegments) {
        const group = new THREE.Group();
        group.name = 'CustomFences';

        fenceSegments.forEach((segment) => {
            const { start, end, type } = segment;

            // Calculate fence properties
            const dx = end.x - start.x;
            const dz = end.z - start.z;
            const length = Math.sqrt(dx * dx + dz * dz);

            if (length < 1) return; // Skip very short fences

            // Calculate angle from start to end
            const angle = Math.atan2(dz, dx);

            // Create fence segment using presets
            // Always create as horizontal segment, then rotate to match the actual angle
            // This matches how buildFenceSegment works for border fences
            let fenceSegmentGroup;

            if (type === 'gate') {
                // Create a gate structure
                fenceSegmentGroup = this.fencePresets.createGateStructure(
                    Math.min(length, 10), // Gates are smaller
                    'horizontal',
                    { color: 0xfbbf24 }
                );
            } else {
                // Create a regular fence segment
                fenceSegmentGroup = this.fencePresets.createBorderSegment(length, 'horizontal');
            }

            // Position at midpoint
            const midX = (start.x + end.x) / 2;
            const midZ = (start.z + end.z) / 2;
            fenceSegmentGroup.position.set(midX, 0, midZ);

            // Rotate to match the actual angle (consistent with buildFenceSegment)
            fenceSegmentGroup.rotation.y = -angle;

            group.add(fenceSegmentGroup);
        });

        console.log(`[BUILD] Created ${fenceSegments.length} custom fence segments`);
        return group;
    }
    
    /**
     * Build structures for competitive multiplayer mode
     */
    buildCompetitiveStructures(bounds, competitiveGates) {
        console.log(`[BUILD] Building competitive structures for ${competitiveGates.length} players`);
        
        this.clearAllStructures();
        
        // Build fences with multiple gates
        const fenceGroup = this.fenceConfigBuilder.buildCompetitiveFences(bounds, competitiveGates);
        this.scene.add(fenceGroup);
        this.structures.fences.push(fenceGroup);
        this._surfaceToTerrain(fenceGroup);

        // Create individual gate markers and pastures
        competitiveGates.forEach(gate => {
            this.createCompetitiveGateMarker(gate);
        });

        // Add field decorations
        this.addFieldDecorations(bounds);
        
        console.log('[OK] Competitive structures built');
    }
    
    
    /**
     * Create visual marker for competitive gate
     */
    createCompetitiveGateMarker(_gate) {
        // No additional markers needed - gates have their own visual identity
        // Player colors are already shown on the gate structures themselves
    }
    
    /**
     * Create player label sprite
     */
    createPlayerLabel(x, y, z, playerId, parent) {
        // Create canvas for text
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        
        // Draw player label
        context.fillStyle = 'white';
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`P${playerId}`, 64, 32);
        
        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(x, y, z);
        sprite.scale.set(2, 1, 1);
        
        parent.add(sprite);
    }
    
    /**
     * Add decorative elements to the field
     */
    addFieldDecorations(bounds) {
        // Corner flags
        const cornerPositions = [
            { x: bounds.minX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.maxZ },
            { x: bounds.minX, z: bounds.maxZ }
        ];
        
        cornerPositions.forEach(pos => {
            const flag = this.createCornerFlag(pos.x, pos.z);
            // Surface the whole flag (pole + flag) as one unit so they stay
            // anchored together on hills.
            flag.userData.surfaceToTerrain = true;
            this.scene.add(flag);
            this.structures.decorations.push(flag);
            this._surfaceToTerrain(flag);
        });
    }
    
    /**
     * Create corner flag decoration
     */
    createCornerFlag(x, z) {
        const group = new THREE.Group();
        
        // Flag pole
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 2, 6),
            new THREE.MeshPhongMaterial({ color: 0xffffff })
        );
        pole.position.y = 1;
        group.add(pole);
        
        // Flag
        const flagGeometry = new THREE.PlaneGeometry(0.5, 0.3);
        const flagMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide,
            emissive: 0x440000,
            emissiveIntensity: 0.1
        });
        
        const flag = new THREE.Mesh(flagGeometry, flagMaterial);
        flag.position.set(0.25, 1.7, 0);
        group.add(flag);
        
        group.position.set(x, 0, z);
        return group;
    }
    
    
    /**
     * Create optimized fence system using instancing
     * For very large fields or many fences
     */
    createOptimizedFenceSystem(fenceSegments) {
        return this.fencePresets.createInstancedFenceSystem(fenceSegments);
    }
    
    /**
     * Update structures (for animations, etc)
     */
    update(_deltaTime) {
        // Animate flags waving
        this.structures.decorations.forEach(decoration => {
            decoration.traverse(child => {
                if (child.geometry && child.geometry.type === 'PlaneGeometry' && child.material.color.r > 0.5) {
                    // Simple flag waving animation
                    child.rotation.z = Math.sin(Date.now() * 0.002) * 0.1;
                }
            });
        });
    }

    /**
     * Estimate total triangle count across all built structures
     * (fences + gates + pastures + decorations). Called once post-build;
     * includes all mesh children inside fence/gate/flag groups.
     * InstancedMesh instances are multiplied by instance count.
     * @returns {number}
     */
    getTotalTriangleEstimate() {
        const allStructures = Object.values(this.structures).flat();
        return Math.round(sumObjectTreeTriangles(allStructures));
    }
}
