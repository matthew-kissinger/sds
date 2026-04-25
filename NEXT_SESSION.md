# Next Session — Cycle 6 closed (awaiting playtest review)

> Updated 2026-04-25. Last closed: [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md). Cold-start agents: read this page top-to-bottom, then [`docs/BACKLOG.md`](docs/BACKLOG.md) for what's deferred. Earlier cycles: [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md), [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md), [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md), [`docs/cycle-3-plan.md`](docs/cycle-3-plan.md).

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

Open `http://localhost:3000` (or `:3001` if :3000 is taken). `?scene=field`, `?scene=rolling-hills`, `?scene=open-country` to skip the picker.

## Where the project stands (2026-04-25)

- `sheepdogsim.com` is live on Cloudflare Pages + Worker + DO + D1.
- **Cycle 6 closed.** Trees + large rocks are real obstacles (sheep + dog route around them). Open Country gained a magical portal at the north shore replacing the coastal pen. Wood zones have biased density. Per-scene camera memory + first-pass OC boid nudge shipped. Full detail: [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), summary in [`docs/BACKLOG.md`](docs/BACKLOG.md) § Recently Completed.
- 99 → **111 / 111** vitest specs pass (+12 from `tree-placement.spec.js`). Production build clean. Sim-baseline byte-identical.

### What changed this cycle (one-line summary, full table in BACKLOG)

- **`shared/TreePlacement.js`** — pure `generateTrees(scene, rng) → TreeInstance[]`, mulberry32-driven, canonically sorted. Client iterates the result to spawn meshes; Worker can do the same when MP island scenes get wired (deferred).
- **Trees + rocks-as-obstacles, solo.** `gameState.obstacles` built from `terrainBuilder.treeInstances + rockPositions` in `main.js`. Sheep apply `obstacleAvoidance` per-tick (30m, strength 6.0). Dog applies a hard push-out + velocity reflection in `Sheepdog.move`. Field's bounds keep its sheep/dog ≥120m from any tree → queries return empty → behavior preserved.
- **Q3 fallback path** — rocks with per-cluster `scale ≥ 0.8` become colliders with radius `finalScale * 0.55`. Pixel-forge bespoke rocks deferred.
- **Wood zones biased density** — inside any `WoodsZoneDef` circle: 0.6× min-distance (denser); outside (when zones present): 1.4× (sparser). Open Country has 3 clusters away from spawn + portal.
- **Open Country portal** — corral at (0, 295). New `PortalEffect.js`: rotating cyan→purple ring shader + vertical particle column + soft ground glow. `CorralDef.effect: 'zap' | 'portal'` discriminator. Sheep retire vertically (existing `isAscending` path). `CorralCompass` HUD already generic over `gameState.corral`.
- **Per-scene camera memory** — `camera-mode-${sceneId}` overrides scene default, falls back to legacy global. C-hotkey writes per-scene on every change.
- **OC boid nudge** — `flocking: { perception: 9, perceptionRadius: 9 }`. Conservative starting point (was 5 / 6); tune in playtest.
- **Defensive null-gate guard** in worker `shouldSeekGate` — corral scenes now skip the gate-seek pathway instead of NPEing.

### Carry-over to next cycle (playtest verification + tuning)

These are the Cycle 6 acceptance items that need user playtest review:

1. **Sheep + dog visibly route around tree trunks** on Rolling Hills + Open Country (no clipping, no fluttering at trunk edges). If fluttering, lower `SHEEP_OBSTACLE_STRENGTH` in [`js/OptimizedSheep.js`](js/OptimizedSheep.js) (currently 6.0). If clipping, raise it.
2. **Open Country woods read as recognizably denser canopy** — three clusters at (-150, 60), (170, 0), (30, 170) with radius 65–80. Adjust positions/radii in [`shared/scenes/open-country.js`](shared/scenes/open-country.js) `woodsZones` if they sit awkwardly relative to the play paths.
3. **Portal objective is clear and the retirement animation plays cleanly.** Portal at (0, 295). If the visual reads weak from the play camera, raise `RING_RADIUS_OUTER` or particle counts in [`js/effects/PortalEffect.js`](js/effects/PortalEffect.js).
4. **Per-tick obstacle-query cost ≤ 0.4ms desktop / ≤ 1.5ms mobile.** Verify with `PerformanceMonitor` (P key) on Open Country after walking into a dense wood cluster. If over budget, drop the query radius from 30m or precompute per-cell candidate lists.
5. **OC boid `perception: 9`** — tune up if flocks still fragment, down if they over-cluster. Edit `shared/scenes/open-country.js` `flocking` block.
6. **Sheep spawn safety on OC.** Spawn at (0, -150) with `spreadRadius: 160` can put a sheep at z=-310, just past the 306m safe radius. Cycle 5 carry-over — sheep get clamped back by the island boundary, but it's ugly. Tighten spread to 130 or shift spawn center to (0, -130) if visible.

### Standing risks (carried)

- **Y-sample regression surface is wide.** A bad heightfield change makes the dog float, sheep sink, grass clip — all simultaneously. After any change in this area, manually verify all three scenes in all three camera modes.
- **MP joiner renderer sync.** Joiners whose URL-param scene differs from the room's see correct sim but mismatched visuals. Carried over.
- **Sim-baseline fixtures are one-way.** Don't regenerate without understanding the diff. Cycle 5 + 6 left them bit-identical — the byte-preserved rect path in `BoundaryCollision` and the `obstacles.trees.length > 0` guard in OptimizedSheep are the contracts that let this hold.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Latest closed cycle | [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), summary in [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Prior cycle | [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md) |
| Cycle stub template | [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) |
| Frozen files / fence rules | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred items | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Cycle 4 Hardening | [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md) |
| Cycle 4 Phase A plan | [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md) |
| Cycle 4 Phase B integration | [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| What Cycle 2 shipped | [`docs/cycle-2-report.md`](docs/cycle-2-report.md) |
| How to add a biome | [`docs/adding-a-biome.md`](docs/adding-a-biome.md) |
| Prior postmortem | [`docs/archive/POSTMORTEM.md`](docs/archive/POSTMORTEM.md) |

## What NOT to do

- Don't rearchitect multiplayer. It works.
- Don't reintroduce procedural mountains. If we want a horizon ring later, the right path is a height-displaced skirt that blends into the play-area heightfield, not the annulus shader.
- Don't add new scenes. Three is the right number.
- Don't touch `shared/MovementPhysics.js`'s `updateMovement` to insert obstacle logic — Cycle 6 deliberately put obstacle force composition at the **call site** (`OptimizedSheep`, `Sheepdog`, future Worker `GameSim`) so MovementPhysics stays a pure-functions library.
- Don't blow up `main.js` in one PR. Shrink it one responsibility at a time.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why. Cycle 5 + 6 preserved them bit-identical.
