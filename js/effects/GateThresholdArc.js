// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * The near-state gate cue: a warm threshold arc drawn on the ground at the
 * destination (Cycle 116 Phase 3-B).
 *
 * WHY IT IS CUE-OWNED AND NOT PART OF THE GATE GROUP. `js/FencePresets.js`
 * already carries a dead `addThresholdEffect` that builds exactly this shape
 * inside the gate assembly, and resurrecting it there was the obvious move and
 * the wrong one. `js/StructureBuilder.js` returns early from its gate path
 * whenever the scene declares a `corral`, so `createGateStructure` is never
 * called on Open Country: that scene builds no gate at all, and its destination
 * is a portal disc in open ground. An arc living in the gate group would
 * therefore ship on some scenes and not others, and D14 (the player learns one
 * visual language on Home Field and it transfers to the island) is the whole
 * reason this cycle exists. So the arc is a mesh the CUE owns, placed at
 * `descriptor.position`, and every scene with a destination gets one whether or
 * not anything built a fence there.
 *
 * Cycle 117 narrowed that list without changing the reasoning: Rolling Hills
 * dropped its corral for a fenced pasture, so it now builds a real gate with
 * real posts and its arc happens to land in a mouth. Open Country still does
 * not, so an arc owned by the gate group would still ship on three scenes out
 * of four. The arc did not move, and that is the point of owning it here.
 *
 * WHY IT IS A CONFORMED STRIP AND NOT A FLAT RING. Rolling Hills and Open
 * Country are heightfield islands. A `RingGeometry` laid flat at one sampled Y
 * buries its uphill half in the terrain and floats its downhill half, and at
 * Open Country's 30m radius the terrain moves several metres across the ring.
 * So the arc is built as a triangle strip whose every vertex takes its own Y
 * from `TerrainBuilder._groundY` at that vertex's own (x, z), which is the same
 * construction the round-up zone decal in `js/boot/initWorld.js` already uses
 * for the same reason. `_groundY` and never `Heightfield.sample`: only
 * `_groundY` applies the smoothstep-to-zero over the last 20m of `worldSize`
 * that the visible terrain mesh uses (.claude/rules/scene-and-render.md), and
 * Newsheepdogland's gate sits far enough out that the difference is the arc
 * hanging in the air over the flat skirt.
 *
 * WHY THE SWEEP IS PER-KIND. `resolveGateDescriptor` normalises two different
 * geometries into one `width`: a disc's diameter, and the gap between two gate
 * posts. For a disc the boundary IS the destination, so the arc closes into a
 * full ring and states exactly where the sheep have to end up. For a gate the
 * destination is a mouth in a line, so a full ring would be drawn straight
 * through the fence and half of it would sit inside the pen the flock is being
 * driven into. The gate case sweeps the approach half only, which draws a sill
 * on the side the flock arrives from and leaves the pen clean. That is a
 * per-KIND derivation from what the number means, not a per-scene branch: Home
 * Field and Newsheepdogland share it without either being named, and hard stop 3
 * is about the cue branching on scene identity. It is the same split, for the
 * same reason, as `gateThresholdRadius`'s gate outset.
 *
 * WHY IT IS A STOCK MATERIAL. Production boots WebGPU. A `ShaderMaterial` here
 * would need a hand-written node twin and the two halves would drift, which is
 * exactly what happened to the rock rim (a compile-time constant on WebGPU, a
 * per-frame uniform on WebGL, and their constants already disagree). A stock
 * `MeshBasicMaterial` is converted to `MeshBasicNodeMaterial` by Three's own
 * `StandardNodeLibrary`, carrying colour, opacity, blending, depth state and
 * `fog` across with it, so the one property this module writes per frame
 * (`material.opacity`) lands identically on both backends from one write. Same
 * idiom as `js/effects/GateColumn.js` and `js/atmosphere/duskLamp.js`.
 *
 * WHERE THE NUMBERS LIVE. Radius, warm, base and peak opacity and the near-fade
 * all come from `js/world/gateCue.js` and are not restated here. The three this
 * file does own are the ones that shape THIS mesh and have exactly one consumer:
 * the sweep, the band width and the ground lift.
 *
 * That single import line is also a bundle constraint. `js/world/gateThreshold.js`
 * declares the warm and the two handover constants and is in the eagerly loaded
 * `main-*.js` chunk, because `js/FencePresets.js` derives the gate-post rim
 * material while it is building a gate. This module is fetched on demand with
 * the rest of the cue, and `gateCue.js` with it, so neither costs that chunk
 * anything - until an import points the wrong way. Measured while writing this
 * phase: reaching into `gateThreshold.js` from here made its curves live inside
 * the measured chunk, and the return edge dragged the whole cue graph in behind
 * them, +2,663 bytes against 80 bytes of remaining headroom on a fenced ratchet.
 * `gateCue.js` re-exports everything the eager module owns, so the rule costs
 * nothing at the call site. `tests/gate-threshold-arc.spec.js` pins it.
 */

import * as THREE from 'three';

