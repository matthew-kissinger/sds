# Cycle 117 - island-pasture

> Authored 2026-07-25 from a six-agent reconnaissance pass. **Rewritten the same day** after a four-agent read-only spike answered the gating question with measurements rather than inspection, and shrank the cycle substantially. **This is a deterministic-sim cycle.** Read [`../.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) in full before touching anything.

## Goal

Rolling Hills' objective stops being a red flag over an invisible radius that fires lightning, and becomes a place you drive sheep into. Today the corral is `{ center, radius }` with an 8m trigger, so the zap has to carry all the meaning of "that counted", which is why it reads as arbitrary. After this cycle the island has a fenced pasture with one open gate, sheep retire on entering it and settle inside, and the lightning is gone from gameplay.

## What the spike changed

**1. The gating question is answered, and it was measured.** A bare pasture rect on Rolling Hills holds nothing: driving the real `shared/` sim through the sim-baseline harness, 60 sheep started inside and **60 leaked, 0 stayed**; 60 pushed at a wall with no gate, **57 got in**. The same run with `shared/survival/pen.js`'s `PenContainment` placed verbatim at Rolling Hills coordinates: **60/60 held, 0/60 wall entries, 34/40 driven in through the gate and settled.** Probe at [`../cycle117-validation/pasture-containment-spike.mjs`](../cycle117-validation/pasture-containment-spike.mjs).

**2. The cycle believed it had two problems and it has one.** Keeping retired sheep *in* is `state = 2` plus zeroed velocity ([`shared/GameStateValidation.js`](../shared/GameStateValidation.js):105-113), which is geometry-independent and already works on the island. Only keeping un-retired sheep *out* depends on Home Field's pasture sitting outside the boundary rect, and `pen.js` solves exactly that. The retirement threshold is not new work either: `pen.js` gets it free from its own invariant, "non-gate crossings are blocked, so inside implies entered via the gate" (`shared/survival/pen.js:26-30`, implemented at `:212-221`).

**3. The gate-predicate fix is NOT in this cycle.** The draft's Phase 2 wanted to derive the crossing direction from the gate's facing and the passage zone from the gate's position. Both defects are real and confirmed at the exact lines claimed, and a correct fix is **bit-identical on Home Field at the IEEE-754 level** with all sim-baseline fixtures unmoved. But the recommended design detects entry by box-inside test, not by `gate.passageZone` crossing, so `shared/index.js:237-249` and `shared/GameStateValidation.js:89` never need touching. The fix also drags a live Newsheepdogland null-dereference that it un-hides, which needs its own decision. Deferred whole, to its own cycle.

**4. Do not add a top-level `gate:` to `shared/scenes/rolling-hills.js`.** This is the single most important design constraint in the cycle. `shared/index.js:232-249` derives `gameState.gate` from `scene.gate?.position`, and a non-null `gameState.gate` switches on Worker gate-attraction the island has never had (`worker/src/GameSim.js:947-950, 1291`) and lights up the x=0 passage-zone suppression rect. **Declare the gate nested inside the pasture descriptor**, where `createGameState` does not read it. That one choice keeps `gameState.gate` null on Rolling Hills exactly as it is today and neutralises the whole multiplayer blast radius.

**5. The corral retirement divergence is real but is not a desync.** The Worker walks a retired sheep to a seeded point inside the corral; the client zaps it and leaves it. Confirmed. But the trigger predicate is byte-identical on both sides, so counts and timing agree, and the post-retirement split is fully masked by server authority with flags riding every frame and one-frame correction latency. It is a cosmetic double-path, not a state divergence, and Phase 3 removes the Rolling Hills half as a side effect. No phase is framed around it.

**6. The fixture blast radius is one file.** `island-boundary-rh-60hz.json` is **proven byte-identical** with the corral removed, by replaying `baseline.spec.ts:273`'s exact construction both ways rather than by inspection. Only `corral-retirement-rh-60hz.json` moves, and it needs a **spec rewrite, not a regenerate**, because `tests/sim-baseline/baseline.spec.ts:347-349` dereferences `state.corral.center.x` and throws the moment the field is gone.

## The leaderboard: D12's premise was false, and the re-decision is D22

D12 authorises resetting Sheep Dog Island's solo leaderboard on the basis that the affected boards hold "2 rows, both Dev test entries, zero player-authored scores". A direct read-only query against remote D1 (not the public API, which hard-excludes anomaly-flagged rows at `worker/src/d1.ts:1179-1181` and collapses many rows to one per player at `:1210`, and therefore could not have seen this) found otherwise:

- **`id=16` is a genuine 12.6-minute human playthrough**, the Cycle 57 incident run, un-flagged by hand in production. It reads `Dev#0002` only because its owner used the rename endpoint that shipped in the same cycle. **Cycle 58 put the 200-sheep rung on Rolling Hills specifically to keep this row comparable**, and that rationale is still live in `shared/scenes/rolling-hills.js:94-99` and in two test comments.
- **`id=23` belongs to `Pakrohk#0001`**, a genuine outside player.

D12's own escape clause fires here: *"If a real score has appeared by then, archive as all-time instead and start a new board for the gate objective."* Archiving and resetting are different pieces of work, so the choice went back to Matt.

**ANSWERED 2026-07-25 as D22.** Shown the real data, Matt chose reset. Scope is ids **16 and 21 only**, never `scene_id`; `id=23` (`Pakrohk#0001`) is untouched. Archive first, then a new append-only `worker/migrations/0011_*.sql` (`0001` to `0010` are immutable), applied by the deploy workflow's migrate job. No raw DELETE against production.

**What actually shipped, and the deviation.** [`worker/migrations/0011_reset_island_solo_rows.sql`](../worker/migrations/0011_reset_island_solo_rows.sql) archives the two rows into a `score_submissions_archive` table and then deletes them, with the DELETE guarded on the archive holding the row so a failed archive cannot lose data. Verified against a scratch SQLite: 16 and 21 archived with every column and removed, 23 untouched, idempotent on re-apply.

D22 asked for the archive to be a **committed artifact**. It is a database table instead, for two reasons. No credential on the authoring machine can read remote D1: `CLOUDFLARE_API_TOKEN` in `~/.config/mk-agent/env` is expired (token verify returns 401) and `CLOUDFLARE_OPS_TOKEN` / `CLOUDFLARE_BOOTSTRAP_TOKEN` are valid but carry no D1 scope, so the repo's `CF_API_TOKEN` Actions secret is the only thing that can see the table. And `score_submissions` carries `persistent_id`, which is half of a player's auth pair and does not belong in a public repository. The archive table keeps every column, so a restore is one `INSERT ... SELECT`.

**The migration is held unpushed until the pasture ships.** Pushing it runs the migrate job against production. The reset's whole rationale is that the old times are not comparable under the new objective, so it lands with the cycle close, not before it. Every phase before the close is still read-only against production: nothing applies, nothing deletes, and 0011 rides no earlier commit.

## Open questions for Matt, surfaced not answered

1. ~~**Leaderboard: archive as all-time, or reset, or accept incomparable history?**~~ **ANSWERED as D22:** reset, scoped to ids 16 and 21, archive first. See the leaderboard section above.
2. ~~**Rolling Hills competitive and timed.**~~ **ANSWERED as D23:** leave them exactly as they are. `shared/CompetitiveLayout.js:16-30` already hardcodes Home Field geometry regardless of scene, so island competitive was using the wrong layout before this cycle and still is. `allowedModes` is NOT narrowed. The one binding constraint: dropping the corral removes what competitive fell back to, so it must stay **broken as before, not newly crashing** - it lands on a layout, never on a null. `_penBarrier` is deliberately null in competitive and timed, so the new pasture fence is not solid there; that is the known cost of leaving the modes untouched, and D24 schedules the real fix (N pastures, one per player) as its own cycle because it needs `CompetitiveLayout` made scene-aware, which moves `competitive.json`.
3. **Findability.** The tall flag pillar and the lightning zap are the island's "find it from the far shore" affordance and its retirement feedback. Cycle 116's gate cue replaces both in principle; Phase 5 verifies it does in practice, and if it does not, that is a design call rather than a bug.

## Phase 1 - Generalise the barrier (~3hr)

`shared/` only. No scene data moves, so nothing can regress.

1. `shared/survival/pen.js` moves to `shared/PenBarrier.js` with a one-line re-export shim at the old path. Three import sites: `worker/src/GameSim.js:53`, `js/gamestate/penContainment.js:9`, `tests/pen-containment.spec.js:14`. Per [`scene-and-render.md`](../.claude/rules/scene-and-render.md)'s "files name WHAT, not WHEN", `survival/` names a campaign and after this cycle the module is not survival-scoped.
2. The constructor (`:50-56`) accepts `{minX, maxX, minZ, maxZ}` alongside `{center, radius}`. Roughly 8 lines. Nothing downstream changes: every other method already reads only `this.minX/maxX/minZ/maxZ`, plus `this.cx/cz` for the `onVertical` edge pick at `:64`.
3. Add rect cases beside the 9 existing square cases in `tests/pen-containment.spec.js`.

**Acceptance (EARS):** When Phase 1 ships, then all 10 sim-baseline fixtures shall be byte-identical, since no scene data has moved. When a rect pasture is constructed, then every barrier method shall behave as it does for a square.

## Phase 2 - Scene data and capability gating (~3hr)

**Depends on Phase 1.**

1. `shared/scenes/types.js` widens `PenDef` (`:55-58`) to the rect form and carries the **nested** gate. See Frozen files for the migration story.
2. `shared/scenes/rolling-hills.js` drops `corral` (`:34-37`) and gains the pasture. Site it where the heightfield is flat enough; the island has real relief.
3. Three call sites currently gate the pen on *survival* rather than on *the scene having one*. All three widen to a scene-capability test: `js/boot/initWorld.js:308` and `:311`, `js/main.js:2651`/`:2662`, `worker/src/GameSim.js:2038`. `gateOpen = true` unconditionally on scenes with no day loop.
4. **No top-level `gate:` field.** Finding 4. A spec asserts `gameState.gate` is null on Rolling Hills, so a future edit cannot quietly switch on gate attraction.

**Acceptance (EARS):** When Rolling Hills loads, then it shall declare a pasture with a nested gate and no corral. When Rolling Hills loads, then `gameState.gate` shall be null and a spec shall fail if it is not.

## Phase 3 - Retirement, scoring, and the one fixture (~3hr)

**Depends on Phase 2.**

1. `PenBarrier.penned` drives `sheepRetired` and completion on both the Worker and the client for Rolling Hills. The island's corral retirement path goes: client `checkCorralAndRetire` (`js/OptimizedSheep.js:2457`) and the `corral-retired` dispatch (`js/GameState.js:354-363`). **Open Country keeps `updateSheepCorralRetirements` unchanged.**
2. `corral-retirement-rh-60hz.json` becomes a pasture-retirement spec and self-captures on first run (`loadOrWriteFixture` writes when the file is absent, `baseline.spec.ts:49-59`). **This is a spec rewrite, not a regenerate.** The decision is recorded in this Acceptance per `shared-sim.md`.
3. **Do not pass `UPDATE_FIXTURES`.** The other ten do not move, and a blanket regenerate would hide it if they did.

**Acceptance (EARS):** When a sheep is driven through the island gate, then it shall retire and settle inside the pasture. When Phase 3 ships, then `island-boundary-rh-60hz.json` shall be byte-identical and the eight other surviving fixtures shall be untouched. When `corral-retirement-rh-60hz` is replaced, then the replacement shall be a rewritten spec with this decision recorded, not a regenerated JSON.

## Phase 4 - The pasture as built geometry (~3hr)

**Depends on Phase 2.**

1. `js/StructureBuilder.js` builds the fence ring and gate on the heightfield, reusing Cycle 115's fence authoring, wear, sag on long runs, and openable gate.
2. Retire the zap pool and flag pillar for Rolling Hills (`js/boot/initWorld.js:656-659`). **Do not delete `js/effects/CorralZapEffect.js`** - D15 keeps the module one more cycle so the pasture can be reverted without a restore.

**Acceptance (EARS):** When a sheep retires on Rolling Hills, then no zap shall fire. When Phase 4 ships, then `js/effects/CorralZapEffect.js` shall still exist. When Phase 4 ships, then neither `main-*.js` nor `three-*.js` shall have grown past its ratchet.

## Phase 5 - Legibility and copy (~2hr)

1. `CorralCompass` and Cycle 116's `js/world/gateCue.js` retarget from the corral centre to the pasture gate. Cycle 116 built the descriptor to make this a data change.
2. Copy pass. `shared/scenes/rolling-hills.js:19` currently reads "a hidden corral. Find it", plus `js/locales/*`, `js/utils/seo.js`, and the public scene pages. Apply [`prose-and-voice.md`](../.claude/rules/prose-and-voice.md).

**Acceptance (EARS):** When Rolling Hills loads, then the gate cue shall point at the pasture gate. When the cycle closes, then no player-facing copy shall describe a hidden corral.

## Phase 6 - The browser probe and the goldens (~2hr)

Not optional padding. Boot Rolling Hills, look at the pasture with [`tools/validation/homestead-probe.mjs`](../tools/validation/homestead-probe.mjs), then `npm run validation:screenshots -- --diff` and re-baseline only once the delta is confined to what changed.

**Acceptance (EARS):** When Phase 6 ships, then Rolling Hills shall have been viewed in a browser. When the goldens are re-baselined, then the delta shall have been read with `--diff` first.

## Phase 7 - Leaderboard disposition (~1hr)

**Rewritten 2026-07-26.** The phase was authored as read-only because the archive-versus-reset choice was still open. D22 closed it, so the phase now ships the reset that D22 authorises. The read-only framing was correct while the question was open and is superseded, not overridden.

1. Archive the affected rows so they stay recoverable, then delete them. Both happen inside [`worker/migrations/0011_reset_island_solo_rows.sql`](../worker/migrations/0011_reset_island_solo_rows.sql): a `score_submissions_archive` table takes every column, and the DELETE is guarded on the archive holding the row, so a failed archive cannot lose data.
2. Scope is ids **16 and 21 only**. Never `scene_id`. `id=23` is untouched.
3. The migration is **held out of every commit before the close**, because it applies to production D1 the moment it lands on `main` and the reset only makes sense once the new objective exists.

**Acceptance (EARS):** When Phase 7 ships, then rows 16 and 21 shall be archived with every column into `score_submissions_archive` before being deleted, and the DELETE shall be guarded on the archive holding the row. When Phase 7 ships, then `id=23` shall be untouched and no statement shall reference `scene_id`. If the archive is empty or absent, then the DELETE shall remove nothing.

## Phase 8 - Gate, docs, close (~2hr)

## Frozen files

- **`shared/scenes/types.js`** - `PenDef` widens to accept a rect and a nested gate. **Migration story:** both new fields are optional additions, so every existing `PenDef` (Newsheepdogland's `{center, radius}`) parses unchanged; no consumer needs updating in the same PR beyond `PenBarrier`'s constructor, which accepts both forms. The alternative considered was a new `PastureDef` type, rejected because it would give the same object two names and force every consumer to branch. The JSDoc at `:341-343` is also false today ("corral replaces gate+pasture when present") and is corrected in the same edit.
- **`tests/sim-baseline/__fixtures__/corral-retirement-rh-60hz.json`** - authorised for Phase 3, replaced by a rewritten spec with the decision recorded in that phase's Acceptance, per `shared-sim.md`.
- **`shared/survival/pen.js`** is **not** fenced. Only 13 of `shared/`'s 38 tracked files are named in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md), and this is not one. The re-export shim in Phase 1 preserves every existing import regardless.
- **`docs/INTERFACE_FENCE.md`** - **authorised, one entry ADDED.** The file freezes itself (`:59`). The edit adds `shared/PenBarrier.js` to the Deterministic sim core list and nothing else. **Migration story:** the module was correctly unfenced while it ran only in survival, and the plan says so at the entry below. This cycle made it the authoritative retirement predicate for Sheep Dog Island, a scene with ranked solo rungs, running byte-identically on the Worker and the client - which is the definition of the list it is being added to. An addition strengthens the fence rather than relaxing it, which is why it is recorded here rather than surfaced as a blocking question; a removal or a relaxation would not be.

- **`.claude/rules/prose-and-voice.md`** - **authorised, split per Matt's call 2026-07-26.** [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md):64 freezes `.claude/rules/*.md`: "edit when the rule itself changes, not for cycle-specific guidance (that goes in the active cycle plan)". A Phase 5 agent edited it unauthorised; the review caught it and it was surfaced rather than self-authorised. **Migration story:** the rule's per-biome entry described Rolling Hills as having a "lightning-zap corral", which this cycle deleted. That is the rule describing the game, and the game changed, so correcting it to "a fenced pasture with one gate" is squarely "edit when the rule itself changes" - and leaving it would have had the next session write the retired copy back out of the rule itself, since the file is loaded as project context every session. The agent also appended a sentence flagging corral/lightning/hidden copy as stale; that is cycle-specific guidance, so it was stripped from the rule and lives here instead:

  > **Copy guidance for this cycle.** Any player-facing text that describes Rolling Hills with "corral", "lightning", "zap" or "hidden" is stale. The island's destination is a fenced pasture with one gate at (50, -58), south-east of the island centre. Phase 5 swept `shared/scenes/rolling-hills.js`, `js/locales/*`, `js/utils/seo.js` and `public/scenes/rolling-hills.html`; check any surface added after that.

- **`tests/refactor-baseline/__fixtures__/scatter-positions.json`** - **authorised retroactively, decision recorded here.** The plan did not anticipate this file. Dropping the corral makes the tree and rock keep-outs inert (`shared/TreePlacement.js:203,275-280` rejects within `corral.radius + 5`; `js/world/rockPlacementPlan.js:114,137-140` within `+ 8`), so scatter would fall inside the new pasture and, once the fence goes up, through it. Teaching both an enclosure keep-out necessarily moves Rolling Hills' scatter: the keep-out geometry goes from a 13 m disc at (110, 60) to a 46 x 46 box at (50, -76), and the recorded entry moves `5a5e506c` to `f5985ac9`, count 60 to 56. **Only the `rolling-hills` entry changes**, edited by hand rather than regenerated; `field` and `open-country` stay byte-identical, and that is also the proof that the shared keep-out helper is behaviour-identical for corral scenes. The new `pen.scatterKeepOut` flag is an explicit opt-in so Newsheepdogland's baked layout is untouched, proven by a spec that generates NSL's trees with the pen removed entirely and asserts a byte-identical list. **This is the whole authorisation; no other `refactor-baseline` fixture may move.**

## Hard stops

1. **No leaderboard delete or update before the cycle close, and none outside `worker/migrations/0011_*.sql`.** Superseded in part by D22: the reset is authorised, scoped to ids 16 and 21, archive-first. What stays hard: no raw DELETE against production, no `scene_id` predicate, `id=23` untouched, and the migration does not ride any commit before the close. Real player rows exist; row 16 is the Cycle 57 incident run.
2. **No top-level `gate:` on Rolling Hills.** Finding 4. It switches on Worker behaviour the island has never had.
3. **`island-boundary-rh-60hz.json` must come back byte-identical.** It is proven so; if it moves, something unintended changed in the sim.
4. **No blanket `UPDATE_FIXTURES`.** Ten fixtures do not move and a blanket regenerate would hide it if they did.
5. **No `CorralZapEffect.js` deletion.** D15.
6. **Any unexplained ULP drift outside the one regenerated fixture aborts the phase**, per `shared-sim.md`'s stricter bar for sim cycles.
7. **No bundle ratchet bump.** A third bump is a bundle cycle and this is not it.

## Explicitly out of scope

- **The gate-direction and passage-zone fix.** Correct, minimal, bit-identical on Home Field, and deferred whole because this design does not need it and it drags a live Newsheepdogland null-dereference that needs its own decision.
- **Extending the `Boundary` discriminated union.** Wrong tool twice: `calculateBoundaryAvoidance*` only ever produces a steering force and a force does not contain, and all three dispatchers carry every one of the 11 fixtures.
- **Reusing Home Field's gate-plus-pasture retirement path.** Origin-locked and north-locked in three independent places, none of which survives a gate at (90, 60).
- **The `js/main.js:1950-1952` gameMode clobber.** Real, unrelated, its own bug entry.

## Success criteria (cycle close)

- [x] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [x] When `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` run at cycle close, all four shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [x] When Phase 1 ships, then all 10 sim-baseline fixtures shall be byte-identical.
- [x] When a rect pasture is constructed, then every barrier method shall behave as it does for a square.
- [x] When Rolling Hills loads, then it shall declare a pasture with a nested gate and no corral.
- [x] When Rolling Hills loads, then `gameState.gate` shall be null and a spec shall fail if it is not.
- [x] When a sheep is driven through the island gate, then it shall retire and settle inside the pasture.
- [x] When Phase 3 ships, then `island-boundary-rh-60hz.json` shall be byte-identical and the eight other surviving fixtures shall be untouched.
- [x] When `corral-retirement-rh-60hz` is replaced, then the replacement shall be a rewritten spec with the decision recorded, not a regenerated JSON.
- [x] When a sheep retires on Rolling Hills, then no zap shall fire.
- [x] When the cycle closes, then `js/effects/CorralZapEffect.js` shall still exist.
- [x] When the cycle closes, then neither `main-*.js` nor `three-*.js` nor the `other` chunk family shall have grown past its ratchet, and `bundle-sizes.json` shall be unmodified.
- [x] When Rolling Hills loads, then the gate cue shall point at the pasture gate.
- [x] When the cycle closes, then no player-facing copy shall describe a hidden corral.
- [x] When Phase 6 ships, then Rolling Hills shall have been viewed in a browser.
- [x] When the goldens are re-baselined, then the delta shall have been read with `--diff` first.
- [x] When Phase 7 ships, then rows 16 and 21 shall be archived with every column before deletion, the DELETE shall be guarded on the archive, `id=23` shall be untouched, and no statement shall reference `scene_id`.

## References

- [`../cycle117-validation/`](../cycle117-validation/) - the read-only spike probes that gated this cycle
- [`../cycle116-validation/PROBE_FINDINGS.md`](../cycle116-validation/PROBE_FINDINGS.md) - the browser probe, including the Rolling Hills findability finding
- [`front-door-roadmap.md`](front-door-roadmap.md) - where this cycle sits in the seven-cycle program
- [`../DECISIONS.md`](../DECISIONS.md) - D12 (leaderboard), D15 (lightning retires, module stays a cycle), D20 (roll continuously)
- [`../.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - the deterministic-sim contract this cycle operates under
- [`../.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) - Worker/DO contract
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`archive/cycles/cycle-116-plan.md`](archive/cycles/cycle-116-plan.md) - the gate cue this cycle retargets
