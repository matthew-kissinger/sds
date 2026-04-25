# Next Session — Cycle 5 closed, Cycle 6 not yet planned

> Updated 2026-04-25 after Cycle 5 (Island + Woods) closed. Cold-start agents: read this page top-to-bottom, then [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md) for what landed and [`docs/BACKLOG.md`](docs/BACKLOG.md) for what's deferred. Earlier cycles: [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md), [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md), [`docs/cycle-3-plan.md`](docs/cycle-3-plan.md).

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

Open `http://localhost:3000` (or `:3001` if :3000 is taken — Vite auto-increments). `?scene=field`, `?scene=rolling-hills`, `?scene=open-country` to skip the picker.

## Where the project stands (2026-04-25)

- `sheepdogsim.com` is live on Cloudflare Pages + Worker + DO + D1.
- **Cycle 5 closed.** Island boundary primitive shipped, Rolling Hills + Open Country migrated to islands with anime/cel water shader, lightning-zap retirement effect on Rolling Hills corral, boulders dropped from islands. Detail: [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md), summary in [`docs/BACKLOG.md`](docs/BACKLOG.md) § Recently Completed.
- 99 / 99 vitest specs pass (76→99 in this cycle, +25 new specs). Production build clean.

### What changed this cycle (one-line summary, full table in BACKLOG)

