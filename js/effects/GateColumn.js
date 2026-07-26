// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * The far-state gate cue: a warm column standing at the destination
 * (Cycle 116 Phase 2).
 *
 * WHAT IT IS. One open-ended tapered cylinder at `descriptor.position`, tall
 * enough to clear the treeline, grounded on the terrain and fading out as the
 * player closes on the destination. It is scene-graph geometry rather than a
 * screen overlay for one reason: it has to be OCCLUDED. A hill between the dog
 * and the gate should hide the column exactly the way it hides the gate, which
 * is what tells the player the cue is a thing standing in the world rather than
 * a marker painted on the glass. A post-process or an HTML chip cannot do that.
 *
 * WHY IT IS NOT A LIGHT. There is no PointLight, SpotLight, RectAreaLight or
 * LightProbe anywhere in js/, and adding one would land on one render path and
 * not the other: js/atmosphere/duskLamp.js documents the full census, and the
 * short version is that not one hand-written WebGL shader in the repo opts into
 * Three's light uniforms, so a light at the gate would paint the WebGPU ground
 * and nothing else. The column is emissive-looking because it is UNLIT: a stock
 * MeshBasicMaterial resolves to MeshBasicNodeMaterial through Three's own
 * NodeLibrary conversion on the WebGPU path, so colour, opacity, blending and
 * `fog: false` all land on both paths from the same property writes with no node
 * material and no twin to keep in step. Same idiom as the round-up zone decal
 * two screens up in js/boot/initWorld.js, and the same reasoning that let Cycle
 * 114's farmhouse material split ship without a WebGPU twin.
 *
 * WHY IT OWNS THE HOOK. Phases 3-B (the ground threshold arc) and 4 (funnel
 * occupancy and the crossing pulse) extend THIS controller, THIS construct site
 * (js/boot/initWorld.js, one unconditional call) and THIS dispose entry
 * (js/boot/loadScene.js step 2). Three phases each threading their own
 * per-frame call into main.js is how two near-thresholds end up disagreeing by
 * five metres and nobody notices for a cycle. There is one update, it computes
 * the distance once, it takes the one projection, and it asks
 * js/world/gateCue.js the one visibility question.
 *
 * WHAT PHASE 5 CHANGED. The cue now PUBLISHES that answer on `cue.view` and
 * `js/components/GameHUD/CorralCompass.tsx` renders it, instead of the chevron
 * importing js/world/gateCue.js and re-deriving the destination, the distance
 * and the projection for itself. Two consequences, one of each kind. The design
 * one: the HUD no longer carries a second opinion about where the sheep are
 * supposed to go (it read `gameState.corral` where the cue reads the scene def,
 * and it had a `pen.center` fallback the cue does not), so "the column and the
 * compass share one visibility decision" is now a fact about the data rather
 * than about two call sites agreeing to call the same function. The build one:
 * js/world/gateCue.js was reachable from the HUD's chunk AND from this one, so
 * rollup hoisted it into a third shared chunk that both had to import across.
 * With the edge gone the whole cue is one lazily loaded chunk.
 *
 * WHAT PHASE 3-B ADDED, IN PLACE. `createGateCue` now owns three surfaces off
 * that one distance: the column (far), the ground threshold arc (near, built by
 * js/effects/GateThresholdArc.js), and the gate-post rim on the scenes that have
 * posts (js/world/gateThreshold.js derives the material, this drives it). No
 * second hook, no second construct site, no second dispose entry. The arc is
 * built HERE rather than inside the gate group because js/StructureBuilder.js
 * builds no gate at all on Open Country, so a gate-owned arc would ship the
 * cue's near state on some scenes and not others.
 *
 * WHAT CYCLE 117 CHANGED, WHICH IS NOTHING IN THIS FILE. Rolling Hills traded
 * its corral disc for a fenced pasture with one opening, so the descriptor it
 * resolves is now a `gate` rather than a `corral` and the island grew posts for
 * `collectGateRimMaterials` to find. Every surface here read the descriptor and
 * not the scene, so the column narrows, the arc becomes a sill instead of a
 * ring, and the rim warms, from a data edit in shared/scenes/rolling-hills.js.
 * That was the whole bet of Cycle 116 Phase 1 and this is it paying out.
 */

