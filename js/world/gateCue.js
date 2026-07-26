// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * One destination descriptor, for every scene (Cycle 116 Phase 1).
 *
 * WHAT THIS IS FOR. The four-state gate cue (column, threshold arc, occupancy
 * brightening, crossing pulse) has to draw at "where the sheep are supposed to
 * go" on four scenes that express that destination four different ways: Home
 * Field has a gate in a fence, Rolling Hills has a corral disc, Open Country has
 * a round-up zone that becomes a portal, Newsheepdogland has a homestead gate on
 * a pen edge. D14 says the player learns one visual language and it transfers,
 * so the cue cannot branch per scene. It branches HERE, once, into one
 * normalised `{ position, facing, width, kind }`, and every later phase reads
 * the descriptor rather than the scene.
 *
 * WHY IT RESOLVES FROM THE SCENE DEF AND NOT FROM GAME STATE. `disposeScene`
 * (js/boot/loadScene.js step 10) nulls `corral`, `objective`, `boundary` and the
 * heightfield on a swap, but deliberately does NOT null `gate` or `pasture` -
 * those live on FieldConfig-shaped client state that outlives the scene. A
 * descriptor that fell back to `gameState.gate` would therefore inherit the
 * PREVIOUS scene's gate the moment the player swapped from Home Field to an
 * island, and would keep drawing a cue in the sea. `gameState` is a parameter
 * for exactly one reason: Open Country's destination moves when the objective
 * flips from `roundup` to `drive`, and only the live state knows which stage is
 * running (solo writes it in js/GameState.js, multiplayer mirrors the server's
 * block into the same shape in js/boot/initNetwork.js).
 *
 * THE `facing` CONVENTION. `facing` is a unit vector pointing the way the flock
 * TRAVELS as it arrives: into the pasture, into the corral, through the gate.
 * It is the negation of `resolveGateApproach().axis` in js/world/groundShading.js,
 * which points the other way on purpose (out of the mouth toward the traffic).
 * Two directions with two jobs; naming them differently is cheaper than one
 * shared vector everyone has to remember the sign of.
 *
 * NO THREE IMPORT. This is arithmetic over plain objects. Keeping three out
 * costs the client bundle nothing beyond these bytes, keeps the module callable
 * from the Worker-free unit tests, and lets Phase 2 own the scene-graph side
 * without this file growing a render opinion.
 */

/**
 * @typedef {'gate'|'corral'|'zone'|'portal'} GateCueKind
 *   'gate'   a mouth in a fence (Home Field, Rolling Hills, Newsheepdogland)
 *   'corral' a plain radial destination disc (no shipping scene since Cycle 117)
 *   'zone'   a hold-here gather disc, not yet the final destination (Open Country, roundup stage)
 *   'portal' a radial destination that ships its own vortex visual (Open Country, drive stage)
 *
 * `corral` is kept rather than deleted because it is the DEFAULT for any scene
 * that declares a `corral` without `effect: 'portal'`, and dropping it would
 * leave that authoring shape resolving to nothing. Cycle 117 moved Rolling
 * Hills off it; Open Country still ships the disc, just as a portal.
 */

/**
 * @typedef {Object} GateDescriptor
 * @property {{x: number, z: number}} position World-space centre of the destination.
 * @property {{x: number, z: number}} facing   Unit vector, the direction of travel INTO the destination.
 * @property {number} width                    Arc scale input: gate width, or radius * 2 for a disc.
 * @property {GateCueKind} kind
 */

/** Fallback direction when nothing in the scene def can derive one. */
const FALLBACK_FACING = Object.freeze({ x: 0, z: 1 });

/**
 * The stage a scene with an objective is in before any live state exists (scene
 * loaded, round not started). Must match `createObjective`'s initial stage in
 * shared/objective.js; tests/gate-descriptor.spec.js asserts that against the
 * real function rather than trusting this literal.
 */
export const DEFAULT_OBJECTIVE_STAGE = 'roundup';

/** Every kind a descriptor can carry, for consumers that style per kind. */
export const GATE_CUE_KINDS = Object.freeze(['gate', 'corral', 'zone', 'portal']);

/**
 * THE near threshold, and the band the far state fades across (Cycle 116 Phase
 * 2). One declaration, re-exported here so every consumer of the cue reads the
 * same two numbers through whichever of the two modules it already imports.
 *
 * They are DECLARED in `js/world/gateThreshold.js` and imported here, rather
 * than the other way round, and Phase 3-B measured why. `gateThreshold.js` is
 * in the eagerly loaded `main-*.js` chunk (`js/FencePresets.js` derives the
 * gate-post rim material during gate construction); this module is not, and its
 * chunk is only fetched when a scene builds. Rollup assigns a module to a chunk
 * by which entry points reach it, so a live edge from the eager module into this
 * one moves this whole file into `main-*.js`: +2,663 bytes, measured, against
 * 80 bytes of headroom on a fenced ratchet. Pointing the edge the other way
 * costs nothing, because a lazily loaded chunk reading from the eagerly loaded
 * one is what every effect in `js/effects/` already does.
 *
 * See `gateThreshold.js` for what the numbers mean.
 */
