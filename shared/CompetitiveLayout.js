// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';

/**
 * Competitive gate and pasture layout generation (P3-GSV-SPLIT: moved
 * verbatim from GameStateValidation.js). Stateless and deterministic - no
 * external dependencies.
 *
 * Cycle 122: the three hand-written 2/3/4-player tables that used to live here
 * were Home Field's geometry longhand, applied to every scene regardless of
 * where the player actually was. They are now DERIVED from the scene's own
 * boundary, and the derivation reproduces those tables bit-for-bit on Home
 * Field - see `tests/competitive-layout.spec.js`, which pins the old numbers
 * verbatim so the derivation cannot drift off them silently.
 *
 * Two things are deliberately kind-aware, and the second one is the subtle one:
 *
 *   MEASUREMENT - a `rect` boundary answers "how far to the edge" with its
 *   half-extent, an `island` with its radius.
 *
 *   PLACEMENT - a rect puts its pastures OUTSIDE the boundary, an island puts
 *   them INSIDE. This is not symmetry for its own sake. Home Field is a fenced
 *   rect in an open plane, and its sheep reach a pasture beyond the fence via
 *   the gate-passage carve-out plus the extended +-35m retirement clamp. An
 *   island's boundary is the waterline, enforced by a HARD radial clamp at
 *   `radius - margin` in BoundaryCollision.js with no carve-out at all, so a
 *   pasture outside it is not merely wet, it is unreachable: the sheep cannot
 *   arrive and the round can never complete. Cycle 117's Rolling Hills pen sits
 *   at roughly 0.64R, inside, and that is the shipped precedent.
 *
 * NOTE FOR ANY FUTURE CHANGE: `js/boot/initNetwork.js` hardcodes gate
 * `width: 8` and `height: 4` when it transforms the broadcast payload, and the
 * payload does not carry them. So GATE_WIDTH must stay scene-independent, or it
 * has to start riding the wire first. See the migration story in
 * `docs/archive/cycles/cycle-122-plan.md`.
 */

/** Half the gate opening, across the direction of travel. Scene-independent - see the note above. */
const GATE_WIDTH = 8;
/** How deep the passage-detection zone extends through the gate. */
const GATE_DEPTH = 4;
/** Clear gap between the gate line and the near edge of the pasture. */
const PASTURE_PAD = 2;
/** Pasture extent along the direction of travel. */
const PASTURE_DEPTH = 28;
/** Pasture half-extent across the direction of travel. */
const PASTURE_HALF_WIDTH = 30;
/**
 * Smallest gate radius an island layout may degrade to before the pasture depth
 * starts giving way instead. No shipped scene comes near this: Rolling Hills
 * (the smallest island that allows competitive) resolves a gate radius of about
 * 107 m. It exists so a hypothetically tiny island degrades deliberately rather
 * than producing a gate at a negative radius.
 */
const MIN_ISLAND_GATE_RADIUS = 20;
/** Floor on that degradation, so a pasture never collapses to nothing. */
const MIN_PASTURE_DEPTH = 8;

/**
 * Direction order per player count, and the colour each position takes.
 * This is contract, not preference: `assignGatesToPlayers` maps playerIds by
 * index, so reordering these reassigns which player owns which corner of the
 * map, and `tests/sim-baseline/competitive.json` is a trace of the 2-player
 * order below.
 */
const LAYOUT_ORDER = {
    2: [
        { direction: 'north', color: 0xFF0000 },
        { direction: 'south', color: 0x0000FF }
    ],
    3: [
        { direction: 'north', color: 0xFF0000 },
        { direction: 'east', color: 0x0000FF },
        { direction: 'west', color: 0x00FF00 }
    ],
    4: [
        { direction: 'north', color: 0xFF0000 },
        { direction: 'south', color: 0x0000FF },
        { direction: 'east', color: 0x00FF00 },
        { direction: 'west', color: 0xFFFF00 }
    ]
};

/**
 * Cardinal axis and sign per direction. For 2 to 4 players every bearing is
 * cardinal, so the ring needs no trigonometry - which matters, because
 * `.claude/rules/shared-sim.md` does not pin Math.cos/sin across engines and a
 * layout that drifted by one ULP between the Worker and a client would desync
 * the prediction. Sign-and-axis is exact everywhere.
 */
const DIRECTION_AXIS = {
    north: { axis: 'z', sign: 1 },
    south: { axis: 'z', sign: -1 },
    east: { axis: 'x', sign: 1 },
    west: { axis: 'x', sign: -1 }
};

