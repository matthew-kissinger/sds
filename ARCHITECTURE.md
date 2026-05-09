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
| i18next | 25 | 5 localized languages (en, es, ja, pt, zh-CN) |
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
Central coordination hub (Mediator pattern). Cycle 28 Stream B1 trimmed `main.js` from 3,529 → 2,188 LOC by extracting one-time module wiring and post-game UI to [`js/boot/`](js/boot/) + [`js/utils/`](js/utils/). Class methods on `SheepDogSimulation` remain as thin shims so the public API binding (React, ScenePicker, cinematic API, e2e specs) stays byte-identical.
- Module lifecycle (init → start → update → cleanup) — boot sequence in [`js/boot/initWorld.js`](js/boot/initWorld.js)
- Mode detection (single-player vs. multiplayer)
- Fixed-timestep physics with interpolated rendering — *retained on `main.js`*
- Per-frame `update()` + `animate()` loops — *retained on `main.js`*
- Pause system with state propagation
- Remote dog update: drives `updateAnimationSystem(deltaTime)` for every `otherPlayer` so skeletal animations play

Extracted helpers under [`js/boot/`](js/boot/):
- `WebVitalsMonitor.js` — Core Web Vitals observer
- `debugProbes.js` — `__sdsStressTestSwaps` + `__sdsMpProbe` (test-only `window` surfaces)
- `initNetwork.js` — `installMpEventHandlers` + per-broadcast `handleMultiplayerGameState`
- `initWorld.js` — scene-body construction (heightfield → terrain → grass → trees → rocks → mountains → farmHouse → structures → effects → water → sheepdog → sheep)
- `loadScene.js` — `disposeScene` (full teardown ordering)
- `completionOverlay.js` — `showCompletionOverlay` + `showLocalCompletionOverlay`
- `js/utils/replay.js` — `startReplay` + `stopReplay` (rolling-tail clip)
- `js/utils/scoreStorage.js` — `formatTime` + best-score localStorage helpers

#### SceneManager.js — Scene + renderer (camera delegated)
- Three.js scene + WebGL renderer + lighting setup
- Mobile detection with separate near/far plane (near 0.1/2.0m, far 4500/3700m). The far plane is sized to cover the terrain plane's diagonal at max zoom-out plus camera offset. Atmosphere skybox glues to the far plane in its shader (`gl_Position = clip.xyww`), so this also controls how far the visible sky reaches; bumping the far plane to grow the visible terrain automatically grows the skybox to match.
- **Camera state moved out** (Cycle 4 Unit M) — all camera positioning, follow smoothing, and competitive-mode offset now live in `CameraController`. SceneManager keeps `getCamera()` (still used widely) plus thin pass-throughs for legacy methods (`setCompetitiveCameraPosition`, `transformMovementForCompetitive`, etc.) so `main.js` call sites did not need rewriting.
- Hardcoded `scene.background` and `scene.fog` were removed in Cycle 4 Phase B; `Atmosphere` is now wired into the render path and owns sky/fog per-scene.

#### CameraController.js — Three-mode camera system (Cycle 4)
Owns camera position, target, smoothing, and yaw state. Three modes selectable at runtime via `setMode()`, the settings panel, or the `C` hotkey.
- **Classic** (default) — preserves the original isometric exactly: distance 80, height 60, no rotation. Backwards-compatible UX for returning players.
- **Follow** — close-up cinematic: distance=22, height=11, lookAtHeight=1.5, lookAhead=`4 * speedNorm` along smoothed aim yaw, yawLagTau=0.35s (camera rotational lag — slow on purpose for cinematic turns), aimLagTau=0.08s (look-ahead direction tracking — fast enough to feel the dog's heading, slow enough to filter physics micro-noise so the look-at point doesn't jitter at high refresh rates), posLagTau=0.15s. Frame-rate-independent smoothing via `1 - exp(-dt/τ)`.
- **Free** — yaw + zoom orbit: right-mouse-drag on desktop, two-finger drag on mobile, right-stick on gamepad. Pitch fixed at Follow's pitch; existing zoom retained. Snap freeYaw to Follow yaw on mode switch so there's no jump-cut.

Public API: `setMode(CameraMode.X)`, `applyYawDelta(rad)`, `setZoom(d)`, `update(dogPos, dogFacing, dt)`, `transformMovement(dir)`, `setHeightfield(hf)`, `setCompetitiveDirection(dir)`, `reset()`. `main.js` instantiates one `CameraController` and routes per-frame updates through it.

