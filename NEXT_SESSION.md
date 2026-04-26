# Next Session — Cycle 8 (playtest-sweep) scaffolded

> Updated 2026-04-25. Active plan: [`docs/cycle-8-plan.md`](docs/cycle-8-plan.md) — scaffold needs Goal + Phases filled in by /cycle-start. Last closed: [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md) (camera + sky/water + OC outer-ring + OC multi-stage objective; deployed live). Cold-start agents: read this page top-to-bottom, then [`docs/BACKLOG.md`](docs/BACKLOG.md) for what's deferred. Earlier cycles: [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md), [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md), [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md), [`docs/cycle-3-plan.md`](docs/cycle-3-plan.md).

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
- **Cycle 7 closed and deployed.** Camera lurch fixed under stamina-out and tree contact; sky horizontal-line artifacts traced to a separate `CloudLayer` shader and resolved; OC outer ring reads as continuous grass + mesh trees out to the shore; OC gained a gather→drive→portal multi-stage loop. Detail in [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md) §Shipped status; headline summary in [`docs/BACKLOG.md`](docs/BACKLOG.md).
- 111 / 111 vitest specs pass. Production build clean. Sim-baseline byte-identical (preserved through cycles 5 + 6 + 7).
- **Cycle 8 (`playtest-sweep`) scaffolded** at [`docs/cycle-8-plan.md`](docs/cycle-8-plan.md). Stub Goal + Phases — needs filling in. Run `/cycle-start` after that.

### What this cycle shipped (full detail in [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md) §Shipped status)

**Phase 1 — Camera lurch fixes (Rolling Hills regression):**
- 1a `targetVelocity` uses `smoothMaxSpeed` so sprint-out on diagonals doesn't whip the velocity vector. [js/Sheepdog.js:626](js/Sheepdog.js)
- 1b force-based dog obstacle avoidance (strength 4.0, 30m broad-phase) with hard push-out + reflection retained as fallback. [js/Sheepdog.js:636-667](js/Sheepdog.js)
- 1c camera `speedNorm` exponentially smoothed (0.1s tau) + `posK` cap at 0.3 per frame. [js/CameraController.js:325-356](js/CameraController.js)

**Phase 1.5 — Sky horizontal seam.** Took 4 rounds; the actual culprit was a SECOND cloud system — [`js/atmosphere/CloudLayer.js`](js/atmosphere/CloudLayer.js)'s `horizonFade` smoothstep, not the dome's integrated cloud math. Widened to `(0.02, 0.85)`; also softened the dome's bounce term and SunBillboard halo as defense-in-depth.

