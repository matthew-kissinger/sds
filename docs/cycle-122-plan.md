# Cycle 122 - N pastures

> Authored 2026-07-26 from a read-only trace. **The riskiest cycle in the program and deliberately last.** This is deterministic-sim work that moves a sim-baseline fixture and touches live multiplayer rooms. Read [`../.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) and [`../.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) in full before touching anything. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first.

## Goal

Island competitive stops using Home Field's geometry. Every player gets their own pasture on the scene they are actually playing, which needs [`shared/CompetitiveLayout.js`](../shared/CompetitiveLayout.js) made scene-aware. D24.

## What the trace found

> **Corrected 2026-07-26 by a second read-only pass, before any code.** Three of the findings below changed and one of them invalidates Phase 2's stated mechanism. The original text is preserved where it was right; where it was wrong the correction says so plainly, per the practice that has paid for itself in every cycle from 117 on.

**1. The defect is exactly as D23 describes, and it is a hardcode, not a bug.** [`shared/CompetitiveLayout.js`](../shared/CompetitiveLayout.js):16 `generateCompetitiveGateLayout(playerCount)` takes **only a player count**. Its 2, 3 and 4-player tables are Home Field coordinates written out longhand: gates at `(0, +-100)` and `(+-100, 0)`, pastures spanning to `+-130`. Rolling Hills is a 180 m island, so a pasture at z=130 is well past the shoreline and the gates sit in open water. Open Country is 380 m and has a portal objective rather than pastures at all.

This was already true before Cycle 117. The corral was what island competitive actually fell back on, and Cycle 117 removed it while deliberately leaving competitive on a layout rather than a null (D23's one binding constraint: **stays broken as before, never newly crashing**). Verify that constraint still holds at the start of this cycle before changing anything, because it is the baseline this cycle has to beat rather than break.

**1b. CORRECTION - it is two stacked hardcodes, not one, and the second one is the worse of the pair.**

`bounds` is the **legacy rect-only field**. [`shared/scenes/types.js`](../shared/scenes/types.js):377 says so outright: "Legacy rect-only field; synthesised into `boundary` if present without `boundary`". Only Home Field declares it (`field.js`:24, `{ minX: -100, maxX: 100, minZ: -100, maxZ: 100 }`). **Rolling Hills and Open Country declare no `bounds` at all** - they carry `boundary: { kind: 'island', center, radius }` at radius 180 and 380 respectively, and Home Field carries no `boundary`.

So at [`worker/src/GameSim.js`](../worker/src/GameSim.js):340, `bounds: this.scene.bounds` evaluates to **`undefined` on every island**, and [`shared/CompetitiveMode.js`](../shared/CompetitiveMode.js):207 falls back to its own hardcoded default:

```js
bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }
```

which is Home Field's rect. That default then becomes `gameState.bounds`, which is what the competitive boundary clamp reads (`applyHardBoundaryConstraintsWithMultipleGates(sheep, gameState.bounds, ...)`). **Island competitive therefore clamps its sheep to a 200 m square that has nothing to do with the island, independently of where the gates are.** Fixing the layout table alone would leave this in place.

**1c. CORRECTION - Phase 2's stated mechanism does not exist.** Phase 2 says "derive the ring of pastures from the scene's own bounds". Islands have no bounds to derive from. The derivation has to read `boundary` and be **kind-aware**, which is the discriminated shape the codebase already uses everywhere else. That is a different job from reading a rect, and it is the single most important correction on this page. See the revised Phase 2.

**2. The blast radius is four files and one fixture.**

Consumers of `generateCompetitiveGateLayout`:

- [`shared/CompetitiveMode.js`](../shared/CompetitiveMode.js):216, the only real caller
- [`shared/GameStateValidation.js`](../shared/GameStateValidation.js):244 and [`shared/index.js`](../shared/index.js):114, both re-export shims
- [`worker/src/GameSim.js`](../worker/src/GameSim.js):29-30 - **CORRECTION: imports both `generateCompetitiveGateLayout` and `assignGatesToPlayers` and calls neither.** Dead imports. Deleting them is the whole of that consumer's migration, and it is worth doing in this cycle precisely because a dead import of a function whose signature is changing reads like a live consumer to the next person.

Every one of those files is on the deterministic-sim core list in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).

**The fixture is [`tests/sim-baseline/competitive.json`](../tests/sim-baseline/competitive.json)** (21,137 bytes, a 2-player race trace). It sits **directly in `tests/sim-baseline/`, not in `tests/sim-baseline/__fixtures__/`**, and the fence entry reads `tests/sim-baseline/__fixtures__/*.json`, so **the fence glob does not cover it** while [`shared-sim.md`](../.claude/rules/shared-sim.md) plainly does ("`tests/sim-baseline/*.json` capture 60Hz traces").

