# Sheep Dog Simulator - Architecture

## Overview

A realtime 3D herding game served entirely from Cloudflare. Static frontend on Pages, authoritative simulation on a Worker with Durable Objects, leaderboard on D1.

### Key technical features
- **GPU-first rendering** - 200-5000 sheep in a single draw call via Three.js InstancedMesh
- **Authoritative DO simulation** - 20Hz tick in a per-room Durable Object, clients interpolate
- **MessagePack wire protocol** - Binary frames over native WebSocket, delta-encoded sheep state
- **Cross-platform** - Desktop, mobile (touch), and gamepad support

## Tech stack

### Client
| Technology | Version | Purpose |
|------------|---------|---------|
| Three.js | 0.181 | WebGL rendering |
| React | 19 | UI components (createElement, no JSX) |
| Vite | 7 | Build tooling |
| Tailwind CSS | 4 | Styling |
| @msgpack/msgpack | 3 | Wire protocol codec |
| nipplejs | 0.10 | Mobile joystick |
| i18next | 25 | 18-language localization |
| lz-string | 1.5 | Sandbox share-URL compression |

### Backend (Cloudflare)
| Component | Purpose |
|-----------|---------|
| Workers | HTTP router, WebSocket upgrade, CORS, JWT issuance |
| Durable Objects | `RoomDO` (per-room sim, 20Hz, hibernation-ready WS), `LobbyDO` (public lobby registry) |
| D1 | `players`, `discriminators`, `score_submissions` tables |
| Pages | Static frontend hosted at `sheepdogsim.com` |

## System diagram

```
                  Browser (Desktop / Mobile)
 ┌──────────────────────────────────────────────────────┐
 │  React UI  <->  GameBridge  <->  Three.js scene      │
 │                                   OptimizedSheep     │
 │                                   Sheepdog / Grass   │
 │                                                      │
 │                 NetworkManager                       │
 │        (native WebSocket + MessagePack)              │
 └──────────────────────────────────────────────────────┘
         │                               │
  HTTPS / fetch                    WSS upgrade
         │                               │
         v                               v
 ┌────────────────────────┐   ┌────────────────────────┐
 │  Cloudflare Pages      │   │  Cloudflare Worker     │
 │  (sds-frontend)        │   │  (sds-worker)          │
 │  sheepdogsim.com/*     │   │  /api/*  /r/:code/ws   │
 └────────────────────────┘   └────────────┬───────────┘
                                           │
                          ┌────────────────┼──────────────────┐
                          v                v                  v
                ┌─────────────────┐ ┌──────────────┐ ┌────────────────┐
                │     RoomDO      │ │   LobbyDO    │ │       D1       │
                │  per roomCode   │ │  singleton   │ │    sds-db      │
                │  20Hz sim tick  │ │  "global"    │ │ players,       │
                │  WS hibernation │ │  upsert/list │ │ discriminators,│
                │  delta encoding │ │  /remove     │ │ score_submits  │
                └─────────────────┘ └──────────────┘ └────────────────┘
```

### Request paths

| Path | Handler | Notes |
|------|---------|-------|
| `GET  /api/lobbies` | Worker -> LobbyDO.list | Public lobby registry |
| `POST /api/register` | Worker | Issues 24h HMAC-signed token (JWT_SECRET) |
| `POST /api/score` | Worker -> D1 | Validates bearer token, writes submission + materialized bests |
| `GET  /api/leaderboard?mode=X&limit=N` | Worker -> D1 | Reads materialized best-per-mode |
| `GET  /r/:code/ws` | Worker -> RoomDO upgrade | MessagePack WebSocket for room lifecycle + sim |

## Core modules

### Client

**`js/main.js`** - game orchestrator, mediator between React, Three.js scene, network, and sim.

**`js/OptimizedSheep.js`** - single InstancedMesh for all sheep, custom vertex shader for leg/head animation, per-instance attributes (phase, speed, state, direction), toon fragment shader with per-fragment FBM wool.

**`js/ExtremeBoidSystem.js`** - spatial-hash flocking with SoA arrays for 1000-5000 sheep (Chaos mode).

**`js/GrassSystem.js`** - 800k grass instances, chunk-based frustum culling, wind shader. Mobile runs at reduced density.

**`js/NetworkManager.js`** - native WebSocket client. Encodes outgoing messages with MessagePack, decodes incoming into the same callback surface that the rest of the client already used. Reconnects with exponential backoff. Host migration handled via `hostChanged`.

**`js/Sheepdog.js`** - player-controlled dog with 40+ GLB animations, stamina system, smooth acceleration/deceleration, gamepad + touch support.

### Backend (`worker/`)

**`worker/src/index.ts`** - Worker router. CORS for `sheepdogsim.com` and localhost. JWT issuance (HMAC-SHA256). D1 reads/writes for register/score/leaderboard. Upgrades `/r/:code/ws` to the matching `RoomDO`.

