// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { configureGLTFLoader } from './TerrainBuilder.js';
import { mulberry32 } from '../shared/Random.js';
import { applyRailSag, writeFenceVertexColors } from './world/fenceWear.js';
import {
    attachGateLeafController,
    buildAuthoredGateLeaves,
    GATE_LEAF_INITIAL_OPEN_FRACTION,
} from './world/gateLeafController.js';
import { applyGatePostRim, GATE_RIM_MATERIALS_KEY } from './world/gateThreshold.js';

/**
 * FencePresets - Modular fence asset system for reusable fence components
 *
 * Features:
 * - Standalone fence segments (borders, gates, pens)
 * - Proper handling of multiplayer configurations
 * - Optimized geometry with instancing support
 * - Configurable materials and colors
 * - GLB model support for fence components
 */

/**
 * Per-post jitter budget (Cycle 114 grounding pass).
 *
 * A run whose posts are all the same height, all perfectly plumb and all
 * facing the same way reads as a picket line rather than as something a
 * farmer dug into a field. Yaw alone is not enough: it is the lean that
 * actually shows, because a post seen from the side is close to
 * rotationally symmetric about its own axis.
 *
 * The caps are set by the RAILS, not by taste. Rails span between adjacent
 * post CENTRES at fixed heights (0.5 / 1.2 / 1.9) and do not follow a post's
 * lean or its top, so:
 *
 * - LEAN_MAX must keep the leaned post's cross-section over the top rail's
 *   attachment point. The shipped post is ~0.42m square, so its half-width is
 *   0.21m and the geometric limit at the 1.9m top rail is
 *   atan(0.21 / 1.9) = 0.110 rad. We sit at about a third of that.
 * - HEIGHT_MIN must keep the shortest post taller than the top rail. The
 *   shipped post is 2.18m, so 0.95 * 2.18 = 2.07m against a top rail whose
 *   upper edge lands near 1.95m.
 *
 * Widen either of these and the rails start detaching on long runs, which is
 * the failure the phase was told to avoid.
 */
const POST_YAW_MAX = 0.20;      // rad, +/- : the post's facing about its own axis
const POST_LEAN_MAX = 0.038;    // rad, +/- : ~2.2 degrees off plumb
const POST_HEIGHT_MIN = 0.95;   // multiplier on the authored post height
const POST_HEIGHT_MAX = 1.10;

/**
 * The procedural swing leaf's open yaw, carried over unchanged from the
 * homestead fallback door it replaces (Cycle 65). Roughly 104 degrees: far
 * enough past square that the leaf clearly reads open from the aerial camera,
 * short enough that it does not fold back onto the fence run behind it.
 */
const PROCEDURAL_GATE_LEAF_OPEN_ANGLE = -Math.PI * 0.58;

/** Node name for the procedural single-leaf door. */
const PROCEDURAL_GATE_LEAF_NAME = 'GateLeaf';

/**
 * Node name for the fallback ground plane `addThresholdEffect` lays under a gate.
 *
 * Exported because `tests/fence-presets.spec.js` used to locate this mesh by
 * `geometry.type === 'PlaneGeometry'`, in two places, and a geometry type is
 * not an identity. It matches any plane that ever lands in a gate group, it
 * matches nothing at all the moment this effect restyles, and one of the two
 * call sites asserted the mesh was ABSENT - so a change that deleted the
 * threshold outright would have made that assertion pass while the other threw.
 * A name the spec imports from here fails at both sites, at import, the moment
 * this stops existing.
 *
 * Cycle 116 note: this effect is unreachable on every shipping scene.
 * `createGateStructure` returns early with the authored assembly before it, and
 * `js/StructureBuilder.js` never calls `createGateStructure` at all on a scene
 * with a corral. The cycle's ground threshold arc belongs to the cue, not to
 * the gate group, which is what lets it draw on all four scenes; this stays as
 * the no-asset fallback's own marker.
 */
export const GATE_FALLBACK_THRESHOLD_NAME = 'GateFallbackThreshold';

/**
 * Bands along a procedural rail's long axis (Cycle 115 P2).
 *
 * Matches `FENCE_RAIL.segments` in `tools/bake-fence/kitPieces.mjs`, so the
 * fallback resolves the same droop the baked rail does. Below four the
 * parabola starts reading as a chevron; above it there is nothing left to see
 * on a 60mm curve.
 */
const RAIL_SAG_SEGMENTS = 4;

