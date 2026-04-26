# Cycle 8 — mode-matrix (modes × sheep counts × scenes × leaderboards)

> Drafted 2026-04-26 after Cycle 7 (camera + sky/water + OC outer-ring + multi-stage objective) closed and deployed live. This cycle was originally scaffolded as `playtest-sweep`; rescoped on 2026-04-26 to also cover the leaderboard / modes / sandbox / multiplayer scope-expansion work surfaced post-deploy. The Cycle-7-carry-over playtest sweep is preserved here as Phase 1. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Shipped status (2026-04-26 — pending live playtest)

Phases 2-5 implemented in code. Phase 1 (playtest sweep) deferred to user-led pass. 111/111 vitest specs pass; production build clean; worker typecheck clean; migration `0002_mode_matrix.sql` applied locally and verified.

**Phase 2a — Insane/Chaos sheep-count bug.** Root cause: [`OptimizedSheep.initializeSheepData`](../js/OptimizedSheep.js) ignored `clusterCenters` from scene defs and used a fixed `spreadRadius` (25-60m) regardless of count. At 3000-5000 sheep that's 1-2 m²/sheep — sheep stack visually and the boid spatial hash thrashes. Fix: cluster-aware spawn (8 OC clusters now actually used), density-driven radius scaling capped at scene-derived `maxRadius`. Field 200 sheep behaviour preserved (sim-baseline byte-identical). Added `chaos` to `useExtremeBoids` toggle alongside extreme/insane.

**Phase 2b — Leaderboard pollution fix.** [`GameState.js:submitScoreToLeaderboard`](../js/GameState.js)'s prior `extreme ? 'soloExtreme' : 'soloClassic'` ternary silently dumped Insane (3000) and Chaos (5000) runs onto the soloClassic board. Replaced with `SOLO_MODE_TO_LEADERBOARD` lookup. Worker [`d1.ts`](../worker/src/d1.ts) `GameMode` union extended with `soloInsane` + `soloChaos`. Frontend [`GlobalLeaderboard`](../js/components/Multiplayer/GlobalLeaderboard.js) gains the two new tabs.

**Phase 3 — Leaderboard matrix.** Migration [`worker/migrations/0002_mode_matrix.sql`](../worker/migrations/0002_mode_matrix.sql) adds `sheep_count INT` + `scene_id TEXT` to `score_submissions`, plus `solo_insane_best` + `solo_chaos_best` to `players`, and a partition index `(game_mode, scene_id, sheep_count, score)`. Backfill: existing `soloExtreme` rows get `sheep_count=1000`; everything else defaults to `(field, 200)`. `getLeaderboard` / `getAllLeaderboards` accept optional `{sceneId, sheepCount}` filters: fast path uses materialized `players.*_best` columns for unfiltered queries; partitioned path queries `score_submissions` with GROUP BY for filtered queries. Frontend leaderboard UI gains scene + sheep-count dropdowns. Submission path wires `sceneId` (from `gameState.sceneId` set at scene init) + `sheepCount` into `additionalData` and the worker lifts both into columns.

**Phase 4 — Sandbox on RH/OC.** [`SandboxConfig`](../js/SandboxConfig.js) gains `sceneId: 'field' | 'rolling-hills' | 'open-country'` (default `'field'`); flows through `serialize`/`deserialize`/`toJSON`. [`SandboxSetup`](../js/components/StartScreen/SandboxSetup.js) gains a 3-tile Scene picker on the Field tab; when a non-Field scene is picked, the Field Size, Field Shape, and Fence Layout sections hide and a notice explains the scene's heightfield is the boundary. [`App.js:handleStartSandbox`](../js/components/App.js) detects scene mismatch with the currently-loaded scene and reloads to `?scene=X#s/<encoded>` so the player lands back in sandbox setup on the right scene. [`GameState.startSandboxGame`](../js/GameState.js) and [`main.js:startSandboxGame`](../js/main.js) take an early-return path on island scenes that skips bounds/fence/structure rebuild — the scene owns its terrain and corral. Custom fences on island heightfields are intentionally deferred (Q3).

