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
 * Cycle 64 adds `coastline` for an arbitrary concave shoreline (a boot, a bay)
 * that the radial `island` kind cannot express. Its `points` polygon is the
 * single prebaked artifact — both the Worker sim and the client predictor build
 * an identical signed-distance field from it at load (shared/CoastlineField.js).
 * `cellSize` (SDF grid resolution, m) MUST match across client and Worker for
 * determinism, so it rides on the boundary def, not on either consumer.
 *
 * @typedef {{kind: 'rect', minX: number, maxX: number, minZ: number, maxZ: number}} RectBoundary
 * @typedef {{kind: 'island', center: {x: number, z: number}, radius: number, falloff: number}} IslandBoundary
 * @typedef {{kind: 'coastline', points: Array<{x: number, z: number}>, falloff: number, cellSize?: number}} CoastlineBoundary
 * @typedef {RectBoundary | IslandBoundary | CoastlineBoundary} Boundary
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
 * Cycle 64: a sheep pen — a safe enclosure the flock is driven into. This cycle
 * ships it as INERT data + visual only (it coexists with the scene's `corral`,
 * which is the wired herding destination). The survival safe-zone semantics
 * (overnight protection, bankruptcy accounting) arrive in Cycle 65; nothing
 * reads `pen` for gameplay yet, so it is the cheap additive fence case.
 *
 * @typedef {Object} PenDef
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
 * @property {number} [facingDeg]   Cycle 65 — Y rotation (deg) of the gate opening. Used by the homestead day-loop gate; absent for legacy perimeter gates.
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
 * @property {Record<string, TerrainZone>} [streamedZones] Cycle 87 Phase 2 —
 *   tree zones built AFTER first-interactive by js/world/foliageStreaming.js,
 *   one idle-scheduled wave per named zone (same nearField/midField/farField/
 *   horizon vocabulary as `zones`). The cold-path build reads only `zones`;
 *   streamed candidates inside any cold `zones` rect are rejected so the two
 *   sets never double-place. Render-only (the Worker ignores `terrain`); the
 *   solo-sim obstacle bundle is refreshed at wave completion on the client.
 *   Absent => no streaming (byte-identical for every existing scene).
 *   Consumers: js/world/foliageStreaming.js, shared/TreePlacement.js (zones
 *   override opts), tests/foliage-streaming.spec.js.
 */

/**
 * @typedef {Object} GrassColors
 * @property {string} base
 * @property {string} mid
 * @property {string} tip
 */

/**
 * Cycle 64: `tallZones` scales grass blade height inside axis-aligned rects, so
 * a scene can grow a tall-grass band (the Wolf Coast shore band) without a new
 * grass system. Absent => grass height is unchanged (byte-identical for every
 * existing scene). Render-only; the sim never reads it.
 *
 * @typedef {Object} GrassTallZone
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minZ
 * @property {number} maxZ
 * @property {number} heightMul   Blade-height multiplier vs the scene base.
 *
 * Cycle 64: `grassCenter` recentres the grass chunk grid off the world origin.
 * The grid spans `grassRadius` around this point, not (0,0). Needed for a large
 * island whose play area sits far from the origin (Wolf Coast's foot): without
 * it the grid would have to span the whole island (thousands of chunks / draw
 * calls). Absent => the grid centres on the origin (every pre-64 scene).
 *
 * @typedef {Object} GrassDef
 * @property {{desktop: number, mobile: number}} clumpsPerChunk
 * @property {GrassColors} [colors]
 * @property {{strength: number, frequency: number}} [wind]
 * @property {GrassTallZone[]} [tallZones]
 * @property {{x: number, z: number}} [grassCenter]
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
 * @property {{grassRadius: number, clumpsPerChunk: {desktop: number, mobile: number}}} [streamed]
 *   Cycle 87 Phase 3 — wider grass coverage built AFTER first-interactive by
 *   js/world/foliageStreaming.js as the final streaming wave. The cold-path
 *   build keeps `grassRadius`/`clumpsPerChunk` above; the streamed pass covers
 *   the annulus out to `streamed.grassRadius` at `streamed.clumpsPerChunk`
 *   density, skipping chunks the cold grid already built. Render-only; absent
 *   => no streamed grass. Consumers: js/GrassSystem.js (buildStreamedGrass),
 *   js/world/foliageStreaming.js, tests/newsheepdogland-scene.spec.js.
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
 * @property {number} [rotationDeg]   Cycle 65 — Y rotation (deg) of the house. Overrides the default 225deg Field facing so the porch can turn toward a homestead pen. Additive optional.
 */