/** The default boundary when a caller supplies none: Home Field's own rect. */
const DEFAULT_BOUNDARY = Object.freeze({ kind: 'rect', minX: -100, maxX: 100, minZ: -100, maxZ: 100 });

/**
 * Reduce a boundary to what the layout actually needs: a centre, and how far
 * the boundary sits from it along each cardinal axis.
 *
 * @param {object} boundary
 * @returns {{ centerX: number, centerZ: number, reachX: number, reachZ: number, inside: boolean, safeReach: number }}
 */
function measureBoundary(boundary) {
    if (boundary.kind === 'island') {
        const r = boundary.radius;
        // The flat meadow ends where the beach falloff begins; beyond it the
        // ground slopes to the sea, and Cycle 117 learned the hard way that a
        // pasture on a slope is a defect, not a detail.
        const safeReach = Math.max(0, r - (boundary.falloff ?? 0));
        return {
            centerX: boundary.center.x,
            centerZ: boundary.center.z,
            reachX: r,
            reachZ: r,
            inside: true,
            safeReach
        };
    }
    if (boundary.kind === 'rect') {
        const centerX = (boundary.minX + boundary.maxX) / 2;
        const centerZ = (boundary.minZ + boundary.maxZ) / 2;
        const reachX = (boundary.maxX - boundary.minX) / 2;
        const reachZ = (boundary.maxZ - boundary.minZ) / 2;
        return { centerX, centerZ, reachX, reachZ, inside: false, safeReach: Math.min(reachX, reachZ) };
    }
    // `coastline` is Newsheepdogland, whose `allowedModes` DOES include
    // competitive and timed even though D19 keeps the scene entrance-gated
    // (`?scene=newsheepdogland` still reaches it). A boot-shaped concave
    // polygon has no single "reach", and inscribing one is real work that this
    // cycle did not scope.
    //
    // So it keeps the legacy rect verbatim: byte-for-byte today's behaviour,
    // which is D23's binding constraint - broken as before, never NEWLY
    // crashing. Throwing here would have been a new crash on a reachable
    // scene, which is hard stop 4. When NSL's regression burn-down lifts D19,
    // giving it a real competitive layout is that cycle's job.
    return measureBoundary(DEFAULT_BOUNDARY);
}

/**
 * Where the far edge of each pasture sits, as a distance from the centre.
 *
 * Both cases keep the SAME outward relationship - gate, then `PASTURE_PAD` of
 * clear ground, then `PASTURE_DEPTH` of pasture - and differ only in where that
 * run is anchored. A rect anchors it at the boundary and runs outward; an
 * island anchors it so the pasture's outermost CORNER lands on the safe reach
 * and runs inward from there. Corner rather than edge, because a rect pasture
 * on a circle is widest at its corners and that is what would touch the beach.
 *
 * Math.sqrt is IEEE-754 spec-pinned and safe in the deterministic core; the
 * transcendentals shared-sim.md warns about are trig, log, exp and pow.
 */
function resolvePastureOuter(measured) {
    if (!measured.inside) return measured.reachX + PASTURE_PAD + PASTURE_DEPTH;
    const safe = measured.safeReach;
    const cornerLimited = safe * safe - PASTURE_HALF_WIDTH * PASTURE_HALF_WIDTH;
    return cornerLimited > 0 ? Math.sqrt(cornerLimited) : 0;
}

/**
 * Generate competitive gate layout for multiple players.
 *
 * @param {number} playerCount - Number of players (2-4)
 * @param {object} [boundary] - The scene's Boundary. Defaults to Home Field's rect.
 * @returns {Array} - Array of gate/pasture configurations
 */