/** FNV-1a. Turns a stable run key into a 32-bit seed for mulberry32. */
function hashString32(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * @typedef {Object} FencePostJitter
 * @property {number} yaw          Extra rotation about Y, on top of the run axis.
 * @property {number} leanX        Rotation about X, radians.
 * @property {number} leanZ        Rotation about Z, radians.
 * @property {number} heightScale  Multiplier on the post's authored height.
 */

/**
 * Deterministic per-post transform jitter for one fence run.
 *
 * Seeded off a stable string, never `Math.random()`, so a run is identical on
 * every load and identical between clients. The key composes the caller's
 * salt with the run's own intrinsic parameters (orientation and length), which
 * is what makes it stable across a scene rebuild: nothing here counts calls or
 * reads a mutable instance counter, so `clearAllStructures()` followed by a
 * fresh build reproduces the same fence.
 *
 * Draws are arithmetic-only (no trig), so the sequence is bit-identical on
 * every engine. The lean is drawn in the unit square and clamped into the unit
 * disc: drawing the two lean axes independently and leaving them there would
 * let a corner draw lean LEAN_MAX * sqrt(2) and would bias every post toward
 * one of the four diagonals.
 *
 * @param {string} seedKey   Stable identity for this run.
 * @param {number} postCount
 * @returns {FencePostJitter[]}
 */
export function createFencePostJitter(seedKey, postCount) {
    const rng = mulberry32(hashString32(`fence-post-jitter:${seedKey}`));
    const jitter = [];
    for (let i = 0; i < postCount; i++) {
        const yaw = (rng() * 2 - 1) * POST_YAW_MAX;
        let lx = rng() * 2 - 1;
        let lz = rng() * 2 - 1;
        const len2 = lx * lx + lz * lz;
        if (len2 > 1) {
            const inv = 1 / Math.sqrt(len2);
            lx *= inv;
            lz *= inv;
        }
        jitter.push({
            yaw,
            leanX: lx * POST_LEAN_MAX,
            leanZ: lz * POST_LEAN_MAX,
            heightScale: POST_HEIGHT_MIN + rng() * (POST_HEIGHT_MAX - POST_HEIGHT_MIN)
        });
    }
    return jitter;
}

/**
 * The run key a segment jitters against. The caller's salt only disambiguates
 * runs that would otherwise collide: two runs with the same orientation and
 * the same length (the pen's two side fences, the two halves of a centred gate
 * run, a competitive field's east and west borders) would otherwise draw the
 * same posts in the same order and read as a repeat.
 * @param {string} salt
 * @param {string} orientation
 * @param {number} length
 */
function fenceRunSeedKey(salt, orientation, length) {
    return `${salt}:${orientation}:${length.toFixed(3)}`;
}

export class FencePresets {
    constructor() {
        // Standard dimensions
        this.fenceHeight = 2.5;
        this.postRadius = 0.12;
        this.railHeight = 0.15;
        this.railWidth = 0.1;
        this.postSpacing = 5; // Distance between posts

        // GLB Model loader (Draco + Meshopt decoders for Phase A Unit B compressed GLBs).
        this.loader = configureGLTFLoader(new GLTFLoader());
        // The four pieces actually assembled at runtime. All four come from a
        // single shared-texture kit GLB (Fence_Kit) - see loadModels().
        this.models = {
            fencePost: null,
            fenceRail: null,
            gatePost: null,
            gateArch: null,
            gateAssembly: null
        };
        this.modelsLoaded = false;
        this.useGLBModels = true; // Toggle to use GLB vs procedural

        // Materials - warm wood tones that contrast with green grass.
        //
        // `post` and `rail` read vertex colours (Cycle 115 P2) because the
        // baked kit now carries its weathering in COLOR_0 and this fallback has
        // to look like the same fence. Anything drawn with either of them MUST
        // carry a `color` attribute: three declares the attribute either way,
        // so a geometry without one renders black rather than untinted. The two
        // cached geometries below are given theirs on the next lines, and
        // every per-call rail geometry gets one as it is built.
        this.materials = {
            post: new THREE.MeshPhongMaterial({
                color: 0x8B7355,  // Warm tan/beige wood
                emissive: 0x2a1a08,
                emissiveIntensity: 0.15,
                shininess: 5,
                vertexColors: true
            }),
            rail: new THREE.MeshPhongMaterial({
                color: 0x9C8465,  // Lighter warm wood
                emissive: 0x3a2a10,
                emissiveIntensity: 0.12,
                shininess: 8,
                vertexColors: true
            }),
            gate: new THREE.MeshPhongMaterial({
                color: 0xA89070,  // Even lighter for gates
                emissive: 0x4a3a18,
                emissiveIntensity: 0.18,
                shininess: 10
            }),
            // The procedural swing leaf's timber. Its colour is inherited
            // verbatim from the homestead fallback door (Cycle 65) so the
            // no-asset path looks identical after the Cycle 115 promotion.
            // Shared rather than built per call because clearAllStructures
            // deliberately disposes geometry and never materials - a per-call
            // material would leak one instance per scene load.
            gateLeaf: new THREE.MeshLambertMaterial({ color: 0x6b4a30 })
        };

        // Cached geometries (fallback for when GLB not loaded)
        this.geometries = {
            post: new THREE.CylinderGeometry(this.postRadius, this.postRadius, this.fenceHeight, 8),
            rail: new THREE.BoxGeometry(this.postSpacing, this.railHeight, this.railWidth)
        };
        // The cylinder is centred on its own origin, so its foot is half the
        // authored height below it. Pass that as the ground reference and the
        // gradient lands in the same place it does on the baked post.
        writeFenceVertexColors(this.geometries.post, {
            footY: -this.fenceHeight / 2,
            BufferAttributeCtor: THREE.BufferAttribute
        });
        // A rail's origin is its own centre, not the ground, so it has no
        // height to weather against and gets underside darkening only.
        writeFenceVertexColors(this.geometries.rail, {
            footY: null,
            BufferAttributeCtor: THREE.BufferAttribute
        });
    }

    /**
     * Load GLB fence models
     * @returns {Promise} Promise that resolves when all models are loaded
     */
    async loadModels() {
        if (this.modelsLoaded) return;

        // One shared-texture kit GLB instead of four standalone files that each
        // re-embedded the same wood texture set. The kit's default scene holds
        // four identity-wrapper nodes; cloning a wrapper reproduces exactly what
        // cloning the old per-file gltf.scene produced.
        //
        // v2 is baked from source by `tools/bake-fence.mjs` (Cycle 115 P1): a
        // real 45 degree weather chamfer, a controllable ring count, and the
        // COLOR_0 channel the weathering in `js/world/fenceWear.js` needs. v1
        // was an opaque binary with no authoring source at all, which is what
        // blocked all three of the cycle's asks. It is still on disk and still
        // in `assets/_originals`, so reverting is this one constant. The palette
        // texture is the SAME 32x4 image, lifted verbatim out of v1 by the bake.
        const KIT_PATH = 'assets/models/Fence_Kit-v2.0.0.glb';
        const GATE_PATH = 'assets/models/Gate_Assembly-v1.0.0.glb';
        const kitNodeNames = {
            fencePost: 'Fence_Post',
            fenceRail: 'Fence_Rail',
            gatePost: 'Gate_Post',
            gateArch: 'Gate_Arch'
        };

        try {
            const gltf = await this.loader.loadAsync(KIT_PATH);
            for (const [name, nodeName] of Object.entries(kitNodeNames)) {
                const node = gltf.scene.getObjectByName(nodeName);
                if (!node) {
                    console.warn(`[WARN] Fence kit missing node: ${nodeName}`);
                    continue;
                }
                // Enable shadows on every mesh in the piece.
                node.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                this.models[name] = node;
                console.log(`[OK] Loaded fence kit piece: ${name}`);
            }
        } catch (err) {
            console.warn('[WARN] Failed to load fence kit:', err);
        }

        try {
            const gltf = await this.loader.loadAsync(GATE_PATH);
            const gate = gltf.scene.getObjectByName('Gate_Assembly') || gltf.scene;
            gate.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            gate.userData.authoredWidth = 8;
            this.models.gateAssembly = gate;
            console.log('[OK] Loaded gate assembly');
        } catch (err) {
            console.warn('[WARN] Failed to load gate assembly:', err);
        }

        this.modelsLoaded = true;
        console.log('[OK] Fence models loaded');
    }

    /**
     * Clone a GLB model for use
     * @param {string} modelName - Name of the model to clone
     * @returns {THREE.Group|null} Cloned model or null if not available
     */
    cloneModel(modelName) {
        if (!this.models[modelName]) return null;
        return this.models[modelName].clone();
    }

    _getSingleMeshSource(modelName) {
        const model = this.models[modelName];
        if (!model) return null;

        const meshes = [];
        model.traverse(child => {
            if (child.isMesh) meshes.push(child);
        });
        if (meshes.length !== 1) return null;

        const mesh = meshes[0];
        model.updateMatrixWorld(true);
        mesh.updateMatrixWorld(true);
        const localMatrix = new THREE.Matrix4()
            .copy(model.matrixWorld)
            .invert()
            .multiply(mesh.matrixWorld);
        return { mesh, localMatrix };
    }
    
    /**
     * Create a straight border fence segment
     * @param {number} length - Length of the border
     * @param {string} orientation - 'horizontal' or 'vertical'
     * @param {Object} [options] - Additional options
     * @param {string} [options.seedKey] - Salt disambiguating this run's post
     *   jitter from another run with the same orientation and length.
     * @returns {THREE.Group} - Border fence group
     */
    createBorderSegment(length, orientation = 'horizontal', options = {}) {
        const group = new THREE.Group();
        const seedKey = fenceRunSeedKey(options.seedKey ?? 'run', orientation, length);

        // Use GLB posts and rails if available (builds fence from components)
        if (this.useGLBModels && this.models.fencePost && this.models.fenceRail) {
            // Post spacing - 5 units between posts
            const postSpacing = this.postSpacing;
            const postCount = Math.ceil(length / postSpacing) + 1;
            const actualSpacing = length / (postCount - 1);
            const postJitter = createFencePostJitter(seedKey, postCount);

            // The rail model is 1 unit long, centered at origin (for easy scaling)
            const railModelLength = 1.0;
            const railHeights = [0.5, 1.2, 1.9];
            const postSource = this._getSingleMeshSource('fencePost');
            const railSource = this._getSingleMeshSource('fenceRail');

            if (postSource && railSource) {
                group.name = 'FenceSegmentGLBInstanced';
                // `postJitter` rides the spec because the instanced path builds
                // one matrix per post inside StructureBuilder._buildInstancedFenceSegment;
                // a count alone cannot express a per-instance transform. The
                // consumer treats it as optional and falls back to the old
                // uniform post if it is absent.
                group.userData.fenceInstancingSpec = {
                    length,
                    orientation,
                    postCount,
                    actualSpacing,
                    railHeights,
                    railModelLength,
                    postSource,
                    railSource,
                    postJitter
                };
                return group;
            }

            // Create posts. The GLB post wrapper's origin is authored at
            // ground contact (cycle105-validation/fence-kiln-spec.md), so a Y
            // scale and a lean both pivot about the post's foot: the top moves,
            // the buried end does not.
            const baseYaw = orientation === 'horizontal' ? 0 : Math.PI / 2;
            for (let i = 0; i < postCount; i++) {
                const post = this.cloneModel('fencePost');
                if (post) {
                    const jitter = postJitter[i];
                    if (orientation === 'horizontal') {
                        post.position.x = i * actualSpacing - length / 2;
                    } else {
                        post.position.z = i * actualSpacing - length / 2;
                    }
                    post.rotation.set(jitter.leanX, baseYaw + jitter.yaw, jitter.leanZ);
                    post.scale.y = jitter.heightScale;
                    post.userData.surfaceToTerrain = true;
                    group.add(post);
                }
            }

            // Create rails between posts (3 levels based on fence segment model).
            //
            // These rails do NOT sag (Cycle 115 P2). Cloning a wrapper shares
            // the source geometry with every other clone, so a droop written
            // here would land on the kit itself and on every other segment.
            // This branch is only reached when a kit piece is not a single
            // mesh, which the kit contract in
            // cycle105-validation/fence-kiln-spec.md forbids and the baked kit
            // satisfies, so in practice `_buildInstancedFenceSegment` owns the
            // rails and sags its own per-segment clone.
            for (const height of railHeights) {
                for (let i = 0; i < postCount - 1; i++) {
                    const rail = this.cloneModel('fenceRail');
                    if (rail) {
                        // Scale rail to match actual spacing between posts
                        const scaleX = actualSpacing / railModelLength;
                        rail.scale.set(scaleX, 1, 1);

                        if (orientation === 'horizontal') {
                            rail.position.set(
                                i * actualSpacing + actualSpacing / 2 - length / 2,
                                height,
                                0
                            );
                        } else {
                            rail.rotation.y = Math.PI / 2;
                            rail.position.set(
                                0,
                                height,
                                i * actualSpacing + actualSpacing / 2 - length / 2
                            );
                        }
                        rail.userData.surfaceToTerrain = true;
                        // Slope-along-terrain metadata: _surfaceToTerrain reads
                        // this to sample heightfield at both endpoints and
                        // re-orient the rail so it actually spans the slope
                        // between adjacent posts (instead of staying horizontal
                        // and stair-stepping over hills).
                        rail.userData.railSpan = {
                            halfLen: actualSpacing / 2,
                            axis: orientation,   // 'horizontal' = ±x, 'vertical' = ±z
                            geomAxis: 'x',       // GLB rail's long axis is local +X
                            baseY: height
                        };
                        group.add(rail);
                    }
                }
            }

            return group;
        }

        // Fallback to procedural geometry
        const postCount = Math.ceil(length / this.postSpacing) + 1;
        const actualSpacing = length / (postCount - 1);
        const postJitter = createFencePostJitter(seedKey, postCount);

        // Create posts. Same jitter as the GLB paths, so a machine without the
        // kit sees the same fence shape. One difference in the maths: the
        // fallback cylinder is centred on its OWN origin rather than on its
        // foot, so scaling and leaning about that origin would swing the buried
        // end out from under the post. Placing the centre at foot + R*(0,
        // half, 0) puts the foot back on its nominal (x, z) exactly.
        const foot = new THREE.Vector3();
        const centreOffset = new THREE.Vector3();
        const postEuler = new THREE.Euler();
        for (let i = 0; i < postCount; i++) {
            const jitter = postJitter[i];
            const post = new THREE.Mesh(this.geometries.post, this.materials.post);
            const offset = i * actualSpacing - length / 2;
            if (orientation === 'horizontal') {
                foot.set(offset, 0, 0);
            } else {
                foot.set(0, 0, offset);
            }

            post.scale.y = jitter.heightScale;
            postEuler.set(jitter.leanX, jitter.yaw, jitter.leanZ);
            post.rotation.copy(postEuler);
            centreOffset
                .set(0, (this.fenceHeight * jitter.heightScale) / 2, 0)
                .applyEuler(postEuler);
            post.position.copy(foot).add(centreOffset);

            post.castShadow = true;
            post.receiveShadow = true;
            post.userData.surfaceToTerrain = true;
            group.add(post);
        }

        // Create rails (3 levels). Geometry's long axis is X for horizontal
        // and Z for vertical orientation; tagged geomAxis lets the slope
        // post-process build the right base-axis quaternion.
        //
        // Cycle 115 P2: each rail is segmented along its long axis and droops.
        // A plain box has vertices only at its two ends, which is exactly where
        // a catenary is flat, so an unsegmented box cannot express sag at all.
        // Four bands is the same budget the baked rail carries.
        const railLevels = [0.5, 1.2, 1.9];
        const geomAxis = orientation === 'horizontal' ? 'x' : 'z';
        for (let level of railLevels) {
            for (let i = 0; i < postCount - 1; i++) {
                const railGeo = new THREE.BoxGeometry(
                    orientation === 'horizontal' ? actualSpacing : this.railWidth,
                    this.railHeight,
                    orientation === 'horizontal' ? this.railWidth : actualSpacing,
                    orientation === 'horizontal' ? RAIL_SAG_SEGMENTS : 1,
                    1,
                    orientation === 'horizontal' ? 1 : RAIL_SAG_SEGMENTS
                );
                // Colours before sag: the underside term reads the normal, and
                // the sag deliberately leaves normals alone.
                writeFenceVertexColors(railGeo, { footY: null, BufferAttributeCtor: THREE.BufferAttribute });
                // Boxes are authored in metres, so one geometry unit is one
                // metre and the sag needs no unit conversion here.
                applyRailSag(railGeo, actualSpacing, { longAxis: geomAxis, metresPerUnit: 1 });
                const rail = new THREE.Mesh(railGeo, this.materials.rail);

                if (orientation === 'horizontal') {
                    rail.position.set(
                        i * actualSpacing + actualSpacing / 2 - length / 2,
                        level,
                        0
                    );
                } else {
                    rail.position.set(
                        0,
                        level,
                        i * actualSpacing + actualSpacing / 2 - length / 2
                    );
                }

                rail.castShadow = true;
                rail.receiveShadow = true;
                rail.userData.surfaceToTerrain = true;
                rail.userData.railSpan = {
                    halfLen: actualSpacing / 2,
                    axis: orientation,
                    geomAxis,
                    baseY: level
                };
                group.add(rail);
            }
        }

        return group;
    }
    
    /**
     * Create a border segment with a gate opening
     * @param {number} length - Total length of the border
     * @param {number} gateWidth - Width of the gate opening
     * @param {number} gatePosition - Position of gate center (0 = center of border)
     * @param {string} orientation - 'horizontal' or 'vertical'
     * @param {Object} gateConfig - Gate configuration (color, playerId, etc)
     * @returns {THREE.Group} - Border with gate group
     */
    createBorderWithGate(length, gateWidth = 8, gatePosition = 0, orientation = 'horizontal', gateConfig = {}) {
        const group = new THREE.Group();
        
        // Calculate segment positions
        const gateStart = gatePosition - gateWidth/2;
        const gateEnd = gatePosition + gateWidth/2;
        
        // Create left segment. The two halves of a centred gate run have the
        // SAME length, so without distinct salts their post jitter would mirror
        // across the gate - the one place a player stands close enough to read
        // two posts against each other. The gate's own position and (in
        // competitive layouts) its compass direction keep two opposite borders
        // of the same length apart as well.
        const runId = `${gateConfig.direction ?? ''}@${gatePosition}`;
        if (gateStart > -length/2) {
            const leftLength = gateStart + length/2;
            const leftSegment = this.createBorderSegment(leftLength, orientation, {
                seedKey: `gate-left${runId}`
            });

            if (orientation === 'horizontal') {
                leftSegment.position.x = -length/2 + leftLength/2;
            } else {
                leftSegment.position.z = -length/2 + leftLength/2;
            }
            
            group.add(leftSegment);
        }
        
        // Create right segment
        if (gateEnd < length/2) {
            const rightLength = length/2 - gateEnd;
            const rightSegment = this.createBorderSegment(rightLength, orientation, {
                seedKey: `gate-right${runId}`
            });

            if (orientation === 'horizontal') {
                rightSegment.position.x = gateEnd + rightLength/2;
            } else {
                rightSegment.position.z = gateEnd + rightLength/2;
            }
            
            group.add(rightSegment);
        }
        
        // Create gate structure
        const gateGroup = this.createGateStructure(gateWidth, orientation, gateConfig);
        if (orientation === 'horizontal') {
            gateGroup.position.x = gatePosition;
        } else {
            gateGroup.position.z = gatePosition;
        }
        // Surface gate as one unit so the two posts + arch + threshold stay
        // co-planar on slopes (don't sample per-child or the gate would shear).
        gateGroup.userData.surfaceToTerrain = true;
        group.add(gateGroup);

        return group;
    }
    
    /**
     * A single procedural swing leaf: three horizontal rails + a hinge stile +
     * a far stile, all in the leaf's local frame with the hinge at local x = 0
     * so the group swings about Y. Rails span local x in [0, width].
     *
     * Promoted out of `StructureBuilder._buildGateDoor` in Cycle 115 P3.
     * It used to be the homestead's private no-asset fallback, which meant a
     * scene whose gate GLB failed to load got a gate with no door at all and
     * nothing to hinge. Now both fallback branches below build one, so a
     * consumer that opens a gate gets a visible result whether or not the
     * authored assembly loaded.
     *
     * @param {number} width - Width of the gate opening
     * @param {string} orientation - 'horizontal' or 'vertical'
     * @returns {import('./world/gateLeafController.js').GateLeaf}
     */
    createProceduralGateLeaf(width, orientation = 'horizontal') {
        const leaf = new THREE.Group();
        leaf.name = PROCEDURAL_GATE_LEAF_NAME;
        const mat = this.materials.gateLeaf;
        const len = Math.max(1, width - 0.4);
        for (const h of [0.7, 1.5, 2.3]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.13, 0.1), mat);
            rail.position.set(0.2 + len / 2, h, 0);
            rail.castShadow = true;
            leaf.add(rail);
        }
        const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.8, 0.16), mat);
        hinge.position.set(0.2, 1.4, 0);
        hinge.castShadow = true;
        leaf.add(hinge);
        const farStile = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.5, 0.14), mat);
        farStile.position.set(width - 0.2, 1.3, 0);
        farStile.castShadow = true;
        leaf.add(farStile);

        // Closed is whatever yaw lays the leaf across the opening, which is NOT
        // 0 for a vertical gate: the leaf's geometry runs along local +X, so a
        // gate whose opening runs along Z needs the hinge parked at +width/2
        // and the leaf turned a quarter turn to reach back across the gap. The
        // controller stores absolute angles precisely so this composes.
        const closed = orientation === 'vertical' ? Math.PI / 2 : 0;
        if (orientation === 'vertical') {
            leaf.position.set(0, 0, width / 2);
        } else {
            leaf.position.set(-width / 2, 0, 0);
        }
        return { node: leaf, closed, open: closed + PROCEDURAL_GATE_LEAF_OPEN_ANGLE };
    }

    /**
     * Create a gate structure
     *
     * Cycle 115 P3: the returned group always carries a leaf controller on
     * `userData.gateLeafController`, on every branch below. Read it with
     * `getGateLeafController(group)`; it is never null, so a consumer that
     * wants to pose a gate needs no branch on which asset loaded. The gate
     * builds at `GATE_LEAF_INITIAL_OPEN_FRACTION`, which is OPEN.
     *
     * That renders identically to the bug this phase replaced, and the
     * difference is worth stating precisely because it is not visible in a
     * screenshot: the pose is now the CONTROLLER'S. It is written from
     * `leaf.open`, decomposed per leaf, rather than being whatever quaternion
     * the GLB happened to bake and nothing ever touched. Before this phase only
     * Newsheepdogland's homestead branch went near the pivots, so every other
     * scene was stuck with the asset. Now any scene can pose its gate.
     *
     * The default is open rather than closed because closing one puts sheep
     * through it: they retire by walking to a target INSIDE the pen, so they
     * cross the gate line, and closed leaves span the full opening. Deciding
     * what shuts a gate is Cycle 116 and 117's problem, and it has exactly one
     * constant to change here.
     *
     * @param {number} width - Width of the gate
     * @param {string} orientation - 'horizontal' or 'vertical'
     * @param {Object} config - Gate configuration
     * @returns {THREE.Group} - Gate structure group
     */
    createGateStructure(width, orientation = 'horizontal', config = {}) {
        const group = new THREE.Group();
        const gateColor = config.color || 0x4a3c28;
        const gateHeight = 3.5; // Gate post height from GLB

        if (this.useGLBModels && this.models.gateAssembly) {
            const gate = this.cloneModel('gateAssembly');
            if (gate) {
                const authoredWidth = this.models.gateAssembly.userData.authoredWidth || 8;
                const scale = width / authoredWidth;
                gate.scale.setScalar(scale);
                if (orientation === 'vertical') {
                    gate.rotation.y = Math.PI / 2;
                }
                group.add(gate);
                // Leaves come from the asset's own pivots, so the orientation
                // rotation above rides on the parent and the hinge angles stay
                // in the asset's frame. An assembly without the leaf meshes
                // yields an empty (still non-null) controller rather than a
                // procedural door laid on top of authored geometry.
                attachGateLeafController(
                    group,
                    buildAuthoredGateLeaves(gate),
                    GATE_LEAF_INITIAL_OPEN_FRACTION
                );
                return this._finishGateStructure(group);
            }
        }

        if (this.useGLBModels && (this.models.fencePost || this.models.gatePost)) {
            const postModelName = this.models.fencePost ? 'fencePost' : 'gatePost';
            // Gate posts
            const leftPost = this.cloneModel(postModelName);
            const rightPost = this.cloneModel(postModelName);

            if (leftPost && rightPost) {
                leftPost.scale.set(1.2, 1, 1.2);
                rightPost.scale.set(1.2, 1, 1.2);

                if (orientation === 'horizontal') {
                    leftPost.position.x = -width / 2;
                    rightPost.position.x = width / 2;
                } else {
                    leftPost.position.z = -width / 2;
                    rightPost.position.z = width / 2;
                }

                group.add(leftPost);
                group.add(rightPost);
            }

            // Visual threshold effect (glowing ground marker instead of asset)
            this.addThresholdEffect(group, width, orientation, gateColor);

            this._addProceduralGateLeaf(group, width, orientation);
            return this._finishGateStructure(group);
        }

        // Fallback to fully procedural geometry
        const gateMaterial = new THREE.MeshPhongMaterial({
            color: gateColor,
            emissive: this.darkenColor(gateColor, 0.8),
            emissiveIntensity: 0.1
        });

        // Gate posts
        const postGeometry = new THREE.CylinderGeometry(0.4, 0.4, gateHeight, 8);
        const leftPost = new THREE.Mesh(postGeometry, gateMaterial);
        const rightPost = new THREE.Mesh(postGeometry, gateMaterial);
        leftPost.position.y = gateHeight / 2;
        rightPost.position.y = gateHeight / 2;

        if (orientation === 'horizontal') {
            leftPost.position.x = -width / 2;
            rightPost.position.x = width / 2;
        } else {
            leftPost.position.z = -width / 2;
            rightPost.position.z = width / 2;
        }

        leftPost.castShadow = true;
        leftPost.receiveShadow = true;
        rightPost.castShadow = true;
        rightPost.receiveShadow = true;

        group.add(leftPost);
        group.add(rightPost);

        // Decorative arch
        const archGeometry = new THREE.CylinderGeometry(0.2, 0.2, width + 1, 8);
        const archMaterial = new THREE.MeshPhongMaterial({
            color: this.lightenColor(gateColor, 0.3),
            emissive: this.darkenColor(gateColor, 0.7),
            emissiveIntensity: 0.1
        });

        const arch = new THREE.Mesh(archGeometry, archMaterial);
        arch.position.y = gateHeight;

        if (orientation === 'horizontal') {
            arch.rotation.z = Math.PI / 2;
        } else {
            arch.rotation.x = Math.PI / 2;
        }

        arch.castShadow = true;
        group.add(arch);

        // Visual threshold effect
        this.addThresholdEffect(group, width, orientation, gateColor);

        this._addProceduralGateLeaf(group, width, orientation);
        return this._finishGateStructure(group);
    }

    /**
     * Build the procedural leaf, mount it, and hang the controller off the gate
     * group. Shared by both no-asset branches so the two cannot drift.
     * @private
     */
    _addProceduralGateLeaf(group, width, orientation) {
        const leaf = this.createProceduralGateLeaf(width, orientation);
        group.add(leaf.node);
        return attachGateLeafController(group, [leaf], GATE_LEAF_INITIAL_OPEN_FRACTION);
    }

    /**
     * The one exit from `createGateStructure` (Cycle 116 Phase 3-A).
     *
     * Every branch above now returns through here, which is the point: the
     * method has three of them (authored assembly, fence-kit posts, fully
     * procedural) and a rim applied on one or two of them is a gate that lights
     * up on some machines and some asset-load outcomes. There is nothing to
     * remember to repeat.
     *
     * WHAT IT RIMS. Every mesh in the gate structure, which on the shipped path
     * means the whole authored `Gate_Assembly`. That is deliberate rather than
     * lazy: the assembly is a single GLB with no per-part mesh names to select
     * posts by, and "the gate warms up" is the read the cue wants anyway. On the
     * two fallback branches it catches the two posts, the arch and the swing
     * leaf, which is the same read.
     *
     * WHAT IT DOES NOT TOUCH. The flanking border segments, the pen and the
     * perimeter fence are all built elsewhere and never enter this group, so the
     * warm stops at the mouth. That contrast IS the cue.
     *
     * The rim starts dark. `js/world/gateThreshold.js` derives one material per
     * SOURCE material and leaves `emissiveIntensity` at 0; the per-frame owner
     * reads `userData[GATE_RIM_MATERIALS_KEY]` and drives it from the camera's
     * distance to the gate through `setGatePostRimIntensity`.
     *
     * @param {THREE.Group} group
     * @returns {THREE.Group} the same group, for `return this._finishGateStructure(group)`
     * @private
     */
    _finishGateStructure(group) {
        const rimMaterials = new Set();
        group.traverse(child => {
            // Null for anything that cannot carry a rim: a group with no
            // material at all, the unlit fallback ground threshold, a
            // multi-material array. Nothing is assigned and nothing is
            // published, so the per-frame owner is never handed a material with
            // nothing to drive or one FencePresets shares with the whole field.
            const rim = applyGatePostRim(child.material);
            if (rim) {
                child.material = rim;
                rimMaterials.add(rim);
            }
        });
        group.userData[GATE_RIM_MATERIALS_KEY] = [...rimMaterials];
        return group;
    }

    /**
     * Add visual threshold effect for gate entrance (glowing ground marker)
     */
    addThresholdEffect(group, width, orientation, color) {
        // Create a subtle glowing ground plane for the gate threshold
        const thresholdGeometry = new THREE.PlaneGeometry(
            orientation === 'horizontal' ? width + 2 : 4,
            orientation === 'horizontal' ? 4 : width + 2
        );
        const thresholdMaterial = new THREE.MeshBasicMaterial({
            color: this.lightenColor(color, 0.4),
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide
        });

        const threshold = new THREE.Mesh(thresholdGeometry, thresholdMaterial);
        threshold.name = GATE_FALLBACK_THRESHOLD_NAME;
        threshold.rotation.x = -Math.PI / 2;
        threshold.position.y = 0.01; // Slightly above ground to avoid z-fighting
        group.add(threshold);

        // Add edge glow lines
        const edgeMaterial = new THREE.MeshBasicMaterial({
            color: this.lightenColor(color, 0.6),
            transparent: true,
            opacity: 0.5
        });

        const edgeWidth = 0.1;
        const edgeGeometry = new THREE.BoxGeometry(
            orientation === 'horizontal' ? width + 2 : edgeWidth,
            0.03,
            orientation === 'horizontal' ? edgeWidth : width + 2
        );

        // Front edge
        const frontEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        frontEdge.position.y = 0.015;
        frontEdge.position.z = orientation === 'horizontal' ? 1.5 : 0;
        frontEdge.position.x = orientation === 'horizontal' ? 0 : 1.5;
        group.add(frontEdge);

        // Back edge
        const backEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        backEdge.position.y = 0.015;
        backEdge.position.z = orientation === 'horizontal' ? -1.5 : 0;
        backEdge.position.x = orientation === 'horizontal' ? 0 : -1.5;
        group.add(backEdge);
    }

    /**
     * Create a gate structure (legacy - keeping old signature)
     * Gate threshold marker - now uses visual effect instead of asset
     */
    createGateThresholdLegacy(width, orientation, gateColor) {
        const thresholdGeometry = new THREE.BoxGeometry(
            orientation === 'horizontal' ? width + 2 : 3,
            0.15,
            orientation === 'horizontal' ? 3 : width + 2
        );
        const thresholdMaterial = new THREE.MeshPhongMaterial({
            color: this.lightenColor(gateColor, 0.5),
            emissive: this.darkenColor(gateColor, 0.5),
            emissiveIntensity: 0.3
        });

        const threshold = new THREE.Mesh(thresholdGeometry, thresholdMaterial);
        threshold.position.y = 0.075;
        group.add(threshold);

        return group;
    }
    
    /**
     * Create a pen/pasture structure that attaches to the main field border
     * @param {Object} dimensions - {width, depth}
     * @param {string} attachmentSide - Which field border the pen attaches to ('north', 'south', 'east', 'west')
     * @returns {THREE.Group} - Pen structure group
     */
    createPenStructure(dimensions, attachmentSide = 'north') {
        const group = new THREE.Group();
        const { width = 60, depth = 30 } = dimensions;

        // The pen's two side fences are the same length AND the same
        // orientation, so they need distinct jitter salts. Without them both
        // sides draw the same posts in the same order, and a pen is small
        // enough that a player standing at the gate sees both at once.
        const run = (role) => ({ seedKey: `pen-${attachmentSide}-${role}` });

        // Create three sides based on attachment side
        // The fourth side (entrance) connects to the field border with the gate

        if (attachmentSide === 'north') {
            // Back fence (extends into field)
            const backFence = this.createBorderSegment(width, 'horizontal', run('back'));
            backFence.position.z = depth;
            group.add(backFence);

            // Side fences extend from border into field
            const leftFence = this.createBorderSegment(depth, 'vertical', run('left'));
            leftFence.position.x = -width/2;
            leftFence.position.z = depth/2;
            group.add(leftFence);

            const rightFence = this.createBorderSegment(depth, 'vertical', run('right'));
            rightFence.position.x = width/2;
            rightFence.position.z = depth/2;
            group.add(rightFence);
        } else if (attachmentSide === 'south') {
            // Back fence (extends into field)
            const backFence = this.createBorderSegment(width, 'horizontal', run('back'));
            backFence.position.z = -depth;
            group.add(backFence);

            // Side fences extend from border into field
            const leftFence = this.createBorderSegment(depth, 'vertical', run('left'));
            leftFence.position.x = -width/2;
            leftFence.position.z = -depth/2;
            group.add(leftFence);

            const rightFence = this.createBorderSegment(depth, 'vertical', run('right'));
            rightFence.position.x = width/2;
            rightFence.position.z = -depth/2;
            group.add(rightFence);
        } else if (attachmentSide === 'east') {
            // Back fence (extends into field) - width tall, at depth distance
            const backFence = this.createBorderSegment(width, 'vertical', run('back'));
            backFence.position.x = depth;
            backFence.position.z = 0;
            group.add(backFence);

            // Side fences extend from border into field - depth long
            const topFence = this.createBorderSegment(depth, 'horizontal', run('top'));
            topFence.position.z = width/2;
            topFence.position.x = depth/2;
            group.add(topFence);

            const bottomFence = this.createBorderSegment(depth, 'horizontal', run('bottom'));
            bottomFence.position.z = -width/2;
            bottomFence.position.x = depth/2;
            group.add(bottomFence);
        } else { // west
            // Back fence (extends into field) - width tall, at depth distance
            const backFence = this.createBorderSegment(width, 'vertical', run('back'));
            backFence.position.x = -depth;
            backFence.position.z = 0;
            group.add(backFence);

            // Side fences extend from border into field - depth long
            const topFence = this.createBorderSegment(depth, 'horizontal', run('top'));
            topFence.position.z = width/2;
            topFence.position.x = -depth/2;
            group.add(topFence);

            const bottomFence = this.createBorderSegment(depth, 'horizontal', run('bottom'));
            bottomFence.position.z = -width/2;
            bottomFence.position.x = -depth/2;
            group.add(bottomFence);
        }

        return group;
    }
    
    /**
     * Helper function to lighten a color
     */
    lightenColor(color, amount) {
        const c = new THREE.Color(color);
        c.r = Math.min(1, c.r + amount);
        c.g = Math.min(1, c.g + amount);
        c.b = Math.min(1, c.b + amount);
        return c.getHex();
    }
    
    /**
     * Helper function to darken a color
     */
    darkenColor(color, amount) {
        const c = new THREE.Color(color);
        c.r = Math.max(0, c.r * amount);
        c.g = Math.max(0, c.g * amount);
        c.b = Math.max(0, c.b * amount);
        return c.getHex();
    }
    
    /**
     * Create optimized instanced fence system for large boundaries
     * @param {Array} segments - Array of segment definitions
     * @returns {THREE.InstancedMesh} - Instanced mesh for all fence posts
     */
    createInstancedFenceSystem(segments) {
        // Count total posts needed
        let totalPosts = 0;
        segments.forEach(segment => {
            totalPosts += Math.ceil(segment.length / this.postSpacing) + 1;
        });
        
        // Create instanced mesh for posts
        const postMesh = new THREE.InstancedMesh(
            this.geometries.post,
            this.materials.post,
            totalPosts
        );
        
        // Set up matrices for each post
        const matrix = new THREE.Matrix4();
        let postIndex = 0;
        
        segments.forEach(segment => {
            const postCount = Math.ceil(segment.length / this.postSpacing) + 1;
            const actualSpacing = segment.length / (postCount - 1);
            
            for (let i = 0; i < postCount; i++) {
                matrix.identity();
                
                const position = new THREE.Vector3();
                if (segment.orientation === 'horizontal') {
                    position.set(
                        segment.start.x + i * actualSpacing * (segment.end.x > segment.start.x ? 1 : -1),
                        this.fenceHeight / 2,
                        segment.start.z
                    );
                } else {
                    position.set(
                        segment.start.x,
                        this.fenceHeight / 2,
                        segment.start.z + i * actualSpacing * (segment.end.z > segment.start.z ? 1 : -1)
                    );
                }
                
                matrix.setPosition(position);
                postMesh.setMatrixAt(postIndex++, matrix);
            }
        });
        
        postMesh.instanceMatrix.needsUpdate = true;
        postMesh.castShadow = true;
        postMesh.receiveShadow = true;
        
        return postMesh;
    }
}