**Hardening additions (2026-04-25):**
- Classic mode now lifts its look-at target to `heightfield.sample(dog.x, dog.z)` so the dog stays centred on hills (was hardcoded y=0).
- `transformMovement` now rotates input by `followYaw` in Follow mode as well as `freeYaw` in Free, so WASD is camera-relative in both. Classic stays world-axis (top-down isometric).
- New `_sampleMaxTerrainAlong(camXZ, dogXZ)` samples 7 points along the camera→dog line; Follow and Free clamp camera Y above the max ridge + `minTerrainClearance` so the dog never disappears behind an intervening hill.

#### atmosphere/Atmosphere.js — Hosek-Wilkie sky + presets (Cycle 4)
Analytic atmospheric scattering ported from sibling repo Terror in the Jungle (`src/systems/environment/atmosphere/`). The GLSL shader is verbatim (already vanilla GLSL); the JS wrapper is JSDoc-typed.
- **Sky** — Hosek-Wilkie skydome (`HosekWilkieSky.js` + `skyShader.glsl.js`) wraps the scene as a large inside-out sphere, evaluated in the fragment shader. Sun direction drives turbidity, ground albedo, and zenith luminance.
- **Presets** (`skyPresets.js`) — five named configurations matching the `SkyDef.preset` enum: `pastoral-noon`, `dusk`, `overcast`, `dawn`, `golden-hour`. Each preset carries sun elevation/azimuth, turbidity, ground albedo, and a fog multiplier table.
- **Top-level class** — `Atmosphere.constructor(scene)`, `applyPreset(presetName)`, `updateSun(elevation, azimuth)`. Created once in `main.js`; `applyPreset(sceneDef.sky.preset)` is called on every scene-load.

