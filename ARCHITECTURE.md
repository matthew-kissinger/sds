# Sheep Dog Simulator — Architecture

## Overview

A real-time 3D herding game with GPU-accelerated rendering, edge-hosted multiplayer, and cross-platform input. The client runs on Cloudflare Pages; the multiplayer server is a Cloudflare Worker fronted by Durable Objects and D1.

### Key technical features

- **GPU-first rendering** — 200 sheep in a single draw call via Three.js `InstancedMesh` with a custom vertex shader that animates legs and heads per-instance.
- **Edge multiplayer** — authoritative 60 Hz sim runs in a Durable Object; state is broadcast over WebSocket as MessagePack frames. No colocated "game server" — rooms live wherever Cloudflare puts them.
- **Hybrid single / multiplayer** — shared deterministic sim in `shared/` is imported by both the browser client (for single-player and prediction) and the Worker (for authoritative multiplayer). Flocking behavior is byte-identical.
- **Adaptive jitter buffer** — client widens the interpolation window automatically when packet arrival stddev rises, without reopening connections.
- **Cross-platform input** — desktop keyboard, full-analog gamepad, and touch joystick paths share a single `InputHandler`.

## Tech stack

### Client
| Technology | Version | Purpose |
|------------|---------|---------|
| Three.js | 0.184 | WebGL rendering |
| React | 19.2 | UI (uses `React.createElement`, no JSX) |
| Vite | 7.3 | Build tooling |
| Tailwind CSS | 4.1 | Styling |
| i18next | 25 | 18 localized languages |
| @msgpack/msgpack | 3 | WS wire format |
| lz-string | 1.5 | Sandbox share-URL compression |
| nipple.js | 0.10 | Mobile joystick |

### Server (Cloudflare Workers)
| Technology | Version | Purpose |
|------------|---------|---------|
| Cloudflare Workers | — | HTTP + WS edge runtime |
| Durable Objects | — | Per-room state (RoomDO) + singleton lobby (LobbyDO) |
| D1 | — | SQLite-on-edge leaderboard |
| wrangler | 4.84 | Deploy + dev tooling |
| @msgpack/msgpack | 3 | WS wire format |

### Testing
| Technology | Version | Purpose |
|------------|---------|---------|
| Vitest | 4.1 | Unit + integration tests |
| Playwright | latest | Browser smoke tests |