// Everything from gateCue.js, including the two names gateThreshold.js also
// declares. gateThreshold.js is in the eagerly loaded main-*.js chunk (the fence
// builder calls it while building a gate); this module is not. An import that
// makes one of that module's functions live inside the eager chunk is spent out
// of the tightest budget in the cycle, and one that runs the other way drags the
// whole cue graph in. tests/gate-threshold-arc.spec.js pins the direction.
import { gateFacingYaw, gateThresholdRadius, GATE_CUE_WARM_LINEAR } from '../world/gateCue.js';

const TAU = Math.PI * 2;

/**
 * THE cue surface: what both of the cue's meshes are made of, and how both are
 * mounted, disposed and faded.
 *
 * The column and the arc are the same object in two shapes - an unlit additive
 * warm mark that terrain occludes, that occludes nothing itself, that ignores
 * fog and that is driven by exactly one property write per frame. Before this
 * was extracted, that was two material option lists and two near-identical
 * mount/dispose blocks in two files, which is the same drift this whole cycle
 * exists to close, one level down: the day someone gives the arc `depthWrite`
 * or drops `fog: false` from the column, nothing notices until a player on one
 * scene sees a mark the other scene does not have.
 *
 * It lives in this file rather than in `GateColumn.js` because `GateColumn.js`
 * already imports this module (it builds the arc through
 * {@link createGateThresholdArc}) and the reverse edge would be an import cycle.
 *
 * @param {object} opts
 * @param {THREE.Object3D} opts.scene
 * @param {THREE.BufferGeometry} opts.geometry
 * @param {string} opts.name        Scene-graph name, for probes and tests.
 * @param {number} opts.renderOrder
 * @param {number} [opts.gain]      Peak opacity: `setOpacity(1)` lands here.
 * @returns {{mesh: THREE.Mesh, material: THREE.MeshBasicMaterial, setOpacity: (o: number) => void, dispose: () => void}}
 */
export function mountCueSurface({ scene, geometry, name, renderOrder, gain = 1 }) {
    const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        // Depth TEST on so terrain occludes the surface; depth WRITE off so it
        // never occludes anything itself - a sheep standing on the arc draws
        // over it, and the column never hides what it is pointing at.
        depthWrite: false,
        // Both faces draw, so the column's far wall shows through its near one
        // and reads as volume, and the arc is visible from below the ground.
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        // The cue is one colour at every distance it is legible from. A beacon
        // that dims into the haze at the distance it exists to be legible from
        // is not a beacon, and fogging the arc but not the column would leave
        // the two halves reading as different marks. Honoured by NodeMaterial.
        fog: false,
    });
    // ONE WARM, in the space it is stated in. Both surfaces paint here, so
    // "warm means go there" is a single triple rather than a hex on the column
    // and a linear triple on the arc - which is what shipped out of Phases 2
    // and 3-B, and which put the two halves of the cue an sRGB decode apart
    // (0xffc98a decodes to (1.00, 0.59, 0.25) against the arc's (1.00, 0.62,
    // 0.26)). `js/world/gateThreshold.js` warns about exactly that decode where
    // it declares the constant. `setRGB` writes in the working colour space,
    // which is linear, so this is the one call that needs no decode at all.
    material.color.setRGB(...GATE_CUE_WARM_LINEAR);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = renderOrder;
    mesh.visible = false;
    mesh.name = name;
    scene.add(mesh);

    return {
        mesh,
        material,
        /** @param {number} opacity 0..1 from the cue's shared decision. */
        setOpacity(opacity) {
            material.opacity = gain * opacity;
            mesh.visible = opacity > 0;
        },
        dispose() {
            if (mesh.parent) mesh.parent.remove(mesh);
            geometry.dispose();
            material.dispose();
        },
    };
}

/**
 * How much of the circle a gate's arc draws, in radians.
 *
 * A half turn, centred on the approach. The two ends land on the fence line, a
 * little outside the posts (Home Field's arc radius is 5.5m against posts at
 * 4m), so the arc reads as a mouth to walk the flock through rather than as a
 * line that stops at the timber.
 */
export const GATE_ARC_GATE_SWEEP_RAD = Math.PI;

/** A disc draws its whole boundary, because its boundary is the destination. */
export const GATE_ARC_DISC_SWEEP_RAD = TAU;

/**
 * Metres the strip sits above the sampled ground.
 *
 * The same lift the round-up zone decal uses. Large enough to clear depth
 * precision at the distances the arc is visible from, small enough that the
 * mark reads as painted on the grass rather than hovering over it.
 */
export const GATE_ARC_GROUND_LIFT_M = 0.08;

/**
 * Target length of one strip segment, in metres.
 *
 * The strip is straight between vertices, so the segment length is how far the
 * arc can cut a corner off the terrain before the chord lifts off a ridge or
 * sinks into a dip. Under two metres keeps the error inside the ground lift on
 * every slope the shipped scenes carry, and it makes the tessellation follow the
 * radius instead of being a number that is right for one scene: Home Field's
 * 5.5m half-arc gets the floor, Open Country's 30m ring gets about 126 segments.
 */
const ARC_TARGET_CHORD_M = 1.5;
const ARC_MIN_SEGMENTS = 24;
const ARC_MAX_SEGMENTS = 160;