**Phase 5 — MP scope expansion.** [`RoomMeta`](../worker/src/RoomDO.ts) gains `sheepCount`, validated against allow-list `{200, 250, 500, 1000}` (Q4 cap held at 1000 pending bandwidth measurement). [`GameSimulation`](../worker/src/GameSim.js) reads `room.sheepCount` and overrides scene default. [`LobbyEntry`](../worker/src/LobbyDO.ts) gains optional `sceneId` + `sheepCount` so lobby browsers can show what's on offer. [`RoomCreation`](../js/components/Multiplayer/RoomCreation.js) gains a sheep-count selector. [`NetworkManager.createRoom`](../js/NetworkManager.js) forwards `sheepCount` through `roomSettings`. Worker `submitScore` (called by RoomDO at game end) now passes scene + sheep count into the audit trail.

**Phase 6 — Follow camera triangulation polish.** Added late after re-analysing the Cycle 7 carry-over playtest matrix on Rolling Hills. Four targeted fixes in [`CameraController.js`](../js/CameraController.js):

- **Ridge sample STEPS 6 → 12 + interior-only.** `_sampleMaxTerrainAlong` was sampling at ~3.7m intervals and including both endpoints. Step density bumped to ~1.8m so a sharp ridge can't slip between samples. Endpoints removed: the camera-side endpoint is already covered by the `camGroundY` clamp, and including the dog-side endpoint was lifting the camera unnecessarily when the dog crested a hill (the dog isn't an obstacle to its own visibility).
- **Asymmetric `smoothedFloorY` smoothing.** Snap UP when the floor rises (dog ascending a ridge) so we never clip terrain; ease DOWN when it falls (cresting a peak) with the existing `FOLLOW_POS_LAG_TAU`. Symmetric smoothing in the first Cycle 8 pass let the camera briefly clip on fast ascents.
- **`_lastValidFacing` tracking.** `_facingAngle` was returning `this.followYaw` when velocity dipped below 0.1 m/s — a feedback loop with no anchor. Now tracks the last valid dog-intent angle so the camera holds where the dog was *facing* through pauses or tree-collision wobbles, instead of compounding its own smoothed output.

**What still needs playtest:**
- Insane/Chaos repro on each of (Field/RH/OC). Confirm 3000 sheep on OC actually fills the 8-cluster ring and the game doesn't lock up.
- Sandbox-on-RH and Sandbox-on-OC end-to-end, including the cross-scene reload UX (does it feel jarring?).
- Leaderboard scene + sheep-count filters: do partition queries return the right rows?
- MP at non-200 sheep counts: 30Hz broadcast budget at 500 / 1000 sheep on a real connection (Q4 measurement).
- Phase 1 (Cycle 7 carry-over playtest sweep) — the camera triangulation matrix + the OC objective tuning.

## Goal

Open up the combinatorial space of how players actually play SDS. Today the game is a matrix of (mode × sheep count × scene) but only ~7 cells are real: Classic on any of 3 scenes (sheep count taken from scene def), Extreme/Insane/Chaos on any scene (count locked to 1000/3000/5000), and three multiplayer modes (Coop/Competitive/Timed) at exactly 200 sheep. Sandbox is locked to Field. Leaderboards collapse all of this into 5 mode tabs and (because of a bug at [`js/GameState.js:1121`](../js/GameState.js)) Insane and Chaos runs are silently submitted as `soloClassic`, polluting that board.

By cycle close: every solo mode runs at any selectable sheep count on any scene; the leaderboard partitions runs by `(mode, sheepCount, scene)` so a 3000-sheep Open Country run is comparable to other 3000-sheep Open Country runs and not to 200-sheep Field; sandbox can launch on Rolling Hills or Open Country; multiplayer rooms can pick mode + scene + sheep count instead of always 200 sheep on coop/comp/timed. Plus all the Cycle-7 carry-over playtest items get a live pass.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code (D1 migration patterns, especially).
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique. Sheep counts at 3000+ on island scenes are still a perf risk — use `PerformanceMonitor`.
- **Pick the simplest thing that meets the budget.** This cycle is about scope, not cleverness.

