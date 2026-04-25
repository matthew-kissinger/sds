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

### Cycle 7 candidate themes (user playtest 2026-04-25, framed as objectives — next agent does its own analysis)

Three issues surfaced post-Cycle-6-deploy that the next cycle should investigate. Each is described as an **objective + signals**, not a prescribed fix — pick the path after analysis. Don't take the bullets below as architectural decisions; they're starting questions.

#### 1. Open Country plays too similarly to Rolling Hills

**Symptom (user, post-Cycle-6 playtest):** "How is open really different from rolling hills now?" Both are islands with corral retirement; the only real differences are size (380m vs 180m), woods zones, and the portal-vs-flag visual. The intended distinction from cycle-5-plan was **"drive sheep through forest to coastal pen"** — a traversal challenge with discrete dense woods to navigate around — but in play that read isn't landing.

**Objective:** Make Open Country feel like a meaningfully different game loop from Rolling Hills, not a bigger version of the same scene.

**Signals to investigate / questions to consider:**
- Is the issue **shape of the loop** (objective + path), or **density of obstacles** (woods don't actually obstruct), or **flock behavior at scale** (200 sheep on a 4.5×-area island feel as cohesive as 250 on a small one)?
- Should OC have a **multi-stage objective** (gather → drive → portal) rather than a single retirement target?
- Should the woods be **traversal-blocking** (sheep refuse to enter dense canopy without dog pressure) rather than just visually denser?
- Are the woodsZones at (-150, 60), (170, 0), (30, 170) **on the player's path** or off to the side? If the player can route around them, they're scenery.
- Does OC need a **distinct verb** — predator avoidance, time pressure, lost-sheep recovery, scattered sub-flocks at multiple cardinal directions — to differentiate from RH's "collect to corral"?
- Is the **flock density** the issue? RH has 250 sheep on ~100k m², OC has 200 on ~450k m² — sheep-per-m² is ~5× lower, which may be why OC feels empty.

**What to look at:**
- `shared/scenes/open-country.js` (sheepSpawn, woodsZones, corral location) — the design parameters.
- `shared/scenes/rolling-hills.js` for the contrast.
- Cycle 5 plan §"Open Country" and §"Goal" for the original intent.
- Cycle 6 plan §Phase 3 for what woodsZones currently do.

Don't pre-commit to "add woods density" or "shrink the island" — those are hypotheses, not the answer. The right move is to identify **what the game loop should be** before tuning numbers.

#### 2. Open Country grass + tree distribution looks inverted

**Symptom (user, same playtest):** "Open mode seems to have grass in middle and trees in middle and no grass on outside and only impostors where the no grass is." The expectation is grass everywhere on the safe land disc with trees scattered through it; what ships is grass + close-up trees concentrated near origin and a barren outer ring populated only by impostor (billboard) trees.

**Objective:** Diagnose why OC's outer ring reads as bare-terrain-with-billboard-trees instead of grass-with-tree-mesh.

**Signals to investigate / questions to consider:**
- Is **grass culling distance** the cause? The grass system has a `cutoffDistance` config. OC's safe radius is 306m; if the cutoff is e.g. 200m, the outer 100m ring shows as bare ground. Check `js/GrassSystem.js` + the `grass.cutoffDistance` field per scene.
- Is **`woodsZones` clustering** placing all the dense (mesh) trees in the center, leaving outside to be sparse + impostor-only? The Cycle 6 bias is 0.6× inside woods, 1.4× outside — that's a 2.3× density delta. With three woods zones near origin and outer rings at 1.4×, the **mesh tree count** stays similar but their **distribution** is now origin-weighted. Verify by counting trees inside vs outside the woodsZones radii after generation.
- Is the **LOD distance cut** ([`js/TerrainBuilder.js` `FAR_LOD_DIST = 250`](js/TerrainBuilder.js)) putting most outer trees into impostor mode? Anything past 250m is a billboard regardless of zone. With OC at 380m radius, ~30% of the disc is past 250m from origin.
- Is the **terrain heightmap falloff** (70m falloff zone) creating bare terrain near the shore that grass legitimately can't render on?
- Combine these: woodsZones cluster mesh trees at center, FAR_LOD_DIST sends outer trees to impostor, grass cutoff abandons the outer ring → the visual lands exactly as the user describes. The fix could be in any of those three levers, or in their interaction.

**What to look at:**
- `shared/scenes/open-country.js` — `grass.clumpsPerChunk` (no cutoffDistance set); compare to RH/Field defaults
- `js/GrassSystem.js` — actual cutoff logic + chunk culling
- `js/TerrainBuilder.js:FAR_LOD_DIST` and `_buildFarTreeBillboards` — impostor cutoff
- `shared/TreePlacement.js` woods-bias factors (0.6× / 1.4×)
- The `terrain.zones` rect spans ([-380, 380] for nearField but [-1100, 1100] for horizon) — outer zones may legitimately have very few trees because Poisson-disk terminates after exhausting valid points

Could also be a play-camera framing issue — grass renders fine but doesn't read at distance. Test by walking to the shore and looking inward.

#### 3. Tree collision disrupts the Follow camera on Rolling Hills

**Symptom (user, same playtest):** Tree collision is working on island scenes, but in **first-person / Follow mode** the camera lurches when the dog runs through (into) trees. The dog's hard push-out + velocity reflection ([`js/Sheepdog.js:638-680`](js/Sheepdog.js)) is correct sim behavior, but the camera follows position 1:1 — when the dog is shoved 1-2m sideways in a single frame, the camera does too, breaking immersion.

**Objective:** Make the Follow camera read smoothly when the dog encounters trees, without sacrificing the routing behavior that's the whole point of Cycle 6 Phase 2.

**Signals to investigate / questions to consider:**
- Is the right fix **camera-side** (smooth/dampen sudden position deltas, raise the camera's lerp factor when the dog's frame-over-frame Δ exceeds a threshold) or **sim-side** (replace dog hard push-out with a force-based steering like the sheep, so the dog *steers around* trees rather than colliding) or **both**?
- Should the dog use a **pre-collision steering force** (large steering force when a tree is within e.g. 5m of the heading vector) so contact rarely happens, with the hard push-out as a safety net for forced-into-tree cases?
- Is the **dog's collision radius** (`DOG_RADIUS = 1.2` in Sheepdog.js) too generous for the visual mesh, making contact happen earlier than it should?
- Does the **camera need scene-aware logic** — e.g. when in dense woods, raise the camera height or pull it back so trees block less of the view?
- Is the **velocity reflection coefficient** (`× 0.85` after `vDotN`) too high → dog keeps energy after impact and lurches farther than expected?
- Compare Classic camera (top-down, far away): does it have the same problem? If yes, the issue is sim-side. If no, it's camera-side.

**What to look at:**
- `js/Sheepdog.js:639-678` — the obstacle hard push-out + velocity reflection.
- `js/CameraController.js` Follow mode — position-tracking logic, any existing smoothing.
- `js/OptimizedSheep.js:1364-1373` for comparison — sheep use a force, not a hard push, and don't have the camera issue.
- The `SHEEP_OBSTACLE_STRENGTH = 6.0` vs the dog's 1.0 (implicit from the push-out math) — sheep get strong steering pressure; dog gets none until contact. That asymmetry is probably the root cause.

Don't pre-commit to "soften the dog collision" or "smooth the camera" — verify which is the actual lever first. A force-based dog routing model with the camera unchanged would be the most architecturally clean outcome (matches how sheep work, no camera special-casing) but may have its own failure modes (dog momentum carrying it through a tree if the force isn't large enough).

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
