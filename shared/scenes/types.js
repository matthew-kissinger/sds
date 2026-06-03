// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
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
 * @property {'zap'|'portal'} [effect]   Cycle 6 Phase 4 — retirement visual.
 *                                       'zap' (default): lightning bolt + flag pillar (Rolling Hills).
 *                                       'portal': swirling vortex + ring shader (Open Country).
 */

/**
 * @typedef {Object} WoodsZoneDef
 * @property {{x: number, z: number}} center
 * @property {number} radius
 * @property {number} density            Multiplier vs base tree density (>1 dense, <1 sparse)
 */

/**
 * Per-scene boid tuning override (Cycle 5+). The override is merged into
 * two different config shapes — the client uses `gameState.params` keys,
 * the Worker uses `createBoidConfig` keys. Include the keys for the
 * pathway(s) you want to affect; unknown keys are harmless on either side.
 *
 * Client (`GameState.params`, consumed by `OptimizedSheep.updateBehavior`):
 * @property {number} [perception]            Neighbour query radius (default 5)
 * @property {number} [separationDistance]    (default 2)
 * @property {number} [separationWeight]      (default 1.6)
 * @property {number} [alignmentWeight]       (default 1.6)
 * @property {number} [cohesion]              (default 0.1)
 * @property {number} [maxForce]              (default 0.02)
 * @property {number} [fleeMultiplier]        (default 4)
 * @property {number} [fleeRadius]            (default 8)
 * @property {number} [gateAttraction]        (default 2)
 * @property {number} [edgeMargin]            (default 2.5)
 * @property {number} [edgeTurnForce]         (default 0.05)
 *
 * Worker (`createBoidConfig`, consumed by `worker/src/GameSim.updateSheep`):
 * @property {number} [perceptionRadius]      Neighbour query radius (default 5)
 * @property {number} [maxSpeed]              (default 1.5)
 * @property {number} [cohesionWeight]        (default 1.0)
 *
 * @typedef {Object} FlockingOverride
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
 * @property {number} [densityRange] Multiplier on `worldSize` for the radial
 *   density-falloff zero point. Default 0.6 — grass density drops to zero at
 *   `worldSize * 0.6` from origin. Legacy fallback when `grassRadius` is absent.
 * @property {number} [grassRadius] Cycle 18 Phase 1 — explicit inner generation
 *   extent in metres. Grass density falloff goes to zero at this distance from
 *   origin. When set, overrides the legacy `worldSize * densityRange` formula
 *   AND drives the chunk-grid extent so grass actually reaches the radius
 *   (the Cycle 17 Phase 3 attempt to do this implicitly via island math was
 *   reverted; explicit per-scene control was the lesson). When absent, falls
 *   back to `worldSize * densityRange` (byte-identical for opt-out scenes).
 *   - Field: omit (default 252m falloff is correct for the rect scene).
 *   - Rolling Hills: 172 (= boundary.radius - 8).
 *   - Open Country: 372 (= boundary.radius - 8).
 */

/**
 * Cycle 7 Phase 3: multi-stage objective. When set on a scene, the scene's
 * corral retirement is gated until the round-up condition is met — the player
 * must hold the required-sheep count within `roundupZone` for `holdRequired`
 * seconds. Until then, sheep that wander into the corral don't retire.
 *
 * Cycle 17 Phase 6: required count can scale with total mode sheep via
 * `requiredSheepFraction` + `requiredSheepMin`. If `requiredSheep` is set
 * explicitly, it wins (legacy + opt-out for non-scaling scenes). The
 * `getRequiredSheep` helper in `shared/ObjectiveLogic.js` resolves all
 * three fields into a single value at game-start.
 *
 * @typedef {Object} ObjectiveDef
 * @property {{x: number, z: number, radius: number}} roundupZone Center + radius of the gather zone.
 * @property {number} [requiredSheep]            Explicit count. When present, fraction/min are ignored.
 * @property {number} [requiredSheepFraction]    Fraction of total sheep (default 0.40).
 * @property {number} [requiredSheepMin]         Lower bound on the computed count (default 10).
 * @property {number} holdRequired               Seconds the count must be held before stage transitions.
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
 * @property {ObjectiveDef} [objective]         Cycle 7+ — multi-stage objective (round-up → drive). When absent, scene retires sheep on corral entry directly.
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
 * @property {string} [placementManifest]   Cycle 45 Phase 3 — optional URL of a
 *   build-time-baked placement manifest (JSON of pre-scattered tree positions).
 *   When set, the renderer loads these positions instead of running the seeded
 *   Poisson scatter at scene-load. Render-only; the Worker sim never reads it.
 *   Scenes without it fall back to runtime `generateTrees` unchanged.
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