import * as THREE from 'three';

// Everything from gateCue.js, never from gateThreshold.js. gateThreshold.js is
// in the eagerly loaded main-*.js chunk because js/FencePresets.js derives the
// rim material while building a gate; this module is fetched on demand and costs
// that chunk nothing until it does. See gateCue.js's "THE CUE'S CURVES" block
// for the measurement; tests/gate-threshold-arc.spec.js pins the direction.
import {
    resolveGateDescriptor,
    resolveGateCueVisibility,
    gateRimFactor,
    gateThresholdOpacity,
    setGatePostRimIntensity,
    gateApproachRect,
    gateApproachOccupancy,
    gatePulseEnvelope,
    createPenCrossingObserver,
    GATE_RIM_MATERIALS_KEY,
    GATE_PULSE_DURATION_S,
    GATE_PULSE_GAIN,
    GATE_RETIRED_EVENT,
    CORRAL_RETIRED_EVENT,
    OBJECTIVE_STAGE_EVENT,
} from '../world/gateCue.js';
import { createGateThresholdArc, mountCueSurface } from './GateThresholdArc.js';

/**
 * Column height in metres. The treeline it has to clear is EZ-Tree foliage at
 * roughly 8-18m depending on scene, and the column reads at 140m only if a
 * useful slice of it sits above the canopy rather than peeking through it.
 */
export const GATE_COLUMN_HEIGHT = 44;

/**
 * Peak material opacity. Additive blending with `transparent: true` gives
 * src-alpha/one, so this scales the light the column contributes and the
 * distance fade multiplies straight into it.
 */
export const GATE_COLUMN_OPACITY = 0.3;

/** Radius band. A destination's width sets the column's girth, within reason. */
const COLUMN_RADIUS_PER_WIDTH = 0.14;
const COLUMN_MIN_RADIUS = 0.9;
const COLUMN_MAX_RADIUS = 2.4;

/**
 * The top radius as a fraction of the base. A cylinder ends in a hard ring
 * against the sky; a taper converges instead, so the column has no visible top
 * edge to read as geometry.
 */
const COLUMN_TAPER = 0.12;

/** Metres of column buried below the sample point, so a slope shows no gap. */
const COLUMN_SINK = 1.5;

const COLUMN_RADIAL_SEGMENTS = 12;

/**
 * Metres up the destination the chevron's projection is taken from, and the NDC
 * envelope inside which the destination counts as on-screen.
 *
 * Both moved here from `CorralCompass.tsx` in Phase 5, unchanged, when the cue
 * took ownership of the projection. 4m keeps the indicator tracking above the
 * ground rather than at it; the 0.95 envelope hides the chevron slightly before
 * the destination reaches the true screen edge, so the two never overlap.
 */
const CUE_PROJECT_HEIGHT_M = 4;
const CUE_ON_SCREEN_NDC = 0.95;

/** Scratch, so the per-frame projection allocates nothing. */
const _projected = new THREE.Vector3();

/**
 * Column girth for a destination width. Home Field's 8m gate mouth and Open
 * Country's 60m gather zone are the same cue, so the girth tracks the
 * destination but is clamped: a column as wide as the round-up zone would be a
 * wall, and one as thin as a fence post disappears at 140m.
 *
 * @param {number} width `GateDescriptor.width`
 * @returns {number} metres
 */
export function gateColumnRadius(width) {
    const scaled = (Number.isFinite(width) ? width : 0) * COLUMN_RADIUS_PER_WIDTH;
    return Math.min(COLUMN_MAX_RADIUS, Math.max(COLUMN_MIN_RADIUS, scaled));
}