## Open questions to resolve before writing code

(Prefix with **Q1**, **Q2**, ... so phases can refer to them.)

1. **Q1: Insane/Chaos repro — what actually fails?** User reports "doesn't work for anything other than 200 sheep — when I click anything else it doesn't work." The wiring at [`js/GameState.js:773-790`](../js/GameState.js) and [`js/main.js:831-837`](../js/main.js) looks intact. Phase 2 must capture a console-log repro on each of (Field, RH, OC) for each of (extreme, insane, chaos). Hypotheses to disprove: (a) `recreateSheepFlock` fails silently on island scenes, (b) island-radius spawn can't seat 3000+ sheep, (c) `useExtremeBoids` toggle path leaves the system half-initialised on subsequent starts, (d) the "200" the user is seeing is just visible-in-frustum sheep, not total.
2. **Q2: Leaderboard partition key — composite vs separate columns?** Options: (a) keep the materialized-best columns and just add 5 new variants per existing mode (e.g., `solo_classic_200_best`, `solo_classic_1000_best`, ...) — explodes column count to 25+, but no schema change required at score-submission time; (b) deprecate the materialized-best columns entirely and compute leaderboards on-demand from `score_submissions` with `(persistent_id, mode, scene_id, sheep_count)` group-by — slower per query but infinitely flexible. Pick before writing the migration. Recommendation: lean (b) since materialised bests are just a micro-optimization, and we're already at low thousands of submissions.
3. **Q3: Sandbox on RH/OC — how do custom fences interact with island heightfield?** Field shapes are 2D rect/circle/etc. Island scenes have a 3D heightfield + falloff disk. Does the existing fence-collision system work on a heightfield, or do we need to project fence segments onto the terrain? This is the only Phase 4 unknown — figure it out before deciding scope. Easy mode: ship "scene = RH" with no custom fences (read-only base) and bring fence-on-heightfield work in a later cycle.
4. **Q4: MP sheep count ceiling.** Worker `GameSim` is currently sized for 200. Does it scale to 1000/3000/5000 over WebSocket+MessagePack at 30Hz? Probably not — Cycle 4 saw bandwidth pressure even at 200. Phase 5 must measure before committing. May need to cap MP at 500 or implement delta compression.
5. **Q5: Submission backwards compatibility.** The schema migration in Phase 3 must keep currently-on-the-leaderboard scores playable / displayable. What's the migration strategy: backfill `sheep_count = 200`, `scene_id = 'field'` for all pre-cycle-8 rows? That's the right default for `soloClassic`/`timed`/`cooperative` (they were always 200 sheep); but `soloExtreme` rows should backfill `sheep_count = 1000`. Lock down before writing migration SQL.

These don't block scaffolding. Phase 1 can proceed concurrently with research on Q1–Q5.

## Architecture / shared changes

### Schema migration (`worker/migrations/0002_mode_matrix.sql`)

The migration extends `score_submissions` with two new columns and lets the leaderboard read them as the partition key:

```sql
ALTER TABLE score_submissions ADD COLUMN sheep_count INTEGER NOT NULL DEFAULT 200;
ALTER TABLE score_submissions ADD COLUMN scene_id TEXT NOT NULL DEFAULT 'field';

-- Backfill rule (Q5): pre-existing soloExtreme rows used 1000 sheep
UPDATE score_submissions
SET sheep_count = 1000
WHERE game_mode = 'soloExtreme' AND submitted_at < <cycle-8-deploy-timestamp>;

CREATE INDEX IF NOT EXISTS idx_submissions_partition
  ON score_submissions(game_mode, scene_id, sheep_count, score);
```

Resolution of Q2 determines whether `players.solo_*_best` columns are also extended or deprecated. Recommendation: deprecate (compute on-demand via the index above).

