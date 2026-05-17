/**
 * Home Field — the flat starter scene. Mountains ring the perimeter as
 * visual backdrop; the play area itself is flat. This captures every
 * currently-hardcoded constant that shapes sim + renderer behavior so
 * a second scene can diverge by file swap alone.
 *
 * Sim-critical constants are consumed today (Step 1). Renderer constants
 * are captured here but still read from TerrainBuilder/GrassSystem
 * hardcodes until Step 1b wires BiomeBuilder.
 *
 * @type {import('./types.js').SceneDef}
 */
export const field = {
    id: 'field',
    name: 'Home Field',
    description: 'Flat fenced pasture. The classic scene.',

    // --- Simulation (authoritative) ---
    // Mirrors shared/index.js createGameState defaults (lines 126-129)
    // and worker/src/GameSim.js hardcoded bounds (lines 63, 69).
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },

    gate: {
        position: { x: 0, z: 100 },
        width: 8
    },

    pasture: {
        centerZ: 115,
        minX: -30,
        maxX: 30,
        minZ: 102,
        maxZ: 130
    },

    sheepSpawn: {
        pattern: 'clustered',
        count: 200,
        spreadRadius: 25,
        centerX: -20,
        centerZ: -20
    },

    // --- Rendering (reserved for Step 1b) ---
    // Mirrors js/TerrainBuilder.js constructor hardcodes (lines 42-57)
    // and js/GrassSystem.js clumpsPerChunk (line 62).
    terrain: {
        seed: 0,
        heightScale: 0, // Flat.
        zones: {
            playArea: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
            nearField: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
            midField: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
            farField: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
            horizon: { minX: -800, maxX: 800, minZ: -800, maxZ: 800 }
        }
    },

    grass: {
        clumpsPerChunk: { desktop: 1800, mobile: 800 },
        colors: { base: '#5a7a3e', mid: '#8aa860', tip: '#c4d68c' }
    },

    farmHouse: {
        position: { x: 180, z: 160 },
        exclusionArea: { minX: 140, maxX: 220, minZ: 120, maxZ: 200 }
    },

    // Cycle 25 Phase G: per-scene tree distribution profile + scale jitter.
    // Field reads as English-pasture: tree1-leaning mix + tighter scale
    // variation for a more manicured silhouette. Profile probabilities
    // sum to 1.
    treeProfile: { tree1: 0.7, tree2: 0.3 },
    treeScaleJitter: { min: 0.90, max: 1.15 },

    sky: { preset: 'pastoral-noon' },
    // Cycle 25 Phase B: fog retuned from "structural mask" to "horizon
    // haze only". near 220 -> 350 / far 700 -> 900 lifts the mid-distance
    // fog veil that was compensating for LOD1 silhouette drift.
    fog: { color: '#cfd9e8', near: 350, far: 900 },

    // --- Gameplay ---
    allowedModes: ['cooperative', 'competitive', 'timed'],
    defaultMode: 'cooperative'
};
