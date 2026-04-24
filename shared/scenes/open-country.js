/**
 * Open Country — a wide pastoral field with no perimeter fences. The dog
 * and player must guide the flock to a gate that floats on the terrain
 * with no walls funneling them in. Golden-hour aesthetic reserved for
 * when the renderer's atmosphere wiring lands (Phase B).
 *
 * Sim differentiation today: larger bounds, no fence assumptions, gate
 * pushed deeper, scattered spawn across a wider radius. Heightmap URL
 * is referenced for Phase B asset consumption — runtime tolerates the
 * file being absent because no consumer fetches it yet.
 *
 * @type {import('./types.js').SceneDef}
 */
export const openCountry = {
    id: 'open-country',
    name: 'Open Country',
    description: 'A wide pastoral field. No fences — herd them through the gates yourself.',

    bounds: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 },

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
        spreadRadius: 80,
        centerX: 0,
        centerZ: -50
    },

    terrain: {
        seed: 42,
        heightScale: 5,
        heightmapUrl: '/terrain/open-country.r32f',
        version: 1,
        zones: {
            playArea: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 },
            nearField: { minX: -250, maxX: 250, minZ: -250, maxZ: 250 },
            midField: { minX: -450, maxX: 450, minZ: -450, maxZ: 450 },
            farField: { minX: -700, maxX: 700, minZ: -700, maxZ: 700 },
            horizon: { minX: -900, maxX: 900, minZ: -900, maxZ: 900 }
        }
    },

    grass: {
        clumpsPerChunk: { desktop: 2400, mobile: 1000 },
        colors: { base: '#7a8a4e', mid: '#a8b870', tip: '#d8d088' }
    },

    farmHouse: null,

    sky: { preset: 'golden-hour' },
    fog: { color: '#e8d8b8', near: 250, far: 800 },

    allowedModes: ['cooperative', 'timed'],
    defaultMode: 'cooperative',
    difficultyModifier: 1.1
};