/**
 * Build the column mesh and add it to the scene, hidden.
 *
 * @param {object} opts
 * @param {THREE.Object3D} opts.scene
 * @param {{position: {x: number, z: number}, width: number}} opts.descriptor
 * @param {(x: number, z: number) => number} opts.groundY
 *   MUST be TerrainBuilder._groundY, never Heightfield.sample: `_groundY`
 *   applies the same smoothstep-to-zero over the last 20m of worldSize that the
 *   visible mesh uses, so a destination near the edge sits ON the ground
 *   instead of hovering over the flat skirt (.claude/rules/scene-and-render.md).
 */
export function createGateColumn({ scene, descriptor, groundY }) {
    const radius = gateColumnRadius(descriptor.width);
    const geometry = new THREE.CylinderGeometry(
        radius * COLUMN_TAPER, radius, GATE_COLUMN_HEIGHT, COLUMN_RADIAL_SEGMENTS, 1, true,
    );
    // The same surface the arc is, in the same warm, differing only in shape
    // and peak opacity. Per D13's "warm means go there": one language, and
    // deliberately not the cream the HUD chips use, since the column is
    // additive over sky and terrain and a neutral white reads as a rendering
    // artifact rather than as a signal.
    const column = mountCueSurface({
        scene, geometry, name: 'gate-cue-column', renderOrder: 3, gain: GATE_COLUMN_OPACITY,
    });
    const { x, z } = descriptor.position;
    column.mesh.position.set(x, groundY(x, z) - COLUMN_SINK + GATE_COLUMN_HEIGHT / 2, z);
    return column;
}

/**
 * The gate cue controller. Owns every world-space piece of the cue for one
 * scene, and one `update` drives all of them.
 *
 * @param {object} opts
 * @param {THREE.Object3D} opts.scene
 * @param {import('../world/gateCue.js').GateDescriptor} opts.descriptor
 * @param {(x: number, z: number) => number} opts.groundY
 * @param {() => ({x: number, z: number} | null)} opts.getDogPosition
 *   A getter rather than a per-frame argument on purpose: the cue is built
 *   before the sheepdog exists, and Phases 3-B and 4 need more of the live
 *   state (sheep positions, the retired count) without main.js's single hook
 *   growing an argument list per phase.
 * @param {() => number} [opts.getOccupancy]
 *   Fraction of the gate approach the flock currently fills, [0, 1]. The same
 *   getter seam as `getDogPosition`, and the one Phase 4 fills in: the arc
 *   already composes it through `gateThresholdOpacity`, so brightening on
 *   approach is a construct-site wiring change and not another edit here.
 *   Absent reads as an empty funnel.
 * @param {Iterable<object>} [opts.rimMaterials]
 *   Gate-post rim materials published by `js/FencePresets.js` on the built gate
 *   structure. Driven from the same distance the column and the arc read, so a
 *   scene with posts warms them at exactly the metre the arc appears.
 * @param {() => number} [opts.getCrossings]
 *   Sheep that crossed since the previous frame, for a destination whose
 *   retirement is READ rather than announced. Newsheepdogland is the only one:
 *   its sheep retire inside `shared/PenBarrier.js`, which dispatches nothing
 *   and lives on the deterministic boundary. Any positive return is one pulse,
 *   exactly like an event, so the two mechanisms cannot produce two different
 *   pulse behaviours.
 * @param {() => (THREE.Camera | null)} [opts.getCamera]
 *   The live camera, for the one projection the cue publishes. Absent leaves
 *   the destination reading as off-screen, which is the state that shows the
 *   chevron: a cue that cannot project should point the player at the
 *   destination, not hide the only surface that says where it is.
 * @param {() => void} [opts.onStageChanged]
 *   Called when the objective flips stage, which is the one moment a scene's
 *   destination MOVES. `bindGateCue` passes its own re-bind: the column's
 *   position and the arc's world-space vertices are both baked at construction,
 *   so a descriptor that merely re-resolved would leave every surface standing
 *   at the old destination. Registered here, with the crossing listeners, so the
 *   cue's own dispose removes it and a re-bind cannot stack a second one.
 */
