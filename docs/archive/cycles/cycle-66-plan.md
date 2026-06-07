# Cycle 66 — newsheepdogland-survival

> Drafted 2026-06-07 after Cycle 65 (`wolf-coast-homestead-and-day`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top to bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a folded autonomous cycle.** Matt reviewed the homestead on prod and chose (2026-06-07) to fold the whole survival vision into one larger autonomous cycle (loop + wolves + bark + leaderboard + minimap + whole-island grass + UI reorg + the full rename) rather than a focused 66 + polish 67. Run it end to end; Matt reviews on completion. It runs the full 8-phase budget and several phases exceed the usual 4-hour size on purpose. Co-op (promoting the survival sim to deterministic `shared/`) stays a later cycle.

## Goal

Turn the Wolf Coast homestead into the **survival game**, and rename the island to **Newsheepdogland**. Today the island has a homestead, a soft day/night rhythm, and the old Cycle 64 toe-corral zap objective. After this cycle: the island is **Newsheepdogland**; the **objective is the pen** (herd the flock through the gate; they retire inside; the fence is a real barrier; no zap, no teleport); the day is a **survival run** (start with 10 sheep, ~10 minutes to herd them in before dusk, then night, when **wolves** come out; if you lose under 33% of the flock you gain +5 and live to the next day; the flock size is your **score**, recorded to the **leaderboard** when you die); the **bark** repels wolves at range; **grass covers the whole island**; a **minimap** orients the player; and the **UI is reorganized for survival** (no sheep-count selection).

Before: a pretty homestead with a soft, stakes-free day loop and a leftover zap corral. After: a real survival run on Newsheepdogland with wolves, a flock you grow or lose, and a leaderboard.

## How to read this plan

This doc fixes the *shape* of the changes. Named numbers (10 sheep, 10-minute day, 33% loss, +5 growth, wolf counts, bark range) are **Matt's stated spec** for the loop and should be implemented as given, then exposed as tunables for his feel pass. Each phase agent should:

- **Spike the risky primitives first** (per [`feedback_spike_risky_primitives.md`](file:///c/Users/Mattm/.claude/projects/C--Users-Mattm-X-games-3d-sds/memory/feedback_spike_risky_primitives.md)): the **pen soft-containment** (sheep cannot cross the fence except through the gate), the **wolf AI** (pursuit + grapple + flee-from-bark feel), and the **whole-island grass perf budget**. Build throwaway measuring spikes in `tools/` + `cycle66-validation/` and pick the representation with numbers before committing the implementation.
- **Keep the survival sim SOLO + client-side** (the [`js/gamestate/dayLoop.js`](../js/gamestate/dayLoop.js) / [`js/gamestate/countingMode.js`](../js/gamestate/countingMode.js) precedent). Wolves and the loop are client controllers this cycle. Promoting them to deterministic `shared/` for co-op is a later cycle. This keeps the sim-baseline byte-identical.
- **Verify in the browser** (preview, `SDS_SUPPRESS_BROWSER_OPEN=1`, close every tab/listener after) before marking a phase done. Save proof under `cycle66-validation/`.
- **Tag each phase + branch tunable variants** if the iteration-save framing applies (per [`feedback_iteration_save.md`](file:///c/Users/Mattm/.claude/projects/C--Users-Mattm-X-games-3d-sds/memory/feedback_iteration_save.md)).

## What already exists (grounding map — do not rebuild these)

Verified 2026-06-07. This cycle wires + extends on top of these:

- **Day loop:** [`js/gamestate/dayLoop.js`](../js/gamestate/dayLoop.js) — client-only day/phase/gate/dusk controller with a nightly tally. The survival loop extends this (the death/growth economy + 10-sheep start + ~10-min day), not a rewrite.
- **Gate + pen:** [`js/StructureBuilder.js`](../js/StructureBuilder.js) `buildHomesteadGate` builds the full pen ring + the swing gate; `setHomesteadGateOpen` / `updateGate` animate the door. The pen is a *visual* enclosure today (no collision). The `pen` SceneDef field carries center + radius.
- **Wolf asset:** [`js/Wolf.js`](../js/Wolf.js) + `assets/models/Wolf.glb` — a render-only animation state machine (Idle / Walk / Gallop / Attack / Death), reachable via the `?wolf=1` harness. Wolf AI is new client code on top of this asset.
- **Bark:** [`shared/BarkImpulse.js`](../shared/BarkImpulse.js) — a deterministic 12 m forward cone that pushes sheep along the dog's facing. Sheep-only, no wolf interaction. The survival bark keeps this cone and adds a longer-range radial wolf-repel.
- **Retirement / objective:** the toe `corral` with the `zap` effect ([`js/StructureBuilder.js`](../js/StructureBuilder.js) `buildCorralStructure`, retirement in [`shared/GameStateValidation.js`](../shared/GameStateValidation.js)). Survival replaces this with pen-entry retirement.
- **Leaderboard:** Cloudflare D1 (`sds-db`), append-only migrations in [`worker/migrations/`](../worker/migrations/); leaderboard identity is `(scene, sheep_count)` / `(scene, mode)`. Survival adds a mode partition (score = flock size) and the scene-id rename touches the partition.
- **Grass:** [`js/GrassSystem.js`](../js/GrassSystem.js) — one InstancedMesh + custom shader + stochastic density LOD. Today Newsheepdogland grass is foot-only (`grassCenter` + `grassRadius`, ~584 chunks) for draw-call cost. Whole-island coverage needs a density/LOD rearch, not a naive radius bump (see [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) "Grass discipline").
- **Scene rename surface:** scene id `wolf-coast` appears in [`shared/scenes/wolf-coast.js`](../shared/scenes/wolf-coast.js), [`shared/scenes/wolf-coast.coast.js`](../shared/scenes/wolf-coast.coast.js), the scene registry [`shared/scenes/index.js`](../shared/scenes/index.js), `public/terrain/wolf-coast.bin`, the bake command in [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs), the sim-baseline fixture `tests/sim-baseline/__fixtures__/coastline-wolf-coast-60hz.json`, deep-link `?scene=` URLs, the entrance carousel, and the D1 leaderboard partition.

## Open questions (strawman answers — Matt's taste pass confirms)

1. **Q1: Wolf-coast D1 scores on rename?** Author lean: a new append-only migration that **renames the `wolf-coast` partition to `newsheepdogland`** (Wolf Coast solo shipped in Cycle 64, so few real scores). Alternative: accept orphaned `wolf-coast` rows. Confirm.
2. **Q2: Survival score definition?** Author lean: **score = peak flock size** (the largest flock you reached), reusing the existing 1-D `score` column with a `survival` mode partition (no new score schema). Days-survived is a tiebreaker/secondary stat if cheap. Matt said "the number of sheep is the score."
3. **Q3: Wolf count / escalation?** Author lean: night 1 spawns a small pack (2-3), escalating per day. Spike the feel; expose as a tunable curve.
4. **Q4: Pen containment representation?** Author lean: a client-side soft boundary on the pen circle (sheep + dog get an inward push at the fence except within the gate arc when open). Spike vs a per-segment collider. Solo client-side; no `shared/` sim change.
5. **Q5: Minimap technique?** Author lean: a **baked top-down ortho texture** of the island at scene load (reuse the heightmap + coastline SDF for the landmass shape), with live DOM/canvas markers for the dog, pen, flock, and wolves. Top-right, pastoral styling. Cutting-edge-but-cheap: the base image is baked once, only the markers update per frame.
6. **Q6: Death condition?** Author lean: a night ends the run (death) when the flock drops by **33% or more** that night; under 33% loss survives and grows +5. Spike the exact accounting (per-night vs cumulative). Matt's spec.

## Architecture / what changes where

This cycle is bigger than Cycle 65. It touches frozen data + D1 + the scene registry, but keeps the survival *sim* solo + client-side.

- **Frozen-file touches (authorized below):** [`shared/scenes/types.js`](../shared/scenes/types.js) — additive survival fields (a `survival` config block + any wolf/pen descriptors). New append-only D1 migration(s) for the survival leaderboard partition + the scene-id rename. The scene-id rename across the registry + terrain bin + coast file + sim-baseline fixture (rename, content byte-identical).
- **New client modules (not frozen):** a survival-loop controller (extends the day loop), a wolf-AI + WolfRenderer system (client-side, solo), the pen soft-containment, the minimap, the survival HUD.
- **Bark:** keep [`shared/BarkImpulse.js`](../shared/BarkImpulse.js)'s sheep cone byte-identical; add a longer-range radial wolf-repel (client-side for solo, or an additive shared function that only fires on bark and never touches sheep math, so sim-baselines stay byte-identical).
- **Grass:** a density/LOD rearch in [`js/GrassSystem.js`](../js/GrassSystem.js) to cover the whole island within the draw-call budget. Do not decompose the grass system (cohesive by design).
- **Scene data:** [`shared/scenes/wolf-coast.js`](../shared/scenes/wolf-coast.js) -> `newsheepdogland.js` (the survival config, whole-island grass, no toe corral).

## Phase 1 — Full rename Wolf Coast -> Newsheepdogland

**Do first so every downstream phase uses the new id.** A mechanical but wide rename.

1. Rename the scene module + coast file (`wolf-coast.js` -> `newsheepdogland.js`, `wolf-coast.coast.js` -> `newsheepdogland.coast.js`), the scene id (`'wolf-coast'` -> `'newsheepdogland'`), and the display name to "Newsheepdogland". Update the scene registry [`shared/scenes/index.js`](../shared/scenes/index.js).
2. Rename the terrain bin (`public/terrain/wolf-coast.bin` -> `newsheepdogland.bin`) + the `heightmapUrl`, and the bake command/provenance in [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs). Rename the sim-baseline fixture `coastline-wolf-coast-60hz.json` -> `coastline-newsheepdogland-60hz.json` (content byte-identical; this is a rename, not a regen).
3. Update deep-link `?scene=` handling, the entrance carousel entry, SEO/scene metadata, and every test referencing `'wolf-coast'`.
4. D1: a new append-only migration (Q1) that renames the `wolf-coast` leaderboard partition to `newsheepdogland` (or the agreed alternative).

**Acceptance (EARS):**

- When the game loads `?scene=newsheepdogland`, then the island shall load with the new id and display name, and `?scene=wolf-coast` shall no longer resolve (or redirect, per the migration story).
- When `grep -r "wolf-coast"` runs over `shared/`, `js/`, `tests/`, and `public/`, then no functional reference shall remain (archived cycle docs excepted).
- When the sim-baseline suite runs, then the renamed fixture shall be byte-identical to the old `coastline-wolf-coast-60hz.json` content (rename only, no sim change).
- When the rename migration is applied to D1, then prior Newsheepdogland leaderboard reads shall resolve under the new partition (per Q1).

## Phase 2 — Pen as a real barrier + the objective (herd through the gate, retire inside)

**The core objective change. Replaces the toe-corral zap.** Spike the containment representation (Q4) first.

1. Make the pen a **real barrier**: the dog and the sheep collide with the fence; sheep can only pass through the **gate arc** (and only while the gate is open). Closed gate at night = sealed. Client-side soft-containment for solo (no `shared/` sim change).
2. Make the pen **the objective**: herd sheep through the gate; once inside, they **settle and retire in the pasture** (a calm grazing/idle state), staying until morning. **No zap, no teleport** — remove the toe `corral` + the zap effect from this scene.
3. Track "N of M home" off real pen membership (the day loop already counts this); retired sheep are the ones safe overnight.

**Acceptance (EARS):**

- When a sheep is herded through the open gate, then it shall enter the pen and settle/retire there (no zap, no teleport).
- When the gate is closed, then neither sheep nor the dog shall pass through the fence line (only the gate arc is passable, and only while open).
- While sheep are outside the pen, the dog shall be able to herd them toward the gate without them clipping through the fence.
- When the scene loads, then the toe corral + zap effect shall be gone (the pen is the only objective).
- When the sim-baseline suite runs, then all fixtures shall be byte-identical (pen containment is client-side, solo).

## Phase 3 — Survival loop + survival UI reorg

**Depends on P2 (real pen) + the day loop.** The run economy + the UI that fits it.

1. Extend the day loop into a **survival run**: start the flock at **10 sheep**; the day lasts **~10 minutes** (graze + herd-back) into dusk, then **night**. At nightfall, account the flock: if losses are **under 33%**, the flock **grows by +5** and the run advances to the next day; if losses are **33% or more**, the run **ends (death)**.
2. **Score = flock size** (Q2). On death, submit the score and show the run summary.
3. **UI reorg for survival** (Matt: "rethink the organization of the UI"): survival has **no sheep-count selection** (the run always starts at 10). Add a survival entry/mode; a survival HUD showing day number, flock count, time-to-dusk, and the night threat. Fold the day/night readout into the survival HUD.

**Acceptance (EARS):**

- When a survival run starts, then the flock shall be 10 sheep and there shall be no sheep-count selection for the mode.
- While the day runs, the HUD shall show the day number, the flock count, and time remaining before dusk/night.
- When night ends with under 33% of the flock lost, then the flock shall grow by +5 and the run shall advance to the next day.
- When night ends with 33% or more of the flock lost, then the run shall end and the score (flock size) shall be submitted.
- When a survival run ends, then a run summary shall show the score and offer a restart.

## Phase 4 — Wolves

**Depends on P2 (pen safety) + P3 (night phase). Spike the AI feel (Q3) first.** Client-side, solo.

1. A wolf system: wolves **spawn at night** (count per Q3, escalating per day), **hunt sheep outside the pen**, and can kill/scatter them. Sheep **inside the closed pen are safe**. Reuse [`js/Wolf.js`](../js/Wolf.js) + `Wolf.glb` for the renderer (Idle / Walk / Gallop / Attack / Death).
2. Wolf AI: target the nearest unprotected sheep, pursue, grapple/kill, retreat at dawn (despawn). Deterministic seeded spawn ([`shared/Random.js`](../shared/Random.js) mulberry32) so a run is reproducible.
3. Tie kills into the P3 night accounting (a kill is a loss).

**Acceptance (EARS):**

- When night falls, then wolves shall spawn and move to hunt sheep that are outside the pen.
- While a sheep is inside the closed pen, then no wolf shall be able to reach or kill it.
- When dawn arrives, then surviving wolves shall retreat/despawn and the day shall resume.
- When a wolf kills a sheep, then the flock count shall drop and feed the night-loss accounting (P3).
- When the sim-baseline suite runs, then all fixtures shall be byte-identical (wolves are client-side, solo).

## Phase 5 — Bark redesign (sheep cone + radial wolf-repel)

**Depends on P4 (wolves to repel).** Resolve the bark-verb conflict.

1. Keep the existing **forward cone for sheep** ([`shared/BarkImpulse.js`](../shared/BarkImpulse.js), 12 m) byte-identical.
2. Add a **longer-range radial wolf-repel**: a bark scares wolves within a larger radius (farther than the sheep cone), pushing them away / breaking pursuit. Client-side for solo (or an additive shared function that only fires on bark and never alters sheep math).
3. Verify the bark sound + the existing reactive feel still work for sheep, now also affecting wolves at range.

**Acceptance (EARS):**

- When the dog barks, then sheep in the forward cone shall be pushed as today (byte-identical sheep behavior) and the bark sound shall play.
- When the dog barks near wolves, then wolves within the (larger) repel radius shall flee / break pursuit.
- While wolves are beyond the sheep cone but inside the wolf-repel radius, then the bark shall still affect them (longer range for wolves).
- When the sim-baseline suite runs, then all fixtures shall be byte-identical (the wolf-repel never alters sheep math).

## Phase 6 — Survival leaderboard

**Depends on P3 (score on death).** The append-only D1 work.

1. A leaderboard for survival on Newsheepdogland: submit the score (flock size, Q2) on death via the existing REST path, partitioned by `(scene='newsheepdogland', mode='survival')`. Add the migration if the partition/schema needs it (Q1/Q2); reuse the existing `score` column if score = flock size fits.
2. Read + display the survival leaderboard (the run-summary screen + the global leaderboard view).

**Acceptance (EARS):**

- When a survival run ends, then the flock-size score shall be submitted to the `newsheepdogland` / `survival` leaderboard partition.
- When the leaderboard is read, then survival scores shall be returned ranked by flock size.
- When a D1 migration is added, then it shall be append-only (a new sequence-numbered file; no edit to an applied migration).
- When the run-summary screen shows, then the player's score and rank shall be visible.

## Phase 7 — Whole-island grass + minimap

**Independent of the survival loop; can run parallel to P3-P6.** The two "reach" features. Spike the grass perf budget first.

1. **Grass across the whole island**: rearchitect the density/LOD so grass covers Newsheepdogland (not just the foot) within the draw-call budget. Use stochastic dither + distance decimation (per the grass-discipline rule); the coastline SDF still culls grass at the shore. Measure draw calls + frame time desktop + mobile; do not balloon the chunk count.
2. **Minimap** (Q5): a top-right minimap that orients the player — a baked top-down island image (from the heightmap + coastline) with live markers for the dog, pen, flock, and wolves. Polished, pastoral styling, pointer-events none.

**Acceptance (EARS):**

- When Newsheepdogland renders, then grass shall cover the playable island (not just the foot), with no draw-call blowup that regresses frame time beyond the agreed budget desktop + mobile.
- While grass renders past the shoreline, then the coastline SDF cull shall keep it on land (no grass on the water).
- When the minimap renders, then it shall show the island shape top-right with live dog / pen / flock / wolf markers, updating as they move.
- When the minimap renders, then it shall be pointer-events none (never eats a touch) with no console error.

## Phase 8 — Validation + browser smoke + ship

**Depends on all prior phases.**

1. Full validation: `npm test`, `npm run lint`, worker `tsc`, `npm run build` (record any bundle ratchet in [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json)). Confirm the sim-baseline is **byte-identical** (the survival sim is client-side; any diff is a leak — stop and find it).
2. Browser smoke (preview, `SDS_SUPPRESS_BROWSER_OPEN=1`, close every tab/listener after): a full survival run on Newsheepdogland — start at 10, herd through the gate, sheep retire in the pen, race dusk, survive a wolf night, grow +5, then die and see the score on the leaderboard. Desktop + mobile, zero console errors. Save proof under `cycle66-validation/`.
3. Ship: commit the phases, push to `main`, confirm the GH Actions deploy is green, verify Newsheepdogland on prod (scene loads, terrain bin 200, leaderboard partition live).

**Acceptance (EARS):**

- When `npm test`, `npm run lint`, worker `tsc`, and `npm run build` run at cycle close, then all shall pass.
- When the sim-baseline suite runs, then all fixtures shall be byte-identical (renamed only; no deterministic-sim change).
- When the browser smoke completes, then a full survival run (start, herd, retire, wolf night, growth, death, score) shall be verified desktop + mobile with no console error, proof under `cycle66-validation/`.
- When the close commit lands on `main`, then the deploy shall succeed and Newsheepdogland shall be live with survival mode.

## Dependencies

```
Phase 1 (rename) ──► everything downstream uses the new id
Phase 2 (pen barrier + objective) ─┬─ Phase 3 (survival loop + UI) ─┬─ Phase 6 (leaderboard)
                                   └─ Phase 4 (wolves) ── Phase 5 (bark redesign)
Phase 7 (grass + minimap) ── parallel to 3-6
                                                          all ──► Phase 8 (validate + ship)
```

## Frozen files (cycle-specific authorization)

The durable fence is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). This cycle is **authorized** to touch:

- [`shared/scenes/types.js`](../shared/scenes/types.js) — **additive** survival/wolf/pen config fields, optional with defaults.
- The **scene-id rename** across [`shared/scenes/index.js`](../shared/scenes/index.js), the scene + coast modules, `public/terrain/*.bin`, the sim-baseline fixture (rename, byte-identical content), and tests. Migration story: a `?scene=wolf-coast` redirect or hard cutover (P1).
- **D1 migrations** ([`worker/migrations/`](../worker/migrations/)) — new append-only files only, for the survival leaderboard partition + the scene-id rename (Q1/Q2). Never edit an applied migration.
- [`shared/BarkImpulse.js`](../shared/BarkImpulse.js) — **additive only**: a wolf-repel that never alters the sheep-cone math (sim-baseline stays byte-identical). If the wolf-repel can be client-side, prefer that and leave BarkImpulse untouched.

Everything else (the survival loop, wolves, pen containment, minimap, grass, HUD, scene *data*) is outside the fence.

## Hard stops

Durable stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. **Keep the survival sim solo + client-side.** Wolves, the loop, and pen containment are client controllers (the day-loop precedent). Do not promote them to deterministic `shared/` this cycle — that is the co-op cycle. If the work starts needing a `shared/` movement/boundary/collision change, stop.
2. **Sim-baseline stays byte-identical.** This cycle does not change the deterministic sheep sim. The only fixture change allowed is the **rename** of `coastline-wolf-coast-60hz.json` (content identical). Any other fixture diff is a leak — find it, do not regenerate.
3. **D1 migrations are append-only.** New sequence-numbered files only; never edit an applied migration. The scene-id rename + survival partition each need a written migration story.
4. **Don't decompose `GrassSystem` or `OptimizedSheep`** (cohesive by design). The whole-island grass is a density/LOD rearch inside `GrassSystem`, not a split.
5. **Don't auto-bump the version.** Newsheepdogland survival becoming a player-visible release is Matt's explicit call.
6. **No co-op, no wire-protocol change** this cycle. Survival is solo.

## What NOT to do during this cycle

- Don't promote the survival sim / wolves into deterministic `shared/` (that is the co-op cycle).
- Don't change the deterministic sheep sim or regenerate sim-baselines (rename the one fixture only).
- Don't reach for Blender / external 3D tools; reuse `Wolf.glb`, the procedural bakes, and scene data.
- Don't decompose `GrassSystem` / `OptimizedSheep`.
- Don't auto-bump the version or auto-post devlog/marketing.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each. Don't pre-check.

- [x] When the cycle closes, all 8 phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover. (P1-P8 shipped; the full alpine mountain-leg grass coverage is deferred to a perf spike, recorded in BACKLOG.)
- [x] When the island loads, then it shall be **Newsheepdogland** (id + display name), with no functional `wolf-coast` reference remaining. (P1; grep-clean.)
- [x] When the player herds sheep through the gate, then they shall retire inside the pen (no zap, no teleport), and the fence shall be a real barrier (gate-only entry). (P2; pen-containment tests + browser smoke.)
- [x] When a survival run plays, then it shall start at 10 sheep, run a ~10-minute day to dusk/night, and have no sheep-count selection. (P3; browser-verified flock 10 / maxFlock 200.)
- [x] When night ends, then under-33% loss shall grow the flock +5 and advance the day, and 33%+ loss shall end the run. (P3; survival-run tests.)
- [x] When night falls, then wolves shall hunt sheep outside the pen, and sheep inside the closed pen shall be safe. (P4; browser smoke - 4 wolves day 3, killed 4/10, none breached the pen.)
- [x] When the dog barks, then sheep shall be pushed (byte-identical) and wolves shall flee at a longer range. (P5; bark repelled all 4 wolves; sheep-cone math untouched.)
- [x] When a run ends, then the flock-size score shall post to the Newsheepdogland survival leaderboard. (P6; worker survival-leaderboard tests + submit-on-death wiring + run-summary read.)
- [~] When Newsheepdogland renders, then grass shall cover the whole island (within the draw-call budget) and a polished top-right minimap shall orient the player. (Minimap shipped + browser-verified. Grass widened to blanket the whole survival PLAY surface - 745 chunks, within budget - but the literal whole-island alpine coverage is deferred to a perf spike per the grass-discipline rule. See BACKLOG.)
- [x] When `npm test`, `npm run lint`, worker `tsc`, and `npm run build` run, then all shall pass and the sim-baseline shall be byte-identical (renamed fixture only). (1078 tests pass; lint + worker tsc clean; build green; sim-baseline byte-identical.)
- [x] When the close commit lands on `main`, then the deploy shall succeed and Newsheepdogland survival shall be live. (Verified post-push below.)

## References

- [`docs/archive/cycles/cycle-65-plan.md`](archive/cycles/cycle-65-plan.md) — the homestead + day loop this builds on
- [`js/gamestate/dayLoop.js`](../js/gamestate/dayLoop.js) — the client day controller the survival loop extends
- [`js/Wolf.js`](../js/Wolf.js) + `assets/models/Wolf.glb` — the wolf renderer/animation asset
- [`shared/BarkImpulse.js`](../shared/BarkImpulse.js) — the sheep bark cone to keep + extend with a wolf-repel
- [`js/StructureBuilder.js`](../js/StructureBuilder.js) — the pen ring + gate (the barrier to make real)
- [`js/GrassSystem.js`](../js/GrassSystem.js) — the grass system to rearch for whole-island coverage
- [`worker/migrations/`](../worker/migrations/) — append-only D1 migrations for the survival leaderboard + rename
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) + [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) + [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) — the durable rules this cycle stays inside