export function generateCompetitiveGateLayout(playerCount, boundary = DEFAULT_BOUNDARY) {
    const order = LAYOUT_ORDER[playerCount];
    if (!order) {
        throw new Error(`Unsupported player count: ${playerCount}. Must be 2-4 players.`);
    }

    const measured = measureBoundary(boundary || DEFAULT_BOUNDARY);
    const pastureOuter = resolvePastureOuter(measured);

    // Deliberate degradation for an island too small to hold the standard run.
    // The pasture gives way before the gate does, because a gate at a tiny
    // radius would put every player's start on top of every other player's.
    let pastureDepth = PASTURE_DEPTH;
    let gateReach = pastureOuter - PASTURE_PAD - pastureDepth;
    if (measured.inside && gateReach < MIN_ISLAND_GATE_RADIUS) {
        pastureDepth = Math.max(MIN_PASTURE_DEPTH, pastureOuter - PASTURE_PAD - MIN_ISLAND_GATE_RADIUS);
        gateReach = Math.max(0, pastureOuter - PASTURE_PAD - pastureDepth);
    }

    return order.map((entry, index) => {
        const { axis, sign } = DIRECTION_AXIS[entry.direction];
        const alongCenter = axis === 'z' ? measured.centerZ : measured.centerX;
        const acrossCenter = axis === 'z' ? measured.centerX : measured.centerZ;
        // A rect measures its reach per axis; an island's reach is its radius
        // either way, so this reads the right one without a second branch.
        const boundaryReach = measured.inside
            ? measured.reachX
            : (axis === 'z' ? measured.reachZ : measured.reachX);

        const gateAlong = alongCenter + sign * (measured.inside ? gateReach : boundaryReach);
        const nearAlong = alongCenter + sign * ((measured.inside ? gateReach : boundaryReach) + PASTURE_PAD);
        const farAlong = alongCenter + sign * ((measured.inside ? gateReach : boundaryReach) + PASTURE_PAD + pastureDepth);
        const minAlong = Math.min(nearAlong, farAlong);
        const maxAlong = Math.max(nearAlong, farAlong);
        const minAcross = acrossCenter - PASTURE_HALF_WIDTH;
        const maxAcross = acrossCenter + PASTURE_HALF_WIDTH;

        const gate = axis === 'z'
            ? { x: acrossCenter, z: gateAlong }
            : { x: gateAlong, z: acrossCenter };

        // Passage zone: GATE_WIDTH across the opening, GATE_DEPTH through it.
        // Preserved exactly as the hand-written tables computed it.
        const passageZone = axis === 'z'
            ? {
                minX: gate.x - GATE_WIDTH / 2,
                maxX: gate.x + GATE_WIDTH / 2,
                minZ: gate.z - GATE_DEPTH,
                maxZ: gate.z + GATE_DEPTH
            }
            : {
                minX: gate.x - GATE_DEPTH,
                maxX: gate.x + GATE_DEPTH,
                minZ: gate.z - GATE_WIDTH / 2,
                maxZ: gate.z + GATE_WIDTH / 2
            };

        const pasture = axis === 'z'
            ? { minX: minAcross, maxX: maxAcross, minZ: minAlong, maxZ: maxAlong }
            : { minX: minAlong, maxX: maxAlong, minZ: minAcross, maxZ: maxAcross };

        return {
            id: index,
            position: new Vector2D(gate.x, gate.z),
            width: GATE_WIDTH,
            height: 4,
            // Gate passage zone (invisible box for detection)
            passageZone,
            pasture: {
                centerZ: (pasture.minZ + pasture.maxZ) / 2,
                minX: pasture.minX,
                maxX: pasture.maxX,
                minZ: pasture.minZ,
                maxZ: pasture.maxZ
            },
            playerId: null,
            color: entry.color,
            direction: entry.direction
        };
    });
}

/**
 * Legacy rect bounds for a boundary, for the competitive sheep clamp.
 *
 * `shared/index.js` has `boundaryToBounds` doing the same job, but importing it
 * here would close a cycle (index.js imports this module's consumers), so this
 * is a deliberate small duplicate rather than a refactor of the module graph.
 * Kept beside the layout it serves so the two cannot disagree about what a
 * boundary means.
 *
 * @param {object} boundary
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number}}
 */
export function competitiveBoundsFromBoundary(boundary) {
    const b = boundary || DEFAULT_BOUNDARY;
    if (b.kind === 'island') {
        const r = b.radius;
        return { minX: b.center.x - r, maxX: b.center.x + r, minZ: b.center.z - r, maxZ: b.center.z + r };
    }
    if (b.kind === 'rect') {
        return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
    }
    // `coastline` has no minX/maxX, so reading them would put `undefined` into
    // the sheep clamp and NaN into every position it touches. Same reasoning as
    // measureBoundary: keep the legacy rect until NSL gets a real layout.
    const d = DEFAULT_BOUNDARY;
    return { minX: d.minX, maxX: d.maxX, minZ: d.minZ, maxZ: d.maxZ };
}

/**
 * Assign gates to players in competitive mode
 * @param {Array} gates - Array of gate configurations
 * @param {Array} playerIds - Array of player IDs
 * @returns {Array} - Gates with assigned player IDs
 */
export function assignGatesToPlayers(gates, playerIds) {
    if (gates.length !== playerIds.length) {
        throw new Error(`Gate count (${gates.length}) must match player count (${playerIds.length})`);
    }

    // Rotate assignment to ensure fairness
    const assignedGates = gates.map((gate, index) => ({
        ...gate,
        playerId: playerIds[index % playerIds.length]
    }));

    return assignedGates;
}
