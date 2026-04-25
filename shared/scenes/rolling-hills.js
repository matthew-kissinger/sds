/**
 * Rolling Hills — a harder variant of Home Field, now with real
 * displaced terrain. Sim bounds match Home Field (so the existing
 * fenced perimeter still fits), but the ground rolls beneath via a
 * heightmap reference, and the sky burns dusk-orange.
 *
 * @type {import('./types.js').SceneDef}
 */
export const rollingHills = {
    id: 'rolling-hills',
    name: 'Rolling Hills',
    description: 'Hills you have to climb. The flock scatters wider; the gate sits across the ridge.',

    // Sim — bounds match Home Field so the current rendered perimeter fits.
    // The differentiation is in the spawn + sheep count.
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
        pattern: 'scattered',
        count: 250,
        spreadRadius: 45,
        centerX: 0,
        centerZ: -40
    },

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
        colors: { base: '#6a7038', mid: '#9a9858', tip: '#e8c878' }
    },

    farmHouse: {
        position: { x: 180, z: 160 },
        exclusionArea: { minX: 140, maxX: 220, minZ: 120, maxZ: 200 }
    },

    sky: { preset: 'dusk' },
    fog: { color: '#d8b888', near: 180, far: 600 },

    allowedModes: ['cooperative', 'competitive', 'timed'],
    defaultMode: 'cooperative',
    difficultyModifier: 1.25
};