/**
 * Fence configuration builder for different game modes
 */
export class FenceConfigBuilder {
    constructor(fencePresets) {
        this.presets = fencePresets;
    }
    
    /**
     * Build only the gate structure + pasture pen — no perimeter fence.
     * Used by "open" scenes (no walls, just a goal floating on the field).
     * @param {Object} bounds
     * @param {Object} gate
     * @param {Object} pasture
     * @returns {THREE.Group}
     */
    buildGateAndPenOnly(bounds, gate, pasture) {
        const group = new THREE.Group();
        group.name = 'GateAndPen';

        // Free-standing gate at gate.position. Mark as one unit so it
        // surfaces to terrain coplanarly.
        const gateGroup = this.presets.createGateStructure(gate.width, 'horizontal', {});
        gateGroup.position.set(gate.position.x, 0, gate.position.z);
        gateGroup.userData.surfaceToTerrain = true;
        group.add(gateGroup);

        // Pen behind the gate (same geometry as buildSinglePlayerFences,
        // but anchored to the gate position rather than the bounds edge).
        if (pasture) {
            const penWidth = pasture.maxX - pasture.minX;
            const penDepth = pasture.maxZ - pasture.minZ;
            const penCenterX = (pasture.maxX + pasture.minX) / 2;

            const pen = this.presets.createPenStructure({
                width: penWidth,
                depth: penDepth
            }, 'north');
            pen.position.set(penCenterX, 0, gate.position.z);
            group.add(pen);

            // Without a perimeter fence, the pen's front side has only the
            // gate. Add two short border segments flanking the gate to span
            // the full pen width — otherwise sheep walk around the gate.
            const halfPen = penWidth / 2;
            const halfGate = gate.width / 2;
            const flankLength = halfPen - halfGate;
            if (flankLength > 0.5) {
                const gateLeftEdge = gate.position.x - halfGate;
                const gateRightEdge = gate.position.x + halfGate;
                const penLeftEdge = penCenterX - halfPen;
                const penRightEdge = penCenterX + halfPen;

                const leftFlankLen = gateLeftEdge - penLeftEdge;
                if (leftFlankLen > 0.5) {
                    const leftFlank = this.presets.createBorderSegment(leftFlankLen, 'horizontal', {
                        seedKey: 'gate-flank-left'
                    });
                    leftFlank.position.set(
                        (penLeftEdge + gateLeftEdge) / 2,
                        0,
                        gate.position.z
                    );
                    group.add(leftFlank);
                }

                const rightFlankLen = penRightEdge - gateRightEdge;
                if (rightFlankLen > 0.5) {
                    const rightFlank = this.presets.createBorderSegment(rightFlankLen, 'horizontal', {
                        seedKey: 'gate-flank-right'
                    });
                    rightFlank.position.set(
                        (gateRightEdge + penRightEdge) / 2,
                        0,
                        gate.position.z
                    );
                    group.add(rightFlank);
                }
            }
        }

        return group;
    }

