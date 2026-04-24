# Next Session — Cycle 3 Entry Point

> Written 2026-04-24 after Cycle 2 shipped. If you are a cold-start agent, read this page, then [`docs/cycle-3-plan.md`](docs/cycle-3-plan.md), then the track doc for whatever the user asks you to work on.

## Running locally

First time on a fresh clone:

```
npm install
cp worker/.dev.vars.example worker/.dev.vars   # sets JWT_SECRET for local
npm run dev:setup                              # applies D1 migrations to local sqlite
```

Every session after that:

```
npm run dev    # starts Vite (:3000) + wrangler (:8787) together
```

Granular alternatives: `npm run dev:client` (just Vite), `npm run dev:worker` (just wrangler), `npm run dev:lan` (Vite with `--host` + wrangler).

Open `http://localhost:3000` (or `:3001` if :3000 is taken — Vite auto-increments). Invite links built from the lobby now use `location.origin`, so host and join can both be on localhost without collision with production.

## Where the project stands (end of 2026-04-24 session)

- `sheepdogsim.com` is live on Cloudflare Pages + Worker + DO + D1 (see [`docs/cycle-2-report.md`](docs/cycle-2-report.md)).
- Gameplay loop (solo, sandbox, local 2P, online 2-4P, three modes) is stable. Playtested 2026-04-24.
- Droplet still online as rollback safety; scheduled destroy ~2026-05-01 (see [`docs/cycle-2-todo.md`](docs/cycle-2-todo.md)).
- **Cycle 3 Track 1 done.** Legacy cleanup committed (`7bfa30f`, -5336 lines). Polish items committed (`16d8228` dead-DOM, `5337b8a` GameBridge 310→86).
- **Cycle 3 Track 3 done.** Scene-as-data schema shipped end-to-end: `shared/scenes/{types,field,index,rolling-hills}.js`, `createGameState` + Worker `GameSim` + client `TerrainBuilder` + `GrassSystem` all scene-aware. Commits `8d528f1` (Step 1), `40ce61c` (Step 1b renderer), `6189822` (Step 2+3 Rolling Hills + URL picker + `docs/adding-a-biome.md`).
- **Cycle 3 Track 2: stepping stone landed (`a08681b`).** `ScenePicker` strip on the main menu exposes the registry to players via `?scene=<id>` reload. Full scene-first menu restructure, mode-shaped HUD, onboarding, compass locator, and dog PNG thumbnails are deferred to a dedicated UI session.
- **Game identity: mode-shaped.** Classic = zen, Timed/Racing = arcade, Sandbox = playground. Detail: [`docs/cycle-3-ui-ux.md`](docs/cycle-3-ui-ux.md) § Vision.

## What to pick up next

Two directions, independent:

**A. Track 2 follow-through** (UI/UX polish, user-facing). Detail: [`docs/cycle-3-ui-ux.md`](docs/cycle-3-ui-ux.md).
- Scene-first state machine in `App.js`: scene → mode → dog → play, instead of today's mode-first.
- Mode-shaped HUD: `hudProfile` derived in `useGameState` gates Classic/Timed/Racing HUD variants.
- First-run onboarding overlay (3-step), compass locator, real dog PNG thumbnails.
- Pass `sceneId` through room creation so MP rooms respect the picker (today the Worker defaults to `field`).

**B. Renderer biome variance** (Track 3 follow-through). Once Rolling Hills needs to actually *look* different, parameterize `TerrainBuilder` further: `terrain.heightScale` drives mesh displacement, `grass.colors` drive the grass shader, `props[]` drive mountain/tree/rock placement. Everything else (`field.js` / `rolling-hills.js` data, registry, sim wire-up) is already done.

**C. Track 1 polish (optional, non-blocking).** JSX flip (mechanical codemod), boid consolidation (needs architectural decision). See [`docs/cycle-3-cleanup.md`](docs/cycle-3-cleanup.md) § Remaining.

## What Cycle 3 shipped

Cycle 2 got the *platform* right. Cycle 3 made biomes a data change, not a code fork. New biomes now ship as one file in `shared/scenes/` + one registry entry; the sim, renderer, and URL-scene switcher all pick them up. See [`docs/adding-a-biome.md`](docs/adding-a-biome.md).

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| What shipped this cycle | [`docs/cycle-2-report.md`](docs/cycle-2-report.md) |
| What's still on the Cycle 2 punch list | [`docs/cycle-2-todo.md`](docs/cycle-2-todo.md) |
| Architecture (as of 2026-04-24) | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Prior postmortem | [`docs/archive/POSTMORTEM.md`](docs/archive/POSTMORTEM.md) |
| Pre-Cycle-2 planning (mostly historical) | [`docs/archive/`](docs/archive/) |

## What NOT to do

- Don't rearchitect multiplayer. It works. The Worker + DO + D1 + `shared/` shape is settled.
- Don't introduce a new ECS library, game engine, physics engine, or UI framework this cycle. Keep the bet small: cleanup + shell + scene definitions.
- Don't write speculative abstractions for features that aren't in the roadmap (no predator-AI hooks "for later", no weather hooks "for later" — build them when the content track arrives).
- Don't blow up `main.js` in one PR. Shrink it one responsibility at a time.
- Don't commit files you can't test. The cleanup track includes real file deletions; each deletion must be verified against `grep` and a clean `npm run build`.