**`worker/src/RoomDO.ts`** - per-room Durable Object.
- Accepts WebSockets via `ctx.acceptWebSocket(server)` (hibernation-ready).
- `setWebSocketAutoResponse("ping","pong")` keeps keepalives cheap without waking the DO.
- Authoritative simulation ported from the legacy Node server, using the TS primitives under `worker/src/shared/`.
- Tick loop driven by `ctx.storage.setAlarm` at 50ms (20Hz), rescheduled at the end of each `alarm()`.
- Tracks previous broadcast state per player; only sends sheep whose position moved >0.1u or whose state changed. Dogs are always sent in full.
- Input validation: `clientPos` ignored if more than 5 units from server position (cheat guard).

**`worker/src/LobbyDO.ts`** - singleton keyed `"global"`. Holds `Map<roomCode, {hostName, playerCount, maxPlayers, gameMode, state}>`. RoomDOs RPC-call `upsert`/`remove` on state changes; `/api/lobbies` reads `list()`.

**`worker/src/protocol.ts`** - TypeScript interfaces for every message shape. Versioned with `v: 1` at the top level.

**`worker/src/shared/`** - TypeScript ports of the sim primitives (`Vector2D`, `FlockingAlgorithms`, `MovementPhysics`, `BoundaryCollision`, `GameStateValidation`), preserving the behavior of the JS `shared/` module used during the droplet era.

## Wire protocol

Transport is MessagePack over WebSocket. All messages are binary (ArrayBuffer) and include `v: 1`. Client -> Server types: `input`, `ready`, `start`, `leave`, `modeLock`, `setDog`. Server -> Client types: `state`, `lobby`, `start`, `complete`, `hostChanged`, `error`.

Full message table, field types, delta-encoding rules, and mode cycling logic: **`worker/docs/protocol.md`**.

## Game modes

| Mode | Description | Players |
|------|-------------|---------|
| Classic | Herd 200 sheep into the pen | 1 |
| Extreme | Harder variant, more sheep | 1 |
| Insane | Hardest solo variant | 1 |
| Chaos | 5000 sheep via ExtremeBoidSystem | 1 |
| Timed | 3-minute clock, highest count wins | 1-4 |
| Sandbox | Custom field, fences, sheep count, win condition | 1 |
| Cooperative | Multiplayer Classic, all share one gate | 2-4 |
| Competitive | Each player owns a gate, race to threshold | 2-4 |

## Playable dogs

| Dog | Breed | Speed | Stamina | Control | Style |
|-----|-------|-------|---------|---------|-------|
| Jep | Border Collie | 3 | 4 | 4 | Well-balanced herder |
| Pip | Australian Shepherd | 5 | 3 | 3 | Fast and agile |
| Sally | Welsh Corgi | 2 | 4 | 5 | Precision control |
| Shiloh | German Shepherd | 3 | 5 | 3 | High endurance |
| George Washington | American Foxhound | 3 | 4 | 3 | Tactical all-rounder |

## Performance

| Metric | Desktop | Mobile |
|--------|---------|--------|
| Target FPS | 60 | 30-60 |
| Sheep draw calls | 1 | 1 |
| Grass instances | 800,000 | 80,000 |
| Memory | ~150MB | ~100MB |

### Optimizations
- **GPU instancing** - one draw call for all sheep regardless of count
- **Chunk culling** - grass rendered only in view frustum
- **Mobile mode** - shadows disabled, reduced pixel ratio, fewer grass blades
- **Lazy mobile controls** - only loaded on touch devices
- **Delta encoding** - only moving sheep transmitted (>0.1u threshold or state change)
- **WebSocket hibernation** - idle DOs suspend; auto-response handles ping without waking

## Deployment

- **Frontend:** `.github/workflows/deploy.yml` builds on every push to `main` and deploys `dist/` to the `sds-frontend` Cloudflare Pages project. `sheepdogsim.com` is bound as a custom domain.
- **Worker:** `cd worker && wrangler deploy` from a local env that has `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` sourced. Routes `sheepdogsim.com/api/*` and `sheepdogsim.com/r/*/ws` bind to the `sds-worker`.
- **D1:** migrations under `worker/migrations/`. Applied via `wrangler d1 execute sds-db --file migrations/0001_init.sql --remote`.
- **Secrets:** `JWT_SECRET` set via `wrangler secret put JWT_SECRET`.
- **itch.io:** `.github/workflows/build-itchio.yml` produces a `sds-itchio-<tag>.zip` from `npm run build:itchio` on tag push or manual dispatch.

## Legacy fallback (temporary)

The previous backend - Geckos.io / WebRTC on a DigitalOcean droplet at `api.sheepdogsim.com`, backed by a local SQLite file - remains online as a rollback target through approximately **2026-05-23**. Its 207 player records were migrated into D1 during the cutover. The legacy Geckos code path was removed from the client default but may still be present behind the `VITE_USE_DO_BACKEND` flag until Track G of the current agent cycle retires it. No active development targets this path.