    /**
     * Build single player fence configuration
     */
    buildSinglePlayerFences(bounds, gate, pasture) {
        const fences = new THREE.Group();
        
        // North fence with gate
        const northFence = this.presets.createBorderWithGate(
            bounds.maxX - bounds.minX,
            gate.width,
            gate.position.x,
            'horizontal'
        );
        northFence.position.set(0, 0, bounds.maxZ);
        fences.add(northFence);
        
        // South fence. A square field's east and west borders are the same
        // length and orientation, so each border names itself in the jitter
        // salt rather than sharing one run's posts.
        const southFence = this.presets.createBorderSegment(
            bounds.maxX - bounds.minX,
            'horizontal',
            { seedKey: 'border-south' }
        );
        southFence.position.set(0, 0, bounds.minZ);
        fences.add(southFence);

        // East fence
        const eastFence = this.presets.createBorderSegment(
            bounds.maxZ - bounds.minZ,
            'vertical',
            { seedKey: 'border-east' }
        );
        eastFence.position.set(bounds.maxX, 0, 0);
        fences.add(eastFence);

        // West fence
        const westFence = this.presets.createBorderSegment(
            bounds.maxZ - bounds.minZ,
            'vertical',
            { seedKey: 'border-west' }
        );
        westFence.position.set(bounds.minX, 0, 0);
        fences.add(westFence);

        // Add pasture pen attached to north border
        const pen = this.presets.createPenStructure({
            width: pasture.maxX - pasture.minX,
            depth: pasture.maxZ - pasture.minZ
        }, 'north');
        pen.position.set(
            (pasture.maxX + pasture.minX) / 2,
            0,
            bounds.maxZ  // Position at field border
        );
        fences.add(pen);
        
        return fences;
    }
    
