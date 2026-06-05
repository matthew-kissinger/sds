# Cycle 58 — solo-on-ramp

> Drafted 2026-06-04 after Cycle 57 closed. Authored from a paired design pass (count-model + leaderboard-partition + completion-bug trace against current code). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Make solo runs approachable on the two islands and fast to start everywhere, without disturbing Home Field's existing leaderboard. Today every difficulty is the same sheep count on every biome (Classic is 200 sheep whether you are on the flat fenced pasture or the 380-metre island), Just Play drops 30 sheep that take too long to gather before you can set the hook, and a solo run completes one sheep short of the flock. After this cycle: each biome has its own difficulty ladder (small fast tiers on the two islands, Home Field's ranked tiers unchanged), Just Play is 3 sheep, a run completes at N of N with no stray sheep, and players can name themselves at two friction-free moments (after a score, and before playing) instead of only buried in Settings. No new game modes (those are Cycle 59) and no new biomes.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), not the final implementation choices. Where it suggests a technique, treat it as a research starting point. Each agent picking up a phase should research current code, measure where relevant, and pick the simplest thing that meets the bar.

The load-bearing constraint all cycle: **Home Field's existing leaderboard scores must stay exactly where they are.** Every phase that touches counts or the leaderboard is designed to be behavior-preserving for existing rows, and Phase 4 proves it with a test.

## Open questions to resolve before writing code

1. **Q1: Where does the per-biome ladder live — a field on the `SceneDef`, or a standalone shared module?** Author lean: an optional `soloLadder` field on the `SceneDef` (`shared/scenes/types.js` + each scene def), resolved through a small `shared/difficulty.js` helper with a legacy default. This fits the scene-as-data contract ("scene-specific knobs live on the `SceneDef`", [`scene-and-render.md`](../.claude/rules/scene-and-render.md)); the worker already imports `getSceneById` for validation, and adding an optional field with a default is the cheap fence case.
2. **Q2: Leaderboard identity — switch the solo board key to `(scene, count)`, or keep the 4 mode-slugs and scale their counts per biome?** Author lean: `(scene, count)`. The `score_submissions` table already has `sheep_count` + the `idx_submissions_partition` index (Cycle 8 built them for this). The switch is behavior-preserving for every existing row because each current `(scene, slug)` is already count-homogeneous (Home Field classic is always 200, etc.), so grouping by count yields identical boards. It unlocks the per-biome ladders and drops in cleanly for the Cycle 59 modes without a schema change.
3. **Q3: The extreme-boid (spatial-hash) path keys on `EXTREME_BOID_SOLO_MODES = {extreme, insane, chaos}` today. With counts now varying by biome, what selects the path?** Author lean: gate `isExtremeBoidMode` on the *resolved count* (a threshold, e.g. count ≥ 500) rather than the difficulty id, so a 600-sheep island run still gets the spatial-hash path and a 200-sheep run does not. Keep the difficulty `id` as a stable handle for labels / save-resume / `restartSameMode`, decoupled from the count.

## Architecture / shared changes

**The difficulty ladder becomes scene data.** A `SceneDef` gains an optional ordered ladder:

```js
scene.soloLadder = [
  { id: 'justplay', count: 3,   ranked: false }, // unranked warmup, set the hook fast
  { id: 'quick',    count: 25,  ranked: true  },
  { id: 'classic',  count: 200, ranked: true  },
  // ...exponential toward the top
]
```

- `shared/difficulty.js` (new) exposes `getSoloLadder(scene)` and `getSoloCount(scene, id)` with a legacy default ladder (`practice 30 / classic 200 / extreme 1000 / insane 3000 / chaos 5000`) so any scene without an explicit ladder behaves as today. This is a pure data module — no DOM, no `js/` import — so the worker and client share one source of truth. `js/gamestate/modes.js`'s `SOLO_MODE_SHEEP_COUNT` becomes a thin re-export of the legacy default for back-compat.
- **Leaderboard identity = `(scene_id, sheep_count)`** for solo. The worker read aggregates solo rows by count instead of by slug; the submit-time allow-list is derived from each scene's ladder; the read is proven byte-identical for existing rows (Phase 4).
- `singlePlayerMode` stays the armed difficulty `id` (so save-resume, `restartSameMode`, and per-mode UI keep working). `totalSheep`, the leaderboard partition, and the boid path all resolve from the ladder, not the id.

**Strawman ladders** (tunable; the shape — small steps low, exponential high — is the point). Bold = preserved exactly from today.