/**
 * Band width as a fraction of radius, and the clamps on it.
 *
 * Proportional so a 5.5m gate sill and a 30m gather ring read as the same
 * thickness of line on screen from the distance each is looked at. Clamped
 * because a hairline vanishes under a top-down camera and a band a tenth of a
 * 30m ring wide stops being a line and becomes a floor.
 */
const ARC_BAND_RATIO = 0.12;
const ARC_BAND_MIN_M = 0.5;
const ARC_BAND_MAX_M = 1.6;

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/**
 * How much of the circle this descriptor's arc draws, in radians.
 *
 * @param {{kind?: string} | null | undefined} descriptor
 * @returns {number}
 */
export function gateArcSweep(descriptor) {
    return descriptor?.kind === 'gate' ? GATE_ARC_GATE_SWEEP_RAD : GATE_ARC_DISC_SWEEP_RAD;
}

/**
 * Where a partial arc starts, as an angle measured from +X toward +Z.
 *
 * Routed through `gateFacingYaw` rather than through a second `atan2` on the
 * descriptor's components, so the cue has exactly one place that turns a facing
 * into an angle. That matters numerically as well as structurally:
 * Newsheepdogland's facing is `(1, 6.1e-17)` because it comes out of
 * `cos(90deg)`, and the shared helper returns exactly a quarter turn for it
 * while an open-coded comparison against zero would not.
 *
 * `gateFacingYaw` is a Y rotation for a +Z-facing object, so a yaw of 0 is the
 * +Z direction, which is a quarter turn round from +X: hence `PI/2 - yaw`.
 *
 * @param {{facing?: {x: number, z: number}} | null | undefined} descriptor
 * @param {number} sweep radians
 * @returns {number} radians
 */
export function gateArcStartAngle(descriptor, sweep) {
    if (sweep >= TAU) return 0;
    // `facing` points the way the flock TRAVELS into the destination, so the
    // side it arrives from is half a turn round from that.
    const approach = Math.PI / 2 - gateFacingYaw(descriptor?.facing) + Math.PI;
    return approach - sweep / 2;
}

/**
 * Build the arc's terrain-conformed strip geometry.
 *
 * Exported so a spec can read the vertices back and check them against the same
 * `groundY` the build was handed, rather than against a number typed twice.
 *
 * @param {import('../world/gateCue.js').GateDescriptor} descriptor
 * @param {(x: number, z: number) => number} groundY
 *   MUST be `TerrainBuilder._groundY`.
 * @returns {{geometry: THREE.BufferGeometry, radius: number, sweep: number, segments: number}}
 */
export function buildGateArcGeometry(descriptor, groundY) {
    const radius = gateThresholdRadius(descriptor);
    const sweep = gateArcSweep(descriptor);
    const band = clamp(radius * ARC_BAND_RATIO, ARC_BAND_MIN_M, ARC_BAND_MAX_M);
    const inner = Math.max(0.05, radius - band / 2);
    const outer = radius + band / 2;
    const segments = Math.round(clamp(
        (sweep * radius) / ARC_TARGET_CHORD_M, ARC_MIN_SEGMENTS, ARC_MAX_SEGMENTS,
    ));
    const start = gateArcStartAngle(descriptor, sweep);
    const cx = descriptor.position.x;
    const cz = descriptor.position.z;

    const positions = new Float32Array((segments + 1) * 2 * 3);
    const indices = [];
    for (let i = 0; i <= segments; i++) {
        const theta = start + (i / segments) * sweep;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const ix = cx + inner * cos;
        const iz = cz + inner * sin;
        const ox = cx + outer * cos;
        const oz = cz + outer * sin;
        const o = i * 6;
        positions[o + 0] = ix;
        positions[o + 1] = groundY(ix, iz) + GATE_ARC_GROUND_LIFT_M;
        positions[o + 2] = iz;
        positions[o + 3] = ox;
        positions[o + 4] = groundY(ox, oz) + GATE_ARC_GROUND_LIFT_M;
        positions[o + 5] = oz;
        if (i < segments) {
            const a = i * 2;
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    // No normals: the material is unlit, and a normal attribute on a strip this
    // wide would be a per-vertex cost for something nothing reads.
    return { geometry, radius, sweep, segments };
}

/**
 * Build the arc and add it to the scene, hidden.
 *
 * Vertices are in WORLD space and the mesh sits at the origin. The strip already
 * carries the terrain's shape, so giving the mesh a transform as well would mean
 * two things describing the same position and one of them going stale the moment
 * the other is edited.
 *
 * @param {object} opts
 * @param {THREE.Object3D} opts.scene
 * @param {import('../world/gateCue.js').GateDescriptor} opts.descriptor
 * @param {(x: number, z: number) => number} opts.groundY
 */
export function createGateThresholdArc({ scene, descriptor, groundY }) {
    const { geometry, radius, sweep, segments } = buildGateArcGeometry(descriptor, groundY);
    const surface = mountCueSurface({
        scene, geometry, name: 'gate-cue-threshold-arc', renderOrder: 2,
    });
    return { ...surface, radius, sweep, segments };
}