    /**
     * Build competitive multiplayer fence configuration
     */
    buildCompetitiveFences(bounds, competitiveGates) {
        const fences = new THREE.Group();
        const playerCount = competitiveGates.length;
        
        if (playerCount === 2) {
            // Simple north/south configuration
            return this.build2PlayerFences(bounds, competitiveGates);
        } else if (playerCount === 3) {
            // Complex configuration with corner gates
            return this.build3PlayerFences(bounds, competitiveGates);
        } else if (playerCount === 4) {
            // Cardinal directions configuration
            return this.build4PlayerFences(bounds, competitiveGates);
        }
        
        return fences;
    }
    
    /**
     * Build 2-player fence configuration
     */
    build2PlayerFences(bounds, gates) {
        const fences = new THREE.Group();
        const gatesOnXAxis = gates[0].direction === 'east' || gates[0].direction === 'west';

        if (gatesOnXAxis) {
            for (const direction of ['west', 'east']) {
                const gate = gates.find((candidate) => candidate.direction === direction);
                const fence = this.presets.createBorderWithGate(
                    bounds.maxZ - bounds.minZ,
                    gate.width,
                    gate.position.z,
                    'vertical',
                    gate
                );
                fence.position.set(direction === 'west' ? bounds.minX : bounds.maxX, 0, 0);
                fences.add(fence);
            }
            for (const direction of ['south', 'north']) {
                const fence = this.presets.createBorderSegment(bounds.maxX - bounds.minX, 'horizontal', {
                    seedKey: `border-${direction}`
                });
                fence.position.set(0, 0, direction === 'south' ? bounds.minZ : bounds.maxZ);
                fences.add(fence);
            }
        } else {
            for (const direction of ['south', 'north']) {
                const gate = gates.find((candidate) => candidate.direction === direction);
                const fence = this.presets.createBorderWithGate(
                    bounds.maxX - bounds.minX,
                    gate.width,
                    gate.position.x,
                    'horizontal',
                    gate
                );
                fence.position.set(0, 0, direction === 'south' ? bounds.minZ : bounds.maxZ);
                fences.add(fence);
            }
            for (const direction of ['west', 'east']) {
                const fence = this.presets.createBorderSegment(bounds.maxZ - bounds.minZ, 'vertical', {
                    seedKey: `border-${direction}`
                });
                fence.position.set(direction === 'west' ? bounds.minX : bounds.maxX, 0, 0);
                fences.add(fence);
            }
        }
        
        // Add pens for each gate
        gates.forEach(gate => {
            // For east/west gates, swap width and depth since pastures are rotated
            let width, depth;
            if (gate.direction === 'east' || gate.direction === 'west') {
                width = gate.pasture.maxZ - gate.pasture.minZ;  // Z dimension becomes width
                depth = gate.pasture.maxX - gate.pasture.minX;  // X dimension becomes depth
            } else {
                width = gate.pasture.maxX - gate.pasture.minX;  // Standard for north/south
                depth = gate.pasture.maxZ - gate.pasture.minZ;
            }
            
            const pen = this.presets.createPenStructure({
                width: width,
                depth: depth
            }, gate.direction);
            
            // Position pen at the field border where the gate is
            let penX = (gate.pasture.maxX + gate.pasture.minX) / 2;
            let penZ = (gate.pasture.maxZ + gate.pasture.minZ) / 2;
            
            // Adjust position to connect with field border
            if (gate.direction === 'north') {
                penZ = bounds.maxZ;
            } else if (gate.direction === 'south') {
                penZ = bounds.minZ;
            } else if (gate.direction === 'east') {
                penX = bounds.maxX;
            } else if (gate.direction === 'west') {
                penX = bounds.minX;
            }
            
            pen.position.set(penX, 0, penZ);
            fences.add(pen);
        });
        
        return fences;
    }
    