export function createGateCue({
    scene, descriptor, groundY, getDogPosition, getOccupancy, rimMaterials, getCrossings,
    getCamera, onStageChanged,
}) {
    const column = createGateColumn({ scene, descriptor, groundY });
    // The near half of the same cue. It is built here, from the same descriptor
    // and the same `groundY`, because the alternative is building it inside the
    // gate group - and `js/StructureBuilder.js` builds no gate at all on Rolling
    // Hills or Open Country, so that ships the language on half the scenes.
    const arc = createGateThresholdArc({ scene, descriptor, groundY });
    /**
     * THE CUE'S PUBLISHED STATE, and the only copy of it.
     *
     * `resolveGateCueVisibility`'s six fields plus the three the screen-edge
     * chevron needs to draw itself: where the destination lands in NDC, and
     * whether the camera is pointing away from it. `js/GameBridge.js` hands
     * this to `CorralCompass`, which renders it and decides nothing.
     *
     * That direction is the point. The chevron used to import
     * `js/world/gateCue.js` and re-derive the destination, the distance and the
     * projection for itself, which meant the HUD carried a second copy of
     * "where are the sheep supposed to go" that could disagree with the world
     * (it read `gameState.corral` where the cue reads the scene def, and it had
     * a `pen.center` fallback the cue does not). Pushing the resolved state
     * outward leaves one destination, one distance and one projection in the
     * build, and it is what lets the whole cue live in one lazily loaded chunk
     * instead of being split across the HUD's.
     *
     * Null only between this line and the `cue.update(0)` at the end of this
     * function, which nothing else runs between. Seeding it with a resolved
     * far-state object instead would be a second construction of the same
     * answer that is overwritten microseconds later.
     *
     * @type {(ReturnType<typeof resolveGateCueVisibility> & {ndcX: number, ndcY: number, behind: boolean}) | null}
     */
    let view = null;

    /**
     * THE CROSSING PULSE, AND WHY IT IS THREE NUMBERS AND A BOOLEAN.
     *
     * Solo Chaos is 5,000 sheep and they retire in clumps, so the whole design
     * constraint is that a crossing must cost the same whether one sheep went
     * through or five hundred did. `signalCrossing` is the entire per-crossing
     * cost: one boolean write, no allocation, no queue, no closure, and
     * idempotent within a frame. The frame's update then converts "something
     * crossed" into exactly one pulse, so N crossings on a frame produce one
     * pulse and no crossings produce none. Nothing is built and nothing is
     * added to the scene graph; the pulse lifts the opacity the cue was already
     * writing.
     */
    let pulsePending = false;
    let pulseElapsed = GATE_PULSE_DURATION_S;
    let pulseCount = 0;
    const signalCrossing = () => { pulsePending = true; };

    // Both crossing events, because the pulse is a property of the CUE rather
    // than of one scene's retirement mechanism (D14). The corral scenes already
    // dispatch per sheep for the lightning zap, which needs each position; the
    // gate path dispatches once per frame. Either way the listener does the same
    // one thing, and the coalescing below makes the two indistinguishable.
    const target = typeof window !== 'undefined' ? window : null;
    target?.addEventListener?.(GATE_RETIRED_EVENT, signalCrossing);
    target?.addEventListener?.(CORRAL_RETIRED_EVENT, signalCrossing);
    // No guard on the third: a nullable callback is spec'd to convert undefined
    // to null and register nothing, so the cue with no stage to follow pays a
    // no-op call rather than a branch it carries into every bundle.
    target?.addEventListener?.(OBJECTIVE_STAGE_EVENT, onStageChanged);

    const cue = {
        descriptor,
        column,
        arc,
        /** Pulses fired since construction. Read by tests, not by the game. */
        get pulseCount() { return pulseCount; },
        /** Last frame's resolved state. The chevron's whole input. */
        get view() { return view; },
        /**
         * THE per-frame hook. Called once from js/main.js.
         * @param {number} [dt] seconds since the previous frame.
         * @returns {typeof view}
         */
        update(dt) {
            const step = Number.isFinite(dt) ? dt : 0;
            // The observer is polled FIRST and unconditionally, so its delta is
            // consumed on every frame rather than accumulating behind a pending
            // event and firing a second pulse later.
            const observed = getCrossings?.() ?? 0;
            if (observed > 0 || pulsePending) {
                pulsePending = false;
                pulseElapsed = 0;
                pulseCount += 1;
            } else if (pulseElapsed < GATE_PULSE_DURATION_S) {
                pulseElapsed += step;
            }
            // D13 state 4 is "one warm pulse ALONG THE THRESHOLD", so the lift
            // rides the arc and not the column: the crossing happens at the
            // player's feet, and a player 140m out watching a column flash has
            // been told about something they cannot see. Clamped so a pulse on
            // an already-bright arc cannot push it past full.
            const lift = 1 + GATE_PULSE_GAIN * gatePulseEnvelope(pulseElapsed);
            const dog = getDogPosition?.() ?? null;
            const distance = dog
                ? Math.hypot(dog.x - descriptor.position.x, dog.z - descriptor.position.z)
                : Infinity;
            // THE projection, taken once. `columnOpacity` deliberately does not
            // read it (a camera swing must not pop 44m of geometry), but the
            // chevron is a screen-edge marker and cannot be drawn without it.
            const camera = getCamera?.() ?? null;
            let ndcX = 0;
            let ndcY = 0;
            let behind = false;
            let onScreen = false;
            if (camera) {
                _projected.set(descriptor.position.x, CUE_PROJECT_HEIGHT_M, descriptor.position.z);
                _projected.project(camera);
                ndcX = _projected.x;
                ndcY = _projected.y;
                behind = _projected.z > 1;
                onScreen = !behind
                    && ndcX >= -CUE_ON_SCREEN_NDC && ndcX <= CUE_ON_SCREEN_NDC
                    && ndcY >= -CUE_ON_SCREEN_NDC && ndcY <= CUE_ON_SCREEN_NDC;
            }
            view = { ...resolveGateCueVisibility({ distance, onScreen }), ndcX, ndcY, behind };
            column.setOpacity(view.columnOpacity);
            // The near state, composed the one way `gateThreshold.js` states it:
            // how near the player is, times how full the funnel is. The near
            // factor is the exact complement of the column's fade, so the two
            // halves of the cue hand over at the same metre instead of stacking.
            arc.setOpacity(Math.min(1, gateThresholdOpacity(distance, getOccupancy?.() ?? 0) * lift));
            // And the posts, where a scene has posts. One property, one write,
            // read identically by the WebGL uniform path and the WebGPU
            // materialReference path - see js/world/gateThreshold.js on why the
            // rock rim is the cautionary tale here rather than the pattern.
            setGatePostRimIntensity(rimMaterials, gateRimFactor(distance));
            return view;
        },
        dispose() {
            target?.removeEventListener?.(GATE_RETIRED_EVENT, signalCrossing);
            target?.removeEventListener?.(CORRAL_RETIRED_EVENT, signalCrossing);
            target?.removeEventListener?.(OBJECTIVE_STAGE_EVENT, onStageChanged);
            column.dispose();
            arc.dispose();
            // Leave the gate's rim materials dark rather than lit at whatever
            // the last frame happened to be: they belong to the fence system's
            // GLB cache and outlive the cue that was driving them.
            setGatePostRimIntensity(rimMaterials, 0);
        },
    };

    // Resolve once at construction, through the same path a frame takes, so the
    // cue is already correct on the frame it is built rather than showing a
    // full-strength column until the first update lands.
    cue.update(0);
    return cue;
}

