# Cycle 122 - N pastures

> Authored 2026-07-26 from a read-only trace. **The riskiest cycle in the program and deliberately last.** This is deterministic-sim work that moves a sim-baseline fixture and touches live multiplayer rooms. Read [`../.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) and [`../.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) in full before touching anything. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first.

## Goal

Island competitive stops using Home Field's geometry. Every player gets their own pasture on the scene they are actually playing, which needs [`shared/CompetitiveLayout.js`](../shared/CompetitiveLayout.js) made scene-aware. D24.

## What the trace found

**1. The defect is exactly as D23 describes, and it is a hardcode, not a bug.** [`shared/CompetitiveLayout.js`](../shared/CompetitiveLayout.js):16 `generateCompetitiveGateLayout(playerCount)` takes **only a player count**. Its 2, 3 and 4-player tables are Home Field coordinates written out longhand: gates at `(0, +-100)` and `(+-100, 0)`, pastures spanning to `+-130`. Rolling Hills is a 180 m island, so a pasture at z=130 is well past the shoreline and the gates sit in open water. Open Country is 380 m and has a portal objective rather than pastures at all.

This was already true before Cycle 117. The corral was what island competitive actually fell back on, and Cycle 117 removed it while deliberately leaving competitive on a layout rather than a null (D23's one binding constraint: **stays broken as before, never newly crashing**). Verify that constraint still holds at the start of this cycle before changing anything, because it is the baseline this cycle has to beat rather than break.

**2. The blast radius is four files and one fixture, and the fixture is not where the fence thinks it is.**

Consumers of `generateCompetitiveGateLayout`:

- [`shared/CompetitiveMode.js`](../shared/CompetitiveMode.js):216, the only real caller
- [`shared/GameStateValidation.js`](../shared/GameStateValidation.js):244 and [`shared/index.js`](../shared/index.js):114, both re-export shims
- the Worker's bundled copy, which is the same `shared/` source

Every one of those files is on the deterministic-sim core list in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).

**The fixture is [`tests/sim-baseline/competitive.json`](../tests/sim-baseline/competitive.json)** (21,137 bytes, a 2-player race trace), driven by `tests/sim-baseline/competitive.spec.ts:151-152`. Note carefully: it sits **directly in `tests/sim-baseline/`, not in `tests/sim-baseline/__fixtures__/`**, and the fence entry reads `tests/sim-baseline/__fixtures__/*.json`. So **the fence glob does not cover it** while [`shared-sim.md`](../.claude/rules/shared-sim.md) plainly does ("`tests/sim-baseline/*.json` capture 60Hz traces"). That is an inconsistency between the rule and the fence, not a licence. **Treat `competitive.json` as fenced and authorise it explicitly below.** Fixing the fence glob so the two agree is a one-line edit to `INTERFACE_FENCE.md` and is authorised in Phase 1 for that purpose only.

**3. This is the only cycle in the program that can desync a live room.** Everything else in 112 to 121 is render-path or docs. `shared/` runs byte-identically on the Worker and every connected client, and a client on the old layout joining a room on the new one is the exact case [`multiplayer.md`](../.claude/rules/multiplayer.md) demands a written migration story for.

## Phase 1 - The migration story, written before any code (~2hr)

`multiplayer.md` requires four pieces for a wire or sim contract change, and this cycle has to produce all four **before** Phase 2 starts, not alongside it:

1. **Name the change** in the phase scope.
2. **The in-flight-session story.** A room mid-round when the deploy lands has a Worker on the new layout and clients on the old one. Decide and record: does the DO refuse, soft-degrade, or version-tag? The v3 protocol's per-client soft-degrade is the precedent worth reading first.
3. **Every consumer that needs updating**, listed. The client predictor, the DO, and every test that asserts layout shape.
4. **An explicit acceptance line** confirming the story is implemented.

Also in this phase: reconcile the fence glob so `tests/sim-baseline/competitive.json` is covered by the same entry that covers its siblings.

**Acceptance (EARS):** When Phase 1 ships, then this plan shall carry all four `multiplayer.md` pieces and no code shall have changed. When Phase 1 ships, then `INTERFACE_FENCE.md`'s sim-baseline entry shall cover `tests/sim-baseline/competitive.json`.

## Phase 2 - Scene-aware layout (~4hr)

**Depends on Phase 1.** `shared/` only.

1. `generateCompetitiveGateLayout` takes the scene's geometry alongside the player count. Derive the ring of pastures from the scene's own bounds rather than from a table, so a new scene needs no new table.
2. **Home Field must come back bit-identical.** It is the only scene competitive has ever worked on, `competitive.json` is a Home Field trace, and a derived layout that reproduces the hand-written table exactly is the proof the derivation is right. If Home Field moves, the derivation is wrong. This is the same proof shape Cycle 117 used for the square-versus-rect barrier.
3. No `Math.random`, no non-spec-pinned transcendentals. The layout is pure geometry and must stay so.

**Acceptance (EARS):** When Phase 2 ships, then Home Field's competitive layout shall be bit-identical to the hand-written table and `competitive.json` shall be byte-identical. When a scene declares bounds, then its competitive layout shall be derived from those bounds rather than from a per-scene table. If a scene cannot support N pastures, then the layout shall degrade deliberately rather than producing geometry outside the scene.

