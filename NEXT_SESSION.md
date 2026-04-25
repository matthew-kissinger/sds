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

#### 3. Follow camera lurches on Rolling Hills — initially attributed to tree collision, may have a separate stamina trigger

**Symptom (user, same playtest):** Camera lurches on Rolling Hills in Follow mode when the dog runs into trees. **Follow-up observation from the user:** "It seems to be possibly partially related to an issue with dog stamina ending and user holding it down — specifically turning up-and-right or up-and-left too while holding stamina while it is out." That suggests at least part of the lurch is a **sprint→walk transition bug** that fires under diagonal input + held-sprint-after-empty, and may be entirely separable from tree collision (or compounded by it).

**Objective:** Make the Follow camera read smoothly under both (a) tree contact and (b) stamina-exhaustion-while-holding-sprint, without sacrificing Cycle 6's tree routing or the existing sprint-cap easing in [`js/Sheepdog.js:604-609`](js/Sheepdog.js).

**Repro to attempt first (cheap and high-signal):**
1. Open Rolling Hills, switch to Follow camera.
2. Hold sprint + diagonal up-right (W + D + Shift) on flat open ground, far from any tree.
3. Drain stamina to zero with sprint still held; keep holding the diagonal input.
4. Watch the camera. If it lurches with no tree nearby, **the camera bug is at least partially independent of tree collision** and the stamina/sprint transition is its own root cause.
5. Repeat with cardinal input (W only, no D). If the cardinal case is smooth and only diagonal lurches, the bug is in how diagonal target-velocity recomputes when `currentMaxSpeed` drops.

If step 4 lurches: **address the stamina case first** before the tree-collision case — they're likely two bugs, not one. The tree collision case may even resolve once the underlying camera-following math handles fast velocity-vector changes.

**Signals to investigate / questions to consider:**

*Stamina-transition path (likely the simpler of the two):*
- The existing easing in `Sheepdog.move` smooths `smoothMaxSpeed` on the way down to **avoid** the camera lerp surge that the easing comment explicitly calls out. Why is it not catching this case? Possibilities:
  - The easing applies to `smoothMaxSpeed` (the safety clamp) but **not** to `targetVelocity` — `targetVelocity = direction.normalize().multiply(currentMaxSpeed)` uses the raw `currentMaxSpeed`, not the smoothed cap. Diagonal input means `direction` is normalized differently than cardinal, so the velocity-diff vector swings sharply when `currentMaxSpeed` halves.
  - Stamina-runs-out happens mid-frame; `accelerationRate * deltaTime` is large; one-frame velocity correction gets multiplied by deltaTime once but the camera tracks the resulting position the next frame.
  - Sprint key held after stamina=0 might re-arm `targetVelocity` at sprint-magnitude every frame and only the smooth cap is gating it — meaning the *velocity* never settles, just gets clamped down externally.
- Is the lurch a **camera lerp surge** (`speedNorm` halves → look-ahead distance pops, position lerp factor changes), a **velocity-direction whip** (velocity vector changes magnitude on a diagonal more than cardinal), or both?

*Tree-collision path (the original bug, may be compounded):*
- Sim-side vs camera-side: dog hard push-out + velocity reflection ([`js/Sheepdog.js:638-680`](js/Sheepdog.js)) is correct sim, but Follow camera tracks position 1:1.
- Should the dog use **pre-collision steering force** like the sheep (force-based, never makes contact) instead of hard push-out + reflection? Sheep have `SHEEP_OBSTACLE_STRENGTH = 6.0` starting at 30m; dog gets nothing until contact. That asymmetry is probably the root cause of the contact-lurch — but verify, don't assume.
- Is `DOG_RADIUS = 1.2` larger than the visual mesh suggests, making contact happen earlier than expected?
- Velocity reflection coefficient `× 0.85` after `vDotN` — keeps 85% of energy after impact, so the dog doesn't just stop, it bounces.

**Triangulation matrix to consider before fixing:**

| Scenario | Tree nearby? | Stamina draining mid-input? | Camera mode | Lurch? |
|---|---|---|---|---|
| Open ground, no sprint, into tree | yes | no | Follow | ? |
| Open ground, no sprint, into tree | yes | no | Classic | ? |
| Diagonal sprint, drain stamina, no tree | no | yes | Follow | yes (per user) |
| Diagonal sprint, drain stamina, no tree | no | yes | Classic | ? |
| Cardinal sprint, drain stamina, no tree | no | yes | Follow | ? |

The matrix decomposes the bug. If the lurch only shows in Follow + diagonal-stamina, it's a camera-tracking issue specifically tied to how Follow handles abrupt velocity-direction swings on a diagonal. If it shows in both camera modes, the sim is producing physically jagged motion and the camera is faithful.

**What to look at:**
- `js/Sheepdog.js:585-688` — `move()` end-to-end, including the `smoothMaxSpeed` easing and the obstacle push-out
- `js/Sheepdog.js` — stamina logic (`updateStamina`)
- `js/CameraController.js` Follow mode — `speedNorm`, position lerp factor, look-ahead distance computation, any existing smoothing windows
- `js/OptimizedSheep.js:1364-1373` for comparison — force-based routing the dog could adopt

Don't pre-commit to a fix shape. The two scenarios may resolve through one change (smoother camera position tracking that doesn't follow single-frame jumps) or through two (camera smoothing + force-based dog routing), and only the repro-matrix above will tell.

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