/**
 * Every gate-post rim material the structure builder published for this scene.
 *
 * `js/FencePresets.js` writes the list on the gate structure's `userData` at the
 * one exit from `createGateStructure`, and `js/StructureBuilder.js` nests that
 * structure at different depths per scene (Newsheepdogland wraps it in a
 * homestead enclosure group that also carries the pen fences). A traverse of the
 * builder's own structure lists is the one reader that does not have to know
 * which scene it is looking at, which is the same reason the arc is cue-owned.
 * Runs once per scene build, never per frame.
 *
 * @param {any} structureBuilder
 * @returns {object[]}
 */
function collectGateRimMaterials(structureBuilder) {
    const roots = Object.values(structureBuilder?.structures ?? {}).flat();
    const materials = [];
    for (const root of roots) {
        root?.traverse?.((node) => {
            const published = node.userData?.[GATE_RIM_MATERIALS_KEY];
            if (published) materials.push(...published);
        });
    }
    return materials;
}

/**
 * THE construct site's worker. Called unconditionally from
 * js/boot/initWorld.js, which is the one path that runs on both a cold boot and
 * a scene rebuild.
 *
 * Unconditional is the whole point. The `if (sceneDef.X)` guards in main.js's
 * rebuild are what leave a previous scene's fixtures standing when the new
 * scene declares nothing; a bind that always runs and always disposes first
 * cannot do that. A scene with no destination clears the cue and leaves
 * `game._gateCue` null.
 *
 * @param {object} game SheepDogSimulation instance.
 * @returns {ReturnType<typeof createGateCue> | null}
 */
