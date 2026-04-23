# Sheep Dog Simulator

A browser-based 3D herding game. Control a sheepdog, herd 200-5000 sheep through a gate, beat the clock or other players. GPU-instanced rendering, realtime multiplayer, 18 localized languages, desktop + mobile.

**Live:** [sheepdogsim.com](https://sheepdogsim.com)

## Features

### Gameplay
- **Interactive Herding** - Control a sheepdog using WASD/gamepad or touch controls
- **Stamina System** - Sprint while managing stamina for strategic play
- **Realistic AI** - Up to 5000 sheep with boid flocking (cohesion, separation, alignment)
- **Six Game Modes** - Classic, Extreme, Insane, Chaos, Timed, Competitive, plus Sandbox
- **Five Dog Breeds** - Jep, Pip, Sally, Shiloh, George Washington, each with tuned stats
- **Leaderboard** - Persistent scoring keyed to a client-generated persistent ID

### Multiplayer
- **Room System** - Create private rooms with share URLs, or use the public lobby list
- **Realtime Sync** - Native WebSocket + MessagePack, 20Hz authoritative server with client interpolation
- **2-4 Players** - Cooperative, Competitive, or Timed modes
- **Host Migration** - Host-starts-game, host migrates on disconnect
- **Server** - Cloudflare Worker + Durable Objects at `sheepdogsim.com/api/*` and `/r/*/ws`

### Visual
- **800x800 World** - Expansive terrain with fog and atmospheric effects
- **Dynamic Grass** - 800,000 animated instances with chunk-based culling
- **Procedural Terrain** - Multi-layered mountains and realistic forests
- **3D Models** - Detailed Border Collies (40+ animations) and GPU-instanced sheep

### Mobile
- **Virtual Joystick** - Touch-based 360-degree movement via nipple.js
- **Zoom Slider** - Camera distance adjustment
- **Sprint Button** - Touch-optimized with stamina feedback
- **Responsive UI** - Adaptive layouts for all screen sizes

## Quick Start

### Prerequisites
- Node.js 22+
- Modern browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)

### Development

```bash
npm install
npm run dev
# Opens at http://localhost:3000
```

For a production build:

```bash
npm run build
```

### Local dev against the Cloudflare Worker

The client uses the Cloudflare Workers + Durable Objects backend by default (`VITE_USE_DO_BACKEND=true` is set in `.env.production`). To run the worker locally:

1. Start the worker dev server:
   ```bash
   cd worker
   npx wrangler dev
   # Listens on http://localhost:8787
   ```
2. Create `.env.local` in the repo root:
   ```
   VITE_USE_DO_BACKEND=true
   ```
3. Start the frontend:
   ```bash
   npm run dev
   ```

On `localhost`, the client auto-targets `ws://localhost:8787` instead of `wss://sheepdogsim.com`.