**Phase 2 — OC outer-ring + water/sun:**
- 2a `FAR_LOD_DIST` 250 → **400** (250 was distance-from-origin, not distance-from-camera; 400 covers OC's full 380m island).
- 2b per-scene `grass.densityRange` field. RH/Field default 0.6; OC = **0.92** (covers shore at ~387m).
- 2c (woods bias) — skipped per plan.
- 2d water sun-glint: smooth Blinn-spec term added at exponent 8 alongside cel sparkles. `uSunSpecularIntensity` default 0.6.
- 2e billboard sun: new [js/effects/SunBillboard.js](js/effects/SunBillboard.js), quad at `cameraPosition + sunDir × 3000`, additive blending, halo color from atmosphere sun light.

**Phase 3 — OC multi-stage objective (gather → drive → portal):**
- New `ObjectiveDef` schema in [shared/scenes/types.js](shared/scenes/types.js); state on [GameState](js/GameState.js) via `setObjective()`.
- OC: round-up zone at (0, 50) radius 30m, **40 sheep / 2.0 sec hold** (tuned down from 120/3.0 mid-playtest).
- Stage transition fires `objective-stage-changed` event; portal `setIntensity(0..1)` tweens visible "open" over 0.6s; round-up decal hides.
- Round-up decal is a 96-segment terrain-conformed cyan ring (each vertex samples heightfield Y so it follows the ground contour).
- [CorralCompass](js/components/GameHUD/CorralCompass.js) refactored to accept generic target — points at round-up zone first, retargets to portal on transition.

**Mid-cycle playtest-driven additions:**
- **Legacy pasture grass-exclusion zone removed for non-Field scenes.** The hardcoded `(-35..35, 98..138)` rect in [js/TerrainBuilder.js:584-600](js/TerrainBuilder.js) is now gated on `sceneDef?.farmHouse` and `sceneDef?.pasture`. RH and OC no longer have a 70×40m bare grass patch.
- **OC sheep spawn distribution.** Was a single tight cluster; now 5 cluster centers across the southern + central island. New `setSheepSpawn()` on GameState wires scene's `sheepSpawn` def into `createSheepFlock`.
- **Stamina state machine fix.** Original logic gated *both* starting and continuing a sprint on `stamina >= minStaminaToSprint(10)`, so stamina oscillated around 10 and never hit 0 — exhaustion lock was unreachable. Now `canStartSprint` (≥10) and `canContinueSprint` (>0) are separate. Drains all the way to 0 then locks until release. [js/Sheepdog.js:923-953](js/Sheepdog.js).
- **Stamina bar visual lag fix.** `transition: all 0.3s` was animating the bar's **width** as well as colors, lagging the bar 300ms behind the percentage text. Now only background and box-shadow transition.
- **Lightning retirement (RH zap) overhaul.** Sheep ascend was 22m / late-shrink, looked like sideways drift. Now: 60m ascend matching bolt height, smoothstep ease, scale shrinks continuously, position locked to ascend-start coords, new `corral-ascend-top` event fires a particle-only spark at the bolt's tip. [js/OptimizedSheep.js](js/OptimizedSheep.js) + [js/effects/CorralZapEffect.js](js/effects/CorralZapEffect.js).
- **Sheep count from scene def** in classic mode (was hardcoded 200). RH = 250, Field/OC = 200.

### Carry-over to Cycle 8 (playtest-sweep)

These are the Cycle 7 acceptance items that weren't explicitly checked off at close + the still-open Cycle 6 carry-over:

1. **Camera triangulation matrix all-smooth on RH Follow** — stamina-out diagonal (W+D+Shift) + tree contact at sprint, both modes (Classic + Follow). Phase 1a/1b/1c shipped; needs explicit user pass.
2. **OC gather→drive verb feels distinct from RH** — currently tuned to 40 sheep / 2.0s; tune up if trivial, down if still too hard.
3. **Frametime budget on OC** — FAR_LOD_DIST=400 raises mesh tree count; verify ≤ 0.4ms desktop / ≤ 1.5ms mobile per-tick obstacle query and overall frame budget on OC after walking into a dense wood cluster.
4. **Cycle 6 carry-over items 1-6** (originally pending; most are de facto verified during Cycle 7 playtest):
   - Sheep + dog visibly route around tree trunks on RH + OC.
   - OC woods read as recognizably denser canopy.
   - Portal objective is clear and the retirement animation plays cleanly.
   - Per-tick obstacle-query cost ≤ 0.4ms desktop / ≤ 1.5ms mobile.
   - OC boid `perception: 9` — tune up/down if flocks fragment / over-cluster.
   - Sheep spawn safety on OC (now distributed across 5 cluster centers; verify no edge-clamp ugliness).

### Cycle 7 themes — all resolved

The three themes that triggered Cycle 7 (OC similarity to RH, OC inverted grass/tree distribution, Follow camera lurch) are all addressed in [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md). See the original investigation prompts in git history at commit [c7698b9](https://github.com/matthew-kissinger/sds) (`docs: refine cycle-7 camera-lurch theme`) and [cb1175a](https://github.com/matthew-kissinger/sds) (`docs: cycle-7 candidate themes`).

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
| Active cycle (scaffolded) | [`docs/cycle-8-plan.md`](docs/cycle-8-plan.md) — needs Goal + Phases filled in |
| Latest closed cycle | [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md) — see §Shipped status |
| Prior closed cycle | [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), summary in [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Older cycles | [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md) |
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
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why. Cycle 5 + 6 + 7 preserved them bit-identical.
- **Cycle 7:** Don't hardcode grass-exclusion zones for non-Field scenes. The pasture/farmHouse rect was hardcoded for *every* scene before, which left bare patches on RH/OC. Now gated on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- **Cycle 7:** Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*. The state machine separates `canStartSprint` (≥10) from `canContinueSprint` (>0); merging them creates the oscillation-around-threshold bug that hides exhaustion entirely.
- **Cycle 7:** Don't set CSS `transition: all` on stamina/progress bars. Width must be instant; only color/glow should animate. Otherwise the bar lags the percentage text by the transition duration.
- **Cycle 7:** Don't assume the dome's integrated cloud math is the only cloud system. [`CloudLayer.js`](js/atmosphere/CloudLayer.js) is a separate planar mesh with its own shader. Both can produce horizontal-line artifacts at low elevation angles; verify the right one when debugging sky seams.
