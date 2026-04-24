# Sheep Dog Simulator - Architecture

## Overview

A real-time 3D herding simulation with GPU-accelerated rendering, WebRTC multiplayer, and cross-platform support.

### Key Technical Features
- **GPU-first rendering**: 200 sheep in a single draw call using Three.js `InstancedMesh`
- **WebRTC networking**: low-latency multiplayer via Geckos.io with adaptive jitter buffer and client-side velocity extrapolation
- **Hybrid architecture**: seamless single-player / multiplayer modes driven by a shared deterministic sim
- **Cross-platform**: desktop, mobile, and gamepad input paths
- **Frame-rate-independent camera smoothing**: same feel at 60 Hz and 144 Hz monitors

## Tech Stack

### Client
| Technology | Version | Purpose |
|------------|---------|---------|
| Three.js | 0.181 | WebGL rendering |
| React | 19.2 | UI components (uses `React.createElement`, no JSX) |
| Vite | 7.3 | Build tooling |
| Tailwind CSS | 4.1 | Styling |
| i18next | 25 | 18 localized languages |
| lz-string | 1.5 | Sandbox share-URL compression |
| nipple.js | 0.10 | Mobile joystick |
| Geckos.io Client | 3.0 | WebRTC client |

### Server
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 22+ | Runtime |
| Geckos.io Server | 3.0 | WebRTC signaling + UDP data channels |
| better-sqlite3 | 12 | Leaderboard DB |
| PM2 | - | Process management |

### Testing
| Technology | Version | Purpose |
|------------|---------|---------|
| Vitest | 4.1 | Unit + integration tests |
| Playwright | latest | Browser smoke tests |
| @msgpack/msgpack | 3 | Integration harness wire format |
| ws | 8 | Integration harness WebSocket client |

### Infrastructure
- **Frontend hosting**: GitHub Pages, `sheepdogsim.com` via Cloudflare DNS
- **API server**: DigitalOcean droplet, `api.sheepdogsim.com`
- **SSL**: Cloudflare proxy for the API
- **UDP ports**: 10000-20000 for WebRTC data channels

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                               │
├─────────────────────────────────────────────────────────────┤
│  StartScreen → GameState → OptimizedSheep → SceneManager    │
│       ↓              ↓            ↓              ↓          │
│  MobileControls  InputHandler  Sheepdog    TerrainBuilder   │
│       ↓              ↓            ↓              ↓          │
│  AudioManager   GamepadManager  GrassSystem   ReactUI       │
│                                                             │
│                    NetworkManager                           │
│                    (Geckos.io client, adaptive buffer)      │
└─────────────────────────────────────────────────────────────┘
                              │
                      WebRTC Data Channel
                              │