| Biome | Just Play | Ranked ladder |
|---|---|---|
| Home Field (flat fenced pasture) | 3 | 25, **200**, **1000**, **3000**, **5000** |
| Rolling Hills (180m island) | 3 | 25, 75, **200**, 1000, 5000 |
| Open Country (380m island) | 3 | 25, 50, 150, 600, 5000 |

Home Field keeps all four ranked anchors (its existing scores stay put). Rolling Hills keeps a 200 tier so the restored incident run (id=16, 759.4s) stays live and comparable. Every biome keeps 5000 as the signature Chaos tier.

## Phase 1 — Completion-count fix (~1hr) [autonomous]

**Independently testable, ship first.** It is isolated, it de-risks every small-count tier, and at 3 sheep the current bug would complete at 2 of 3.

The client solo loop double-counts a sheep on the frame it retires: `js/GameState.js` increments `sheepRetired` once in the `triggered` branch (~:310, alongside the chime + zap) and again in the "count all retired" pass (~:325). The win predicate `isSoloComplete = sheepRetired >= sheep.length` ([`js/gamestate/winConditions.js`](../js/gamestate/winConditions.js):46) therefore fires one tail-sheep early.

1. **Fix.** Remove the redundant `this.sheepRetired++` in the `triggered` branch of `js/GameState.js`; keep the chime and the `corral-retired` zap event. The "count all passed/retiring" pass is the authoritative count.
2. **Test.** Add a unit test over the retired-count loop (or `isSoloComplete`) asserting that a flock where every sheep is retired yields `sheepRetired === sheep.length`, and that a flock one short does not complete.

**Acceptance (EARS):**

- When a solo run ends, the system shall complete only when `sheepRetired === sheep.length` (no sheep left in the field).
- When a sheep retires on a given frame, then the retired count shall increase by exactly one (no double-count).
- This is a client/solo-only change; the worker's shared `checkGameCompletion` is untouched, so multiplayer is unaffected and no `shared/` file changes.

## Phase 2 — Difficulty ladder as scene data (~3hr) [autonomous]

**Depends on:** nothing. Foundation for Phases 3, 4, 6.

1. **Schema.** Add optional `soloLadder` (array of `{ id, count, ranked }`) to the `SceneDef` typedef in [`shared/scenes/types.js`](../shared/scenes/types.js).
2. **Helper.** New `shared/difficulty.js`: `getSoloLadder(scene)`, `getSoloCount(scene, id)`, `getRankedCounts(scene)`, with the legacy default ladder. Pure, no `js/` import.
3. **Scene data.** Add the strawman `soloLadder` to [`shared/scenes/field.js`](../shared/scenes/field.js), [`shared/scenes/rolling-hills.js`](../shared/scenes/rolling-hills.js), [`shared/scenes/open-country.js`](../shared/scenes/open-country.js).
4. **Back-compat.** Re-point `SOLO_MODE_SHEEP_COUNT` in [`js/gamestate/modes.js`](../js/gamestate/modes.js) at the legacy default so existing importers keep resolving.
5. **Tests.** Ladder resolution + default fallback + Home-Field-counts-unchanged.

**Acceptance (EARS):**

- When a scene declares a `soloLadder`, then `getSoloCount(scene, id)` shall return that scene's count for the difficulty.
- While a scene declares no `soloLadder`, the helper shall return the legacy default counts.
- When Home Field's ladder resolves, then its ranked counts shall be exactly `[200, 1000, 3000, 5000]`.

## Phase 3 — Worker submit validation, count-aware (~2hr) [autonomous]

**Depends on:** Phase 2.