export {
    GATE_CUE_NEAR_DISTANCE,
    GATE_CUE_COLUMN_FADE_SPAN,
    GATE_CUE_WARM_LINEAR,
    GATE_RIM_MATERIALS_KEY,
} from './gateThreshold.js';
import {
    GATE_CUE_NEAR_DISTANCE,
    GATE_CUE_COLUMN_FADE_SPAN,
} from './gateThreshold.js';

/**
 * THE fade, and the only place the near threshold is turned into a number.
 *
 * 0 at or inside `GATE_CUE_NEAR_DISTANCE`, 1 once the fade span above it is
 * spent, smoothstepped between (matching `duskLampFactor`'s easing so the two
 * ramps in the shipping build behave the same way rather than one crawling and
 * one popping). A distance that is not a finite number reads as far, because a
 * cue that has not resolved a destination yet should point outward rather than
 * plant itself at the dog's feet.
 *
 * Private, because the two things the game reads off it are exact complements
 * and both are exported: {@link resolveGateCueVisibility}'s `columnOpacity` is
 * this, and {@link gateRimFactor} is one minus this. Writing the curve once is
 * what makes "the far surfaces and the near surfaces hand over at the same
 * metre" a fact about the code rather than a pair of formulas someone has to
 * keep in step.
 *
 * @param {number} distanceM
 * @returns {number} 0..1
 */
function columnFade(distanceM) {
    const u = isNum(distanceM)
        ? (distanceM - GATE_CUE_NEAR_DISTANCE) / GATE_CUE_COLUMN_FADE_SPAN
        : 1;
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return u * u * (3 - 2 * u);
}

/**
 * The one visibility decision, for one frame.
 *
 * The cue's far state (D13 state 1) is "the destination is beyond the near
 * threshold, or it is off-screen", and its near state (state 2) is the
 * complement. Every surface resolves its half of that here rather than holding
 * its own distance test:
 *
 *   `columnOpacity` / `showColumn` depend on `distance` ONLY. The column is
 *   world geometry; deriving its fade from whether the destination projects
 *   on-screen would pop it in the moment the camera swings past, since the
 *   column is 44m tall and stays in frame long after its base leaves.
 *
 *   `showCompass` / `near` additionally need `onScreen`. The compass has always
 *   been the off-screen fallback, and stays exactly that.
 *
 * ONE CALLER, ON PURPOSE (Cycle 116 Phase 5). This is called from the cue's
 * per-frame update and nowhere else. The cue projects the destination, resolves
 * this, and PUBLISHES the answer on `cue.view`; `CorralCompass` reads that
 * through `js/GameBridge.js` rather than importing this module and re-deriving
 * the destination, the distance and the projection for itself. That is the
 * difference between two surfaces agreeing because they call the same function
 * and two surfaces agreeing because there is only one answer.
 *
 * @param {{distance?: number, onScreen?: boolean}} view
 * @returns {{
 *   distance: number,
 *   onScreen: boolean,
 *   near: boolean,
 *   columnOpacity: number,
 *   showColumn: boolean,
 *   showCompass: boolean,
 * }}
 */
export function resolveGateCueVisibility(view) {
    const distance = isNum(view?.distance) ? view.distance : Infinity;
    const onScreen = view?.onScreen === true;
    const columnOpacity = columnFade(distance);
    return {
        distance,
        onScreen,
        near: onScreen && distance <= GATE_CUE_NEAR_DISTANCE,
        columnOpacity,
        showColumn: columnOpacity > 0,
        showCompass: !onScreen,
    };
}

/* ------------------------------------------------------------------------- *
 * THE CUE'S CURVES (Cycle 116, authored in Phase 3-A, re-homed in Phase 3-B)
 *
 * Everything below arrived in `js/world/gateThreshold.js` and moved here for a
 * measured reason, stated once so nobody moves it back.
 *
 * `gateThreshold.js` is in the eagerly loaded `main-*.js` chunk, because
 * `js/FencePresets.js` calls `applyGatePostRim` while it is building a gate.
 * This module is not: since Phase 5 it is reached from exactly one place, the
 * on-demand cue import in `js/boot/initWorld.js`, so the whole cue rides in
 * that one lazily loaded chunk and the eager bundle never pays for it. (Phase 2
 * also had `CorralCompass` import it, which put it in two lazy graphs at once
 * and made rollup hoist it into a third shared chunk both had to import across:
 * 3,384 bytes of chunk plus the cross-boundary export and import lists, for one
 * symbol. Phase 5's push-the-state-outward removed the edge.) Rollup drops a
 * declaration nothing calls, which is why Phase 3-A's layout measured clean:
 * every one of these functions was dead code in main and was shaken out.
 * Phase 3-B's arc calls them, so in that layout they all became live inside the
 * measured chunk (+583 bytes) and, when the edge ran the other way too, dragged
 * this whole file in with them (+2,663 bytes against 80 bytes of headroom).
 *
 * The split that costs nothing is by DIRECTION, not by subject: what the fence
 * builder needs stays eager (the warm, the rim material, the two handover
 * constants, the userData key) and this module imports and re-exports those;
 * what only the cue needs lives here. `tests/gate-threshold-arc.spec.js` fails
 * if `gateThreshold.js` ever grows an import from this file.
 * ------------------------------------------------------------------------- */

