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

    // Cycle 64 inert: the survival pen, same place as the corral. Nothing reads
    // it for gameplay yet (Cycle 65 wires the safe-zone semantics).
    pen: {
        center: { x: 895, z: -982 },
        radius: 34,
    },

    // The world origin is the instep bay (water on a boot), so the dog spawns in
    // the foot lowland instead of the default (0, -30).
    dogSpawn: { x: -100, z: -1050 },

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

    // Conifer-leaning woods: a dense forest band on the leg, a light scatter in
    // the foot. Kept well inside the land so the scatter stays off the water.
    woodsZones: [
        { center: { x: -616, z: 560 }, radius: 320, density: 2.5 },
        { center: { x: -520, z: -250 }, radius: 240, density: 1.2 },
        { center: { x: 300, z: -1120 }, radius: 280, density: 0.5 },
    ],
    treeProfile: { tree1: 0.7, tree2: 0.3 },
    treeScaleJitter: { min: 0.92, max: 1.3 },

    farmHouse: {
        position: { x: 650, z: -1080 },
        exclusionArea: { minX: 600, maxX: 700, minZ: -1130, maxZ: -1030 },
    },

    sky: { preset: 'dusk' },
    // Dusk-tinted fog lifted well past the far shore (the island spans ~3 km) so
    // the horizon reads as soft haze rather than a fog wall over the water.
    fog: { color: '#b9a98c', near: 600, far: 2600 },

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
