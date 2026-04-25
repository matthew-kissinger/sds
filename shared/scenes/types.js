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
 * Discriminated boundary shape. Cycle 5 introduced `island` alongside the
 * legacy `rect`. createGameState synthesises `{ kind: 'rect', ...bounds }`
 * for scenes that ship only the legacy `bounds` field.
 *
 * @typedef {{kind: 'rect', minX: number, maxX: number, minZ: number, maxZ: number}} RectBoundary
 * @typedef {{kind: 'island', center: {x: number, z: number}, radius: number, falloff: number}} IslandBoundary
 * @typedef {RectBoundary | IslandBoundary} Boundary
 */

/**
 * @typedef {Object} CorralDef
 * @property {{x: number, z: number}} center
 * @property {number} radius
 */

/**
 * @typedef {Object} WoodsZoneDef
 * @property {{x: number, z: number}} center
 * @property {number} radius
 * @property {number} density            Multiplier vs base tree density (>1 dense, <1 sparse)
 */

/**
 * @typedef {Object} FlockingOverride
 * @property {number} [separationDistance]
 * @property {number} [neighborRadius]
 * @property {number} [maxSpeed]
 * @property {number} [cohesionStrength]
 * @property {number} [alignmentStrength]
 * @property {number} [separationStrength]
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
 * @property {Bounds} [bounds]                  Legacy rect-only field; synthesised into `boundary` if present without `boundary`
 * @property {Boundary} [boundary]              Cycle 5+ discriminated boundary; takes precedence over `bounds` if both present
 * @property {GateDef} [gate]                   Optional for `island` scenes that use a `corral` instead
 * @property {PastureDef} [pasture]             Optional for `island` scenes that use a `corral` instead
 * @property {CorralDef} [corral]               Cycle 5+ — circular destination zone (Rolling Hills); replaces gate+pasture when present
 * @property {SheepSpawnDef} sheepSpawn
 * @property {WoodsZoneDef[]} [woodsZones]      Cycle 5+ — biased tree placement clusters (Open Country)
 * @property {FlockingOverride} [flocking]      Cycle 5+ — per-scene boid tuning override (Phase 1.5)
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
 * @property {'classic'|'follow'|'free'} [defaultCamera]   Cycle 5+ — initial camera mode if user has no localStorage preference
 * @property {boolean} [perimeterFence]                    Render flag — false disables the visual fence ring
 * @property {number} [timeLimit]              Mode-specific override, seconds
 * @property {number} [difficultyModifier]     Flock tightness / dog stamina scale
 */

export {};