/**
 * `emissiveIntensity` on a gate post at full proximity.
 *
 * Emissive is added after lighting and before tone mapping, so this is a direct
 * lift on the post's lit colour: 0.55 x (1.00, 0.62, 0.26) = (0.55, 0.34, 0.14).
 * Deliberately an order below the homestead lantern's 2.2, and for the opposite
 * reason that number is high. The lantern is a handful of pixels and wants to
 * clip through the tone curve so it reads as a source. A gate post is a 2.2m
 * timber the player walks a dog past; over-driving it would turn a landmark into
 * a light bulb, and there are no lights in this game.
 */
export const GATE_POST_RIM_PEAK_INTENSITY = 0.55;

/**
 * Arc radius, in metres, from a descriptor's `width`.
 *
 * `resolveGateDescriptor` normalises two different things into one `width`:
 * a gate's mouth (Home Field 8, Rolling Hills 12, Newsheepdogland 12) and a
 * disc's diameter (Open Country 60 then 18). Half of either is the honest
 * radius, and for a disc that is the end of it - the arc IS the boundary the
 * flock has to end up inside, so drawing it anywhere else would be a lie about
 * where the sheep count.
 *
 * A gate is the one case that needs an outset. Its width is the gap BETWEEN two
 * posts, so an arc at exactly half of it is drawn through the posts and the
 * player reads a line that stops at the timber rather than a mouth to walk
 * through. 1.5m clears a 0.4m post section with room for the post jitter in
 * `js/FencePresets.js` to lean it. This is a per-KIND derivation, not a
 * per-scene one: Home Field, Rolling Hills and Newsheepdogland share it, and
 * hard stop 3 is about the cue branching on scene identity.
 *
 * The clamps shape nothing that ships. Every descriptor above lands between
 * them; they exist so a scene authored later with a 2m corral or a 400m zone
 * gets something drawable rather than a dot or a horizon ring.
 */
export const GATE_THRESHOLD_GATE_OUTSET_M = 1.5;
export const GATE_THRESHOLD_MIN_RADIUS_M = 4;
export const GATE_THRESHOLD_MAX_RADIUS_M = 34;

/**
 * Arc opacity with nothing in the funnel, and with the funnel full.
 *
 * The floor has to be visible without competing with the flock: the arc is a
 * standing mark on the ground for as long as the player is near the gate, and a
 * mark that reads as strongly as a sheep is a mark the player learns to ignore.
 * The ceiling is where the arc becomes the brightest thing on the ground, which
 * is exactly the moment it should be, because at that moment the flock is
 * funnelling in and the player's next input decides whether it stays.
 */
export const GATE_THRESHOLD_BASE_OPACITY = 0.28;
export const GATE_THRESHOLD_PEAK_OPACITY = 0.75;

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * How near the destination is, in [0, 1]. 1 at or inside
 * `GATE_CUE_NEAR_DISTANCE`, 0 once the fade span above it is spent, eased
 * between with the same Hermite the column uses.
 *
 * THE HANDOVER IS ONE DECISION. The near-state surfaces (the gate-post rim, the
 * ground arc) and the far-state surfaces (the world-space column, the
 * screen-edge chevron) have to change over at the same metre on every scene, so
 * this is one minus the same private `columnFade` that
 * {@link resolveGateCueVisibility}'s `columnOpacity` is, rather than a second
 * curve over a second threshold. There is no second formula to keep in step.
 * `tests/gate-threshold.spec.js` still asserts the two sum to 1 across the whole
 * band, against the live functions.
 *
 * A non-finite distance reads as 0 rather than throwing, because a cue with
 * nothing resolved should be invisible, not fatal.
 *
 * @param {number} distanceM - dog to destination, metres.
 * @returns {number}
 */
export function gateRimFactor(distanceM) {
    return 1 - columnFade(distanceM);
}

/**
 * Ground-arc radius for a descriptor, in metres.
 *
 * @param {{width?: number, kind?: string} | null | undefined} descriptor
 *   A {@link GateDescriptor}. Only `width` and `kind` are read.
 * @returns {number}
 */
