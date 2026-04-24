# Sheep Dog Simulator - Architecture

## Overview

A real-time 3D herding simulation with GPU-accelerated rendering, WebRTC multiplayer, and cross-platform support.

### Key Technical Features
- **GPU-First Rendering**: 200 sheep in single draw call using Three.js InstancedMesh
- **WebRTC Networking**: Low-latency multiplayer via Geckos.io
- **Hybrid Architecture**: Seamless single-player/multiplayer modes
- **Cross-Platform**: Desktop, mobile, and gamepad support

## Tech Stack

### Client
| Technology | Version | Purpose |
|------------|---------|---------|
| Three.js | 0.181 | WebGL rendering |
| React | 19.2 | UI components (createElement, no JSX) |
| Vite | 7.2 | Build tooling |
| Tailwind CSS | 4.1 | Styling |
| i18next | 25 | 18 localized languages |
| lz-string | 1.5 | Sandbox share-URL compression |
| nipple.js | 0.10.2 | Mobile joystick |
| Geckos.io Client | 3.0.1 | WebRTC client |

### Server
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 22+ | Runtime |
| Geckos.io Server | 3.0.1 | WebRTC signaling |
| better-sqlite3 | 12.9 | Leaderboard DB |
| PM2 | - | Process management |

### Infrastructure
- **Hosting**: DigitalOcean Droplet
- **Domain**: api.sheepdogsim.com
- **SSL**: Cloudflare proxy
- **UDP Ports**: 10000-20000 (WebRTC)

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
│                    (Geckos.io Client)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                      WebRTC Data Channel
                              │
┌─────────────────────────────────────────────────────────────┐
│                         SERVER                               │
├─────────────────────────────────────────────────────────────┤
│  index.js (Geckos.io Server)                                │
│       ↓                                                     │
│  RoomManager → GameSimulation → LeaderboardManager          │
│                                                             │
│  shared/                                                    │
│  ├── BoundaryCollision.js                                   │
│  ├── FlockingAlgorithms.js                                  │
│  └── GameStateValidation.js                                 │
└─────────────────────────────────────────────────────────────┘
```

## Core Modules

### Client

#### main.js - Game Orchestrator
Central coordination hub implementing the Mediator pattern.
- Module lifecycle management (init → start → update → cleanup)
- Mode detection (single-player vs multiplayer)
- Fixed timestep physics with interpolated rendering
- Pause system with state propagation

#### OptimizedSheep.js - GPU-Instanced Sheep
High-performance sheep rendering system.
- Single InstancedMesh for 200 sheep (1 draw call)
- Custom vertex shader for leg/head animation
- Per-instance attributes: phase, speed, state, direction
- Toon fragment shader with vertex colors

#### GrassSystem.js - Chunk-Based Grass
Interactive grass with wind effects.
- 800,000 grass instances
- Chunk-based frustum culling
- Wind shader animation
- Mobile optimization (reduced density)

#### NetworkManager.js - Multiplayer Client
WebRTC networking via Geckos.io.
- Automatic environment detection (local/production)
- State interpolation (100ms delay)
- Input buffering with sequence numbers
- Reconnection with exponential backoff

#### Sheepdog.js - Player Controller
Player-controlled dog with animations.
- Smooth movement with acceleration/deceleration
- Stamina system with sprint mechanics
- 40+ animations from GLB model
- Gamepad and touch input support

### Server

#### index.js - Geckos.io Server
WebRTC signaling and game coordination.
- Connection management (ping timeout 60s)
- 15+ message type handlers
- UDP ports 10000-20000

#### RoomManager.js - Session Management
Room and player management.
- 4-letter room codes
- Host migration
- Quick match system
- 2-4 players per room

#### GameSimulation.js - Server-Side State
Authoritative game simulation.
- 60 FPS tick rate
- State broadcast to all clients
- Input validation and anti-cheat
- Deterministic flocking algorithms

## Game Modes

| Mode | Description | Players |
|------|-------------|---------|
| Solo | Client-side simulation, instant start | 1 |
| Cooperative | Work together to herd 200 sheep | 2-4 |
| Competitive | Race to collect sheep (first to 101 in 2P) | 2-4 |
| Timed | 3-minute countdown, highest score wins | 2-4 |

## Network Protocol

### Message Types
```typescript
// Client → Server
interface PlayerInput {
    direction: { x: number, z: number };
    sprinting: boolean;
    timestamp: number;
    sequence: number;
}

