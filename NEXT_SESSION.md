# Next Session — Cycle 4 Phase B Entry Point

> Written 2026-04-24 after Cycle 4 Phase A shipped. If you are a cold-start agent, read this page, then [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md), then [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md). Earlier-cycle context lives in [`docs/cycle-3-plan.md`](docs/cycle-3-plan.md) and [`docs/cycle-2-report.md`](docs/cycle-2-report.md) — read those if the Cycle 4 docs reference behavior you don't recognize.

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
- **Cycle 3 done.** Track 1 cleanup, Track 3 scenes-as-data, Track 2 stepping-stones (ScenePicker + MP sceneId end-to-end). Detail: [`DECISIONS.md`](DECISIONS.md) § Cycle 3.
- **Cycle 4 Phase A done** (assume merge happens before this lands). 11 parallel units shipped: Three.js bumped 0.181 → 0.184, baked heightmaps + asset pipeline, scene schema widened, `shared/terrain/Heightfield.js`, `js/atmosphere/Atmosphere.js` (Hosek-Wilkie sky port from Terror in the Jungle), `js/ProceduralMountains.js`, `js/CameraController.js` (Classic/Follow/Free), open-country biome, GrassSystem polish, TerrainBuilder dead-code delete, scene aesthetic retunes. Standalone modules ship unwired — Phase B is the integration. Detail: [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md).

## What to pick up next

**Cycle 4 Phase B — heightfield + atmosphere integration.** Single sequential PR by the user, NOT another parallel batch. Full plan: [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md).

The eight-step sequence:
1. TerrainBuilder vertex displacement from `Heightfield`.
2. GrassSystem y-sample so blades sit on terrain.
3. OptimizedSheep + Sheepdog y-clamp.
4. Atmosphere wiring in `main.js` (SceneManager loses its hardcoded `scene.background` + `scene.fog`).
5. ProceduralMountains wiring into TerrainBuilder.
6. Slope-modulated sheep speed in `shared/MovementPhysics.js`.
7. Prop placement on terrain (one heightfield query per prop at scene-load).
8. Camera y-clamp in Follow / Free.

### Key risks for Phase B

- **Y-sample regression surface is wide.** A bad Heightfield sample makes the dog float, sheep sink, and grass clip — all simultaneously. Verify each step with the e2e recipe (`npm test && npm run build && npm run dev:client`, cycle through `?scene=field`, `?scene=rolling-hills`, `?scene=open-country`) before moving to the next.
- **Atmosphere wiring touches `SceneManager` which Unit M just refactored.** Re-read SceneManager carefully before deleting the hardcoded `scene.background` / `scene.fog` — Unit M's camera extraction may have moved or renamed surrounding code. Don't merge step 4 on muscle memory.
- **Regenerate `tests/sim-baseline/` fixtures only after manual verification.** Step 6 (slope-modulated sheep speed) will break the existing baselines. Manually verify the new sheep behavior is intentional first, then `UPDATE_FIXTURES=true npm test`. Diff the new fixture vs. the old to confirm slopes add deterministic offsets, not chaotic noise. The fixture flip is one-way; don't commit it under merge pressure.

### Deferred (still on the list, not blocking Phase B)

- **Cycle 3 Track 2 follow-through** (UI/UX polish): scene-first state machine in `App.js`, mode-shaped HUD profile, onboarding overlay, compass locator, real dog PNG thumbnails, MP-joiner renderer reactivity. Detail: [`docs/cycle-3-ui-ux.md`](docs/cycle-3-ui-ux.md).
- **MP joiner renderer sync.** Joiners whose URL-param scene differs from the room's still see mismatched visuals. Phase B's heightfield displacement makes this more visible, not less — fix it during Phase B or document the user-facing implication.
- **Cycle 3 Track 1 polish:** JSX flip (mechanical codemod), boid consolidation (needs architectural decision). See [`docs/cycle-3-cleanup.md`](docs/cycle-3-cleanup.md) § Remaining.

## What Cycle 4 Phase A shipped

Cycle 3 made biomes a data change. Cycle 4 Phase A built the foundation that lets biomes actually look different — heightfield terrain (baked, bilinear-sampled), an analytic Hosek-Wilkie sky with five named presets, a three-mode user camera (Classic preserved as default), and a refreshed pastoral grass + fog palette across all scenes. The standalone modules are unwired by design; Phase B is one sequential PR that connects them to the render path. See [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md) and [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md).

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Cycle 4 Phase A plan + units | [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md) |
| Cycle 4 Phase B integration plan | [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md) |
| Architecture (as of 2026-04-24) | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| What Cycle 2 shipped | [`docs/cycle-2-report.md`](docs/cycle-2-report.md) |
| Cycle 2 punch list | [`docs/cycle-2-todo.md`](docs/cycle-2-todo.md) |
| Cycle 3 plan + tracks | [`docs/cycle-3-plan.md`](docs/cycle-3-plan.md) |
| How to add a biome | [`docs/adding-a-biome.md`](docs/adding-a-biome.md) |
| Prior postmortem | [`docs/archive/POSTMORTEM.md`](docs/archive/POSTMORTEM.md) |
| Pre-Cycle-2 planning (mostly historical) | [`docs/archive/`](docs/archive/) |

## What NOT to do

- Don't rearchitect multiplayer. It works. The Worker + DO + D1 + `shared/` shape is settled.
- Don't introduce a new ECS library, game engine, physics engine, or UI framework this cycle. Keep the bet small: cleanup + shell + scene definitions.
- Don't write speculative abstractions for features that aren't in the roadmap (no predator-AI hooks "for later", no weather hooks "for later" — build them when the content track arrives).
- Don't blow up `main.js` in one PR. Shrink it one responsibility at a time.
- Don't commit files you can't test. The cleanup track includes real file deletions; each deletion must be verified against `grep` and a clean `npm run build`.
