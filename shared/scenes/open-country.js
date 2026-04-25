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
        spreadRadius: 160,
        centerX: 0,
        centerZ: -150
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

    // Open-country has no perimeter fence — only the portal stands alone
    // in the field. Sheep are still bounded by the island, they just
    // can't see a wall.
    perimeterFence: false,

    sky: { preset: 'golden-hour' },

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

    allowedModes: ['cooperative', 'timed'],
    defaultMode: 'cooperative',
    defaultCamera: 'follow',
    difficultyModifier: 1.1
};
