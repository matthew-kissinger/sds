# Sheep Dog Simulator

A browser-based 3D herding simulation where players control a sheepdog to guide 200 sheep through a gate into a pasture. Features GPU-accelerated boid flocking, WebRTC multiplayer, and cross-platform support.

**Live:** [sheepdogsim.com](https://sheepdogsim.com)

## Features

### Gameplay
- **Interactive Herding**: Control a sheepdog using WASD/gamepad or touch controls
- **Stamina System**: Sprint while managing stamina for strategic gameplay
- **Realistic AI**: 200 sheep with boid flocking behavior (cohesion, separation, alignment)
- **Multiple Game Modes**: Solo, Cooperative, Competitive racing, and Timed collection
- **Leaderboard**: Track best times with persistent scoring

### Multiplayer
- **Room System**: Create private rooms with 4-letter codes or quick match
- **Real-time Sync**: Low-latency WebRTC networking via Geckos.io
- **2-4 Players**: Cooperative or competitive modes
- **Dog Selection**: Choose from Jep, Pip, or Shiloh
- **Server**: DigitalOcean Droplet with Cloudflare SSL (api.sheepdogsim.com)

### Visual
- **800x800 World**: Expansive terrain with fog and atmospheric effects
- **Dynamic Grass**: 800,000 animated instances with chunk-based culling
- **Procedural Terrain**: Multi-layered mountains and realistic forests
- **3D Models**: Detailed Border Collies (40+ animations) and GPU-instanced sheep

### Mobile
- **Virtual Joystick**: Touch-based 360-degree movement via nipple.js
- **Zoom Slider**: Camera distance adjustment
- **Sprint Button**: Touch-optimized with stamina feedback
- **Responsive UI**: Adaptive layouts for all screen sizes

## Quick Start

### Prerequisites
- Node.js 22+ (root + server both pin `engines.node >=22.0.0`)
- Modern browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)

### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev
# Opens at http://localhost:3000

# Production build
npm run build
```

### Multiplayer Server
```bash
cd server
npm install
npm start
# Server runs at http://localhost:9208
```

## Controls

### Desktop
| Key | Action |
|-----|--------|
| W/A/S/D | Move |
| Shift | Sprint |
| Escape | Pause |
| Mouse Wheel | Zoom |
| P | Performance stats |
| Gamepad | Full controller support |

### Mobile
- **Joystick** (bottom-left): Movement
- **Sprint Button** (above joystick): Hold to sprint
- **Zoom Slider** (bottom-right): Camera distance

## Architecture

```
├── js/                      # Client game logic
│   ├── main.js              # Game orchestrator
│   ├── SceneManager.js      # Three.js rendering
│   ├── TerrainBuilder.js    # Environment generation
│   ├── OptimizedSheep.js    # GPU-instanced sheep system
│   ├── Sheepdog.js          # Player controller
│   ├── GrassSystem.js       # Chunk-based grass rendering
│   ├── NetworkManager.js    # WebRTC multiplayer client
│   ├── GameState.js         # Game logic and state
│   ├── MobileControls.js    # Touch interface
│   ├── GamepadManager.js    # Controller support
│   ├── AudioManager.js      # Sound system
│   └── components/          # React 19 overlay (App.js, GameHUD, Multiplayer, StartScreen)
│
├── server/                  # Multiplayer server
│   ├── index.js             # Geckos.io WebRTC server
│   ├── GameSimulation.js    # Server-side game state
│   ├── RoomManager.js       # Room/session management
│   └── LeaderboardManager.js # SQLite persistence
│
├── shared/                  # Shared client/server code
│   ├── BoundaryCollision.js
│   ├── FlockingAlgorithms.js
│   └── GameStateValidation.js
│
├── assets/
│   ├── models/              # 3D models (.glb)
│   │   ├── Jep.glb          # Border Collie
│   │   ├── Pip.glb          # Border Collie
│   │   ├── Shiloh.glb       # Border Collie
│   │   └── Sheep.glb        # Sheep model
│   ├── sounds_compressed/   # Audio files
│   └── images/              # UI and SEO assets
│
└── css/                     # Stylesheets
```

## Tech Stack

### Client
- **Three.js** v0.181 - WebGL rendering
- **React 19** - UI components (createElement, no JSX)
- **Vite** v7.2 - Build tooling
- **Tailwind CSS** v4.1 - Styling
- **i18next** v25 - 18 localized languages
- **lz-string** v1.5 - Sandbox share-URL compression
- **nipple.js** - Mobile joystick
- **Geckos.io Client** - WebRTC networking

### Server
- **Node.js** 22+ - Runtime
- **Geckos.io Server** - WebRTC signaling
- **better-sqlite3** v12 - Leaderboard persistence
- **PM2** - Process management

## Performance

- **GPU Rendering**: Single draw call for 200 sheep via InstancedMesh
- **Chunk Culling**: Grass rendered in frustum-culled chunks
- **Mobile Optimization**: Reduced grass density, disabled shadows
- **Target FPS**: 60 (desktop), 30-60 (mobile)

## Deployment

### Frontend
GitHub Pages, CNAME'd to sheepdogsim.com via Cloudflare DNS proxy. Build with `npm run build`; push `main`.

### Multiplayer Server
DigitalOcean droplet running PM2 (api.sheepdogsim.com):
- Cloudflare SSL proxy
- UDP ports 10000-20000 for WebRTC
- SQLite leaderboard

See [DROPLET_DEPLOYMENT.md](DROPLET_DEPLOYMENT.md) for server setup.

## Current cycle

Backend migration to Cloudflare Workers + DO + D1 + Pages was attempted in Cycle 1 and rolled back 2026-04-23 (see [POSTMORTEM.md](POSTMORTEM.md) and [docs/cycle-1-audit.md](docs/cycle-1-audit.md)). A Cycle 2 prep batch has landed artifacts under [docs/c-retry/](docs/c-retry/) and [AGENT_PLAN.md](AGENT_PLAN.md) Section 10 that gate the retry on contracts, integration tests, staging soak, and one-command rollback. Production still runs the Geckos droplet until the retry ships.

## License

MIT License - feel free to modify and use for educational purposes.