    /**
     * Build 3-player fence configuration (North, East, West gates)
     */
    build3PlayerFences(bounds, gates) {
        const fences = new THREE.Group();
        
        // North fence with gate
        const northGate = gates.find(g => Math.abs(g.position.z - bounds.maxZ) < 1);
        if (northGate) {
            const northFence = this.presets.createBorderWithGate(
                bounds.maxX - bounds.minX,
                northGate.width,
                northGate.position.x,
                'horizontal',
                northGate
            );
            northFence.position.set(0, 0, bounds.maxZ);
            fences.add(northFence);
        }
        
        // South fence (no gate)
        const southFence = this.presets.createBorderSegment(bounds.maxX - bounds.minX, 'horizontal');
        southFence.position.set(0, 0, bounds.minZ);
        fences.add(southFence);
        
        // East fence with gate
        const eastGate = gates.find(g => Math.abs(g.position.x - bounds.maxX) < 1);
        if (eastGate) {
            const eastFence = this.presets.createBorderWithGate(
                bounds.maxZ - bounds.minZ,
                eastGate.width,
                eastGate.position.z,
                'vertical',
                eastGate
            );
            eastFence.position.set(bounds.maxX, 0, 0);
            fences.add(eastFence);
        }
        
        // West fence with gate
        const westGate = gates.find(g => Math.abs(g.position.x - bounds.minX) < 1);
        if (westGate) {
            const westFence = this.presets.createBorderWithGate(
                bounds.maxZ - bounds.minZ,
                westGate.width,
                westGate.position.z,
                'vertical',
                westGate
            );
            westFence.position.set(bounds.minX, 0, 0);
            fences.add(westFence);
        }
        
        // Add pens for each gate
        gates.forEach(gate => {
            // For east/west gates, swap width and depth since pastures are rotated
            let width, depth;
            if (gate.direction === 'east' || gate.direction === 'west') {
                width = gate.pasture.maxZ - gate.pasture.minZ;  // Z dimension becomes width
                depth = gate.pasture.maxX - gate.pasture.minX;  // X dimension becomes depth
            } else {
                width = gate.pasture.maxX - gate.pasture.minX;  // Standard for north/south
                depth = gate.pasture.maxZ - gate.pasture.minZ;
            }
            
            const pen = this.presets.createPenStructure({
                width: width,
                depth: depth
            }, gate.direction);
            
            // Position pen at the field border where the gate is
            let penX = (gate.pasture.maxX + gate.pasture.minX) / 2;
            let penZ = (gate.pasture.maxZ + gate.pasture.minZ) / 2;
            
            // Adjust position to connect with field border
            if (gate.direction === 'north') {
                penZ = bounds.maxZ;
            } else if (gate.direction === 'south') {
                penZ = bounds.minZ;
            } else if (gate.direction === 'east') {
                penX = bounds.maxX;
            } else if (gate.direction === 'west') {
                penX = bounds.minX;
            }
            
            pen.position.set(penX, 0, penZ);
            fences.add(pen);
        });
        
        return fences;
    }
    