## Phase 3 - The island layout (~4hr)

**Depends on Phase 2.** Only now does anything move.

1. Rolling Hills gets N pastures inside its own island. This is the first change that legitimately moves `competitive.json`, and only if the fixture's scene changes; if the fixture stays a Home Field trace, Phase 2's byte-identical result should still hold and that is the better outcome. **Decide which, explicitly, and record it here.**
2. Open Country has a portal objective and no pastures. Say what competitive means there, or state that it stays out of scope and why.
3. The pen fence: D23 records that `_penBarrier` is deliberately null in competitive and timed, so the new pasture fences are not solid there. That is the known cost this cycle is meant to remove. Removing it is deterministic-sim work in its own right, so it lands here with its own acceptance rather than as a side effect.

**Acceptance (EARS):** When Phase 3 ships, then Rolling Hills competitive shall place every pasture inside the island. When any sim-baseline fixture moves, then the decision shall be recorded in this plan per `shared-sim.md`, with the diff read rather than regenerated as a shortcut. When Phase 3 ships, then competitive pasture fences shall be solid or the plan shall record why they are not.

## Phase 4 - Multiplayer verification (~3hr)

Unit tests cannot catch a desync. This phase runs the thing.

1. A real room, real clients, the Worker's authoritative sim against the client predictor, on Rolling Hills competitive.
2. The migration story from Phase 1 gets exercised, not asserted: an old-protocol client against a new Worker.
3. Watch for the failure mode `shared-sim.md` describes: divergence surfaces several seconds late and only at scale, so a short clean run proves little.

**Acceptance (EARS):** When Phase 4 ships, then a multi-client competitive round shall have been played on Rolling Hills with no observed desync. When an old-layout client joins a new-layout room, then the behaviour shall match what Phase 1 recorded.

## Frozen files

All authorised for this cycle, per the protocol in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). Every entry needs its migration story filled in during Phase 1; **this list is the scope, not the authorisation** until that is done.

- **[`shared/CompetitiveLayout.js`](../shared/CompetitiveLayout.js)** - the signature change. Migration story: Phase 1.
- **[`shared/CompetitiveMode.js`](../shared/CompetitiveMode.js)** - the one real caller, updated in the same phase.
- **[`shared/GameStateValidation.js`](../shared/GameStateValidation.js)** and **[`shared/index.js`](../shared/index.js)** - re-export shims, updated in the same phase.
- **[`tests/sim-baseline/competitive.json`](../tests/sim-baseline/competitive.json)** - authorised for Phase 3 only, and only if Phase 3 records the decision. **Phase 2 must leave it byte-identical.**
- **[`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md)** - authorised for Phase 1, one edit only: widening the sim-baseline glob so it covers `competitive.json`. An addition that strengthens the fence.

## Hard stops

1. **No code before Phase 1's migration story is written.** `multiplayer.md` requires four pieces and a change without them is a fence violation.
2. **Home Field bit-identical through Phase 2.** If it moves, the derivation is wrong and the phase stops.
3. **No blanket fixture regenerate.** Read the diff. `shared-sim.md`'s stricter bar applies: any unexplained ULP drift outside the one authorised fixture aborts the phase.
4. **Competitive must never newly crash.** D23's constraint holds until the moment this cycle replaces it. Broken-as-before is acceptable at every intermediate commit; a null dereference is not.
5. **No `Math.random` and no unpinned transcendentals in the layout.**
6. **No ratchet bump.**

## Explicitly out of scope

- **The seasonal leaderboard.** Its own Worker and D1 cycle.
- **Timed mode's layout.** D23 left competitive and timed together; this cycle names competitive. If timed falls out for free, say so; do not go looking for it.
- **Newsheepdogland competitive.** Still gated per D19.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to [`BACKLOG.md`](BACKLOG.md) carryover.
- [ ] When `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` run at cycle close, all four shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Phase 1 ships, then all four `multiplayer.md` migration pieces shall be recorded here.
- [ ] When Phase 1 ships, then the fence glob shall cover `tests/sim-baseline/competitive.json`.
- [ ] When Phase 2 ships, then Home Field's layout shall be bit-identical and `competitive.json` byte-identical.
- [ ] When a scene declares bounds, then its competitive layout shall be derived from them rather than from a table.
- [ ] When Phase 3 ships, then every Rolling Hills competitive pasture shall lie inside the island.
- [ ] When any fixture moves, then the decision shall be recorded here with the diff read.
- [ ] When Phase 4 ships, then a multi-client competitive round shall have been played with no observed desync.
- [ ] When the cycle closes, then competitive shall never crash on any scene.
- [ ] When the cycle closes, then `bundle-sizes.json` shall be unmodified.

## References

- [`front-door-roadmap.md`](front-door-roadmap.md) - the Cycle 122 entry
- [`../DECISIONS.md`](../DECISIONS.md) - D23 (leave competitive as it is for now), D24 (N pastures, its own cycle)
- [`../.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - the deterministic-sim contract and the fixture discipline
- [`../.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) - the four pieces a contract change owes
- [`archive/cycles/cycle-117-plan.md`](archive/cycles/cycle-117-plan.md) - the square-versus-rect bit-identity proof shape Phase 2 reuses
