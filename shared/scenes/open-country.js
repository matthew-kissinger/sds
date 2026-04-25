/**
 * Open Country — Cycle 5: a much larger island than Rolling Hills.
 * Wilderness round-up loop with woodland zones the sheep wander into.
 * Coastal pen at the north shore — drive sheep from the woods to the
 * gate. No perimeter fence (water replaces it).
 *
 * @type {import('./types.js').SceneDef}
 */
export const openCountry = {
    id: 'open-country',
    name: 'Open Country',
    description: 'A wild island of meadow and woods. Drive the flock through the trees to the coastal pen.',

    // Island ~760m diameter (radius 380) — way bigger than Rolling Hills
    // per playtest 2026-04-25. 70m falloff keeps the shoreline gentle.
    boundary: {
        kind: 'island',
        center: { x: 0, z: 0 },
        radius: 380,
        falloff: 70
    },

    // Coastal pen on the north shore (Q2 decision). Inside the island
    // safe radius — at z=130 with safeRadius=200, gate is well within.
    gate: {
        position: { x: 0, z: 130 },
        width: 10
    },

    pasture: {
        centerZ: 145,
        minX: -40,
        maxX: 40,
        minZ: 132,
        maxZ: 158
    },

    sheepSpawn: {
        pattern: 'scattered',
        count: 200,
        spreadRadius: 160,
        centerX: 0,
        centerZ: -150
    },

    terrain: {
        seed: 42,
        heightScale: 5,
        heightmapUrl: '/terrain/open-country.r32f',
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
        colors: { base: '#7a8a4e', mid: '#a8b870', tip: '#d8d088' }
    },

    farmHouse: null,

    // Open-country has no perimeter fence — only the gate + pen stand
    // alone in the field. Sheep are still bounded by the sim bounds box,
    // they just can't see a wall. StructureBuilder reads this flag to
    // skip the four border segments.
    perimeterFence: false,

    sky: { preset: 'golden-hour' },

    allowedModes: ['cooperative', 'timed'],
    defaultMode: 'cooperative',
    defaultCamera: 'follow',  // Q6: Follow makes the woodland depth read
    difficultyModifier: 1.1
};
