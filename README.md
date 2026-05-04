# Sheep Dog Simulator

A browser-based 3D herding game with three distinct biomes, four solo modes (200 → 5,000 sheep), 2-4 player online co-op + competitive rooms, a 2-player split-screen mode, and a sandbox editor. Free to play, MIT licensed, built to be forked.

**Play now at [sheepdogsim.com](https://sheepdogsim.com)** — no install, no sign-up, works on desktop, phone, and a gamepad.

![MIT License](https://img.shields.io/badge/license-MIT-green) ![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen) ![Three.js](https://img.shields.io/badge/three.js-0.181-black) ![React](https://img.shields.io/badge/react-19-61DAFB) ![Vite](https://img.shields.io/badge/vite-7.3-646CFF) ![Cloudflare](https://img.shields.io/badge/backend-Cloudflare%20Workers-F38020)

## Why this repo exists

Most WebGL games are either tech demos or closed-source mobile-clone ports. This one is neither. It is a fully playable, polished 3D game you can fork in an afternoon and ship your own variant of by the weekend. The stack is small, legible, and modern:

- **Three hand-built biomes** — flat fenced field, 180m hilly island with a corral, 380m open-country island with a magical portal and a multi-stage gather→drive objective
- **GPU-instanced boid flocks** in a single draw call with a custom vertex shader; sheep counts scale 200 → 1,000 → 3,000 → 5,000 by mode
- **Force-based steering on real obstacles** — sheep + dog actually route around tree trunks and large rocks via a deterministic kdbush spatial index
- **Authoritative 60 Hz multiplayer** on Cloudflare Workers + Durable Objects + D1
- **MessagePack over WebSocket** for per-tick state; native `fetch` for lobby + leaderboard
- **Hosek-Wilkie analytic sky** with day/night presets, parallax cloud layer, water with sun-glint, and a billboarded sun disc
- **Hundreds of thousands of grass blades** with directional wind shader, oriented-body interaction (dog bends grass along its facing), per-scene density tuning, and stochastic-dither LOD
- **Three camera modes** — Classic (top-down isometric), Follow (cinematic close-up), Free (yaw-orbit) — with per-scene memory
- **Sandbox mode** with fence/gate/spawn editing and lz-string share URLs
- **i18n** in five languages (`en`, `es`, `ja`, `pt`, `zh-CN`) via i18next

If you are learning 3D web games, agent-authored backends, or distributed real-time sim on edge compute, the code here is something you can actually read end to end. The engine is ~10k lines of JavaScript plus a ~500-line TypeScript worker; no build-time codegen, no wasm, no platform-specific binaries.

## Try it

- **Play:** [sheepdogsim.com](https://sheepdogsim.com) (desktop, mobile, gamepad)
- **Source:** [github.com/matthew-kissinger/sds](https://github.com/matthew-kissinger/sds)
- **Architecture tour:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **What's been shipping:** [DECISIONS.md](DECISIONS.md) (chronological log) and [docs/BACKLOG.md](docs/BACKLOG.md) (per-cycle headlines)

## Quick start

Requires Node 22+ and a modern browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+).

```bash
npm install
cp worker/.dev.vars.example worker/.dev.vars   # JWT secret for local
npm run dev:setup                              # apply D1 migrations to local sqlite

# Vite (:3000) + wrangler (:8787) together:
npm run dev

# Granular alternatives:
npm run dev:client                             # just Vite
npm run dev:worker                             # just wrangler
npm run dev:lan                                # Vite with --host + wrangler

# Production build:
npm run build                                  # output to dist/
```

The client auto-detects `localhost` and points at `http://localhost:8787` + `ws://localhost:8787`; otherwise it hits the deployed worker.

URL params for fast scene picking:
- `?scene=field` — flat fenced Home Field (default)
- `?scene=rolling-hills` — 180m hilly island with a corral
- `?scene=open-country` — 380m island with portal + multi-stage objective

## Controls

| Input | Desktop | Mobile |
|-------|---------|--------|
| Move | W A S D | Virtual joystick, bottom-left |
| Sprint | Shift (drains stamina; locks until released after empty) | Button above joystick |
| Camera mode | C (cycles Classic / Follow / Free) | Tap the camera-mode chip on the HUD |
| Zoom | Mouse wheel | Slider, bottom-right |
| Pause | Escape | Pause button on the HUD |
| Perf panel | P | — |
| Gamepad | Full analog support | — |

Camera modes: **Classic** (high-isometric, world-axis WASD), **Follow** (close cinematic chase, camera-relative WASD, ridge-clearance lift), **Free** (mouse-yaw orbit on top of Follow's pitch). Per-scene preference is remembered in localStorage.

## Scenes

| Scene | Shape | Sheep (Classic) | Hook |
|-------|-------|-----------------|------|
| **Home Field** | Flat fenced rect, ±100m | 200 | Single perimeter pen, gate-passage retirement. The starter. |
| **Rolling Hills** | 180m island | 250 | Lightning-zap corral retirement. Trees + rocks as real obstacles. |
| **Open Country** | 380m island, ~4.2× area | 200 | Multi-stage objective: gather **40 sheep into the round-up zone for 2 sec**, then drive them into a magical portal at the north shore. Three woods clusters bias tree density. |

Beyond Classic, three boost modes scale the sheep count uniformly across all scenes: **Extreme** (1,000), **Insane** (3,000), **Chaos** (5,000).

## Game modes

| Mode | Players | Goal | Scoring |
|------|---------|------|---------|
| **Solo Classic** | 1 | Herd the scene's flock to its retirement zone. | Best time — global leaderboard. |
| **Solo Extreme** | 1 | 1,000 sheep with aggressive flock AI. | Best time — separate leaderboard. |
| **Solo Insane** | 1 | 3,000 sheep. Dog stamina matters. | Best time — separate leaderboard. |
| **Solo Chaos** | 1 | 5,000 sheep. The flock is the antagonist. | Best time — separate leaderboard. |
| **Cooperative** | 2-4 | Team-herd 200 sheep into a shared gate. | Best team time per player. |
| **Competitive** | 2-4 | Each player gets their own gate. | Wins counter per player. |
| **Timed** | 2-4 | Three-minute countdown, spawns regenerate. | Highest sheep count. |
| **Sandbox** | 1-2 | Design the field (fences, gates, spawn zones). | Shareable via lz-string URL. |
| **Local 2-player** | 2 (same screen) | Split-screen co-op, versus, or timed. | Local-only, no leaderboard. |

## Architecture at a glance

```
┌──────────────────────── CLIENT (Cloudflare Pages) ──────────────────────┐
│                                                                         │
│  StartScreen → GameState → OptimizedSheep → SceneManager                │
│       ↓              ↓            ↓              ↓                      │
│  MobileControls  InputHandler  Sheepdog    TerrainBuilder               │
│       ↓              ↓            ↓              ↓                      │
│  AudioManager   GamepadManager  GrassSystem   Atmosphere + Effects      │
│       │              │              │              │                    │
│       │              │              │              ├── HosekWilkieSky   │
│       │              │              │              ├── CloudLayer       │
│       │              │              │              ├── SunBillboard     │
│       │              │              │              ├── PortalEffect     │
│       │              │              │              └── CorralZapEffect  │
│       └──────────────┴──── shared/ deterministic kernels ──────────┐    │
│                       (boid, MovementPhysics, BoundaryCollision,   │    │
│                        TreePlacement, SceneObstacles, scenes/)     │    │
│                                                                    │    │
│                    NetworkManager                                  │    │
│            (WebSocket + MessagePack + fetch, adaptive jitter buffer)    │
└─────────────────────────────────┬───────────────────────────────────────┘
                          HTTPS │ WSS
┌─────────────────────────────── ▼ ─── SERVER (Cloudflare Worker) ───────┐
│                                                                         │
│  index.ts                                                               │
│    ├── HTTP:  /api/register, /api/rooms, /api/score, /api/leaderboards │
│    └── WS:    /r/:code/ws → RoomDO                                      │
│         ↓                                                               │
│  RoomDO   — per-room, runs GameSim at 60 Hz, broadcasts state frames    │
│  LobbyDO  — singleton, public lobby list + quick-match + room codes     │
│         ↓                                                               │
│  D1 (sds-db)                                                            │
│    ├── players                  (materialized best per mode + identity)│
│    ├── discriminators           (#0001 allocation)                     │
│    └── score_submissions        (audit trail)                          │
└─────────────────────────────────────────────────────────────────────────┘
```

The `shared/` modules are imported byte-identically by both client (Vite) and worker (esbuild) — flocking, obstacle queries, boundary collision, tree placement, and scene definitions all live here so solo and multiplayer agree on physics. Sim-baseline tests pin a deterministic Field run to JSON fixtures and have stayed bit-identical across cycles 5–7.

See [ARCHITECTURE.md](ARCHITECTURE.md) for module-level diagrams, the network protocol, and the full file tree.

## Tech stack

**Client:** Three.js 0.181 · React 19 · Vite 7.3 · Tailwind 4.1 · @msgpack/msgpack 3 · i18next · lz-string · nipple.js · kdbush
**Server:** Cloudflare Workers · Durable Objects · D1 · wrangler 4
**Shared:** `shared/` deterministic boid + physics + obstacle modules, imported by both client and worker
**Testing:** Vitest 4 (111 specs across atmosphere, heightfield, scene-obstacles, island-boundary, tree-placement, sim-baseline, integration harness) · Playwright (browser smoke)

## Current status

[sheepdogsim.com](https://sheepdogsim.com) serves from Cloudflare Pages (`sds-frontend`); the multiplayer API runs on a Cloudflare Worker at `sds-worker.matt-m-kissinger.workers.dev` with Durable Objects for room state and D1 for leaderboards. The legacy DigitalOcean droplet was destroyed in April 2026 — Cloudflare-only stack going forward.

Latest cycle highlights:

- **Cycle 7** (camera + sky/water + OC outer-ring + multi-stage objective) — see [docs/archive/cycles/cycle-7-plan.md](docs/archive/cycles/cycle-7-plan.md). Camera lurch fixed under stamina-out and tree contact; sky horizontal-line artifacts traced to a separate `CloudLayer` shader and resolved; OC outer ring now reads as continuous grass + mesh trees out to the shore; OC gained a gather→drive→portal multi-stage loop. Mid-cycle: stamina state machine corrected; lightning retirement traces the full bolt with a spark at the top; legacy hardcoded grass-exclusion zones gated on scene defs.
- **Cycle 6** — Trees + large rocks are real obstacles (sheep + dog route around them); woods clusters bias tree density on Open Country; coastal pen replaced by a magical portal.
- **Cycle 5** — Discriminated `Boundary` schema enabling island scenes; `kdbush` + `SceneObstacles` primitives; anime cel-water shader; Rolling Hills + Open Country migrated to islands.
- **Cycle 4 Hardening** — 29 fixes across atmosphere, terrain, grass-LOD, camera, and animation; latest live deploy.

[docs/BACKLOG.md](docs/BACKLOG.md) keeps the per-cycle headline log; [DECISIONS.md](DECISIONS.md) is the chronological "why" record.

## Roadmap — where the game is going

With the backend on Cloudflare's edge, the engine modular, and three biomes shipped, what comes next is content depth and dynamic life:

- **Dynamic weather + time-of-day** as gameplay levers, not just visual atmosphere. The Hosek-Wilkie sky already supports dawn/noon/dusk/golden-hour/overcast presets and the dusk preset alters sun glint + fog color; the next step is wiring a `DayNightCycle` driver that sheep flocking tightens at dusk and visibility drops in fog.
- **More multi-stage objectives** beyond Open Country's gather→drive. River crossings, predator-flushing, time-pressure herding to a closing gate, lost-sheep recovery, scattered sub-flocks at multiple cardinal directions — each unlocked by data in `shared/scenes/*.js` rather than new code paths.
- **Predators + NPCs.** Wolves or strays as obstacle-aware boids using the same `SceneObstacles` index sheep already query. A second AI shepherd that competes or assists.
- **Mod-friendly scene format.** Sandbox uses lz-string-encoded URLs today; growing this to full scene descriptions (heightmap + tree zones + woods clusters + objective def) so a custom biome ships as a link.
- **Spherical-billboard impostors** so the high-elevation atlas tiles aren't dead pixels at cinematic / freeFly altitudes. The Cycle 18 octahedral atlas already bakes 16 views per species (4 azimuth × 4 elevation), and Cycle 19.5 brightened the bake to match LOD0 exposure — but the runtime quad still billboards around world-Y only, so high-elevation atlas tiles render edge-on. A proper spherical billboard with a square-tile bake would unlock the overhead shots.
- **Competitive seasons + tournaments** once the leaderboard has enough player history to make them meaningful.

None of this is gated on the backend — D1 scales trivially, DO rooms are independent, Workers autoscale at the edge. Contributions toward any direction welcome.

## Contributing

This codebase is deliberately easy to read. Whether you want to mod the game, use it as a reference for a 3D browser project of your own, or ship a PR, the reading order is:

1. [ARCHITECTURE.md](ARCHITECTURE.md) — module map + render + network protocol
2. [DEVELOPMENT.md](DEVELOPMENT.md) — local setup, dev servers, mobile testing
3. [DECISIONS.md](DECISIONS.md) — why we made the calls we did
4. [docs/BACKLOG.md](docs/BACKLOG.md) — per-cycle "what shipped" headlines
5. [docs/INTERFACE_FENCE.md](docs/INTERFACE_FENCE.md) — files where stability matters more than ergonomics

### Places a PR would be genuinely useful

- **Delta-encoded state broadcast** in `worker/src/RoomDO.ts` — the client already extrapolates from `vx`/`vz`, so per-viewer deltas would roughly halve bandwidth.
- **LOD2 → LOD0 cross-fade** at the 100 m boundary. The hard pop is visible — alpha-dither / fade across a 5-10 m hysteresis band would soften it. Requires the impostor material to participate in the fade (alpha output), which isn't a one-line patch.
- **Spherical-billboard tilt for overhead camera angles** (paired with a square-tile re-bake) — see roadmap above.
- **More languages.** i18n keys live in `js/locales/`; PRs add a new directory + JSON files.
- **Dog GLB compression** via gltf-transform + Draco — 25-40k triangles per dog, five dog models.
- **Better mobile perf.** Current target is 30-60 fps; getting 60 reliable on mid-range Android would help.
- **MP joiner renderer sync.** Joiners whose URL-param scene differs from the room's see correct sim but mismatched visuals.
- **Resize behavior audit.** Carried from Cycle 4; sometimes camera/HUD don't reseat correctly after a window resize.

Issues and PRs welcome. If you ship a mod or fork, open an issue and I'll link it from this section.

## License

MIT. Fork it, mod it, ship it, sell it, teach with it. Credit appreciated but not required.