export function gateThresholdRadius(descriptor) {
    const width = descriptor?.width;
    const half = isNum(width) && width > 0 ? width / 2 : 0;
    const outset = descriptor?.kind === 'gate' ? GATE_THRESHOLD_GATE_OUTSET_M : 0;
    const radius = half + outset;
    if (radius < GATE_THRESHOLD_MIN_RADIUS_M) return GATE_THRESHOLD_MIN_RADIUS_M;
    if (radius > GATE_THRESHOLD_MAX_RADIUS_M) return GATE_THRESHOLD_MAX_RADIUS_M;
    return radius;
}

/**
 * Arc opacity as a function of funnel occupancy alone, ignoring distance.
 *
 * Linear rather than eased, because the acceptance line is "brightens in
 * PROPORTION" and a proportion is a straight line. Half the funnel occupied is
 * half way between floor and ceiling, and a player who fills the funnel twice
 * as full sees twice the lift. An ease here would be prettier and would make
 * that sentence false.
 *
 * @param {number} occupancy - fraction of the approach funnel occupied, [0, 1].
 * @returns {number} opacity in [GATE_THRESHOLD_BASE_OPACITY, GATE_THRESHOLD_PEAK_OPACITY]
 */
export function gateThresholdBrightness(occupancy) {
    const t = isNum(occupancy) ? clamp01(occupancy) : 0;
    return GATE_THRESHOLD_BASE_OPACITY
        + (GATE_THRESHOLD_PEAK_OPACITY - GATE_THRESHOLD_BASE_OPACITY) * t;
}

/**
 * The arc's actual opacity: how near the player is, times how full the funnel
 * is. Stated once, here, so the near-fade and the occupancy curve are composed
 * the same way by every consumer.
 *
 * @param {number} distanceM
 * @param {number} occupancy
 * @returns {number}
 */
export function gateThresholdOpacity(distanceM, occupancy) {
    return gateRimFactor(distanceM) * gateThresholdBrightness(occupancy);
}

/* ------------------------------------------------------------------------- *
 * THE FUNNEL, AND THE CROSSING (Cycle 116 Phase 4)
 *
 * States 3 and 4 of the cue. State 3 is "the flock is funnelling in", which
 * brightens the arc in proportion to how full the approach is; state 4 is "one
 * of them just went through", which is a single warm pulse.
 *
 * Everything here is arithmetic over plain objects, in the lazily loaded chunk,
 * for the reason the block above states: `js/world/gateThreshold.js` is in the
 * eagerly loaded `main-*.js` chunk and this module is not. The per-frame count
 * runs over `gameState.sheep`, which the client already walks every frame for
 * retirement, so it is a second pass over data that is already hot rather than
 * a new source of work.
 * ------------------------------------------------------------------------- */

/**
 * How deep the approach funnel reaches back from the destination, as a multiple
 * of the arc radius.
 *
 * The funnel is the ground the player is actually working: far enough back that
 * a flock being walked in registers before its nose reaches the mark, close
 * enough that sheep milling in the middle of the field do not read as progress.
 * Two and a half radii is roughly "the last few seconds of the drive" at the
 * speeds the sim runs.
 */
const GATE_APPROACH_DEPTH_RATIO = 2.5;

/**
 * Square metres of funnel one sheep occupies when the funnel reads FULL.
 *
 * A sheep's body radius is 0.6m, so a genuinely packed flock sits at roughly
 * 1.5m centres. This is the area half of the capacity below, and it is what
 * stops Solo Chaos from saturating the cue the moment the flock exists: 5,000
 * sheep cannot fit in Home Field's 8m mouth, so the physical capacity of the
 * funnel is the honest ceiling there.
 */
const GATE_APPROACH_SHEEP_AREA_M2 = 2.5;

/**
 * Share of the LIVE flock that also reads as a full funnel, and the floor under
 * it.
 *
 * The area term alone would leave Open Country's 60m gather zone reading a few
 * percent full with the whole 200-sheep flock inside it, because the zone is
 * enormous and the flock is not. The flock term alone would leave Chaos never
 * brightening at all. Capacity is the SMALLER of the two, so the arc reaches
 * full when the funnel is physically packed OR when a decent share of the flock
 * is in it, whichever the scene and mode reach first. The floor keeps a small
 * survival flock (Newsheepdogland starts with a handful) able to fill its own
 * funnel.
 */
const GATE_APPROACH_FULL_FRACTION = 0.25;
const GATE_APPROACH_MIN_FULL = 3;