### `GameMode` enum extension

[`worker/src/d1.ts:19`](../worker/src/d1.ts) currently:
```ts
export type GameMode = 'soloClassic' | 'soloExtreme' | 'timed' | 'competitive' | 'cooperative';
```

Becomes:
```ts
export type GameMode = 'soloClassic' | 'soloExtreme' | 'soloInsane' | 'soloChaos' | 'timed' | 'competitive' | 'cooperative';
```

Old `soloExtreme` is preserved (1000-sheep tradition); new `soloInsane` (3000) and `soloChaos` (5000) get their own keys instead of polluting `soloClassic`. This fixes the Phase 2 leaderboard-pollution bug at the wire format level.

[`js/GameState.js:1121`](../js/GameState.js) gets a real lookup table replacing the ternary:
```js
const MODE_TO_LEADERBOARD = {
  classic: 'soloClassic',
  extreme: 'soloExtreme',
  insane:  'soloInsane',
  chaos:   'soloChaos',
};
```

### Score submission payload

`additionalData` already carries `totalSheep` (see [`js/GameState.js:1142`](../js/GameState.js)). Add `sceneId` to the payload at submission time and lift both into top-level columns server-side. Frontend leaderboard view consumes the indexed query rather than `getAllLeaderboards()`.

### Sandbox scene wiring

