# Sheep Dog Simulator

A browser-based 3D herding game with solo leaderboard runs, 2-4 player online co-op and competitive rooms, a 2-player split-screen mode, and a sandbox editor. Free to play, MIT licensed, built to be forked.

**Play now at [sheepdogsim.com](https://sheepdogsim.com)** — no install, no sign-up, works on desktop, phone, and a gamepad.

![MIT License](https://img.shields.io/badge/license-MIT-green) ![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen) ![Three.js](https://img.shields.io/badge/three.js-0.181-black) ![React](https://img.shields.io/badge/react-19-61DAFB) ![Vite](https://img.shields.io/badge/vite-7.3-646CFF) ![Cloudflare](https://img.shields.io/badge/backend-Cloudflare%20Workers-F38020)

## Why this repo exists

Most WebGL games are either tech demos or closed-source mobile-clone ports. This one is neither. It is a fully playable, polished 3D game you can fork in an afternoon and ship your own variant of by the weekend. The stack is small, legible, and modern:

- **200-sheep GPU boid flock** in one draw call with a custom vertex shader
- **Authoritative 60 Hz multiplayer** on Cloudflare Workers + Durable Objects + D1
- **MessagePack over WebSocket** for per-tick state; native `fetch` for lobby + leaderboard
- **Hundreds of thousands of grass blades** with wind shader and per-blade player/sheep interaction
- **Sandbox mode** with fence/gate/spawn editing and lz-string share URLs
- **Localized in 18 languages** via i18next

If you are learning 3D web games, agent-authored backends, or distributed real-time sim on edge compute, the code here is something you can actually read end to end. The engine is ~8k lines of JavaScript plus a ~500-line TypeScript worker; no build-time codegen, no wasm, no platform-specific binaries.

## Try it

- **Play:** [sheepdogsim.com](https://sheepdogsim.com) (desktop, mobile, gamepad)
- **Source:** [github.com/matthew-kissinger/sds](https://github.com/matthew-kissinger/sds)
- **Architecture tour:** [ARCHITECTURE.md](ARCHITECTURE.md)

## Quick start

Requires Node 22+ and a modern browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+).

```bash
npm install

# Single-player dev (no backend needed)
npm run dev                    # Vite on :3000

# Full stack: client + local worker
npm run dev                    # terminal 1 — Vite on :3000
cd worker && npx wrangler dev  # terminal 2 — Worker on :8787

# Production build
npm run build                  # output to dist/
```

For multiplayer testing, the client auto-detects `localhost` and points at `http://localhost:8787` + `ws://localhost:8787`; otherwise it hits the deployed worker.

## Controls

| Input | Desktop | Mobile |
|-------|---------|--------|
| Move | W A S D | Virtual joystick, bottom-left |
| Sprint | Shift (burns stamina) | Button above joystick |
| Zoom | Mouse wheel | Slider, bottom-right |
| Pause | Escape | Pause button on the HUD |
| Perf panel | P | — |
| Gamepad | Full analog support | — |

## Game modes

| Mode | Players | Goal | Scoring |
|------|---------|------|---------|
| **Solo Classic** | 1 | Herd 200 sheep into the pen. | Best time — global leaderboard. |
| **Solo Extreme** | 1 | 1,000 sheep with aggressive flock AI. | Best time — separate leaderboard. |
| **Solo Insane** | 1 | 3,000 sheep. Good luck. | Best time — separate leaderboard. |
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
│  AudioManager   GamepadManager  GrassSystem   ReactUI                   │
│                                                                         │
│                    NetworkManager                                       │
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

See [ARCHITECTURE.md](ARCHITECTURE.md) for module-level diagrams, the network protocol, and the full file tree.

## Tech stack

**Client:** Three.js 0.181 · React 19 · Vite 7.3 · Tailwind 4.1 · @msgpack/msgpack 3 · i18next · lz-string · nipple.js
**Server:** Cloudflare Workers · Durable Objects · D1 · wrangler 4
**Shared:** `shared/` deterministic boid + physics modules, imported by both client and worker
**Testing:** Vitest 4 (unit + WS integration harness) · Playwright (browser smoke)

## Current status

Everything is on Cloudflare. [sheepdogsim.com](https://sheepdogsim.com) serves from Cloudflare Pages (`sds-frontend`), and the multiplayer API runs on a Cloudflare Worker at `sds-worker.matt-m-kissinger.workers.dev` with Durable Objects for room state and D1 for leaderboards. The old DigitalOcean droplet is in short-term soak mode as a rollback safety net; it's scheduled for teardown a week post-cutover. Closeout in [docs/cycle-2-report.md](docs/cycle-2-report.md); remaining cleanup in [docs/cycle-2-todo.md](docs/cycle-2-todo.md).

## Roadmap — where the game is going

The single fenced-in valley is the starting point, not the destination. With the backend fully on Cloudflare's edge, what comes next is content expansion:

- **New scenes beyond the valley.** Rolling hills, river crossings, moorland, canyon runs, forest clearings — each with its own terrain generator, grass density, prop set, and boundary rules. The `TerrainBuilder` module is already zone-based; the scaffolding for swappable biomes is there.
- **Scene-specific game modes.** A herding drive across a valley floor plays differently from a mountain-pass funnel or a marshland with gaps. Modes like *drive* (point-A-to-point-B across rough terrain), *chase* (chase a wandering flock into natural enclosures), and *endless* (procedural terrain, rising sheep count) are on the docket.
- **Dynamic weather + time of day.** Wind already ripples the grass — rain, fog banks, dusk/dawn lighting are plausible next steps now that the grass and atmospheric shaders exist.
- **Richer NPC behavior.** Predators (wolves, strays), other herders with their own flocks, and sheep personalities (lead, stubborn, skittish).
- **Mod-friendly asset pipeline.** The sandbox format is lz-string-encoded today; it can grow to full scene descriptions that live in `public/scenes/*.json` or URL hashes, so a custom biome ships as a link.
- **Competitive seasons + tournaments** once the leaderboard has enough player history to make them meaningful.

None of this is gated on the backend — D1 scales trivially, DO rooms are independent, Workers autoscale at the edge. Contributions toward any of these directions are welcome; see the [Contributing](#contributing) section.

## Contributing

This codebase is deliberately easy to read. Whether you want to mod the game, use it as a reference for a 3D browser project of your own, or ship a PR, the reading order is:

1. [ARCHITECTURE.md](ARCHITECTURE.md) — module map + render + network protocol
2. [DEVELOPMENT.md](DEVELOPMENT.md) — local setup, dev servers, mobile testing
3. [DECISIONS.md](DECISIONS.md) — why we made the calls we did
4. [docs/cycle-2-report.md](docs/cycle-2-report.md) — what the current backend actually does

### Places a PR would be genuinely useful

- **Delta-encoded state broadcast** in `worker/src/RoomDO.ts` — the client already extrapolates from `vx`/`vz`, so per-viewer deltas would roughly halve bandwidth
- **Tree LOD beyond 150 m** — trees are the biggest remaining triangle contributor on desktop
- **Dog GLB compression** via gltf-transform + Draco — 25-40 k triangles per dog, five dog models
- **More languages** — i18n keys in `js/i18n/`
- **Better mobile perf** — current target is 30-60 fps; getting 60 reliable on mid-range Android would help

Issues and PRs welcome. If you ship a mod or fork, open an issue and I'll link it from this section.

## License

MIT. Fork it, mod it, ship it, sell it, teach with it. Credit appreciated but not required.