/**
 * The approach funnel for a destination: an oriented rectangle in the
 * descriptor's own frame, resolved once per scene rather than per frame.
 *
 * `back` and `front` are measured along `facing` (the direction the flock
 * TRAVELS into the destination), `half` across it. The per-kind split is the
 * same one the arc sweep and the gate outset make, for the same reason: a gate
 * is a mouth in a line, so the ground worth counting is entirely OUTSIDE it and
 * a sheep past the posts has already arrived. A disc's boundary IS the
 * destination, so sheep standing inside it are still part of what the player is
 * gathering. No scene is named (hard stop 3).
 *
 * `areaFull` is baked in here rather than recomputed per frame, and there are
 * no defensive numeric guards: the only input is a descriptor from
 * {@link resolveGateDescriptor}, whose shape `tests/gate-descriptor.spec.js`
 * already pins.
 *
 * @param {GateDescriptor} descriptor
 * @returns {{x: number, z: number, fx: number, fz: number, half: number, back: number, front: number, areaFull: number}}
 */
export function gateApproachRect(descriptor) {
    const radius = gateThresholdRadius(descriptor);
    const back = radius * GATE_APPROACH_DEPTH_RATIO;
    const front = descriptor.kind === 'gate' ? 0 : radius;
    return {
        x: descriptor.position.x,
        z: descriptor.position.z,
        fx: descriptor.facing.x,
        fz: descriptor.facing.z,
        half: radius,
        back,
        front,
        areaFull: (2 * radius * (back + front)) / GATE_APPROACH_SHEEP_AREA_M2,
    };
}

/**
 * How many sheep read as a full funnel, for this destination and this flock.
 *
 * The smaller of the two terms, so the area ceiling wins where the flock is
 * huge and the flock share wins where the funnel is huge. Never below
 * `GATE_APPROACH_MIN_FULL`, which also keeps the division in
 * {@link gateApproachOccupancy} away from zero.
 *
 * @param {ReturnType<typeof gateApproachRect>} rect
 * @param {number} flock - live sheep count (`activeCount`, not the array length).
 * @returns {number}
 */
export function gateApproachCapacity(rect, flock) {
    const byFlock = (isNum(flock) && flock > 0 ? flock : 0) * GATE_APPROACH_FULL_FRACTION;
    return Math.min(rect.areaFull, Math.max(GATE_APPROACH_MIN_FULL, byFlock));
}

/**
 * One pass, no allocation, no closure: how many sheep are in the funnel.
 *
 * Sheep that have already retired are skipped rather than filtered out, because
 * a filter would allocate a list per frame and Solo Chaos runs 5,000 of them.
 * The skip matters on Newsheepdogland in particular, where retired sheep stand
 * in the pen for the rest of the day instead of vanishing.
 *
 * @param {ArrayLike<any> | null | undefined} sheep
 * @param {ReturnType<typeof gateApproachRect> | null | undefined} rect
 * @returns {number}
 */
export function countSheepInGateApproach(sheep, rect) {
    if (!sheep || !rect) return 0;
    let count = 0;
    for (let i = 0; i < sheep.length; i++) {
        const s = sheep[i];
        const p = s?.position;
        if (!p || s.hasPassedGate || s.isRetiring) continue;
        const dx = p.x - rect.x;
        const dz = p.z - rect.z;
        const along = dx * rect.fx + dz * rect.fz;
        if (along > rect.front || along < -rect.back) continue;
        const across = dx * rect.fz - dz * rect.fx;
        if (across < -rect.half || across > rect.half) continue;
        count += 1;
    }
    return count;
}

/**
 * Funnel occupancy in [0, 1], the input {@link gateThresholdBrightness} is
 * stated in terms of.
 *
 * @param {ArrayLike<any> | null | undefined} sheep
 * @param {ReturnType<typeof gateApproachRect> | null | undefined} rect
 * @param {number} flock
 * @returns {number}
 */
export function gateApproachOccupancy(sheep, rect, flock) {
    if (!rect) return 0;
    return clamp01(countSheepInGateApproach(sheep, rect) / gateApproachCapacity(rect, flock));
}

/**
 * The crossing pulse: how long it lasts, and how much it lifts the cue.
 *
 * "One quiet warm pulse", so it is short enough to read as an acknowledgement of
 * a single event rather than as an animation, and it lifts the cue's existing
 * opacity rather than drawing anything new. Nothing is built, nothing is
 * allocated and nothing is added to the scene graph when a sheep crosses; one
 * float changes.
 */
export const GATE_PULSE_DURATION_S = 0.5;
export const GATE_PULSE_GAIN = 0.8;

/**
 * Pulse strength in [0, 1] at `elapsed` seconds since the pulse started.
 *
 * Instant attack, quadratic decay: the crossing is the event, so the cue is
 * brightest on the frame it is told about it and settles back. A ramp up would
 * put the peak somewhere after the thing it is acknowledging.
 *
 * @param {number} elapsedS
 * @returns {number}
 */