┌─────────────────────────────────────────────────────────────┐
│                         SERVER                               │
├─────────────────────────────────────────────────────────────┤
│  index.js (Geckos.io server)                                │
│       ↓                                                     │
│  RoomManager → GameSimulation → LeaderboardManager          │
│                                                             │
│  shared/                                                    │
│  ├── BoundaryCollision.js                                   │
│  ├── FlockingAlgorithms.js                                  │
│  ├── GameStateValidation.js                                 │
│  └── MovementPhysics.js                                     │
└─────────────────────────────────────────────────────────────┘
```

## Core Modules

### Client

#### main.js - Game Orchestrator
Central coordination hub (Mediator pattern).
- Module lifecycle (init -> start -> update -> cleanup)
- Mode detection (single-player vs. multiplayer)
- Fixed-timestep physics with interpolated rendering
- Pause system with state propagation
- Registers per-system triangle counts with `PerformanceMonitor` once at init

#### SceneManager.js - Scene, Camera, Renderer
- Three.js scene + camera + WebGL renderer setup
- **Frame-rate-independent camera follow**: `k = 1 - Math.pow(1 - 0.05, dt * 60)`, identical feel at any refresh rate
- Mobile detection with separate near/far plane, pixel ratio forced to 1, shadows disabled
- Competitive-mode camera offset based on gate direction

#### OptimizedSheep.js - GPU-Instanced Sheep
- Single `InstancedMesh` for all 200 sheep (1 draw call)
- Custom vertex shader for leg and head animation
- Per-instance attributes: phase, speed, state, facing
- Toon fragment shader with vertex colors
- Reports `sheepCount * trisPerSheep` to PerformanceMonitor

#### GrassSystem.js - Chunk-Based Grass
- ~218k grass clumps on desktop (1800 per chunk x ~121 chunks), ~100k on mobile (800/chunk)
- Each clump has 7 blades desktop / 5 blades mobile, 4 triangles per blade
- Chunk-based frustum culling so only visible chunks render
- Wind shader animation + player/sheep interaction shader (ripple-through-grass)
- LOD: near/mid/far distance thresholds

#### TerrainBuilder.js - Environment Generation
- 1000x1000 terrain plane with procedural noise-based displacement
- Trees and rocks placed via Poisson-disk distribution, rendered as instanced meshes
- **Mountains use coarse LOD**: every placement more than 400 m from origin clones from a pre-simplified source built once per mountain type via three-addons `SimplifyModifier` (~30% vertex retention)
- Exposes `getTriangleBreakdown()` for PerformanceMonitor

#### StructureBuilder.js
- Fences, gates, corner flags, pasture label
- Exposes `getTotalTriangleEstimate()`

#### Sheepdog.js - Player Controller
- Smooth movement with acceleration / deceleration
- **Stamina system**: sprint drain, exhaustion lock until key release, regen
- **Animation state machine** with 1.0-unit hysteresis on speed thresholds to prevent boundary oscillation
- **Dynamic timeScale**: `currentAction.timeScale = clamp(speed / stateMax, 0.5, 1.5)` so legs slow proportionally when the dog decelerates post-exhaustion
- 40+ animations from a GLB (Idle 1-7, Walk/Trot/Run/RunFast in F/L/R, Bark)

#### NetworkManager.js - Multiplayer Client
- Geckos.io WebRTC client
- Automatic environment detection (local vs production)
- **Adaptive jitter buffer**: 20-entry ring of packet arrival timestamps, stddev-based interp delay between 100 ms and 150 ms
- State interpolation with buffer underrun handling
- Reconnection with exponential backoff

#### PerformanceMonitor.js - Diagnostics
- Stats.js FPS panel (toggled with "P" key)
- Custom panel with triangles, draw calls, geometries, textures, programs
- **Per-system triangle breakdown** with rows for Grass, Trees, Rocks, Mountains, Terrain, Structures, Sheep
- Memory usage (where supported by the browser)

#### js/utils/TriangleCount.js
Shared helpers used by systems reporting their triangle counts:
- `geometryTriangleCount(geometry)`
- `countMeshTriangles(mesh)`
- `sumInstancedMeshTriangles(mesh)`
- `sumObjectTreeTriangles(obj)` - traverses cloned GLB groups

### Server

#### index.js - Geckos.io Server
- Connection management (ping timeout 60 s)
- 15+ message type handlers
- UDP ports 10000-20000

#### RoomManager.js - Session Management
- 4-letter room codes
- Host migration on disconnect
- Quick-match + public lobby list
- 2-4 players per room

#### GameSimulation.js - Authoritative Sim
- 60 FPS tick rate
- State broadcast: sheep (position, velocity, state) + players (position, velocity, stamina, dogType) + competitive gates + time remaining
- Ships `vx, vz` on every sheep so the client can extrapolate on packet loss
- Ships `interpolatingToClient` flag on dog state so the client can blend instead of snap
- Deterministic flocking via `shared/FlockingAlgorithms.js`

#### LeaderboardManager.js
SQLite-backed persistent leaderboard.

## Game Modes

| Mode | Description | Players |
|------|-------------|---------|
| Solo | Client-side simulation, instant start | 1 |
| Cooperative | Work together to herd 200 sheep | 2-4 |
| Competitive | First player to fill their own gate wins | 2-4 |
| Timed | 3-minute countdown, highest retired count wins | 2-4 |

## Network Protocol

### Message Shapes
```typescript
// Client -> Server
interface PlayerInput {
    direction: { x: number, z: number };
    sprinting: boolean;
    timestamp: number;
    sequence: number;
}

// Server -> Client
interface GameStateUpdate {
    sheep: Array<{ id, x, z, vx, vz, state, facing, hasPassedGate, isRetiring }>;
    players: Record<string, { x, z, vx, vz, rotation, stamina, sprinting, dogType, interpolatingToClient }>;
    competitiveGates?: Array<{ playerId, direction, count }>;
    timeRemaining?: number;
    timestamp: number;
    tick: number;
}
```

### Connection Flow
```
DISCONNECTED -> CONNECTING -> CONNECTED -> IN_ROOM -> IN_GAME
       ^                                                │
       └─────── (reconnection with exponential backoff) ┘