Foundation:
- **Discriminated `Boundary`** (`rect | island`) — schema in `shared/scenes/types.js`, dispatch in `shared/BoundaryCollision.js`, accepts legacy `bounds` rect AND new `Boundary` interchangeably so existing call sites don't break.
- **`shared/SceneObstacles.js`** — `kdbush`-backed proxy collider primitive with canonical-sort determinism contract. Consumer wiring deferred (see § What's still TODO).
- **`shared/Random.js`** — `mulberry32` seeded PRNG lifted from the test harness for future shared/-side code that needs cross-V8 determinism. Not yet consumed.
- **Heightmap bake** gains `--boundary island --radius N --falloff M --seaLevel S` flags, mirrors the existing farmhouse smoothstep math.
- **Anime water shader** (`js/water/AnimeWater.js`): single `ShaderMaterial`, depth-pre-pass for shoreline foam, two-band depth color, simplex-noise ripples, cel sparkles, atmosphere fog match. ~150 lines GLSL. `js/water/DepthPrePass.js` owns the shared depth render-target.

Rolling Hills (final after playtest):
- Island radius **180m** / falloff **40m** (original 90m/15m read as cliff + too cramped).
- Corral at (110, 60), radius 8. Tall flag pillar + faint anime ground ring. CorralCompass HUD arrow points off-screen with distance label.
- **Lightning zap effect** + **ascend-into-sky animation** when sheep enter the corral. Sheep float upward (~22m) with ease-out cubic, scale to zero, vanish. Bolt is ~2.4s with crackling re-jitter.
- Farmhouse removed (would have been in the water).
- Trees + rocks confined to land disk; smaller rocks only (no boulders).

Open Country (final after playtest):
- Island radius **380m** / falloff **70m** (~760m diameter, ~2× Rolling Hills).
- Coastal pen at north shore preserved (Q2 decision) — though see § What's still TODO for an open question on whether to switch to a portal.
- `defaultCamera: 'follow'`. Smaller rocks only.

Cross-cutting:
- **Per-scene flocking override** (`scene.flocking`) wired in client + Worker.
- **R10 audited**: client `OptimizedSheepSystem` and Worker `generateInitialSheepPositions` are entirely different code paths — never both run for the same game (Worker authoritative in MP, client solo only). No determinism prerequisite needed for this cycle. Reframed as a Phase-3 design constraint when tree placement lifts into `shared/`.
- **Bug fix**: Poisson-disk seed-point loop only tried once. For islands the zone box is bigger than the safe disc → ~64% of the time the seed landed in water → zero trees. Fixed with up-to-100-attempt retry.

## What's still TODO (carry-over for next cycle)

Items the user raised during Cycle 5 playtest that were intentionally deferred so the cycle could close. Listed in priority order. **Read this section before opening any new work.**

1. **Trees + rocks collision (sim-side).** User playtest: "i do not see the sheep or the sheep dog colliding with the trees or rocks". `shared/SceneObstacles.js` shipped with kdbush queries + `obstacleAvoidance` push-out math. The remaining work:
   - In [`shared/MovementPhysics.js`](shared/MovementPhysics.js), per tick, query nearby tree/rock obstacles around each sheep + dog (~30m radius) via `obstacles.queryTrees(pos, r)`. Push entities out of overlapping circles using `obstacleAvoidance`.
   - Build the `SceneObstacles` set after `TerrainBuilder.createTrees + addEnvironmentDetails` and pass it through to the sim. For solo, that's `gameState.obstacles = obstacles`. For MP, the Worker doesn't have terrain yet → blocked on item #2.
   - Tree trunk radius: trees are scaled 12–22m mesh-scale; trunk visual radius ~1.5–2.5m. Use `radiusXZ: 1.8`. Rock radius depends on rock type/scale; capture during placement.
   - **Acceptance:** sheep + dog visibly route around individual trunks in playtest, no clipping. Per-tick cost ≤ 0.4ms desktop / ≤ 1.5ms mobile.
   - Estimate: **~2 hr**.

2. **Lift Poisson tree placement into `shared/TreePlacement.js` with seeded PRNG.** R7 + R10 from the Cycle 5 plan. Today the placement lives in client-only [`js/TerrainBuilder.createTrees`](js/TerrainBuilder.js) with raw `Math.random`. For MP island scenes, client + Worker must independently compute identical tree positions. Use `mulberry32` from `shared/Random.js` with `scene.terrain.seed`. Add a determinism spec.
   - Required before any MP island scene ships.
   - Estimate: **~1.5 hr**.

3. **Open Country objective rethink — portal vs coastal pen.** User: "what is the objective? there is a small gated pasture and also it appears to be some sort of portal on the side of the island - can we think through that. maybe the goal is to guide sheep to the portal? idk". Options:
   - (a) Keep gate+pasture at the north shore (current), tighten the visual so it reads cleanly.
   - (b) Replace with a corral-style trigger zone + a portal visual (animated swirling vortex + particle effect). Reuse the `CorralZapEffect` pool pattern with a portal-specific visual.
   - (c) Keep gate+pasture but add a magical portal somewhere else as a bonus objective.
   - **Recommendation:** (b) feels consistent with the Rolling Hills magical theme. Build `PortalEffect.js` with a tinted ring shader + vertical column of particles. Sheep ascend through the portal instead of straight up.
   - Estimate: **~2.5 hr** for option (b).

4. **Wood zones with biased tree density.** `woodsZones: WoodsZoneDef[]` schema field exists; `createTrees` ignores it. Once `TreePlacement` lifts (item #2), bias Poisson density inside the zones (denser inside, sparser outside). Open Country plan called for 2-3 woodland clusters; current implementation has trees uniform across the entire safe radius.
   - Estimate: **~1 hr** (after item #2 lands).

5. **Boid retune for island scale.** Cycle 5 Phase 1.5 wired `scene.flocking` override pathway but didn't ship tuned numbers. Open Country at 760m diameter is **3.5× Rolling Hills meadow area**. Without re-tuning, expect cohesion to under-reach (flocks fragment). Playtest-driven tuning.
   - Estimate: **~1.5 hr**.

6. **`defaultCamera` localStorage override semantics.** Today the saved `camera-mode` value always wins, so `scene.defaultCamera` only fires on first visit. User playtest noted Rolling Hills launched in Classic instead of Follow. Options: (a) per-scene last-mode in localStorage, (b) refresh-only override that respects scene default once per session.
   - Estimate: **~30 min**.

7. **Resize behavior** (carried from Cycle 4 Hardening). On hold pending user reproduction.

8. **Octahedral impostors v2** for tree LOD. Defer until 3-quad version demonstrably fails. Currently solid.

9. **GitHub Actions Node.js 20 deprecation.** Bump action versions before June 2nd, 2026.

Any of these is a reasonable Cycle 6 starter. Items #1 + #2 together unlock MP island scenes and the woodland gameplay loop — the highest-value combo.

### Standing risks

- **Y-sample regression surface is wide.** A bad heightfield change makes the dog float, sheep sink, grass clip — all simultaneously. After any change in this area, manually verify all three scenes in all three camera modes.
- **MP joiner renderer sync.** Joiners whose URL-param scene differs from the room's see correct sim but mismatched visuals. Phase B's terrain displacement makes this more visible. Carried over.
- **Sim-baseline fixtures are one-way.** Don't regenerate without understanding the diff. Cycle 5 left them bit-identical — the byte-preserved rect path in `BoundaryCollision` is the contract that lets that hold.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Latest closed cycle | [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md), summary in [`docs/BACKLOG.md`](docs/BACKLOG.md) |
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
- Don't move sim logic out of `shared/`. Trees-as-obstacles work belongs in `shared/SceneObstacles.js` (already there) and `shared/MovementPhysics.js`, so the Worker sim stays in lockstep.
- Don't blow up `main.js` in one PR. Shrink it one responsibility at a time.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why. Cycle 5 preserved them bit-identical via the byte-preserved rect path in `BoundaryCollision`.