export function bindGateCue(game) {
    try { game._gateCue?.dispose?.(); } catch (err) { console.warn('[CUE] gate cue dispose:', err); }
    game._gateCue = null;

    const scene = game?.sceneManager?.getScene?.();
    const descriptor = resolveGateDescriptor(game?.currentScene, game?.gameState);
    if (!scene || !descriptor) return null;

    const builder = game.terrainBuilder;
    // Resolved once per scene: the rect depends only on the descriptor, and the
    // per-frame pass reads it rather than rebuilding it every frame.
    const approach = gateApproachRect(descriptor);
    // Only Newsheepdogland has one. Everywhere else the crossing is an event,
    // and a null getter costs the update an `?? 0`.
    const pen = game._penBarrier;
    const observeCrossings = pen ? createPenCrossingObserver(pen) : null;

    game._gateCue = createGateCue({
        scene,
        descriptor,
        groundY: (x, z) => (builder?._groundY ? builder._groundY(x, z) : 0),
        getDogPosition: () => game.sheepdog?.position ?? null,
        // The live flock, not the array length: Counting Sheep pre-sizes the
        // array to its 5,000 ceiling and brings instances online in batches, so
        // `sheep.length` would read a full flock on round one and leave the arc
        // stuck near dark for the whole run.
        getOccupancy: () => gateApproachOccupancy(
            game.gameState?.sheep,
            approach,
            game.gameState?.optimizedSheepSystem?.activeCount
                ?? game.gameState?.sheep?.length
                ?? 0,
        ),
        getCrossings: observeCrossings,
        // A getter, not the camera itself: the scene manager swaps cameras on a
        // mode change and the cue is built once per scene.
        getCamera: () => game.sceneManager?.getCamera?.() ?? null,
        // The destination moves when an objective flips from gathering to
        // driving, and a bind is exactly what has to happen then: the descriptor
        // is resolved once, at construction, and the column mesh and the arc
        // strip are both built AT it, so nothing short of rebuilding them moves
        // the cue. Re-entering the bind also disposes the old surfaces and the
        // listener that fired it, so a flip swaps one cue for one cue. Safe
        // during dispatch because the DOM invokes a copy of the listener list,
        // so the cue built inside the handler is not called for the same event.
        onStageChanged: () => bindGateCue(game),
        rimMaterials: collectGateRimMaterials(game.structureBuilder),
    });
    return game._gateCue;
}
