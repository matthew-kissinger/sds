# Sheep Dog Simulator

A browser-based 3D herding game where you play a border collie guiding 200 boid-simulated sheep into the pasture. Runs on desktop, mobile, and gamepad; plays with friends over WebRTC; renders hundreds of thousands of wind-animated grass blades at 60 fps.

**Play now at [sheepdogsim.com](https://sheepdogsim.com)**

![MIT License](https://img.shields.io/badge/license-MIT-green) ![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen) ![Three.js](https://img.shields.io/badge/three.js-0.181-black) ![React](https://img.shields.io/badge/react-19-61DAFB) ![Vite](https://img.shields.io/badge/vite-7.3-646CFF)

## Highlights

- **Real flocks.** 200 sheep run a cohesion / separation / alignment boid sim. All of them render in a single GPU draw call via `InstancedMesh` with a custom vertex shader that animates legs and heads per-instance.
- **Real multiplayer.** 2-4 player cooperative or competitive rooms over Geckos.io WebRTC, 60 Hz authoritative server tick, 100-150 ms adaptive jitter buffer, client-side velocity extrapolation for smooth sync on lossy links.
- **Big, alive world.** 800x800 m terrain, wind-driven grass with per-blade interaction shader, multi-layered mountains with distance-based LOD via `SimplifyModifier`, 40+ dog animations loaded from GLB.
- **Plays everywhere.** WASD, full-analog gamepad, or a touch joystick with sprint button and zoom slider. Mobile drops shadows, caps pixel ratio at 1, and halves grass density so it still hits 30-60 fps on phones.
- **Localized in 18 languages** via i18next with browser-language detection.
- **Sandbox mode.** Design your own field layout (fences, gates, spawn zones) and share it with a single lz-string-encoded URL.
- **Open source, MIT licensed.** Fork it, mod it, use it as a reference for 3D browser games. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full map.

## Quick start

Requires Node 22+ and a modern browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+).

```bash
npm install

# Client + multiplayer server together
npm run dev:full          # Vite on :3000, Geckos on :9208

# Or client only (connects to the live API for multiplayer)
npm run dev               # Vite on :3000

# Production build
npm run build             # Output to dist/
```

## Controls

### Desktop
| Input | Action |
|-------|--------|
| W A S D | Move |
| Shift | Sprint (burns stamina) |
| Mouse wheel | Zoom |
| Escape | Pause |
| P | Show performance panel (FPS, triangles, per-system breakdown) |
| Gamepad | Full analog support |

### Mobile
- Joystick (bottom-left): 360-degree movement
- Sprint button (above joystick): hold to sprint with stamina feedback
- Zoom slider (bottom-right): camera distance

## Game modes

| Mode | Players | Goal |
|------|---------|------|
| Solo | 1 | Guide 200 sheep through the gate |
| Cooperative | 2-4 | Team-herd 200 sheep |
| Competitive | 2-4 | First player to fill their own gate wins |
| Timed | 2-4 | Most sheep retired in 3 minutes |

## Tech stack

**Client:** Three.js 0.181, React 19, Vite 7.3, Tailwind 4.1, Geckos.io 3 client, i18next, lz-string, nipple.js  
**Server:** Node 22, Geckos.io 3 server, better-sqlite3, PM2  
**Testing:** Vitest 4 (unit + WebSocket integration harness), Playwright (browser smoke)  
**Infra:** GitHub Pages + Cloudflare DNS for the frontend, DigitalOcean droplet for the API

## Development

```bash
npm run dev:full             # client + server for local multiplayer
npm test                     # run all vitest suites
npm run test:integration     # WebSocket two-client harness (POSTMORTEM 5.3 gate)
npm run test:e2e             # Playwright browser smoke tests
npm run build                # production bundle
```

Current state: 30/37 vitest tests pass. 7 are intentionally skipped as scaffolding for the Cycle 2 backend migration (see `tests/integration/flow.spec.ts`). Browser smoke tests require `npx playwright install chromium` once.

## Architecture at a glance

```
js/
  main.js              Game orchestrator (Mediator pattern over all subsystems)
  SceneManager.js      Three.js scene, camera, frame-rate-independent follow cam
  TerrainBuilder.js    Procedural terrain, trees, rocks, mountains (LOD)
  OptimizedSheep.js    200-sheep InstancedMesh + custom vertex shader
  GrassSystem.js       Chunk-based wind grass with player/sheep interaction
  Sheepdog.js          Player dog: movement, stamina, animation state machine
  NetworkManager.js    Geckos.io client, adaptive jitter buffer, extrapolation
  GameState.js         Game logic, score, gate completion
  PerformanceMonitor.js FPS, draw calls, per-system triangle breakdown
  components/          React 19 UI (no JSX; uses React.createElement)

server/                Geckos.io authoritative sim + SQLite leaderboard
shared/                Deterministic flocking + physics (client + server)
tests/                 Vitest integration + sim baseline + Playwright e2e
docs/                  Design docs, POSTMORTEM, cycle-1-audit, c-retry/
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for module-level diagrams, the network protocol, performance metrics, and the full file tree.

## Deployment

**Frontend:** static site on GitHub Pages. `main` branch builds and deploys; the custom domain is configured via CNAME to Cloudflare.

**Multiplayer server:** DigitalOcean droplet running PM2, fronted by Cloudflare SSL on `api.sheepdogsim.com`, UDP ports 10000-20000 open for WebRTC data channels, SQLite file for leaderboard persistence. See [DROPLET_DEPLOYMENT.md](DROPLET_DEPLOYMENT.md).

## Current project status

A Cloudflare Workers + Durable Objects + D1 + Pages migration was attempted in Cycle 1 and rolled back on 2026-04-23 after surfacing seven launch-blocking gaps between the client's expectations and the worker's behavior. Production still runs the Geckos + DigitalOcean droplet path.

Cycle 2 is queued. Prep artifacts (client-server contract, protocol v2 spec, CF resources runbook, integration + sim-baseline test harnesses, cycle-1 audit) all landed and live in [docs/c-retry/](docs/c-retry/). The overnight execution brief is at [NEXT_SESSION.md](NEXT_SESSION.md). See also [POSTMORTEM.md](POSTMORTEM.md) and [docs/cycle-1-audit.md](docs/cycle-1-audit.md) for context on what not to repeat.

## Contributing

Issues and PRs welcome. High-value areas right now:

- MP server-side delta encoding (the client already extrapolates from `vx`/`vz`; adding a `SHEEP_DELTA_THRESHOLD` on the server would roughly halve bandwidth)
- Dog GLB compression with gltf-transform + Draco (25-40k triangle saving per dog)
- Tree LOD at >150 m (the biggest remaining triangle contributor on desktop)
- More languages (i18n keys live in `js/i18n/`)

Reading order for new contributors:
1. [ARCHITECTURE.md](ARCHITECTURE.md)
2. [DECISIONS.md](DECISIONS.md)
3. [POSTMORTEM.md](POSTMORTEM.md) (for context on past migration attempts)
4. [AGENT_PLAN.md](AGENT_PLAN.md) (the living roadmap)

## License

MIT. Fork, mod, learn, ship.
