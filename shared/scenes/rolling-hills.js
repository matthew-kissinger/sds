/**
 * Rolling Hills — Cycle 5: an island bounded by water, with an off-centre
 * corral the player must drive sheep into. No perimeter fence, no gate;
 * the destination is a circular corral reached by navigation across
 * the heightfield.
 *
 * @type {import('./types.js').SceneDef}
 */
export const rollingHills = {
    id: 'rolling-hills',
    name: 'Rolling Hills',
    description: 'Find the corral on the island. Drive the flock home before they wander into the water.',

    // Sim — Cycle 5 island. Centre at origin, 90m radius, 15m falloff into sea.
    boundary: {
        kind: 'island',
        center: { x: 0, z: 0 },
        // Bigger island per playtest 2026-04-25 — original 90m radius felt
        // cramped. 180m gives a generous open meadow. 40m falloff drops
        // the slope to ~15° (beach instead of cliff).
        radius: 180,
        falloff: 40
    },

    // Off-centre corral (Q1 decision) — visible from the island centre but
    // requires navigation to reach. Tall flag/pillar makes it findable from
    // the far shore; CorralCompass HUD kicks in when off-screen.
    corral: {
        center: { x: 110, z: 60 },
        radius: 8
    },

    sheepSpawn: {
        pattern: 'scattered',
        count: 250,
        spreadRadius: 45,
        // Spawn south-west of origin so players have to traverse to reach the corral
        centerX: -30,
        centerZ: -30
    },

    perimeterFence: false,

    terrain: {
        seed: 1,
        heightScale: 6,
        heightmapUrl: '/terrain/rolling-hills.r32f',
        version: 1,
        zones: {
            playArea: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
            nearField: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
            midField: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
            farField: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
            horizon: { minX: -800, maxX: 800, minZ: -800, maxZ: 800 }
        }
    },

    grass: {
        clumpsPerChunk: { desktop: 2200, mobile: 900 },
        colors: { base: '#6a7038', mid: '#9a9858', tip: '#e8c878' },
        // Cycle 18 Phase 1: explicit grass radius. boundary.radius (180) minus
        // 8m inner buffer = 172m. Density falloff zero point lands inside the
        // 217m island.boundary cull, so the boundary still owns the cliff edge
        // while the falloff curve is shaped to the island instead of the
        // worldSize default (252m extended past the shoreline).
        grassRadius: 172
    },

    // No farmhouse on the island — original (180, 160) would sit in the
    // water with the new boundary. If we want set-dressing later it should
    // move inside the island disc.

    // Cycle 25 Phase G: Mediterranean profile — even mix, default jitter.
    treeProfile: { tree1: 0.5, tree2: 0.5 },
    treeScaleJitter: { min: 0.80, max: 1.20 },

    sky: { preset: 'dusk' },
    // Cycle 23 Phase A1: warm dusk-tinted linear fog. near 200m matches
    // the Cycle 22 atmospheric desat start; far 650m is just past the
    // 380m island shore so off-island horizon reads as a soft fade
    // instead of crisp ocean line. Color is lifted toward sky horizon
    // each frame in Atmosphere.applyFogColor().
    // Cycle 25 Phase B: lift fog further out so RH's island horizon reads
    // as soft haze rather than a structural fog wall. near 200 -> 350,
    // far 650 -> 900.
    fog: { color: '#d4c4a8', near: 350, far: 900 },

    allowedModes: ['cooperative', 'competitive', 'timed'],
    defaultMode: 'cooperative',
    defaultCamera: 'follow',  // Q6: Follow makes the island depth read
    difficultyModifier: 1.25
};
