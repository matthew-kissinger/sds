// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Open Country — Cycle 5 island, Cycle 6 portal.
 * A wild island of meadow and woods. Drive the flock through the trees
 * to a magical portal at the north shore, where sheep ascend to retire.
 *
 * @type {import('./types.js').SceneDef}
 */
export const openCountry = {
    id: 'open-country',
    name: 'Open Country',
    description: 'A wild island of meadow and woods. Drive the flock through the trees to the portal.',

    // Island ~760m diameter (radius 380) — way bigger than Rolling Hills
    // per playtest 2026-04-25. 70m falloff keeps the shoreline gentle.
    boundary: {
        kind: 'island',
        center: { x: 0, z: 0 },
        radius: 380,
        falloff: 70
    },

    // Cycle 6 Phase 4: portal trigger replaces the coastal gate+pasture.
    // Placed at the north shore (z=295) so it reads as "edge of the world"
    // — well inside the safe land radius (380 - 70 - 4 = 306).
    // `effect: 'portal'` selects the swirling-vortex visual + ring shader
    // (vs. Rolling Hills' lightning-zap default).
    corral: {
        center: { x: 0, z: 295 },
        radius: 9,
        effect: 'portal'
    },

    sheepSpawn: {
        pattern: 'scattered',
        count: 200,
        // Cycle 8 Phase B: 8-cluster ring around the perimeter at radius
        // 240m (inside the 306m safe radius — boundary 380 minus 70
        // falloff minus 4 buffer). Cycle 7's 5-cluster southern bias
        // gave a "drive the flock north" loop but the user playtest
        // wanted edges emphasized so the gather phase requires a real
        // sweep across the island. Per-cluster spread tightened from
        // 90m to 60m so each cluster reads as a "group at the edge"
        // rather than scattered everywhere.
        spreadRadius: 60,
        centerX: 0,
        centerZ: 0,
        clusterCenters: [
            { x:    0, z: -240 },  // S
            { x:  170, z: -170 },  // SE
            { x:  240, z:    0 },  // E
            { x:  170, z:  170 },  // NE
            { x:    0, z:  240 },  // N (~55m south of portal at z=295)
            { x: -170, z:  170 },  // NW
            { x: -240, z:    0 },  // W
            { x: -170, z: -170 }   // SW
        ]
    },

    // Cycle 6 Phase 3: woodsZones drive density biasing in TreePlacement.
    // Three clusters away from the south-shore spawn and the north-shore
    // portal, so players cross from open ground into denser woods en route.
    woodsZones: [
        { center: { x: -150,  z: 60 }, radius: 70, density: 2 },
        { center: { x:  170,  z: 0  }, radius: 80, density: 2 },
        { center: { x:   30,  z: 170 }, radius: 65, density: 2 }
    ],

    terrain: {
        seed: 42,
        heightScale: 5,
        heightmapUrl: '/terrain/open-country.bin',
        version: 1,
        zones: {
            playArea: { minX: -380, maxX: 380, minZ: -380, maxZ: 380 },
            nearField: { minX: -380, maxX: 380, minZ: -380, maxZ: 380 },
            midField: { minX: -550, maxX: 550, minZ: -550, maxZ: 550 },
            farField: { minX: -800, maxX: 800, minZ: -800, maxZ: 800 },
            horizon: { minX: -1100, maxX: 1100, minZ: -1100, maxZ: 1100 }
        }
    },

    grass: {
        clumpsPerChunk: { desktop: 2400, mobile: 1000 },
        colors: { base: '#7a8a4e', mid: '#a8b870', tip: '#d8d088' },
        // Cycle 18 Phase 1: explicit grass radius supersedes Cycle 7's
        // densityRange=0.92. boundary.radius (380) minus 8m inner buffer
        // = 372m. With explicit grassRadius, GrassSystem expands the chunk
        // grid to cover the island AND uses 372m as the density falloff
        // zero point, so grass actually reaches the shore on the perimeter.
        // The Cycle 17 Phase 3 implicit grid expansion was reverted post-
        // gallery-review (broke per-m² density); per-scene explicit control
        // is the durable fix. densityRange retained as an inert fallback.
        grassRadius: 372,
        densityRange: 0.92
    },

    farmHouse: null,

    // Open-country has no perimeter fence — only the portal stands alone
    // in the field. Sheep are still bounded by the island, they just
    // can't see a wall.
    perimeterFence: false,

    // Cycle 7 Phase 3 / Cycle 17 Phase 6: gather → drive multi-stage objective.
    // Player must hold (≥ 40% of total mode sheep) inside the round-up zone at
    // (0, 50) radius 30m for 2.0 seconds before the portal at (0, 295) accepts
    // retirement. Required = clamp(totalSheep, max(10, floor(0.40 * total))).
    // Cycle 58 per-rung (this scene's solo ladder): Just Play 3→3, Quick 25→10,
    // Classic 50→20, Hard 150→60, Extreme 600→240, Chaos 5000→2000. The Cycle 58
    // clamp to totalSheep keeps the smallest rungs winnable (a 3-sheep flock can
    // never hold 10). Helper: `shared/ObjectiveLogic.getRequiredSheep`.
    objective: {
        roundupZone: { x: 0, z: 50, radius: 30 },
        requiredSheepFraction: 0.40,
        requiredSheepMin: 10,
        holdRequired: 2.0
    },

    // Cycle 25 Phase G: Pacific Northwest profile — tree2-leaning mix +
    // wider scale variation for wild-forest silhouette diversity.
    treeProfile: { tree1: 0.4, tree2: 0.6 },
    treeScaleJitter: { min: 0.90, max: 1.25 },

    sky: { preset: 'golden-hour' },
    // Cycle 23 Phase A1: cooler open-horizon linear fog. far 800m clears
    // the 380m island radius + 70m falloff with headroom for the
    // visible-from-shore mountain ring. Color tracks horizon LUT each
    // frame; near 220m so the desat (start 100m) and fog (near 220m)
    // layer cleanly.
    // Cycle 25 Phase B: lift fog further out — OC's mountain ring is the
    // intentional far-horizon mark, fog should haze it rather than wall
    // it off. near 220 -> 350, far 800 -> 900.
    fog: { color: '#b8c8d8', near: 350, far: 900 },

    // Cycle 6 Phase 5: starting-point boid override for the 380m radius
    // island (~4.5× Rolling Hills meadow area). Without re-tuning, cohesion
    // under-reaches and flocks fragment. Nudge perception radius up so
    // sheep recruit more neighbours; keep everything else default.
    // Tune in playtest. Both client `perception` and worker
    // `perceptionRadius` keys included since the two pathways read
    // different field names.
    flocking: {
        perception: 9,
        perceptionRadius: 9
    },

    // Cycle 58: the 380-metre gather-and-portal island is the hardest biome to
    // herd, so its ranked ladder runs the smallest counts of the three. It keeps
    // 5000 as the signature Chaos tier. Just Play is 3 sheep. The gather
    // objective's requiredSheep is clamped to <= totalSheep
    // (shared/ObjectiveLogic.js) so these small counts stay winnable. (The
    // sheepSpawn.count above is the multiplayer / default spawn, unrelated to
    // these solo counts.)
    soloLadder: [
        { id: 'practice', count: 3, ranked: false, label: 'Just Play', blurb: 'No timer, no fail state.' },
        { id: 'quick', count: 25, ranked: true, label: 'Quick', blurb: 'A small flock to portal home.' },
        { id: 'classic', count: 50, ranked: true, label: 'Classic', blurb: 'The open-country run.' },
        { id: 'hard', count: 150, ranked: true, label: 'Hard', blurb: 'A bigger gather across the woods.' },
        { id: 'extreme', count: 600, ranked: true, label: 'Extreme', blurb: 'Six hundred sheep.' },
        { id: 'chaos', count: 5000, ranked: true, label: 'Chaos', blurb: 'The flock becomes the antagonist.' },
    ],

    allowedModes: ['cooperative', 'timed'],
    defaultMode: 'cooperative',
    defaultCamera: 'follow',
    difficultyModifier: 1.1
};