**CORRECTION: that location is deliberate, not an accident.** `competitive.spec.ts`:23-26 records the reason: "The phase plan (docs/hardening/phase-0-foundation.md [P0-DETTEST]) names this exact path, so unlike the legacy fixtures it lives at the directory root rather than in `__fixtures__/`." The fence glob simply never caught up with a deliberate divergence. That makes widening the glob the right fix and **moving the fixture the wrong one** - moving it would break the path its own phase plan names. **Treat `competitive.json` as fenced and authorise it explicitly below.**

**2b. The fixture is genuinely downstream of the function being changed**, which is what makes Phase 2's bit-identity proof work. `tests/sim-baseline/harness.js`:506 `makeCompetitiveGameState` delegates to the real `createCompetitiveGameState`, which calls `generateCompetitiveGateLayout(2)` at `CompetitiveMode.js`:216. A derivation that moves Home Field by one ULP will move `competitive.json`. The proof shape holds.

**2c. Island competitive is genuinely reachable, so Phases 3 and 4 are not speculative.** [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts):463 validates a client-supplied `sceneId` against the real scene list and stores it on room meta; `GameSim` loads it at :288. A competitive room on Rolling Hills is a thing a player can make today.

**3. The cardinal-ring derivation is PROVEN, not proposed.** Ran read-only against the shipped tables before writing Phase 2. With `R` = distance from centre to boundary, gate at the cardinal point at `R`, pasture from `R+2` to `R+30` at half-width 30, and the shipped per-count direction order:

```
2-player: IDENTICAL
3-player: IDENTICAL
4-player: IDENTICAL
PROVEN: one cardinal-ring derivation reproduces all three tables exactly (Object.is on every leaf).
```

`Object.is` on every numeric leaf, so a `-0` could not hide in it. **Phase 2's bit-identity requirement is satisfiable and the formula is known.** No trig: it is sign-and-axis, per Phase 2 item 5.

**3b. And running that same rule on the islands is how the pass earned its keep - it puts every island pasture in the sea.**

```
rolling-hills (r=180) 2P: gate z=180, pasture z 182..210
open-country  (r=380) 2P: gate z=380, pasture z 382..410
```