1. **Allow-list.** Replace the fixed `ALLOWED_MODE_SHEEPCOUNT` per-slug table in [`worker/src/d1.ts`](../worker/src/d1.ts) with a scene-aware check derived from the ladder (a submitted `(scene, count)` is valid iff `count` is in that scene's ranked ladder).
2. **Duration floors.** Add low-count entries to `MIN_PLAUSIBLE_DURATION_BY_COUNT` so a legitimately fast small-flock run is not hard-rejected as implausible.
3. **Tests.** Extend the real-SQLite worker specs (reuse [`tests/worker/helpers/d1-sqlite.ts`](../tests/worker/helpers/d1-sqlite.ts)): a small-count ranked submit is accepted; a count not in the scene's ladder is rejected; a fast small-count run clears the floor.

**Acceptance (EARS):**

- When a submit arrives with a `(scene, count)` in that scene's ranked ladder, then the worker shall store it.
- If a submit's `count` is not in the scene's ladder, then the worker shall hard-reject it.
- When a fast small-count run submits, then it shall not be hard-rejected by the duration floor.

## Phase 4 — Leaderboard partition by (scene, count) (~3hr) [autonomous]

**Depends on:** Phase 2, 3. **Highest-risk phase — read-only, no data migration, reversible.**

1. **Read.** Switch the solo path of `getLeaderboard` in [`worker/src/d1.ts`](../worker/src/d1.ts) to key on `(scene_id, sheep_count)` (aggregating across the legacy solo slugs, which map 1:1 to a count).
2. **Behavior-preserving proof.** Seed the real-SQLite harness with existing-shape rows (slug + count 1:1, including a rolling-hills/200 row like id=16) and assert the `(scene, count)` grouping yields the same board membership and ordering as the current `(scene, slug)` grouping.
3. **API.** Ensure the `/api/leaderboard` handler ([`worker/src/index.ts`](../worker/src/index.ts)) passes `sheepCount` for solo reads.

**Acceptance (EARS):**

- When the solo leaderboard aggregates existing rows after the switch, then each board shall be byte-identical to the pre-change board (proven by test).
- When two runs on the same scene at different counts exist, then they shall land on separate boards.
- This phase performs no D1 migration and no row rewrite.

## Phase 5 — Leaderboard UI: per-biome count tabs (~2hr) [autonomous]

**Depends on:** Phase 4.

1. **Tabs.** In [`js/components/Multiplayer/GlobalLeaderboard.tsx`](../js/components/Multiplayer/GlobalLeaderboard.tsx), derive the solo tabs/filter for the selected scene from that scene's ranked ladder instead of the fixed `SOLO_LEADERBOARD_MODES`. The read passes the tab's count.
2. **Labels.** Show each tier's label + count; keep the restored 200 tier visible on Rolling Hills.

**Acceptance (EARS):**

- When a scene is selected, then the solo tabs shall be that scene's ranked ladder counts.
- When a count tab is selected, then the board shown shall be `(scene, count)`.

## Phase 6 — Entrance + GameState wiring (~3hr) [autonomous]

**Depends on:** Phase 2.

1. **Entrance.** Replace the flat `MODES` array in [`js/components/entrance/worlds.ts`](../js/components/entrance/worlds.ts) so the difficulty options come from the armed world's ladder; the displayed sheep count reads from the ladder entry.
2. **GameState.** Resolve `totalSheep` from `getSoloCount(scene, singlePlayerMode)` in [`js/GameState.js`](../js/GameState.js) (~:553) instead of the flat `SOLO_MODE_SHEEP_COUNT`.
3. **Boid path.** Gate `isExtremeBoidMode` (in [`js/gamestate/modes.js`](../js/gamestate/modes.js)) on the resolved count threshold per Q3.

**Acceptance (EARS):**

- When a world is armed, then its difficulty options shall be that world's ladder.
- When a Just Play run starts on any biome, then the flock shall be 3 sheep.
- While a run's resolved count is at or above the spatial-hash threshold, the system shall use the extreme-boid path.

## Phase 7 — Open Country objective clamp for tiny counts (~2hr) [autonomous]

**Depends on:** Phase 6 (tiny counts become reachable). **`shared/` fence touch — follow the sim-baseline protocol.**

The Open Country gather objective requires `max(requiredSheepMin=10, floor(count * 0.40))` ([`shared/ObjectiveLogic.js`](../shared/ObjectiveLogic.js)), which is unwinnable below 10 sheep (a 3-sheep run needs 10).

1. **Clamp.** Make `requiredSheepMin` count-relative so `requiredSheep <= totalSheep` always (e.g. clamp the min to the available flock).
2. **Sim-baseline.** Confirm no committed fixture runs Open Country below the old clamp, so traces stay byte-identical; record the acceptance in this section if any regeneration is truly needed (it should not be).

**Acceptance (EARS):**

- While `totalSheep` is below the legacy min clamp, the required count shall be `<= totalSheep` (the run is winnable).
- When the sim-baseline specs run after this change, then the committed fixtures shall remain byte-identical (no regeneration).
- When this change ships, then the migration story (file, why, consumer = win-condition only) shall be recorded in this phase.

## Phase 8 — Naming touchpoints + close (~3hr) [autonomous]

**Depends on:** nothing structurally (independent of the count work).

1. **Shared field.** Extract the Settings display-name editor ([`js/components/StartScreen/SettingsPanel.js`](../js/components/StartScreen/SettingsPanel.js):47-84) into a shared `NameField` component over the existing `NetworkManager.renamePlayer()` path.
2. **Post-score offer.** On [`js/components/GameHUD/CompletionScreen.tsx`](../js/components/GameHUD/CompletionScreen.tsx), when a submit succeeds and `nameType === 'auto'`, show the `NameField` inline ("Saved as Shepherd#0001. Want your own name?"). Non-blocking, dismissible.
3. **Pre-play optional.** Make the entrance "Playing as {name}" label ([`js/components/entrance/Entrance.tsx`](../js/components/entrance/Entrance.tsx):230) an inline-editable name affordance. Never a gate.
4. **Close.** Run `/validate`.

**Acceptance (EARS):**

- When a solo run is saved and the player's `nameType === 'auto'`, then the completion screen shall offer a non-blocking name field.
- When the entrance is shown, then the player shall be able to set a name without leaving it and without being required to.
- When the player sets a name at either touchpoint, then the leaderboard row and local identity shall update.

## Dependencies

```
Phase 1 (standalone, first)
Phase 2 → Phase 3 → Phase 4 → Phase 5
Phase 2 → Phase 6 → Phase 7
Phase 8 (standalone; lands last with /validate)
```

Phase 1 and Phase 8 are independent of the count work. Phases 3 and 4 both touch `worker/src/d1.ts`, so serialize them. Phase 6 can run in parallel with the worker phases (3/4/5) once Phase 2 lands.

## Frozen files (cycle-specific authorizations)

These [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) entries are authorized for this cycle with the migration story below:

- **`shared/scenes/types.js`** (SceneDef schema) — Phase 2 adds an **optional** `soloLadder` field with a default. The cheap fence case: no consumer breaks if absent (the `shared/difficulty.js` helper supplies the legacy default). Consumers updated in-cycle: worker validation (P3), leaderboard read (P4), entrance + GameState (P6).
- **`shared/ObjectiveLogic.js`** — Phase 7 makes `requiredSheepMin` count-relative. Migration story: behavior changes only for `totalSheep` below the legacy clamp (10), a regime no committed sim-baseline fixture exercises; the sole consumer is the Open Country win condition. Sim-baseline must stay byte-identical (Hard stop 2).

No D1 migration (the `sheep_count` / `scene_id` columns and partition index already exist). No MessagePack wire-protocol change (multiplayer counts come from `room.sheepCount`, untouched).

## Hard stops

Durable stops apply ([`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. **Existing-board drift.** If the Phase 4 behavior-preserving test shows any existing solo board changing membership or order, stop. The partition switch must be byte-identical for existing data.
2. **Sim-baseline drift.** If any committed sim-baseline fixture changes after the Phase 7 clamp, stop and read the diff before regenerating — unexplained ULP drift outside the tiny-count regime aborts the phase.
3. **Schema creep.** If any phase wants a D1 migration or a wire-format change, stop and surface — it means the design drifted from count-as-identity over existing columns.

## What NOT to do during this cycle

- **The two new game modes.** They are Cycle 59. This cycle only reshapes the existing solo difficulty axis.
- **New biomes or scenes.** Out of scope.
- **Sheep-to-sheep collision.** Still its own future cycle (deferred from Cycle 56).
- **Regenerating sim-baseline fixtures as a shortcut.** Phase 7 must preserve them.
- **Auto-bumping the version.** Player-visible releases stay explicit.
- **Rewriting Home Field's ladder counts.** Its ranked anchors are preserved by construction; only Just Play (unranked) changes there.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all 8 phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, the sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When a solo run finishes, the system shall complete at retired == spawned with no stray sheep (Phase 1).
- [ ] When a Just Play run starts on any biome, the flock shall be 3 sheep (Phase 6).
- [ ] When the solo leaderboard aggregates existing rows after the partition switch, the boards shall be byte-identical to pre-change, proven by test (Phase 4).
- [ ] When Home Field's ranked ladder resolves, its counts shall be exactly `[200, 1000, 3000, 5000]` (no existing score disturbed).
- [ ] When a player is auto-named and saves a score, the completion screen shall offer a non-blocking name field (Phase 8).
- [ ] When the entrance is shown, the player shall be able to set a name without being required to (Phase 8).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) — deterministic-sim boundary (Phase 7)
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) — scene-as-data contract (Phase 2)
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