/**
 * Cycle 58: one rung of a biome's solo difficulty ladder. The ladder is the
 * source of truth for "how many sheep does difficulty X spawn on this biome",
 * replacing the flat per-id `SOLO_MODE_SHEEP_COUNT` table so the two islands can
 * run smaller, faster tiers than Home Field without disturbing Home Field's
 * ranked counts. Resolved through `shared/difficulty.js` (pure, shared by the
 * client and the Worker). `id` is the armed `singlePlayerMode` handle (stable
 * within a biome); `count` is `totalSheep`; `ranked` gates leaderboard submit.
 * `label` / `blurb` are render-only (entrance copy) and ignored by the Worker.
 *
 * Leaderboard identity is `(scene_id, count)`, not the id — so two biomes may
 * reuse an id for different counts, and a count is comparable across the ids
 * that happen to share it. `label` / `blurb` follow prose-and-voice.md (no
 * em-dashes, no exclamation marks, concrete numbers).
 *
 * @typedef {Object} SoloLadderEntry
 * @property {string} id        Armed singlePlayerMode handle (e.g. 'classic').
 * @property {number} count     totalSheep spawned at this rung.
 * @property {boolean} ranked   Whether a finished run submits to the leaderboard.
 * @property {string} [label]   Player-facing tier name (entrance). Render-only.
 * @property {string} [blurb]   One-line tier description (entrance). Render-only.
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
 * Cycle 65: opt-in day/night cycle + the homestead day loop for a scene. When
 * `enabled`, the renderer turns on the existing DayNightCycle (js/atmosphere/
 * DayNightCycle.js): the sun starts at `initialT` and arcs over `secondsPerDay`.
 * `dayLoop` opts the scene into the client-side herd-back day loop (gate opens at
 * dawn, closes at night, count the flock home by dusk). Render/client-only - the
 * Worker sim never reads it, so it is the cheap additive fence case. Absent =>
 * the scene keeps its static `sky.preset` (every pre-65 scene), byte-identical.
 *
 * @typedef {Object} DayNightDef
 * @property {boolean} enabled            Turn on the day/night sun arc.
 * @property {number} [secondsPerDay]     Real seconds for a full day (default 600).
 * @property {number} [initialT]          Start time-of-day in [0,1) (default 0.5 noon; 0.25 sunrise, 0.75 sunset).
 * @property {boolean} [dayLoop]          Opt into the homestead herd-back day loop.
 */

/**
 * Cycle 66 - the survival run config. When present (Newsheepdogland), the scene
 * is a survival run: it starts with `startFlock` sheep (no count selection), and
 * the client-side run economy (js/gamestate/survivalRun.js) grows the flock by
 * `growth` each surviving day and ends the run when a night loses `lossThreshold`
 * or more of the flock. Solo + client-only; the Worker sim never reads it, so it
 * is the cheap additive fence case (absent => not a survival scene).
 *
 * @typedef {Object} SurvivalDef
 * @property {number} startFlock          Flock size at the start of the run (Matt's spec: 10).
 * @property {number} [growth]            Sheep added per surviving day (default 5).
 * @property {number} [lossThreshold]     Loss ratio in a night that ends the run (default 1/3).
 * @property {number} [maxFlock]          InstancedMesh capacity ceiling for growth (default 80).
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
 * @property {PenDef} [pen]                      Cycle 64 — inert safe-enclosure data/visual (survival reads it in Cycle 65); coexists with `corral`
 * @property {{x: number, z: number}} [dogSpawn] Cycle 64 — initial dog position; defaults to (0, -30) when absent (every pre-64 scene). Must be on land.
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
 * @property {SoloLadderEntry[]} [soloLadder]   Cycle 58 — per-biome solo difficulty
 *   ladder (ordered easiest-first). Optional: scenes without it fall back to the
 *   legacy default (`practice 30 / classic 200 / extreme 1000 / insane 3000 /
 *   chaos 5000`) via `shared/difficulty.js`, so this is the cheap additive fence
 *   case. Consumed by `getSoloCount` (totalSheep), `getRankedCounts` (Worker
 *   submit allow-list + leaderboard count tabs), and the entrance.
 * @property {DayNightDef} [dayNight]   Cycle 65 — opt-in day/night sun arc + the homestead day loop. Render/client-only; the Worker ignores it. Absent => static sky.preset.
 * @property {SurvivalDef} [survival]   Cycle 66 — opt-in survival run (start flock, +growth/day, loss threshold). Client-only; the Worker ignores it. Absent => not a survival scene.
 * @property {GameMode[]} allowedModes
 * @property {GameMode} defaultMode
 * @property {'classic'|'follow'|'free'} [defaultCamera]   Cycle 5+ — initial camera mode if user has no localStorage preference
 * @property {'webgl'} [renderer]   Cycle 71 — pin this scene to the WebGL renderer regardless of the global WebGPU preference. Render-only (the Worker ignores it). Default absent => follow the global renderer choice. Today only newsheepdogland sets it: its cold WebGPU pipeline compile blocks the main thread ~43s and TDR-crashes the tab, and the WebGPU node-lighting is wrong on it; WebGL loads it in ~2s with correct lighting. See cycle71-validation/webgpu-crash/findings.md.
 * @property {boolean} [prewarmShaders]   Cycle 74 - opt this scene into a build-tail `renderer.compileAsync(scene, camera)` pass (shown as an 'Optimizing shaders' load step) on the WebGPU renderer, so the heavy cold pipeline compile runs on Dawn's async path instead of blocking the first renderAsync (the lazy compile TDR-crashes the tab on the heavy scene). Render-only; WebGPU-only (no-op on the WebGL-pinned path, where lazy compile is already cheap); the Worker ignores it. Default absent => no prewarm (every existing scene byte-identical). Today only newsheepdogland sets it. See docs/cycle-74-plan.md.
 * @property {boolean} [perimeterFence]                    Render flag — false disables the visual fence ring
 * @property {number} [timeLimit]              Mode-specific override, seconds
 * @property {number} [difficultyModifier]     Flock tightness / dog stamina scale
 */

export {};