### Infrastructure
- **Frontend hosting:** Cloudflare Pages (`sds-frontend`, production branch `main`), served at [sheepdogsim.com](https://sheepdogsim.com) via a proxied CNAME
- **API:** Cloudflare Worker (`sds-worker`) at `sds-worker.matt-m-kissinger.workers.dev`
- **State:** Durable Objects (`RoomDO` per room, `LobbyDO` as a singleton)
- **Database:** Cloudflare D1 (`sds-db`) — materialized leaderboards + append-only submission log

See [docs/cycle-2-report.md](docs/cycle-2-report.md) for the full cutover record.

## System architecture

```
┌─────────────────────────── CLIENT (Cloudflare Pages) ─────────────────────────┐
│                                                                               │
│  StartScreen → GameState → OptimizedSheep → SceneManager                      │
│       ↓              ↓            ↓              ↓                            │
│  MobileControls  InputHandler  Sheepdog    TerrainBuilder                     │
│       ↓              ↓            ↓              ↓                            │
│  AudioManager   GamepadManager  GrassSystem   ReactUI                         │
│                                                                               │
│                         NetworkManager                                        │
│       (native WebSocket + @msgpack/msgpack + fetch, adaptive jitter buffer)   │
└───────────────────┬──────────────────────────────────────────┬────────────────┘
              HTTPS │ fetch                                WSS │ WebSocket
┌─────────────────────────── WORKER (sds-worker) ──────────────────────────────┐
│                                                                              │
│  index.ts — HTTP router + WS upgrade                                         │
│      │                                                                       │
│      ├─► LobbyDO (singleton 'global')                                        │
│      │     · public lobby list + stale eviction                              │
│      │     · quick-match search                                              │
│      │     · room-code allocation                                            │
│      │                                                                       │
│      └─► RoomDO  (one per active room)                                       │
│            · meta + players, persisted to DO storage                         │
│            · WS session table (playerId → WebSocket)                         │
│            · GameSim (60 Hz tick via setInterval)                            │
│            · 60 Hz broadcast of state frames to all sessions                 │
│                                                                              │
│  D1 sds-db                                                                   │
│      ├── players           (identity + materialized best per mode)           │
│      ├── discriminators    (#0001 allocation)                                │
│      └── score_submissions (audit trail)                                     │
│                                                                              │
│  shared/ (bundled into the worker via esbuild)                               │
│      ├── BoundaryCollision.js                                                │
│      ├── FlockingAlgorithms.js                                               │
│      ├── GameStateValidation.js                                              │
│      ├── MovementPhysics.js                                                  │
│      └── Vector2D.js                                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Core modules

### Client

#### main.js — Game orchestrator
Central coordination hub (Mediator pattern).
- Module lifecycle (init → start → update → cleanup)
- Mode detection (single-player vs. multiplayer)
- Fixed-timestep physics with interpolated rendering
- Pause system with state propagation
- Remote dog update: drives `updateAnimationSystem(deltaTime)` for every `otherPlayer` so skeletal animations play

#### SceneManager.js — Scene + renderer (camera delegated)
- Three.js scene + WebGL renderer + lighting setup
- Mobile detection with separate near/far plane, pixel ratio forced to 1, shadows disabled
- **Camera state moved out** (Cycle 4 Unit M) — all camera positioning, follow smoothing, and competitive-mode offset now live in `CameraController`. SceneManager keeps `getCamera()` (still used widely) plus thin pass-throughs for legacy methods (`setCompetitiveCameraPosition`, `transformMovementForCompetitive`, etc.) so `main.js` call sites did not need rewriting.
- Hardcoded `scene.background` and `scene.fog` will be removed in Cycle 4 Phase B once `Atmosphere` is wired into the render path.

#### CameraController.js — Three-mode camera system (Cycle 4)
Owns camera position, target, smoothing, and yaw state. Three modes selectable at runtime via `setMode()`, the settings panel, or the `C` hotkey.
- **Classic** (default) — preserves the original isometric exactly: distance 80, height 60, no rotation. Backwards-compatible UX for returning players.
- **Follow** — close-up cinematic: distance=22, height=11, lookAtHeight=1.5, lookAhead=`4 * speedNorm` along dog facing, yawLagTau=0.35s, posLagTau=0.15s. Frame-rate-independent smoothing using the same `1 - Math.pow(1 - alpha, dt * 60)` pattern that previously lived in SceneManager.
- **Free** — yaw + zoom orbit: right-mouse-drag on desktop, two-finger drag on mobile, right-stick on gamepad. Pitch fixed at Follow's pitch; existing zoom retained. Snap freeYaw to Follow yaw on mode switch so there's no jump-cut.

Public API: `setMode(CameraMode.X)`, `applyYawDelta(rad)`, `setZoom(d)`, `update(dogPos, dogFacing, dt)`, `transformMovement(dir)`, `setCompetitiveDirection(dir)`, `reset()`. `main.js` instantiates one `CameraController` and routes per-frame updates through it.

#### atmosphere/Atmosphere.js — Hosek-Wilkie sky + presets (Cycle 4)
Analytic atmospheric scattering ported from sibling repo Terror in the Jungle (`src/systems/environment/atmosphere/`). The GLSL shader is verbatim (already vanilla GLSL); the JS wrapper is JSDoc-typed.
- **Sky** — Hosek-Wilkie skydome (`HosekWilkieSky.js` + `skyShader.glsl.js`) wraps the scene as a large inside-out sphere, evaluated in the fragment shader. Sun direction drives turbidity, ground albedo, and zenith luminance.
- **Presets** (`skyPresets.js`) — five named configurations matching the `SkyDef.preset` enum: `pastoral-noon`, `dusk`, `overcast`, `dawn`, `golden-hour`. Each preset carries sun elevation/azimuth, turbidity, ground albedo, and a fog multiplier table.
- **Top-level class** — `Atmosphere.constructor(scene)`, `applyPreset(presetName)`, `updateSun(elevation, azimuth)`. Created once in `main.js`; `applyPreset(sceneDef.sky.preset)` is called on every scene-load.

Phase B note: not yet wired to `main.js` or `SceneManager` — the module ships standalone in Phase A and integrates in Phase B (single sequential PR).

#### shared/terrain/Heightfield.js — Bilinear height-sampled module (Cycle 4)
Pure ES module + JSDoc, importable from both client (`js/`) and worker (`worker/src/`) since it lives in `shared/`. Loads a baked R32F heightmap and exposes O(1) sampling.

Public API:
- `static async load(url, manifest) → Heightfield` — fetches `public/terrain/<scene>.r32f` (1024×1024 floats) and the matching `.json` manifest (bounds, version).
- `sample(x, z) → number` — bilinear interpolation; returns terrain height in metres.
- `normal(x, z) → {x, y, z}` — finite-difference normal (ε=1m) for slope queries.
- `getRawArray()` — exposes the underlying Float32Array for advanced consumers.

Pattern ported from `terror-in-the-jungle/src/systems/terrain/BakedHeightProvider.ts`. Used by the client (`TerrainBuilder` displacement, `GrassSystem` y-sample, `OptimizedSheep` + `Sheepdog` y-clamp, `CameraController` y-clamp) and by the shared sim (`MovementPhysics` slope-modulated sheep speed) — all wired in Phase B.

#### OptimizedSheep.js — GPU-instanced sheep
- Single `InstancedMesh` for all 200 sheep (1 draw call)
- Custom vertex shader for leg and head animation
- Per-instance attributes: phase, speed, state, facing
- Toon fragment shader with vertex colors

#### GrassSystem.js — Chunk-based grass
- ~137k grass clumps on desktop, fewer on mobile
- 7 blades per clump desktop / 5 blades mobile, 4 triangles per blade
- Chunk-based frustum culling
- Wind shader animation + player/sheep interaction shader (ripple-through-grass)

#### TerrainBuilder.js — Environment
- 1000×1000 terrain plane with procedural noise-based displacement
- Trees and rocks placed via Poisson-disk distribution, rendered as instanced meshes
- Mountains rendered at full resolution (earlier coarse-LOD simplification was reverted after visual issues)

#### Sheepdog.js — Player controller
- Smooth movement with acceleration / deceleration
- **Stamina system:** sprint drain, exhaustion lock until key release, regen
- **Animation state machine** with 1.0-unit hysteresis on speed thresholds to prevent boundary oscillation
- **Dynamic timeScale:** `currentAction.timeScale = clamp(speed / stateMax, 0.5, 1.5)` so legs slow proportionally when the dog decelerates post-exhaustion
- 19+ animations from a GLB (Idle 1-7, Walk/Trot/Run/RunFast in F/L/R, Bark)

#### NetworkManager.js — Multiplayer client
- Native `WebSocket` + `@msgpack/msgpack` (no Geckos.io, no WebRTC)
- HTTP via `fetch` for register, rooms, quick-match, score, leaderboards
- **Adaptive jitter buffer:** 20-entry ring of packet arrival timestamps, stddev-based interp delay between 100 ms and 150 ms
- **Velocity extrapolation:** sheep extrapolated from server `vx`/`vz` when packets are late
- **Dog blend:** 8-frame lerp toward server-authoritative stop when `interpolatingToClient=true`
- Auto-registers returning users from localStorage identity on first room action

### Server — `worker/`

#### worker/src/index.ts — HTTP router + WS upgrade
- HTTP endpoints:
  - `POST /api/register` — upserts a player row, returns `{token, playerProfile}`
  - `POST /api/rooms` — allocates a code via LobbyDO, initializes a RoomDO, registers lobby entry
  - `POST /api/rooms/:code/join` — adds the player to the RoomDO
  - `POST /api/rooms/quick-match` — finds or creates a public room matching `gameMode`
  - `POST /api/score` — writes `score_submissions` + `players.<mode>_best` in one D1 batch
  - `GET /api/leaderboard?mode=<mode>&limit=<n>` — single-mode leaderboard
  - `GET /api/leaderboards?limit=<n>` — all modes
  - `GET /api/lobbies` — public lobby list
- WS upgrade on `/r/:code/ws?playerId=<sessionId>` — forwarded to the room's DO stub. The `playerId` is the ephemeral session id returned by the REST join/create.
- CORS allowlist includes the Pages hostname, preview hostnames, and localhost.

#### worker/src/RoomDO.ts — Per-room DO
- Holds `meta` (roomCode, hostId, gameMode, etc.) and `players` map.
- Persists both to DO storage on every mutation; hydrates on construction so rooms survive worker redeploys.
- On `/init` (from create-room), stamps the host and its dogType.
- On `/join`, appends the joiner and broadcasts `playerJoined` to existing sessions.
- On `/ws` upgrade, validates `playerId` is a known player, calls `server.accept()`, binds the WebSocket to the session table.
- `handleClientMessage` dispatches on `t`: `playerInput`, `startGame`, `setDogType`, `setModeLock`, `leaveRoom`, `ping`.
- On `startGame`, builds a DO adapter that exposes the subset of RoomManager/Room surface `GameSim.js` expects, instantiates `GameSimulation`, starts the 60 Hz tick, and starts a 60 Hz broadcast loop (`setInterval`, 16 ms) that emits `gameStateUpdate` to every session.
- Handles host migration on WS close.

#### worker/src/LobbyDO.ts — Singleton lobby DO
- Name `global`. Accessed via `env.LOBBY_DO.idFromName('global')`.
- Tracks `{roomCode, hostName, gameMode, playerCount, maxPlayers, state, isPublic}` per public room. Stale entries (>2 min) are evicted on read.
- Allocates 6-char room codes (`AAA000`-`ZZZ999` style) on request.
- Finds a compatible public room for quick-match (matching `gameMode`, `state=waiting`, has room).

#### worker/src/GameSim.js — Authoritative sim
Direct port of `server/GameSimulation.js`. Runs inside RoomDO.
- 60 Hz tick via `setInterval(tick, 16.67ms)` (user preference — 20 Hz felt chunky in Cycle 1).
- State broadcast: sheep (id, x, z, vx, vz, state, facing, hasPassedGate, isRetiring, assignedGate, targetX, targetZ) + sheepdogs (playerId, dogType, x, z, vx, vz, rotation, stamina, sprinting, sequence, interpolatingToClient) + mode-specific fields (sheepRetired, competitive.{playerScores,gates,winCondition}, timedMode.{timeRemaining,gameDuration}).
- Shared sim code (`shared/`) imported directly; wrangler bundles it.

#### worker/src/d1.ts — Leaderboard
- `registerPlayer` — insert-or-return pattern; allocates a discriminator (`#0001` etc.) on first-time registration.
- `submitScore` — bounds-checks the score, inserts a `score_submissions` audit row, and updates the matching `players.<mode>_best` column in the same `db.batch`.
- `getLeaderboard(mode, limit)` and `getAllLeaderboards(limit)` — read-side, formatted for the UI.

#### worker/src/jwt.ts — Minimal HS256 JWT
Sign / verify using `crypto.subtle`. Used only to bind a Worker response to a persistent-id so that `POST /api/rooms` and `POST /api/score` can't be spoofed by fake persistent ids.

## Game modes

| Mode | Description | Players |
|------|-------------|---------|
| Solo Classic | Full sim, client-only. Classic difficulty. | 1 |
| Solo Extreme | Aggressive flock AI. | 1 |
| Cooperative | Team-herd 200 sheep into a single gate. | 2-4 |
| Competitive | Each player gets their own gate; first to fill wins. Race to 101 with 2 players, highest score at total-collected with 3-4 players. | 2-4 |
| Timed | 3-minute countdown; retired sheep respawn after 5 s. Highest count wins. | 2-4 |
| Sandbox | Designer mode (fences / gates / spawns) with lz-string share URLs. | 1-2 |
| Local 2-player | Split-screen on one machine. Co-op / versus / timed. | 2 |

## Network protocol

### HTTP endpoints

See `worker/src/index.ts` for the authoritative implementation. Request/response shapes match [docs/archive/c-retry/contract.md](docs/archive/c-retry/contract.md) (kept as a reference for contributors wanting a single-sheet view).

### WebSocket

Upgrade URL: `wss://<worker-host>/r/<ROOMCODE>/ws?playerId=<sessionId>`.

Every frame is MessagePack-encoded with a `t` (type) discriminator:

**Client → Server**
- `playerInput` — `{direction:{x,z}, sprint, sequence, timestamp, clientPosition?}`
- `startGame` — host only
- `setDogType` — `{dogType}`
- `setModeLock` — `{locked}` (host only)
- `leaveRoom` — `{}`
- `ping` — `{id, timestamp}`

**Server → Client**
- `roomUpdated`, `playerJoined`, `playerLeft`, `hostChanged`, `modeLockChanged`
- `gameStarted` — `{room, gameState}`
- `gameStateUpdate` — the sim snapshot described in `GameSim.js createGameStateSnapshot`
- `gameComplete` — mode-specific completion payload
- `pong` — `{id, timestamp}`
- `roomError`, `error`

The server-to-client state snapshot is the same shape the legacy Geckos server used, so the client's `handleMultiplayerGameState` path is unchanged apart from message transport.

### Client-side interpolation

- **Buffer:** stores `lastServerState` + `previousServerState` for lerp
- **Adaptive delay:** expands to 150 ms when packet-interval stddev > 30 ms, shrinks to 100 ms when < 15 ms
- **Velocity extrapolation:** if more than 33 ms has elapsed since the last sheep update, predict position from server-provided `vx`, `vz` (capped at 500 ms of extrapolation)
- **Dog blend:** when a dog packet arrives with `interpolatingToClient=true`, lerp current → server over 8 frames instead of snapping

## Performance

### Targets
| Metric | Desktop | Mobile |
|--------|---------|--------|
| Target FPS | 60 | 30-60 |
| Draw calls (sheep) | 1 | 1 |
| Grass clumps | ~137k | ~80k |
| Triangles (typical) | ~0.5M | ~0.3M |
| Memory | ~150 MB | ~100 MB |
| Network bandwidth | ~10 KB/s | ~10 KB/s |

### Optimizations
- **GPU instancing** — single draw call for all sheep
- **Chunk culling** — grass rendered only in view frustum
- **Mobile mode** — shadows disabled, pixel ratio forced to 1, reduced grass density
- **Lazy loading** — mobile controls only load on touch devices
- **Frame-rate-independent smoothing** — camera, animation timeScale
- **State interpolation + extrapolation** — smooth remote player and sheep motion under jitter

## File structure

```
├── js/                     Game client
│   ├── main.js             Orchestrator
│   ├── SceneManager.js     Three.js scene / camera / renderer
│   ├── TerrainBuilder.js   Terrain + trees + rocks + mountains
│   ├── StructureBuilder.js Gates, fences, flags, pasture label
│   ├── OptimizedSheep.js   GPU sheep system
│   ├── Sheepdog.js         Player controller + animation state machine
│   ├── GrassSystem.js      Chunk-based grass
│   ├── GameState.js        Game logic
│   ├── GameTimer.js        Timing
│   ├── NetworkManager.js   WebSocket + msgpack + fetch
│   ├── MultiplayerState.js Multiplayer state tracker (players, scores, ping)
│   ├── MobileControls.js   Touch controls
│   ├── InputHandler.js     Keyboard / gamepad
│   ├── GamepadManager.js   Controller support
│   ├── AudioManager.js     Sound
│   ├── MenuController.js   Menu flow + NetworkManager owner + game-start callback
│   ├── PerformanceMonitor.js FPS / triangles / per-system
│   ├── GameAssetLoader.js  GLB / audio / texture loader
│   ├── Boid.js             Sheep flocking primitives
│   ├── FencePresets.js     Fence configurations
│   ├── Vector2D.js         2D math
│   ├── utils/              Triangle counters, helpers
│   └── components/         React UI (createElement, no JSX)
│
├── worker/                 Cloudflare Worker (new multiplayer server)
│   ├── src/
│   │   ├── index.ts        HTTP router + WS upgrade
│   │   ├── RoomDO.ts       Per-room DO
│   │   ├── LobbyDO.ts      Singleton lobby DO
│   │   ├── GameSim.js      Authoritative sim (ported)
│   │   ├── d1.ts           Leaderboard
│   │   └── jwt.ts          Minimal HS256
│   ├── migrations/
│   │   └── 0001_init.sql   players, discriminators, score_submissions
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml
│
├── server/                 Legacy Geckos server (fallback, being retired)
│   ├── index.js
│   ├── GameSimulation.js
│   ├── RoomManager.js
│   ├── LeaderboardManager.js
│   └── leaderboard.db
│
├── shared/                 Deterministic sim, imported by both client and worker
│   ├── BoundaryCollision.js
│   ├── FlockingAlgorithms.js
│   ├── GameStateValidation.js
│   ├── MovementPhysics.js
│   ├── Vector2D.js
│   ├── scenes/             Scene-as-data registry (field, rolling-hills, open-country)
│   └── terrain/            Heightfield runtime module (bilinear-sampled R32F maps)
│
├── tests/
│   ├── integration/        Vitest + ws + MessagePack two-client harness
│   ├── sim-baseline/       Deterministic sim traces
│   └── e2e/                Playwright browser smoke tests
│
├── assets/                 GLBs, sounds, images
├── css/                    Production + multiplayer styles
├── public/                 Pages static assets (favicon, _headers)
├── docs/                   Design docs, cycle reports
│   ├── cycle-2-report.md   ← CURRENT STATE
│   ├── cycle-2-todo.md     ← WHAT'S LEFT
│   ├── multiplayer-ux.md   MP design doc
│   └── archive/            Historical: cycle-1-audit, POSTMORTEM, c-retry, AGENT_PLAN…
│
├── index.html
├── package.json
├── vite.config.js
├── vitest.config.ts
├── playwright.config.ts
└── tailwind.config.js
```

## Development

### Local setup

```bash
npm install                       # client deps
cd worker && npm install && cd .. # worker deps
```

### Run it locally

```bash
# Single-player only (no worker)
npm run dev                       # Vite on :3000

# Multiplayer: terminal 1
npm run dev                       # Vite on :3000, client auto-detects localhost

# Multiplayer: terminal 2
cd worker && npx wrangler dev     # Worker on :8787, uses local wrangler D1
```

### Testing

```bash
npm test                          # vitest
npm run test:integration          # WebSocket two-client harness
npm run test:e2e                  # Playwright browser smoke
```

### Production build

```bash
npm run build                     # client → dist/
cd worker && npx wrangler deploy  # worker → Cloudflare
npx wrangler pages deploy dist --project-name=sds-frontend --branch=main
```

## Scenes (biomes)

`shared/scenes/` is the scene registry. One file per biome; each file exports a `SceneDef` (JSDoc-typed in `shared/scenes/types.js`). Consumed by both the Worker sim and the client renderer, so a biome is a data change, not a code fork.

- **Schema** — `shared/scenes/types.js`. Sim-critical fields (`bounds`, `gate`, `pasture`, `sheepSpawn`) are authoritative; renderer fields (`terrain`, `grass`, `farmHouse`, `sky`, `fog`) are optional overrides on the hardcoded renderer defaults.
- **Registry** — `shared/scenes/index.js`. Exports `loadScene(id)`, `listScenes()`, `DEFAULT_SCENE_ID`. Unknown ids throw; the helpers are re-exported from `shared/index.js` for convenience.
- **Worker** — `worker/src/RoomDO.ts` stores `sceneId` on `RoomMeta` (validated against `listScenes()` at `initRoom`, defaults to `DEFAULT_SCENE_ID`; backfilled on rehydrate of pre-Cycle-3 rooms). `worker/src/GameSim.js` calls `loadScene(room.sceneId || DEFAULT_SCENE_ID)` once in the constructor. Both cooperative (`createGameState`) and competitive/timed (`createCompetitiveGameState`) paths read `bounds` and `sheepSpawn` from the resulting scene.
- **Client** — `js/main.js` picks the scene (`?scene=<id>` URL param; selectable via `ScenePicker` strip above the menu) and threads the `SceneDef` into `TerrainBuilder`, which reads `zones` and `farmHouse`, and through to `GrassSystem`, which reads `grass.clumpsPerChunk`. `js/NetworkManager.js createRoom` sends the current `sceneId` to the Worker in `roomSettings`. Joiners whose URL-param scene differs from the room's sceneId currently render mismatched visuals — Track 2 follow-up.
- **Shipped biomes (2026-04-24)** — `field` ("Home Field" — the flat fenced play area ringed by mountain props, previously called "valley"), `rolling-hills` ("Rolling Hills" — sim-differentiated harder variant; visual differentiation deferred until renderer consumes `terrain.heightScale` / `grass.colors` / `props`).

See [`docs/adding-a-biome.md`](docs/adding-a-biome.md) for the step-by-step, and [`docs/cycle-3-scene-arch.md`](docs/cycle-3-scene-arch.md) for the design rationale and open questions (notably: harmonizing the client's `FieldConfig` + `SandboxConfig` with `SceneDef`).

## Designed for expansion

The single Home Field — a flat fenced play area with mountain props ringing the perimeter — plus a fenced pasture, is the shipped starting point. The modules are designed to be extended into new biomes and modes, not rebuilt.

- **`TerrainBuilder.js`** is zone-keyed (`playArea`, `nearField`, `midField`, `farField`) and scene-aware (reads `zones` + `farmHouse` from its `sceneDef` argument). Parameterizing terrain displacement and prop placement from the scene def is the next extension point.
- **`StructureBuilder.js`** owns fence / gate geometry and is independent of gameplay rules, so a canyon-pass or river-crossing scene can reuse the collision/rendering without competing-gate assumptions.
- **`GameState.js`** `startGame(mode, competitiveData, singlePlayerMode)` already takes a mode discriminator; new modes (drive, chase, endless) slot in here without forking the orchestrator.
- **`worker/src/RoomDO.ts`** is mode-agnostic — the `gameMode` field is passed through to `GameSim.js`; mode-specific sim logic already branches there (`isCompetitive`, `isTimedMode`). Adding new modes is an additive change.
- **`shared/`** is deterministic and scene-driven. New scenes add a file and a registry entry; neither the sim code nor the core render code changes.

See the "Roadmap — where the game is going" section in [README.md](README.md) for the content direction beyond the Home Field.

## Project docs

- [docs/cycle-2-report.md](docs/cycle-2-report.md) — what the current backend does and how we got here
- [docs/cycle-2-todo.md](docs/cycle-2-todo.md) — the punch list to finish the migration
- [DECISIONS.md](DECISIONS.md) — architectural decision log (cycle-by-cycle)
- [docs/archive/POSTMORTEM.md](docs/archive/POSTMORTEM.md) — Cycle 1 rollback retrospective (process lessons)
- [docs/archive/cycle-1-audit.md](docs/archive/cycle-1-audit.md) — the seven launch-blocking bugs Cycle 1 shipped
- [docs/archive/c-retry/](docs/archive/c-retry/) — pre-Cycle-2 contract + runbook artifacts; useful as a spec reference for contributors
- [docs/archive/AGENT_PLAN.md](docs/archive/AGENT_PLAN.md) — historical roadmap