See `worker/README.md` for worker-specific tooling (D1, secrets, deploy).

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
sds/
├── index.html              # Entry, SEO meta
├── about.html              # Secondary page
├── sw.js                   # Service worker (build-id cache busting)
├── vite.config.js          # Dual-target build (CF Pages + itch.io)
│
├── js/                     # Client game logic
│   ├── main.js             # Game orchestrator
│   ├── GameState.js        # Sim config, mode switching, sandbox
│   ├── SceneManager.js     # Three.js scene/camera/renderer
│   ├── OptimizedSheep.js   # GPU-instanced sheep + custom shaders
│   ├── ExtremeBoidSystem.js # Spatial-hash flocking for 1000+ sheep
│   ├── Sheepdog.js         # Player/NPC dog entity
│   ├── TerrainBuilder.js   # Terrain, trees, structures
│   ├── GrassSystem.js      # 800k-blade instanced grass
│   ├── NetworkManager.js   # WebSocket + MessagePack client
│   ├── SandboxConfig.js    # Sandbox serialization + share URLs
│   ├── components/         # React 19 UI (createElement, no JSX)
│   ├── locales/            # 18 language packs
│   └── shaders/            # GLSL for grass + sheep
│
├── shared/                 # Sim primitives (mirrored into worker/)
│
├── worker/                 # Cloudflare Worker backend
│   ├── src/
│   │   ├── index.ts        # Router: /api/*, /r/:code/ws
│   │   ├── RoomDO.ts       # Per-room Durable Object, 20Hz sim
│   │   ├── LobbyDO.ts      # Public lobby registry singleton
│   │   ├── protocol.ts     # MessagePack wire types
│   │   └── shared/         # TS port of sim primitives
│   ├── migrations/         # D1 schema
│   └── docs/protocol.md    # Wire protocol reference
│
├── assets/                 # GLB models, audio, images
├── css/                    # Tailwind v4 source + custom layers
├── public/                 # Static passthrough (_headers, _redirects)
│
├── .github/workflows/
│   ├── deploy.yml          # CF Pages deploy on push to main
│   └── build-itchio.yml    # itch.io zip on tag or manual dispatch
│
├── ARCHITECTURE.md
├── DECISIONS.md
└── AGENT_PLAN.md           # Current cycle plan
```

## Tech Stack

### Client
| Technology | Version | Purpose |
|------------|---------|---------|
| Three.js | 0.181 | WebGL rendering |
| React | 19 | UI components |
| Vite | 7 | Build tooling |
| Tailwind CSS | 4 | Styling (CSS-first, no config) |
| @msgpack/msgpack | 3 | Wire protocol codec |
| nipplejs | 0.10 | Mobile joystick |
| i18next | 25 | Localization (18 languages) |
| lz-string | 1.5 | Sandbox share-URL compression |

### Backend (Cloudflare)
| Component | Purpose |
|-----------|---------|
| Workers | HTTP router (`/api/*`), WebSocket upgrade (`/r/:code/ws`) |
| Durable Objects | `RoomDO` (per-room sim, 20Hz), `LobbyDO` (public lobby registry) |
| D1 | Leaderboard + score submissions (SQLite-compatible) |
| Pages | Static frontend hosting at `sheepdogsim.com` |

## Deployment

### Frontend - Cloudflare Pages

Auto-deploys via GitHub Actions on every push to `main`.

**Workflow:** `.github/workflows/deploy.yml`
- Checkout, `npm ci`, `npm run build`, deploy `dist/` to Cloudflare Pages via `cloudflare/pages-action@v1`.

**Required repository secrets:**
- `CF_API_TOKEN` - Cloudflare API token with Pages write permissions
- `CF_ACCOUNT_ID` - Cloudflare account ID

**CF Pages project:** `sds-frontend`
**Production branch:** `main`
**Custom domain:** `sheepdogsim.com`

Preview deployments are created automatically for PRs and commented on the PR with the preview URL.

### Backend - Cloudflare Worker

Deployed manually from `worker/` with `wrangler deploy`. Routes:
- `sheepdogsim.com/api/*` - HTTP API (lobbies, register, score, leaderboard)
- `sheepdogsim.com/r/*/ws` - WebSocket upgrade to per-room Durable Objects

D1 database `sds-db` holds the leaderboard (207 players migrated from the legacy droplet). See `worker/README.md` for local dev, D1 setup, and secret configuration.

### itch.io Builds

**Workflow:** `.github/workflows/build-itchio.yml`

Triggered by:
- Manual: Actions tab > "Build for itch.io" > Run workflow
- Automatic: pushing a tag like `v1.2.3`

Produces `sds-itchio-<tag>.zip` from `npm run build:itchio` (relative paths, no base URL). On tagged releases the zip is uploaded as a GitHub release asset. Upload to itch.io manually.

## Rollback window

The legacy DigitalOcean droplet (`api.sheepdogsim.com`, Geckos.io/WebRTC + SQLite) remains online as a fallback through approximately **2026-05-23** (30 days post-cutover). To roll back: remove `sheepdogsim.com` as a custom domain from the `sds-frontend` Pages project, then re-point the DNS CNAME to `matthew-kissinger.github.io`. The droplet is destroyed in Track G of the current agent cycle.

## License

MIT License - feel free to modify and use for educational purposes.