    /**
     * Build 4-player fence configuration
     */
    build4PlayerFences(bounds, gates) {
        const fences = new THREE.Group();
        
        // North fence with gate
        const northGate = gates.find(g => Math.abs(g.position.z - bounds.maxZ) < 1);
        if (northGate) {
            const northFence = this.presets.createBorderWithGate(
                bounds.maxX - bounds.minX,
                northGate.width,
                northGate.position.x,
                'horizontal',
                northGate
            );
            northFence.position.set(0, 0, bounds.maxZ);
            fences.add(northFence);
        }
        
        // South fence with gate
        const southGate = gates.find(g => Math.abs(g.position.z - bounds.minZ) < 1);
        if (southGate) {
            const southFence = this.presets.createBorderWithGate(
                bounds.maxX - bounds.minX,
                southGate.width,
                southGate.position.x,
                'horizontal',
                southGate
            );
            southFence.position.set(0, 0, bounds.minZ);
            fences.add(southFence);
        }
        
        // East fence with gate
        const eastGate = gates.find(g => Math.abs(g.position.x - bounds.maxX) < 1);
        if (eastGate) {
            const eastFence = this.presets.createBorderWithGate(
                bounds.maxZ - bounds.minZ,
                eastGate.width,
                eastGate.position.z,
                'vertical',
                eastGate
            );
            eastFence.position.set(bounds.maxX, 0, 0);
            fences.add(eastFence);
        }
        
        // West fence with gate
        const westGate = gates.find(g => Math.abs(g.position.x - bounds.minX) < 1);
        if (westGate) {
            const westFence = this.presets.createBorderWithGate(
                bounds.maxZ - bounds.minZ,
                westGate.width,
                westGate.position.z,
                'vertical',
                westGate
            );
            westFence.position.set(bounds.minX, 0, 0);
            fences.add(westFence);
        }
        
        // Add pens for each gate
        gates.forEach(gate => {
            // For east/west gates, swap width and depth since pastures are rotated
            let width, depth;
            if (gate.direction === 'east' || gate.direction === 'west') {
                width = gate.pasture.maxZ - gate.pasture.minZ;  // Z dimension becomes width
                depth = gate.pasture.maxX - gate.pasture.minX;  // X dimension becomes depth
            } else {
                width = gate.pasture.maxX - gate.pasture.minX;  // Standard for north/south
                depth = gate.pasture.maxZ - gate.pasture.minZ;
            }
            
            const pen = this.presets.createPenStructure({
                width: width,
                depth: depth
            }, gate.direction);
            
            // Position pen at the field border where the gate is
            let penX = (gate.pasture.maxX + gate.pasture.minX) / 2;
            let penZ = (gate.pasture.maxZ + gate.pasture.minZ) / 2;
            
            // Adjust position to connect with field border
            if (gate.direction === 'north') {
                penZ = bounds.maxZ;
            } else if (gate.direction === 'south') {
                penZ = bounds.minZ;
            } else if (gate.direction === 'east') {
                penX = bounds.maxX;
            } else if (gate.direction === 'west') {
                penX = bounds.minX;
            }
            
            pen.position.set(penX, 0, penZ);
            fences.add(pen);
        });
        
        return fences;
    }
}