[`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js):391-398 is a **hard radial clamp** at `boundary.radius - margin`. A sheep physically cannot reach `z=182` on a 180 m island. Home Field gets away with pastures outside its boundary because it is a rect with gate passage plus an extended `+-35 m` retirement clamp (`GameSim` / harness, `bounds.minX - 35`); **the island clamp has no such carve-out.** So the derivation that is bit-identical on Home Field is unreachable on every island, and `outside the boundary` is the wrong side.

**The shipped precedent already says which side is right.** Cycle 117 put Rolling Hills' pen at `minX: 32, maxX: 68, minZ: -94, maxZ: -58` - corner distance about 116 m on a 180 m island, roughly `0.64R`, comfortably **inside**. That is what island retirement geometry looks like on this project when someone has actually stood in it.

**Consequence for Phase 2:** the derivation is not one rule with a scalar swapped, as Phase 2 item 1 hoped. It is **kind-aware in placement as well as in measurement** - `rect` places pastures outside the boundary and relies on gate passage, `island` places them inside and relies on the pen pattern Cycle 117 shipped. Write it as two named placements sharing one ring, not as one formula with a sign flip, so the next reader sees the asymmetry instead of tripping on it. Phase 3's acceptance line ("every Rolling Hills competitive pasture shall lie inside the island") already demanded this; it just could not have known the naive derivation would violate it.

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

**Depends on Phase 1.** `shared/` only. **Rewritten 2026-07-26** after finding 1c: the original text derived from a field that islands do not have.

1. `generateCompetitiveGateLayout` takes the scene's **boundary** alongside the player count, and is **kind-aware in two separate ways** (finding 3b): `rect` reads its half-extent and places pastures **outside** the boundary; `island` reads its radius and places them **inside** it, because the island clamp is a hard radial wall with no gate-passage carve-out. Both share one cardinal ring; only the measurement and the placement side differ. `coastline` is Newsheepdogland only and stays out of scope per D19.
2. **The derivation is already legible in the existing table, and it reproduces it exactly.** Home Field's bounds are `+-100` and its four gates sit at `(0, +-100)` and `(+-100, 0)` - the boundary edge midpoints, i.e. distance-from-centre = 100 on each axis. Its pastures span 102 to 130: **2 m beyond the boundary, 28 m deep, 60 m wide.** For 2, 3 and 4 players every bearing is cardinal, so a radial ring at 90-degree increments is axis-aligned and the axis-aligned pasture rect still expresses it. **One derivation covers both kinds**; the only thing that changes is the scalar it reads.
3. **Home Field must come back bit-identical.** It is the only scene competitive has ever worked on, `competitive.json` is downstream of this exact call (finding 2b), and a derived layout that reproduces the hand-written table exactly is the proof the derivation is right. If Home Field moves, the derivation is wrong. Same proof shape as Cycle 117's square-versus-rect barrier.
4. **Fix the second hardcode in the same phase** (finding 1b). `createCompetitiveGameState`'s `bounds = { +-100 }` default is Home Field's rect standing in for every scene, and it feeds the competitive sheep clamp, not just the layout. Leaving it would mean island competitive still herds inside an invisible 200 m square. It is the same defect wearing a different hat and it is not a separate cycle.
5. No `Math.random`, no non-spec-pinned transcendentals. For N <= 4 the bearings are cardinal, so **the ring needs no trig at all** - write it as sign-and-axis rather than reaching for `Math.cos`, which `shared-sim.md` does not pin across engines. If a future N > 4 needs real bearings, that is when the lookup-table conversation happens.

**Acceptance (EARS):** When Phase 2 ships, then Home Field's competitive layout shall be bit-identical to the hand-written table and `competitive.json` shall be byte-identical. When a scene declares a boundary, then its competitive layout shall be derived from that boundary rather than from a per-scene table, for both the `rect` and `island` kinds. When Phase 2 ships, then no competitive code path shall fall back to a hardcoded `+-100` rect for a scene that declares its own boundary. When Phase 2 ships, then the layout shall contain no call to `Math.cos`, `Math.sin` or `Math.atan2`. If a scene cannot support N pastures, then the layout shall degrade deliberately rather than producing geometry outside the scene.

## Phase 3 - The island layout (~4hr)

**Depends on Phase 2.** Only now does anything move.

1. Rolling Hills gets N pastures inside its own island. This is the first change that legitimately moves `competitive.json`, and only if the fixture's scene changes; if the fixture stays a Home Field trace, Phase 2's byte-identical result should still hold and that is the better outcome. **Decide which, explicitly, and record it here.**
2. Open Country has a portal objective and no pastures. Say what competitive means there, or state that it stays out of scope and why.
3. The pen fence: D23 records that `_penBarrier` is deliberately null in competitive and timed, so the new pasture fences are not solid there. That is the known cost this cycle is meant to remove. Removing it is deterministic-sim work in its own right, so it lands here with its own acceptance rather than as a side effect.

   **The null has a stated reason and Phase 2 removes it.** [`worker/src/GameSim.js`](../worker/src/GameSim.js):379-386 spells the reason out: competitive and timed are excluded because "`shared/CompetitiveLayout.js` lays its gates and pastures out on Home Field geometry regardless of scene ... so a mid-island fence would sit across the competitive pastures." Once Phase 2 lands, pastures are on the island and that sentence stops being true. **Re-read that comment as the first step of this item** - it is the precondition, written down by the person who set the null, and it tells you exactly what has to be true before flipping it. Update the comment in the same commit that flips it, or the next reader inherits a stale justification for a branch that no longer needs one.

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
- **[`worker/src/GameSim.js`](../worker/src/GameSim.js)** - three separate touches, added 2026-07-26 by the correcting pass: the dead imports at :29-30 (finding 2), the `bounds: this.scene.bounds` call site at :340 that resolves to `undefined` on islands (finding 1b), and the `_penBarrier` null plus its now-stale justifying comment at :379-386 (Phase 3). It is the Worker's authoritative sim, so treat it with the same discipline as `shared/` even where the fence does not name it.
- **[`tests/sim-baseline/competitive.json`](../tests/sim-baseline/competitive.json)** - authorised for Phase 3 only, and only if Phase 3 records the decision. **Phase 2 must leave it byte-identical.**
- **[`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md)** - authorised for Phase 1, one edit only: widening the sim-baseline glob so it covers `competitive.json`. An addition that strengthens the fence.

## Hard stops

1. **No code before Phase 1's migration story is written.** `multiplayer.md` requires four pieces and a change without them is a fence violation.
2. **Home Field bit-identical through Phase 2.** If it moves, the derivation is wrong and the phase stops.
3. **No blanket fixture regenerate.** Read the diff. `shared-sim.md`'s stricter bar applies: any unexplained ULP drift outside the one authorised fixture aborts the phase.
4. **Competitive must never newly crash.** D23's constraint holds until the moment this cycle replaces it. Broken-as-before is acceptable at every intermediate commit; a null dereference is not.
4b. **An island pasture outside the radial clamp is unreachable, not merely ugly.** Finding 3b. `BoundaryCollision.js`'s hard clamp at `radius - margin` means a sheep cannot arrive, so the round cannot complete and competitive would be **worse** than the broken-as-before baseline D23 protects. Any island layout gets its pasture corners distance-checked against the radius before it is called done.
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