// Server → Client
interface GameStateUpdate {
    sheep: Array<{id, position, velocity, state}>;
    players: Map<string, {position, velocity, stamina, dogType}>;
    timestamp: number;
    tick: number;
}
```

### Connection Flow
```
DISCONNECTED → CONNECTING → CONNECTED → IN_ROOM → IN_GAME
       ↑                                              │
       └──────── (reconnection with backoff) ────────┘
```

## Performance

### Metrics
| Metric | Desktop | Mobile |
|--------|---------|--------|
| Target FPS | 60 | 30-60 |
| Draw Calls (sheep) | 1 | 1 |
| Grass Instances | 800,000 | 80,000 |
| Memory | ~150MB | ~100MB |
| Network Bandwidth | ~10KB/s | ~10KB/s |

### Optimizations
- **GPU Instancing**: Single draw call for all sheep
- **Chunk Culling**: Grass rendered only in view frustum
- **Mobile Mode**: Shadows disabled, reduced pixel ratio
- **Lazy Loading**: Mobile controls load only on touch devices
- **State Interpolation**: Smooth remote player movement

## File Structure

```
├── js/
│   ├── main.js              # Game orchestrator
│   ├── SceneManager.js      # Three.js scene/camera
│   ├── TerrainBuilder.js    # Environment generation
│   ├── StructureBuilder.js  # Gates, fences, pastures
│   ├── OptimizedSheep.js    # GPU sheep system
│   ├── Sheepdog.js          # Player controller
│   ├── GrassSystem.js       # Chunk-based grass
│   ├── GameState.js         # Game logic
│   ├── GameTimer.js         # Timing system
│   ├── NetworkManager.js    # WebRTC client
│   ├── MultiplayerUI.js     # Multiplayer UI
│   ├── MobileControls.js    # Touch controls
│   ├── InputHandler.js      # Input management
│   ├── GamepadManager.js    # Controller support
│   ├── AudioManager.js      # Sound system
│   ├── StartScreen.js       # Start screen
│   ├── PerformanceMonitor.js # FPS stats
│   ├── GameAssetLoader.js   # Asset loading
│   ├── Boid.js              # Base AI behavior
│   ├── ExtremeBoid.js       # Aggressive variant
│   ├── FencePresets.js      # Fence configurations
│   ├── Vector2D.js          # 2D math
│   └── components/
│       ├── App.js           # React root (createElement, no JSX)
│       ├── GameHUD/
│       ├── Multiplayer/     # Lobby, RoomCreation, PublicLobbyList, etc.
│       ├── StartScreen/
│       ├── hooks/
│       ├── shared/
│       └── ui/              # Button, Panel, LanguageSelector
│
├── server/
│   ├── index.js             # Geckos.io server
│   ├── GameSimulation.js    # Server game state
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
├── assets/
│   ├── models/              # GLB models
│   ├── sounds_compressed/   # Audio
│   └── images/              # UI/SEO
│
├── css/
│   ├── production.css
│   └── multiplayer-react.css
│
├── index.html               # Entry point
├── package.json
├── vite.config.js
└── tailwind.config.js
```

## Development

### Local Setup
```bash
# Client
npm install
npm run dev  # http://localhost:3000

# Server
cd server
npm install
npm start    # http://localhost:9208
```

### Production Build
```bash
npm run build  # Output to dist-react/
```

### Deployment
- **Frontend**: Static hosting (GitHub Pages, CDN)
- **Server**: DigitalOcean Droplet with PM2
- **SSL**: Cloudflare proxy for api.sheepdogsim.com
