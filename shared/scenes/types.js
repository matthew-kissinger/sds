/**
 * Scene definitions — one file per biome, consumed by both client renderer
 * and Worker sim. JSDoc typedefs give IDE types without a TS build step.
 *
 * Sim-critical fields (bounds/gate/pasture/sheepSpawn) are read by
 * shared/index.js createGameState and worker/src/GameSim.js. Renderer fields
 * (terrain/grass/props/sky/fog) are reserved for Step 1b when BiomeBuilder
 * takes over from the hardcoded TerrainBuilder setup.
 */

/**
 * @typedef {Object} Bounds
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minZ
 * @property {number} maxZ
 */

/**
 * @typedef {Object} GateDef
 * @property {{x: number, z: number}} position
 * @property {number} width
 */

/**
 * @typedef {Object} PastureDef
 * @property {number} centerZ
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minZ
 * @property {number} maxZ
 */

/**
 * @typedef {Object} SheepSpawnDef
 * @property {"clustered"|"scattered"|"herded"} pattern
 * @property {number} count
 * @property {number} spreadRadius
 * @property {number} centerX
 * @property {number} centerZ
 */

/**
 * @typedef {Object} TerrainZone
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minZ
 * @property {number} maxZ
 */

/**
 * @typedef {Object} TerrainDef
 * @property {number} seed
 * @property {number} heightScale
 * @property {Record<string, TerrainZone>} zones
 * @property {string} [heightmapUrl]
 * @property {number} [version]
 */

/**
 * @typedef {Object} GrassColors
 * @property {string} base
 * @property {string} mid
 * @property {string} tip
 */

/**
 * @typedef {Object} GrassDef
 * @property {{desktop: number, mobile: number}} clumpsPerChunk
 * @property {GrassColors} [colors]
 * @property {{strength: number, frequency: number}} [wind]
 * @property {number} [cutoffDistance]
 */

/**
 * @typedef {Object} FarmHouseDef
 * @property {{x: number, z: number}} position
 * @property {Bounds} exclusionArea
 */

/**
 * @typedef {Object} SkyDef
 * @property {"pastoral-noon"|"dusk"|"overcast"|"dawn"|"golden-hour"} preset
 */

/**
 * @typedef {Object} FogDef
 * @property {string} color
 * @property {number} near
 * @property {number} far
 */

/**
 * @typedef {"cooperative"|"competitive"|"timed"} GameMode
 */

/**
 * @typedef {Object} SceneDef
 * @property {string} id                       Registry key (e.g. "field")
 * @property {string} name                     Display name (plain or i18n key)
 * @property {string} description              Short blurb or i18n key
 *
 * Simulation (authoritative; read by Worker + shared createGameState):
 * @property {Bounds} bounds
 * @property {GateDef} gate
 * @property {PastureDef} pasture
 * @property {SheepSpawnDef} sheepSpawn
 *
 * Rendering (reserved for Step 1b — BiomeBuilder consumption):
 * @property {TerrainDef} [terrain]
 * @property {GrassDef} [grass]
 * @property {FarmHouseDef} [farmHouse]
 * @property {SkyDef} [sky]
 * @property {FogDef|null} [fog]
 *
 * Gameplay:
 * @property {GameMode[]} allowedModes
 * @property {GameMode} defaultMode
 * @property {number} [timeLimit]              Mode-specific override, seconds
 * @property {number} [difficultyModifier]     Flock tightness / dog stamina scale
 */

export {};