Wired into `main.js` and the scene-load path in Cycle 4 Phase B (PR #42 + tonemap fix). SceneManager no longer references `scene.background` or `scene.fog`; Atmosphere is the single source of truth.

#### shared/terrain/Heightfield.js — Height-sampled module (Cycle 4 + Cycle 14 + Cycle 30)
Pure ES module + JSDoc, importable from both client (`js/`) and worker (`worker/src/`) since it lives in `shared/`. Loads a baked R32F heightmap and exposes two distinct sampling paths: **sim-Y** (raw bilinear, deterministic) and **visual-Y** (triangle-interp against the captured terrain mesh vertex grid, render-aligned).

Public API:
- `static async load(url) → Heightfield` — fetches `public/terrain/<scene>.bin` (1024×1024 R32F floats; renamed from `.r32f` in Cycle 26 to dodge itch.io's CDN extension blocklist) and the sibling `.bin.json` manifest (width, height, worldSize, peakHeight, optional boundary).
- `sample(x, z) → number` — bilinear interpolation; returns raw heightfield Y in metres. **Used by sim/physics** so behaviour stays decoupled from any render-time mesh resampling.
- `normal(x, z) → {x, y, z}` — finite-difference normal (ε=1m) for slope queries.
- `bakeMeshGrid({ segments, size }) → Float32Array` *(Cycle 30)* — returns a `(segments+1)²` displaced-heights grid built by sampling per-vertex with the same square-radial smoothstep falloff over the last 20m of `worldSize` that the visible terrain mesh uses; binds the result via `setMeshGrid`. One algorithm, one home.
- `setMeshGrid({ displacedHeights, segments, size })` — lower-level entry point for callers that already have a displaced array (e.g. `TerrainBuilder` writing it onto `PlaneGeometry`).
- `meshSampleY(x, z) → number` *(Cycle 14)* — visual surface Y, triangle-interp against the bound mesh grid. **Throws if no grid is bound** (Cycle 30 removed the `+ 0.05m` defensive fallback). Use for visual entity placement (grass, trees, rocks, dog, sheep).
- `surfaceY(x, z) → number` — thin alias of `meshSampleY` retained as the named seam in [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md).
- `getRawArray()` — exposes the underlying Float32Array for advanced consumers.

Pattern ported from `terror-in-the-jungle/src/systems/terrain/BakedHeightProvider.ts`. Used by the client only today: `TerrainBuilder` for displacement (calls `bakeMeshGrid` then writes the returned array onto its `PlaneGeometry`), and `GrassSystem` / `OptimizedSheep` / `Sheepdog` / `CameraController` for visual y-clamp via `meshSampleY` / `surfaceY`. The Worker sim does **not** read heightfield Y today — it could in the future (slope-modulated sheep speed has been considered), at which point sim would call `sample()` (deterministic), not `meshSampleY()`.

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

**Hardening additions (2026-04-25):**
- **Stochastic LOD dither.** Each blade has a stable hash from `gl_InstanceID + chunk world XZ`. As distance from camera grows through `[grassFadeStart=70m, grassFadeEnd=260m]`, an increasing fraction of blades collapse to degenerate triangles (vertex shader emits `gl_Position = vec4(2.0)`). Smooth density gradient — no count-step ring visible in Classic top-down. Hard count-decimation LOD still runs (200/280m) for CPU savings but is hidden behind the dither. Same dither in mobile shader for parity. Standard production technique (Cesium-for-Unreal, Witcher 3, RDR2).
- **Zen wind.** Three noise samples taken at *different rotations* (windDirection, perpendicular, bisector) at slightly different scales/speeds, averaged. Mean push along `windDirection` still leans the field, but the gust modulation has no single visible front. Variation tightened to 0.35–0.65 (was 0.4–1.2) so the field shimmers rather than pulses. Desktop-only; mobile has no wind by design.
- **Body-shaped interaction.** Each entity reports a facing direction (`updateInteractors` reads dog's `currentRotation`, sheep's `renderFacingDirection`); shader transforms blade-to-entity delta into entity-local frame and computes a rounded-rectangle SDF against body half-extents. Dog 1.6m × 0.6m elongated body, 1.4m falloff ring. Sheep 0.6m × 0.5m near-square, 0.9m falloff. The clearing now turns with the entity instead of being world-axis-locked. Same SDF in mobile (single-interactor cap).

#### TerrainBuilder.js — Environment

Cycle 28 Stream B2 trimmed `TerrainBuilder.js` from 2,785 → 1,387 LOC by extracting placement + shader-patch helpers to [`js/world/`](js/world/). Class methods remain as thin shims so the public API (`createTerrain`, `createGrass`, `createTrees`, `addEnvironmentDetails`, `addMountains`, `addFarmHouse`, `setDynamicBounds`, `setRockRimColor`, `setImpostorTint`, etc.) stays byte-identical.

Extracted to [`js/world/`](js/world/):
- `RockPlacement.js` — `placeEnvironmentDetails` (Math.random()-driven Poisson formations + InstancedMesh2 + BVH)
- `TreePlacement.js` — `placeTrees` + `bakeTreeImpostor` + `createCrossBillboardGeometry` (per-instance LOD chain, Pixel Forge Kiln impostor preference, cross-billboard fallback)
- `shaderPatches.js` — `patchTreeWindMaterial` + `setupTreeWind` + `patchRockMaterial` + `setupRockShader` + `setRockRimColor` + `setImpostorTint`
- `sandbox.js` — `setDynamicBounds` + `updateFarmhousePosition` + `rebuildEnvironment` + `regenerateGrass` (sandbox-mode rebuild on play-area resize)

What `TerrainBuilder` retains: terrain mesh construction, heightfield displacement, fog binding, scene-defaulted zone reading, and the public API the rest of the codebase calls.

- **4000m × 4000m desktop / 3200m × 3200m mobile** terrain plane (1000m pre-hardening; 2400/1600 mid-hardening; 4000/3200 round 2 because the previous edge was still visible as a faint line at max zoom-out). 384 segments desktop / 256 segments mobile (~10.4m / 12.5m per quad). Heightfield content is unchanged at ±200m; the larger plane just adds more flat skirt that fades into the existing fog before reaching the camera far plane.
- Heightfield-displaced (`heightfield.sample(worldX, worldZ)` per vertex) when the scene declares a `heightmapUrl`; flat fallback otherwise. Heightfield content is multiplied by a smoothstep falloff over the last 20m of its `worldSize` so the play-area "island" blends smoothly into a flat skirt extending to the fog horizon.
- **`_groundY(x, z)` helper** mirrors that same falloff for entity placement. `Heightfield.sample()` clamps to edge values past `worldSize`, but the terrain mesh applies the falloff — so trees in the outer zones (up to ±800m) and rocks in the same zones would otherwise sample the clamped edge height and float above the flat skirt. `_groundY` returns the same Y the visible terrain has at that (x,z): full-strength sample inside ±180m, smoothstep ramp 180–200m, y=0 past 200m.
- Trees and rocks placed via Poisson-disk distribution; both query `_groundY` for their Y at construction. **Tree GLBs**: at load time, child mesh transforms are baked into geometries (so InstancedMesh-per-child captures sub-mesh layout) and per-model `bbox.min.y` is stored on `userData.modelBaseYOffset`. At placement, `placementY = _groundY(x, z) + (-bboxMinY) * scale` lifts the visible base to terrain regardless of GLB origin convention. Same compensation applied to the farmhouse.
- **Far-tree LOD past 250m** via 3-quad impostors. Each tree GLB is rendered once to a 512² RenderTarget by an offscreen orthographic camera (transparent background, `MeshBasicMaterial { alphaTest: 0.4, transparent: true }`). Far instances use a 3-plane geometry at 60° apart sharing that texture — any view direction is within 30° of one quad's normal, so the silhouette never goes edge-on. ~99% triangle reduction in the farField + horizon zones.
- **Terrain fog driven by `scene.fog`** (Atmosphere-managed, FogExp2 density 0.0006). The terrain shader uses Three.js's standard fog chunks (`fog_pars_*` + `fog_*`) with `material.fog = true` and `THREE.UniformsLib.fog` merged into the material — same fog colour as the sky's horizon at the same distance, so the terrain-sky transition is seamless across every preset. An earlier hardening pass had a custom warm-grey-green fog at fixed near/far, but it didn't match the dynamic sky and produced a visible cutoff at the horizon (white at noon, dark at night).
- `addMountains()` is a no-op as of 2026-04-25 — the previous procedural ring read as paper-thin shells. The `ProceduralMountains` class is left on disk for future revisit; use a real height-displaced skirt blending into the play-area heightfield, not the annulus shader.

#### StructureBuilder.js — Fences, gates, pens
- Owns the structure tree for each scene: perimeter fences (when scene allows), gate, pen, corner flags.
- **`_surfaceToTerrain(group)`** — post-process that walks the group, finds nodes tagged with `userData.surfaceToTerrain`, and lifts each to terrain Y. Per-piece tagging on posts/individual rails so they ride hills independently; gate group tagged as a single rigid unit so the two posts stay coplanar and the arch doesn't shear.
- **`_slopeRailToTerrain(rail)`** — for rails carrying `userData.railSpan = { halfLen, axis, geomAxis, baseY }`, samples the heightfield at both endpoints, sets the rail's local position to the midpoint and `quaternion.setFromUnitVectors(geomAxis, lifted_dir)`. Rails span the slope between adjacent posts instead of staying horizontal — no more stair-stepping over hills.
- `perimeterFence: false` scene flag (Open Country) routes through `buildGateAndPenOnly`, which builds the gate + a closed pen (with two flanking border segments completing the front of the pen). Other scenes get the standard four-side perimeter via `buildSinglePlayerStructures`.

#### Sheepdog.js — Player controller
- Smooth movement with acceleration / deceleration
- **Stamina system:** sprint drain, exhaustion lock until key release, regen
- **Smoothed speed cap** (2026-04-25 round 2). `smoothMaxSpeed` snaps on the way UP (sprint press is responsive) and eases τ=0.2s on the way DOWN. The safety velocity clamp uses the smoothed cap, so when stamina runs out, velocity decays naturally from 25 → 15 over ~75ms via the existing acceleration logic instead of being hard-clamped in one frame. Without this, the camera look-ahead distance popped (`speedNorm` halved instantly) and the animation state crossfaded SPRINTING → RUNNING faster than the leg blend could keep up.
- **Animation state machine** with 1.0-unit hysteresis on speed thresholds to prevent boundary oscillation
- **Dynamic timeScale:** `currentAction.timeScale = clamp(speed / stateMax, 0.5, 1.5)` so legs slow proportionally when the dog decelerates post-exhaustion
- 19+ animations from a GLB (Idle 1-7, Walk/Trot/Run/RunFast in F/L/R, Bark)
- **Terrain tilt** (2026-04-25) — `updateTerrainTilt` reads `heightfield.normal(x, z)`, projects the slope vector against the dog's facing direction, and sets `mesh.rotation.x` (pitch) + `mesh.rotation.z` (roll) clamped to ~22°. Mesh `rotation.order = 'YXZ'` so yaw composes cleanly. Smoothed at ~6 Hz to avoid snap on sharp gradients. `OptimizedSheep` does the same with a stateless per-frame snap (no per-instance interpolation buffer worth keeping at 200+ instances) and tighter ~18° clamp.
- **Distance indicator (chevron + diamond)** tracks `mesh.position.y` (terrain-clamped) so the marker stays anchored to the dog on hills — was hardcoded to `y = 0` before 2026-04-25, which caused parallax drift through the angled camera.

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
│   ├── StructureBuilder.js Gates, fences, flags, pasture label (post-2026-04-25: surfaces to heightfield via userData.surfaceToTerrain tags)
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
- **Shipped biomes (2026-04-25)** — `field` ("Home Field" — the flat fenced play area, classic loop), `rolling-hills` ("Rolling Hills" — heightfield-displaced terrain, dusk lighting, 250 sheep scattered; gameplay loop still mirrors field, intended island-redesign tracked in [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md) § 1), `open-country` ("Open Country" — heightfield-displaced terrain, golden-hour lighting, **no perimeter fence** (`perimeterFence: false` on the scene def — gate + pen stand alone), 200 sheep scattered across a 80 m radius). All three have `Atmosphere` wired and surface their fences/structures to terrain via `StructureBuilder._surfaceToTerrain`.

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