`SandboxConfig` schema (in `js/SandboxConfig.js`) gets a `sceneId: 'field' | 'rolling-hills' | 'open-country'` field defaulting to `'field'`. [`js/components/StartScreen/SandboxSetup.js`](../js/components/StartScreen/SandboxSetup.js) gains a "Scene" tab. When `sceneId !== 'field'`, the field-size / field-shape pickers are disabled (the scene's heightfield is the boundary); fence-layout pickers may also be disabled pending Q3.

## Phase 1 — Live-deploy playtest sweep + Cycle 7 carry-over (~1hr)

**Independently testable.** Validates Cycle 7 in users' hands. Same content as the previous draft; preserved verbatim.

1. Run the camera triangulation matrix from the prior NEXT_SESSION on Rolling Hills. Stamina-out + tree contact in Follow.
2. Drive the OC gather→drive loop end-to-end. 40 sheep / 2.0s; portal opens; retirement works.
3. Walk OC outer ring and verify grass + mesh trees extend to the shore.
4. Pitch up at the sky in Follow on all three scenes; confirm no horizontal seam.
5. Open `PerformanceMonitor` (P key) on OC; verify per-tick obstacle-query ≤ 0.4ms desktop.
6. Walk Cycle 6 carry-over items 1-6 (de facto verified during Cycle 7 playtest but explicit pass needed).

**Acceptance:** all checks pass or any failures captured as carry-over to Phase 2 / Phase 3.

## Phase 2 — Insane/Chaos sheep-count repro + leaderboard pollution fix (~3hr)

**Depends on:** Phase 1 (in case the bug is camera/HUD-shaped, not flock-shaped).

1. **Repro matrix.** For each `(scene ∈ {field, rolling-hills, open-country}) × (mode ∈ {classic, extreme, insane, chaos})`: from a fresh load, click through to the mode and start. Log: `gameState.totalSheep` at start, `optimizedSheepSystem.sheep.length` after `recreateSheepFlock`, `gameState.useExtremeBoids`, console errors during start. Capture screenshots showing the actual sheep visible.
2. **Diagnose** based on the matrix. Most likely root causes (research Q1):
   - `recreateSheepFlock(scene)` doesn't pick up the per-scene spawn config on RH/OC for high counts.
   - Island radius can't seat 3000+ sheep with the default cluster spread; sheep clamp to a tiny disk and the effect reads as "200 visible".
   - Re-using an `optimizedSheepSystem` across mode changes leaves the spatial-hash sized for the prior count.
3. **Fix the root cause.** No band-aids. If it's spawn distribution, extend `setSheepSpawn` to accept a count override. If it's spatial-hash sizing, rebuild on count change. Whatever it is, write a vitest spec that exercises `setSheepCount(3000)` on each scene and checks the post-spawn count.
4. **Fix the leaderboard-pollution bug** — the smaller, easier subitem of this phase. Replace [`js/GameState.js:1121`](../js/GameState.js)'s `extreme ? 'soloExtreme' : 'soloClassic'` ternary with a real `MODE_TO_LEADERBOARD` lookup. Add `'soloInsane'` and `'soloChaos'` to the worker's `GameMode` union ([`worker/src/d1.ts:19`](../worker/src/d1.ts), [`worker/src/index.ts:363`](../worker/src/index.ts)). Frontend leaderboard tabs gain Insane + Chaos rows ([`js/components/Multiplayer/GlobalLeaderboard.js:21-27`](../js/components/Multiplayer/GlobalLeaderboard.js)). Add the two new `players.solo_*_best` columns or do this as part of Phase 3's deprecation — see Q2.

**Acceptance:**
- 12-cell repro matrix all green: each (scene, mode) combination spawns the expected sheep count and is playable.
- Insane and Chaos runs submit to their own leaderboards, not `soloClassic`.
- Vitest spec covers per-scene sheep-count override.

## Phase 3 — Leaderboard matrix: per-(mode, scene, sheepCount) (~6hr)

**Depends on:** Phase 2 (Q2 + Q5 must be answered).

1. **Migration `0002_mode_matrix.sql`** per the schema above. Apply locally with `npm run dev:setup` and verify backfill defaults are sane before deploying.
2. **Worker API.**
   - `submitScore` accepts `sceneId` + `sheepCount` in `body.additionalData`, lifts to dedicated columns. JWT auth path unchanged.
   - `getLeaderboard(mode, sceneId?, sheepCount?, limit)` supports optional partition filters. Order-by remains per-mode (asc time / desc sheep / desc wins).
   - `/api/leaderboards` (the multi-mode endpoint at [`worker/src/index.ts:386`](../worker/src/index.ts)) gains optional `?scene=` and `?sheepCount=` query params.
3. **Submission path.** [`js/GameState.js:submitScoreToLeaderboard`](../js/GameState.js) reads `this.sceneSpawnDef?.id` (or equivalent) and includes it in `additionalData` along with `totalSheep`.
4. **Frontend leaderboard UI.** [`js/components/Multiplayer/GlobalLeaderboard.js`](../js/components/Multiplayer/GlobalLeaderboard.js) gets two new selectors above the existing mode tabs: a Scene picker (Field / RH / OC / All) and a Sheep-Count picker (200 / 250 / 500 / 1000 / 3000 / 5000 / Any). The list re-fetches on selector change. The composite-key view defaults to "current scene + sheep count from the run that just completed" when reached via the post-game submit flow.
5. **Don't drop pre-cycle-8 scores.** Backfilled rows show up under their default partition (`scene=field`, `sheep=200` or `sheep=1000` for soloExtreme).

**Acceptance:**
- A 3000-sheep OC run shows up on the (insane, open-country, 3000) leaderboard, not on (insane, field, 1000).
- Pre-cycle-8 scores still appear in the appropriate default partition.
- Migration is idempotent and rollback-tested locally.
- Vitest spec covers query partitioning.

## Phase 4 — Sandbox on Rolling Hills + Open Country (~4hr)

**Depends on:** Q3 resolution.

1. **`SandboxConfig` schema extension.** Add `sceneId` (default `'field'`). Update `serialize()` / `deserialize()` (URL-encoded share links must remain compact — see [`js/components/StartScreen/SandboxSetup.js:107-125`](../js/components/StartScreen/SandboxSetup.js) for the URL-length cap).
2. **Sandbox start path.** [`js/main.js:startSandboxGame`](../js/main.js) currently injects field bounds into the terrain builder; for `sceneId !== 'field'` it should defer to the scene's terrain entirely (skip the `FieldConfig`-based bounds, skip the field-shape custom-fence path). The clean shape: when `sceneId !== 'field'`, sandbox is "the scene's terrain + your sheep-count + your win condition + your timer".
3. **`SandboxSetup` UI.** Add a Scene tab (or merge into Field tab). When non-Field is picked, hide Field Size + Field Shape pickers; show a notice: "Custom fences are disabled on island scenes for this cycle (carry-over)".
4. **Sandbox + scene known-issue audit.** From the BACKLOG and the "Standing risks" section of NEXT_SESSION:
   - The deprecated hardcoded pasture-rect grass exclusion was already gated on `sceneDef?.farmHouse` in Cycle 7 — verify no regression on Sandbox-on-Field.
   - Cycle-7 5-cluster spawn distribution belongs to `open-country.js`'s `sheepSpawn` — sandbox-on-OC should inherit it.
   - Sandbox uses `setSpawnConfig({centerX:-30, centerZ:-30, ...})` from [`js/GameState.js:818-823`](../js/GameState.js); on island scenes that point may be in the water. Read scene's `sheepSpawn` instead.

**Acceptance:**
- "New sandbox" flow lets you pick Field / RH / OC; starting on RH or OC gives you the scene's heightfield + tree placement + spawn distribution + your configured sheep count.
- Share links work cross-scene (URL-decode produces the right scene).
- Vitest spec for `SandboxConfig.deserialize` with `sceneId` payloads.

## Phase 5 — Multiplayer scope expansion (~5hr)

**Depends on:** Phase 2 (modes existing) and Phase 4 (Q4 measurement done) and Q4 resolution.

1. **`RoomMeta` extension** ([`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts)): add `sheepCount: number` defaulting to 200. Validate against an allow-list (200 / 250 / 500 / 1000 / 3000 / 5000) at room creation. Pass through `LobbyDO` so quick-match can filter by sheep count.
2. **`GameMode` widening on the worker.** Allow `soloInsane` / `soloChaos` / `soloClassic` / `soloExtreme` / `sandbox` as MP modes too (the actual game loop is `cooperative` — players race together to corral their personal goal — but the *count* and *seeding* mirror the solo mode). Or: keep the existing 3 MP modes and just allow them to take any `sheepCount`. **Pick one shape after research.** Recommendation: the latter; "Cooperative @ 3000 sheep" is mechanically what "Coop Insane" would be.
3. **`RoomCreation` UI** ([`js/components/Multiplayer/RoomCreation.js`](../js/components/Multiplayer/RoomCreation.js)): add a sheep-count selector after the mode picker. Maybe also a scene picker if not already present.
4. **`GameSim` sizing on the worker.** Sheep count must be configurable at construction. If Q4 surfaces bandwidth issues at 1000+, cap MP sheep count to whatever stays in budget; document the cap visibly.
5. **MP score submission** must already include the new `sheepCount` and `sceneId` partition keys (Phase 3 covers this; just verify it works through the MP path, where `submitScore` runs in `RoomDO`).

**Acceptance:**
- Creating a room with 1000 sheep on RH actually starts a 1000-sheep RH game for all joiners.
- Cooperative leaderboard partitions correctly (1000-sheep RH coop runs not commingled with 200-sheep Field coop runs).
- No bandwidth or sim cliff: 30Hz holds at the chosen sheep ceiling.

## Dependencies

```
Phase 1 (playtest sweep, independent)
                ↓
Phase 2 (Insane/Chaos fix + lookup-table) ──┐
                                            ├→ Phase 3 (leaderboard matrix)
                                            │       ↓
                                            ├→ Phase 4 (sandbox on RH/OC)
                                            │
                                            └→ Phase 5 (MP scope) — needs Phase 3's submission shape + Phase 4's measurement
```

Phase 1 can run anytime. Phases 2–5 must run in order; Phases 4 and 5 can interleave once Phase 3 lands.

If scope blows out, defer Phase 5 to Cycle 9 — it's the largest, the riskiest (network bandwidth at 1000+ sheep is unmeasured), and the least requested in raw playtest. Phases 1–4 are the must-have shape of this cycle.

## Frozen files (cycle-specific additions)

These files require explicit task-brief authorization to modify within this cycle. The durable fence list is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md); add cycle-specific freezes here only if the work pattern requires extra discipline.

- `tests/sim-baseline/` — DO NOT regenerate fixtures. Phase 2's flock recreation must preserve byte-identical output for the 200-sheep Field case (i.e., the baseline scenario). New test specs are welcome; existing fixtures are not.
- `worker/migrations/0001_init.sql` — append-only via new migration files. Don't rewrite history.
- `shared/MovementPhysics.js` `updateMovement` — Cycle 6 fence; obstacle composition stays at the call site.

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure that you don't understand — don't regenerate fixtures, escalate.
3. Phase 3 schema migration that drops or rewrites existing rows.
4. Phase 5 MP-bandwidth measurement showing >2× wire bandwidth at 1000 sheep on a representative consumer connection — escalate to user before implementing a sheep-count cap or a delta-compression scheme.
5. Visual regression on a previously-passing scene — fix or revert before adding new scope.

## What NOT to do during this cycle

- Don't add new scenes. Three is still the right number. Phase 4 is *enabling* sandbox on existing scenes, not adding any.
- Don't reopen multiplayer architecture. Phase 5 is parameter widening (sheep count, scene), not a re-architecture.
- Don't touch `shared/MovementPhysics.js` `updateMovement` to insert obstacle logic.
- Don't merge `canStartSprint` and `canContinueSprint` (Cycle 7 split — preserves the exhaustion lock).
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed.
- Don't write a one-off backfill script for the schema migration — bake the backfill into the migration SQL so it's idempotent.
- Don't implement Phase 5 fence-on-island-heightfield. Q3 punts custom fences on island scenes to a later cycle by design.
- Don't rebuild leaderboard storage on top of materialized-best columns once Q2 lands on "deprecate them" — the on-demand-from-`score_submissions` path is the new home.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] All phases shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] All vitest specs pass (target ≥ 120; 111 currently, +9 expected from Phases 2–5).
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.
- [ ] Migration `0002_mode_matrix.sql` applied to remote D1 with no row loss.
- [ ] Insane and Chaos modes spawn the right sheep count on Field, RH, and OC.
- [ ] Insane / Chaos leaderboards exist as their own tabs and are no longer polluting `soloClassic`.
- [ ] Per-(mode × scene × sheepCount) partition shows up correctly in the leaderboard UI.
- [ ] Sandbox can launch on Rolling Hills or Open Country.
- [ ] MP rooms can pick non-200 sheep counts (or Phase 5 explicitly deferred to Cycle 9 with a written reason).
- [ ] Cycle 6 + 7 carry-over playtest items confirmed (Phase 1).
- [ ] No frametime regression on RTX 3070 desktop or mobile target.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-7-plan.md`](archive/cycles/cycle-7-plan.md) — prior cycle (Cycle 7)
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
- [`worker/migrations/0001_init.sql`](../worker/migrations/0001_init.sql) — current schema (parent of `0002_mode_matrix.sql`)
- [`worker/src/d1.ts`](../worker/src/d1.ts) — `submitScore` / `getLeaderboard` (the Phase 3 surface)
- [`js/components/Multiplayer/GlobalLeaderboard.js`](../js/components/Multiplayer/GlobalLeaderboard.js) — frontend leaderboard view
- [`js/GameState.js:1109-1148`](../js/GameState.js) — score submission (the Phase 2 lookup-table fix lives here)
- [`js/GameState.js:757-810`](../js/GameState.js) — solo `startGame` mode → sheep-count branching
- [`js/components/StartScreen/SandboxSetup.js`](../js/components/StartScreen/SandboxSetup.js) — sandbox UI (Phase 4 surface)
- [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) — MP `RoomMeta` (Phase 5 surface)