/**
 * Watch a pen for sheep arriving, without the pen knowing it is watched.
 *
 * WHY AN OBSERVER AND NOT AN EVENT. Every other scene tells the cue a sheep
 * crossed: Rolling Hills and Open Country dispatch `corral-retired` per sheep,
 * and Home Field dispatches the once-per-frame gate event. Newsheepdogland
 * retires its sheep somewhere neither of those runs. It declares a `gate` and a
 * `pen` and no `corral`, so `js/GameState.js` takes the gate branch and tests
 * `checkGatePassageAndRetire` against FieldConfig's passage zone at roughly
 * (+-4, 98..102) - about 1,200 metres from Newsheepdogland's actual gate at
 * (610, -1000). It never fires. What actually retires a sheep there is
 * `PenBarrier.update`, inside `shared/PenBarrier.js`, which dispatches
 * nothing and cannot be given a dispatch without a `shared/` edit.
 *
 * So the crossing is read rather than announced. `pennedCount` is recomputed
 * from scratch on every pen tick, so the frame-to-frame rise in it IS the
 * number of sheep that walked through the gate that frame, and reading it costs
 * one subtraction.
 *
 * NEGATIVE DELTAS ARE NOT CROSSINGS. `releaseAll` empties the pen at dawn and
 * `pennedCount` drops to zero; a fresh observer likewise starts at zero while
 * the pen may already be full when a cue is rebound mid-day. Both are
 * bookkeeping, not sheep, so only a rise is reported and the baseline follows
 * the count either way.
 *
 * It lives HERE, with {@link gatePulseEnvelope} and the two crossing event
 * names, rather than in `js/gamestate/penContainment.js` where Phase 4 first
 * wrote it. It reads one number off an object and is otherwise entirely the
 * cue's own bookkeeping, so the pen module was carrying it only because that is
 * where the number comes from - and the import made a pen shim that two lazily
 * loaded graphs both depend on. Nothing in the pen system ever called it.
 *
 * @param {{pennedCount?: number} | null | undefined} pen
 * @returns {() => number} sheep penned since the previous call. Allocates
 *   nothing per call and nothing per sheep.
 */
export function createPenCrossingObserver(pen) {
    let seen = pen?.pennedCount ?? 0;
    return () => {
        const now = pen?.pennedCount ?? 0;
        const crossed = now > seen ? now - seen : 0;
        seen = now;
        return crossed;
    };
}

export function gatePulseEnvelope(elapsedS) {
    // `!(x >= 0)` rather than a finite check, so NaN falls out here too.
    if (!(elapsedS >= 0) || elapsedS >= GATE_PULSE_DURATION_S) return 0;
    const u = 1 - elapsedS / GATE_PULSE_DURATION_S;
    return u * u;
}

/**
 * Name of the client-side event `js/GameState.js` dispatches once per frame on
 * which one or more sheep crossed a GATE (as opposed to entering a corral,
 * which keeps its own per-sheep `corral-retired` because the lightning zap
 * needs each position).
 *
 * Declared here, in the cue that consumes it, and used as a bare literal at the
 * dispatch site because `js/GameState.js` is in the eagerly loaded chunk and an
 * import from here would drag this whole module into it (see the block above).
 * `tests/gate-retire-event.spec.js` reads this constant and asserts the
 * dispatch site contains exactly it, so the two cannot drift apart even though
 * only one of them declares it.
 */
export const GATE_RETIRED_EVENT = 'gate-retired';

/** The corral path's existing per-sheep event, which the pulse also listens to. */
export const CORRAL_RETIRED_EVENT = 'corral-retired';

/**
 * The objective's existing stage-flip event, dispatched by `js/GameState.js`
 * (solo) and `js/boot/initNetwork.js` (multiplayer) when a round-up completes.
 *
 * The cue listens to it because it is the only moment a scene's destination
 * MOVES: `resolveGateDescriptor` reads `objective.stage`, so Open Country's
 * answer changes from the gather zone to the portal 245m north the instant this
 * fires, and every surface built at the old answer has to be rebuilt at the new
 * one. Declared here with the other two event names the cue consumes;
 * `tests/gate-cue-stage.spec.js` asserts both dispatch sites carry this exact
 * literal, since they are in the eagerly loaded chunk and cannot import it.
 */
export const OBJECTIVE_STAGE_EVENT = 'objective-stage-changed';

/**
 * Drive a set of gate-post rim materials from one proximity factor.
 *
 * The single drive point, and the reason the rim cannot go asymmetric the way
 * the rock rim did: there is one function, it writes one property, and that
 * property is read by the WebGL uniform path and by the WebGPU
 * `materialReference` path from the same object. There is no second half to keep
 * in step. `js/world/gateThreshold.js` works through the mechanism where the
 * material is derived; this is the write.
 *
 * @param {Iterable<object> | null | undefined} materials
 * @param {number} factor - proximity in [0, 1], normally {@link gateRimFactor}.
 * @returns {number} how many materials were written, for callers that assert.
 */
