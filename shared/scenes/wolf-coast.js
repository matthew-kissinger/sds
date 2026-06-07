// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Wolf Coast - Cycle 64. A boot-shaped island roughly 3.2 km^2 with a 120 m
 * mountain in the north leg, banking curved coastlines, and forest / tall-grass
 * / light-tree biome bands. The first scene on the new `coastline` boundary
 * kind (an arbitrary concave shoreline the radial `island` kind cannot express).
 *
 * Playable in the existing modes this cycle (Just Play, Solo). Survival mode,
 * wolves, the day/night loop, co-op, and the survival leaderboard are Cycles
 * 65-68. The `pen` field ships here as inert data for survival to consume later;
 * the wired herding destination this cycle is the `corral` at the toe.
 *
 * The coastline polygon, the heightmap mask, and the sim SDF all come from the
 * same WOLF_COAST_POINTS array (shared/scenes/wolf-coast.coast.js) so the
 * rendered coast cannot drift from the sim boundary. Heightmap baked by:
 *   node scripts/bake-heightmap.mjs --scene wolf-coast --boundary coastline \
 *     --points shared/scenes/wolf-coast.coast.js --size 1024 --worldSize 3300 \
 *     --peakHeight 12 --mountainHeight 120 --peakX -616 --peakZ 1110 \
 *     --peakRadius 520 --seaLevel -3 --coastFalloff 50 --seed 7 \
 *     --out public/terrain/wolf-coast.bin
 *
 * @type {import('./types.js').SceneDef}
 */
import { WOLF_COAST_POINTS } from './wolf-coast.coast.js';