```

### Client-Side Interpolation (NetworkManager.js + main.js)
- **Buffer**: stores `lastServerState` + `previousServerState` for lerp
- **Adaptive delay**: expands to 150 ms when packet-interval stddev > 30 ms, shrinks to 100 ms when < 15 ms
- **Velocity extrapolation**: if more than 33 ms has elapsed since the last sheep update, predict position from server-provided `vx, vz` (capped at 500 ms of extrapolation)
- **Dog blend**: when a dog packet arrives with `interpolatingToClient=true`, lerp current -> server over 8 frames instead of snapping

## Performance

### Targets
| Metric | Desktop | Mobile |
|--------|---------|--------|
| Target FPS | 60 | 30-60 |
| Draw calls (sheep) | 1 | 1 |
| Grass clumps (max) | ~218k | ~100k |
| Triangles (typical) | ~0.5M | ~0.3M |
| Memory | ~150 MB | ~100 MB |
| Network bandwidth | ~10 KB/s | ~10 KB/s |

### Optimizations
- **GPU instancing**: single draw call for all sheep
- **Chunk culling**: grass rendered only in view frustum
- **Mountain LOD**: distant mountains use a simplified-geometry source
- **Mobile mode**: shadows disabled, pixel ratio forced to 1, reduced grass density
- **Lazy loading**: mobile controls only load on touch devices
- **Frame-rate-independent smoothing**: camera, animation timeScale
- **State interpolation + extrapolation**: smooth remote player and sheep motion under jitter

## File Structure

```
├── js/
│   ├── main.js              # Game orchestrator
│   ├── SceneManager.js      # Three.js scene / camera / renderer
│   ├── TerrainBuilder.js    # Terrain + trees + rocks + mountains (with LOD)
│   ├── StructureBuilder.js  # Gates, fences, flags, pasture label
│   ├── OptimizedSheep.js    # GPU sheep system
│   ├── Sheepdog.js          # Player controller + animation state machine
│   ├── GrassSystem.js       # Chunk-based grass
│   ├── GameState.js         # Game logic
│   ├── GameTimer.js         # Timing system
│   ├── NetworkManager.js    # WebRTC client + adaptive jitter buffer
│   ├── MultiplayerUI.js     # Multiplayer flow UI
│   ├── MobileControls.js    # Touch controls
│   ├── InputHandler.js      # Keyboard / gamepad input
│   ├── GamepadManager.js    # Controller support
│   ├── AudioManager.js      # Sound system
│   ├── StartScreen.js       # Start screen integration
│   ├── PerformanceMonitor.js # FPS / draw calls / per-system triangles
│   ├── GameAssetLoader.js   # GLB / audio / texture loading
│   ├── Boid.js              # Base AI behavior
│   ├── ExtremeBoid.js       # Aggressive variant
│   ├── FencePresets.js      # Fence configurations
│   ├── Vector2D.js          # 2D math
│   ├── utils/
│   │   └── TriangleCount.js # Triangle-counting helpers
│   └── components/
│       ├── App.js           # React root (createElement, no JSX)
│       ├── GameHUD/         # In-game HUD, mobile controls
│       ├── Multiplayer/     # Lobby, RoomCreation, PublicLobbyList, etc.
│       ├── StartScreen/
│       ├── hooks/
│       ├── shared/
│       └── ui/              # Button, Panel, LanguageSelector
│
├── server/
│   ├── index.js             # Geckos.io server
│   ├── GameSimulation.js    # Server game state (60 Hz, authoritative)
│   ├── RoomManager.js       # Room management
│   ├── LeaderboardManager.js # SQLite persistence
│   └── package.json
│
├── shared/
│   ├── BoundaryCollision.js
│   ├── FlockingAlgorithms.js
│   ├── GameStateValidation.js
│   ├── MovementPhysics.js
│   └── Vector2D.js
│
├── tests/
│   ├── integration/         # Vitest + ws + MessagePack two-client harness
│   ├── sim-baseline/        # Deterministic sim traces for Cycle 2 comparison
│   └── e2e/                 # Playwright browser smoke tests
│
├── assets/
│   ├── models/              # GLB models (Jep, Pip, Shiloh, Sheep)
│   ├── sounds_compressed/   # Audio
│   └── images/              # UI + SEO
│
├── css/                     # Production + multiplayer-specific styles
│
├── docs/                    # POSTMORTEM, cycle-1-audit, c-retry/, etc.
│
├── index.html               # Entry point
├── package.json
├── vite.config.js
├── vitest.config.ts
├── playwright.config.ts
└── tailwind.config.js
```

## Development

### Local Setup
```bash
npm install
npm run dev:full          # Vite :3000 + Geckos server :9208
```

### Testing
```bash
npm test                   # run all vitest suites
npm run test:integration   # WebSocket two-client harness only
npm run test:e2e           # Playwright browser smoke tests
```

### Production Build
```bash
npm run build              # Output to dist/
```

### Deployment
- **Frontend**: static hosting on GitHub Pages, CNAMEd to sheepdogsim.com via Cloudflare DNS.
- **Server**: DigitalOcean droplet running PM2. SSH config + deploy command in `package.json` scripts (`server:deploy`).
- **SSL**: Cloudflare proxy fronts `api.sheepdogsim.com`.

See [DROPLET_DEPLOYMENT.md](DROPLET_DEPLOYMENT.md) for full server setup.

## Project Docs

- [POSTMORTEM.md](POSTMORTEM.md) - Cycle 1 Cloudflare migration retrospective
- [AGENT_PLAN.md](AGENT_PLAN.md) - living roadmap (Section 10: Cycle 2 retry plan)
- [DECISIONS.md](DECISIONS.md) - architectural decisions log
- [docs/cycle-1-audit.md](docs/cycle-1-audit.md) - the 7 launch-blocking bugs that triggered rollback
- [docs/c-retry/](docs/c-retry/) - contracts, protocol-v2, staging, rollback, verification runbooks for the retry