export function setGatePostRimIntensity(materials, factor) {
    if (!materials) return 0;
    const intensity = clamp01(isNum(factor) ? factor : 0) * GATE_POST_RIM_PEAK_INTENSITY;
    let written = 0;
    for (const material of materials) {
        if (!material || typeof material.emissiveIntensity !== 'number') continue;
        material.emissiveIntensity = intensity;
        written += 1;
    }
    return written;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {number} x
 * @param {number} z
 * @returns {{x: number, z: number} | null} unit vector, or null when degenerate
 */
function unit(x, z) {
    if (!isNum(x) || !isNum(z)) return null;
    const len = Math.hypot(x, z);
    if (!(len > 1e-6)) return null;
    return { x: x / len, z: z / len };
}

/**
 * The scene's axis-aligned play rect, whichever way it declares one. Cycle 5
 * introduced the discriminated `boundary`; pre-5 scenes (Home Field) still ship
 * only the legacy `bounds`, and `createGameState` synthesises the rect from it.
 *
 * @param {any} sceneDef
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number} | null}
 */
function resolvePlayRect(sceneDef) {
    const candidate = sceneDef?.boundary?.kind === 'rect' ? sceneDef.boundary : sceneDef?.bounds;
    if (!candidate) return null;
    const { minX, maxX, minZ, maxZ } = candidate;
    if (!isNum(minX) || !isNum(maxX) || !isNum(minZ) || !isNum(maxZ)) return null;
    if (!(maxX > minX) || !(maxZ > minZ)) return null;
    return { minX, maxX, minZ, maxZ };
}

/**
 * The point a radial destination faces away from. An island states its centre;
 * a rect gives its middle. A coastline states neither - its play area is a boot,
 * and a bounding-box centre for one would be a number with no meaning, so this
 * returns null and the caller falls back rather than inventing one.
 *
 * @param {any} sceneDef
 * @returns {{x: number, z: number} | null}
 */
function resolvePlayCentre(sceneDef) {
    const boundary = sceneDef?.boundary;
    if (boundary?.kind === 'island' && isNum(boundary.center?.x) && isNum(boundary.center?.z)) {
        return { x: boundary.center.x, z: boundary.center.z };
    }
    const rect = resolvePlayRect(sceneDef);
    if (rect) return { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 };
    return null;
}

/**
 * Outward normal of the play-rect edge a gate sits on. A gate is by definition a
 * break in a boundary, so "which edge is it nearest" answers "which way does it
 * open" without the scene having to declare a `facingDeg`. Home Field's gate is
 * at (0, maxZ), so this returns +Z.
 *
 * Ties (a gate exactly on a corner) resolve in the fixed order +Z, -Z, +X, -X.
 * Nothing declares one; the order exists so the answer is deterministic if
 * something ever does.
 *
 * @param {{x: number, z: number}} position
 * @param {{minX: number, maxX: number, minZ: number, maxZ: number}} rect
 * @returns {{x: number, z: number}}
 */
function outwardEdgeNormal(position, rect) {
    const edges = [
        { d: Math.abs(position.z - rect.maxZ), n: { x: 0, z: 1 } },
        { d: Math.abs(position.z - rect.minZ), n: { x: 0, z: -1 } },
        { d: Math.abs(position.x - rect.maxX), n: { x: 1, z: 0 } },
        { d: Math.abs(position.x - rect.minX), n: { x: -1, z: 0 } },
    ];
    let best = edges[0];
    for (const edge of edges) if (edge.d < best.d) best = edge;
    return { ...best.n };
}

/**
 * `GateDef.facingDeg` is a Y rotation in degrees applied to a +Z-facing gate
 * (js/StructureBuilder.js:563 sets `gate.rotation.y` from it directly), so the
 * opening's direction is that rotation applied to +Z.
 *
 * @param {number} deg
 * @returns {{x: number, z: number}}
 */
function facingFromDeg(deg) {
    const rad = (deg * Math.PI) / 180;
    return { x: Math.sin(rad), z: Math.cos(rad) };
}

/**
 * The Y rotation that turns a +Z-facing object to look along `facing`. The exact
 * inverse of `facingFromDeg` in radians, so a scene's authored `facingDeg` round
 * trips through a descriptor unchanged.
 *
 * @param {{x: number, z: number} | null | undefined} facing
 * @returns {number} radians
 */
export function gateFacingYaw(facing) {
    if (!isNum(facing?.x) || !isNum(facing?.z)) return 0;
    return Math.atan2(facing.x, facing.z);
}

/**
 * The live objective stage, or the pre-round default. Reads only what both the
 * solo tick (js/GameState.js) and the multiplayer mirror (js/boot/initNetwork.js)
 * write, and refuses anything it does not recognise so a malformed snapshot
 * cannot move the destination.
 *
 * @param {any} gameState
 * @returns {'roundup'|'drive'}
 */
function resolveObjectiveStage(gameState) {
    const stage = gameState?.objective?.stage;
    return stage === 'drive' || stage === 'roundup' ? stage : DEFAULT_OBJECTIVE_STAGE;
}

/**
 * Build a descriptor for a radial destination (a disc: corral, portal, gather
 * zone). Facing is derived outward from the play centre, which is the direction
 * the flock is travelling by the time it arrives.
 *
 * @param {any} sceneDef
 * @param {{x: number, z: number}} centre
 * @param {number} radius
 * @param {GateCueKind} kind
 * @returns {GateDescriptor | null}
 */
function radialDescriptor(sceneDef, centre, radius, kind) {
    if (!isNum(centre?.x) || !isNum(centre?.z) || !(radius > 0)) return null;
    const playCentre = resolvePlayCentre(sceneDef);
    const facing = playCentre
        ? unit(centre.x - playCentre.x, centre.z - playCentre.z)
        : null;
    return {
        position: { x: centre.x, z: centre.z },
        facing: facing ?? { ...FALLBACK_FACING },
        width: radius * 2,
        kind,
    };
}

/**
 * The one destination descriptor for a scene, or null when the scene declares no
 * destination at all.
 *
 * Resolution order is "what is the flock being driven at RIGHT NOW":
 *
 *   1. An objective still in its `roundup` stage. The gather zone is the live
 *      destination and the final one is not open yet, so the zone wins.
 *   2. A gate. A mouth in a fence is the thing the player aims at.
 *   3. A corral. `effect: 'portal'` distinguishes Open Country's vortex from
 *      Rolling Hills' plain disc so Phase 3-B can style them consistently
 *      without styling them identically.
 *
 * @param {any} sceneDef       A SceneDef (shared/scenes/types.js).
 * @param {any} [gameState]    Live state. Read ONLY for `objective.stage`.
 * @returns {GateDescriptor | null}
 */
export function resolveGateDescriptor(sceneDef, gameState) {
    if (!sceneDef) return null;

    const zone = sceneDef.objective?.roundupZone;
    if (zone && resolveObjectiveStage(gameState) === 'roundup') {
        const descriptor = radialDescriptor(sceneDef, zone, zone.radius, 'zone');
        if (descriptor) return descriptor;
    }

    // Cycle 117 P2: `pen.gate` first, then the top-level one. A fenced pasture
    // nests its gate inside the pen descriptor because a top-level `gate` is
    // load-bearing in the sim (see PenDef in shared/scenes/types.js), and the
    // cue has to aim at the opening the flock actually walks through. The `??`
    // order leaves Newsheepdogland, whose homestead gate IS top-level and which
    // has no nested one, resolving exactly as before. This is the data change
    // Cycle 116 built the descriptor for: one line, no new kind, no scene id.
    //
    // WHY THE ISLAND PASTURE IS 'gate' AND NOT A FIFTH KIND (Cycle 117 P5).
    // `kind` exists to answer three questions and nothing else, and a fenced
    // pasture answers all three the way Home Field's gate does:
    //   - `gateThresholdRadius`: does the arc need an outset past the posts?
    //     Yes. Rolling Hills' 12m is the gap BETWEEN two posts, exactly as
    //     Home Field's 8m is, so half of it is drawn through the timber.
    //   - `gateApproachRect`: is the ground worth counting entirely outside
    //     the mark? Yes. A sheep past the posts has arrived; there is no
    //     "still gathering it" state inside a pen the way there is inside
    //     Open Country's 60m zone.
    //   - `createGateThresholdArc`'s sweep: is a full ring wrong here? Yes.
    //     A ring would be drawn through the fence and half of it would sit
    //     inside the pasture.
    // A new kind would have to give a different answer to at least one of
    // those to earn its existence, and it gives the same answer to all three.
    // What makes the island a gate is the fence around it (Cycle 117 P4 builds
    // a real one, posts and all, so `collectGateRimMaterials` finds them and
    // the rim warms), not which scene file it is declared in.
    const gate = sceneDef.pen?.gate ?? sceneDef.gate;
    if (isNum(gate?.position?.x) && isNum(gate?.position?.z) && gate.width > 0) {
        const position = { x: gate.position.x, z: gate.position.z };
        let facing = null;
        if (isNum(gate.facingDeg)) {
            facing = facingFromDeg(gate.facingDeg);
        } else {
            const rect = resolvePlayRect(sceneDef);
            if (rect) {
                facing = outwardEdgeNormal(position, rect);
            } else {
                const playCentre = resolvePlayCentre(sceneDef);
                if (playCentre) facing = unit(position.x - playCentre.x, position.z - playCentre.z);
            }
        }
        return {
            position,
            facing: facing ?? { ...FALLBACK_FACING },
            width: gate.width,
            kind: 'gate',
        };
    }

    const corral = sceneDef.corral;
    if (corral?.center) {
        const kind = corral.effect === 'portal' ? 'portal' : 'corral';
        const descriptor = radialDescriptor(sceneDef, corral.center, corral.radius, kind);
        if (descriptor) return descriptor;
    }

    return null;
}