export const wolfCoast = {
    id: 'wolf-coast',
    name: 'Wolf Coast',
    description: 'A boot-shaped island under a low dusk sky. A mountain in the north, a wide foot lowland, and a stone fold at the toe to drive the flock into.',

    // Cycle 64: the coastline boundary. cellSize 12 (the spiked resolution) MUST
    // match the value any future Worker build uses for co-op determinism, so it
    // rides here, not on either consumer. falloff 30m beach band.
    boundary: {
        kind: 'coastline',
        points: WOLF_COAST_POINTS,
        falloff: 30,
        cellSize: 12,
    },

    // Herding destination this cycle: a fold at the toe (the far-east foot).
    corral: {
        center: { x: 895, z: -982 },
        radius: 34,
        effect: 'zap',
    },

    // Cycle 65: the homestead pen - the herd-back home zone for the day loop,
    // beside the farmhouse. Sheep counted within this radius by dusk are "home".
    // Separate from the toe `corral`, which stays the wired Solo objective.
    pen: {
        center: { x: 640, z: -1000 },
        radius: 30,
    },

    // Cycle 65: the homestead gate on the west edge of the pen, facing the
    // grazing lowland. The day loop swings it open at dawn, closed at night.
    // facingDeg 90 turns the opening to span the north-south pen edge.
    gate: {
        position: { x: 610, z: -1000 },
        width: 12,
        facingDeg: 90,
    },

    // Cycle 65: the dog wakes at the homestead, just outside the gate, ready to
    // herd the flock grazing west across the foot. (Was the lone foot drop in
    // Cycle 64; now it is the homestead doorstep.)
    dogSpawn: { x: 585, z: -1000 },

    sheepSpawn: {
        pattern: 'scattered',
        count: 200,
        spreadRadius: 300,
        // Clustered in the foot lowland, west of the toe corral so there is a
        // real drive across the foot.
        centerX: 250,
        centerZ: -1150,
    },

    perimeterFence: false,

    terrain: {
        seed: 7,
        // Heights are stored as absolute metres in the bake; manifest
        // peakHeight=1, so the displaced mesh reads metres directly.
        heightScale: 1,
        heightmapUrl: '/terrain/wolf-coast.bin',
        version: 1,
        zones: {
            playArea: { minX: -300, maxX: 700, minZ: -1450, maxZ: -800 },
            nearField: { minX: -700, maxX: 900, minZ: -1500, maxZ: 200 },
            midField: { minX: -1100, maxX: 1300, minZ: -1500, maxZ: 900 },
            farField: { minX: -1400, maxX: 1500, minZ: -1600, maxZ: 1500 },
            horizon: { minX: -1700, maxX: 1700, minZ: -1700, maxZ: 1700 },
        },
    },

    grass: {
        clumpsPerChunk: { desktop: 950, mobile: 400 },
        // Cooler coastal greens than the golden Rolling Hills.
        colors: { base: '#5a6a3a', mid: '#83904f', tip: '#c8cf86' },
        // Wolf Coast is ~3.2 km^2; grassing the whole island would be thousands
        // of chunks / draw calls. The play loop lives in the foot, so the grass
        // grid centres there and spans only it (the mountain/leg are forest +
        // alpine, not meadow). Density + waterline cull still follow the SDF.
        grassCenter: { x: 350, z: -1050 },
        grassRadius: 650,
        // The tall-grass shore band across the foot, just inside the sole.
        tallZones: [
            { minX: -250, maxX: 750, minZ: -1380, maxZ: -1050, heightMul: 1.8 },
        ],
    },

    // Cycle 65 biome character: dense forest pockets, a tree-line windbreak, and
    // a deliberately open grazing pasture so the foot reads as fields-and-woods
    // rather than one mountain on empty ground. Densities: >1 dense, <1 sparse.
    // The central-east foot (the grazing field) is left open on purpose; the
    // west foot (the future homestead) stays light so the dog start is clear.
    // Trees in water are culled by the Cycle 64 coastline SDF, so coastal stands
    // self-trim at the shore.
    woodsZones: [
        // Dense conifer forest cloaking the mountain skirt on the leg.
        { center: { x: -616, z: 560 }, radius: 300, density: 3.0 },
        // A second dense stand lower on the leg.
        { center: { x: -430, z: 120 }, radius: 190, density: 2.4 },
        // Thinning treeline where the leg meets the foot.
        { center: { x: -520, z: -260 }, radius: 210, density: 1.1 },
        // North-foot windbreak: a row of tight stands reads as a tree line
        // dividing the open foot pasture from the wooded leg.
        { center: { x: -150, z: -880 }, radius: 55, density: 2.2 },
        { center: { x: 20, z: -870 }, radius: 55, density: 2.2 },
        { center: { x: 190, z: -875 }, radius: 55, density: 2.2 },
        { center: { x: 360, z: -880 }, radius: 55, density: 2.2 },
        { center: { x: 520, z: -885 }, radius: 55, density: 2.2 },
        // A lone copse on the east foot near the toe, for depth.
        { center: { x: 700, z: -1180 }, radius: 130, density: 0.9 },
        // A light grove southwest of the homestead so the west foot has shape
        // without crowding the dog start.
        { center: { x: -280, z: -1180 }, radius: 110, density: 1.0 },
    ],
    treeProfile: { tree1: 0.7, tree2: 0.3 },
    treeScaleJitter: { min: 0.92, max: 1.3 },

    farmHouse: {
        position: { x: 650, z: -1080 },
        exclusionArea: { minX: 600, maxX: 700, minZ: -1130, maxZ: -1030 },
    },

    sky: { preset: 'dusk' },
    // Dusk-tinted fog lifted well past the far shore (the island spans ~3 km) so
    // the horizon reads as soft haze rather than a fog wall over the water. The
    // day/night cycle drives the fog COLOR from the horizon each frame; these
    // near/far distances stay fixed so the huge island never hits a fog wall.
    fog: { color: '#b9a98c', near: 600, far: 2600 },

    // Cycle 65: the day/night cycle + the homestead herd-back day loop. You wake
    // at the homestead just after sunrise on day one; the sun arcs over
    // secondsPerDay; dayLoop opts in the gate-by-phase + herd-back-before-dusk
    // controller. A tunable strawman (day length / start time) for Matt's pass.
    dayNight: { enabled: true, secondsPerDay: 240, initialT: 0.28, dayLoop: true },

    // Cycle 64: a tunable strawman ladder (reserved for Matt's feel pass). The
    // island is large, so it runs a broad span from a 3-sheep Just Play up to
    // the 5000 Chaos signature tier.
    soloLadder: [
        { id: 'practice', count: 3, ranked: false, label: 'Just Play', blurb: 'No timer, no fail state.' },
        { id: 'quick', count: 25, ranked: true, label: 'Quick', blurb: 'A small flock in the foot.' },
        { id: 'classic', count: 100, ranked: true, label: 'Classic', blurb: 'The coast run.' },
        { id: 'hard', count: 300, ranked: true, label: 'Hard', blurb: 'Three hundred across the lowland.' },
        { id: 'extreme', count: 1000, ranked: true, label: 'Extreme', blurb: 'A thousand sheep.' },
        { id: 'chaos', count: 5000, ranked: true, label: 'Chaos', blurb: 'The flock becomes the antagonist.' },
    ],

    allowedModes: ['cooperative', 'competitive', 'timed'],
    defaultMode: 'cooperative',
    defaultCamera: 'follow',
    difficultyModifier: 1.2,
};
