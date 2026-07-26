# Cycle 122 - N pastures

> Authored 2026-07-26 from a read-only trace. **The riskiest cycle in the program and deliberately last.** This is deterministic-sim work that moves a sim-baseline fixture and touches live multiplayer rooms. Read [`../.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) and [`../.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) in full before touching anything. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first.

## Goal

Island competitive stops using Home Field's geometry. Every player gets their own pasture on the scene they are actually playing, which needs [`shared/CompetitiveLayout.js`](../shared/CompetitiveLayout.js) made scene-aware. D24.

## What the trace found

> **Corrected 2026-07-26 by a second read-only pass, before any code.** Three of the findings below changed and one of them invalidates Phase 2's stated mechanism. The original text is preserved where it was right; where it was wrong the correction says so plainly, per the practice that has paid for itself in every cycle from 117 on.

**1. The defect is exactly as D23 describes, and it is a hardcode, not a bug.** [`shared/CompetitiveLayout.js`](../shared/CompetitiveLayout.js):16 `generateCompetitiveGateLayout(playerCount)` takes **only a player count**. Its 2, 3 and 4-player tables are Home Field coordinates written out longhand: gates at `(0, +-100)` and `(+-100, 0)`, pastures spanning to `+-130`. ~~Rolling Hills is a 180 m island, so a pasture at z=130 is well past the shoreline and the gates sit in open water.~~ Open Country is 380 m and has a portal objective rather than pastures at all.

**1a. CORRECTION - the struck sentence above is wrong, and it was mine to check.** Rolling Hills' `radius` **is** the shoreline (180 m) and its beach falloff starts at 140 m, so the old pasture at z=102 to 130 sat comfortably **inside the meadow**. Nothing was in open water and no gate was afloat. Caught by an assertion in `tests/competitive-layout.spec.js` that failed because it encoded the plan's claim rather than the measurement - a spec bug that happened to falsify the prose it was written from.

**The real defect is less dramatic and more damaging.** With `bounds` falling back to Home Field's rect (finding 1b), the entire competitive round is clamped to a **200 m square inside a 360 m-diameter island: about 39% of it**, arbitrarily placed, with the whole outer ring unreachable. Players get an invisible box with no relationship to the land they can see. That is what this cycle fixes, and it is worth stating accurately because "the gates are in the sea" would have been fixed by any layout change at all, whereas this is only fixed by making the bounds scene-aware too.

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

---

### THE MIGRATION STORY (Phase 1 deliverable, written 2026-07-26, no code changed)

**Piece 1. The change, named.** `generateCompetitiveGateLayout(playerCount)` becomes `generateCompetitiveGateLayout(playerCount, boundary)` and derives gate and pasture geometry from the scene's boundary instead of from three hardcoded Home Field tables. `createCompetitiveGameState`'s `bounds` default stops standing in Home Field's rect for every scene. Both live in `shared/`, so both run byte-identically on the Worker and on every client that imports them.

**Piece 2. The in-flight-session story: there is no client-side layout to desync, and this was verified rather than assumed.**

The **DO is the sole author of the layout and it rides every competitive frame.** `worker/src/GameSim.js`:1786 puts the full gate set into `snapshot.competitive.gates` - `id`, `x`, `z`, `playerId`, `color`, `direction`, `pasture` - and [`js/boot/initNetwork.js`](../js/boot/initNetwork.js):330-351 transforms that payload and assigns it straight onto `game.gameState.competitiveGates`. **No client ever calls `generateCompetitiveGateLayout`**; the only callers in the tree are `shared/CompetitiveMode.js`:216, two re-export shims, and the dead import at `worker/src/GameSim.js`:29-30.

So: **a client on the old build joining a room on the new layout receives the new gates over the wire and renders them.** No version tag, no refusal, no soft-degrade needed - the wire format is unchanged, only the values inside it move. This is materially cheaper than the v3 protocol precedent because **this is not a wire-format change at all**; it is a change to numbers that already ride an existing field.

**The one thing that would break that story is broadcasting less than the client needs**, so:

**Piece 3. Consumers, listed, with the two hazards the trace found.**

| Consumer | What it needs |
|---|---|
| `shared/CompetitiveMode.js`:216 | pass the boundary through; it already destructures `bounds` in the same scope |
| `shared/GameStateValidation.js`:244, `shared/index.js`:114 | re-export shims, signature only |
| `worker/src/GameSim.js`:29-30 | **dead imports, delete them** |
| `worker/src/GameSim.js`:340 | passes `bounds: this.scene.bounds`, which is `undefined` on every island; must pass the boundary |
| `worker/src/GameSim.js`:1786 | the broadcast payload - **must keep carrying everything the client cannot derive** |
| `js/boot/initNetwork.js`:330-351 | the client transform - **see the hazard below** |
| `js/FencePresets.js`:1283 | `buildCompetitiveFences(bounds, competitiveGates)` branches on `competitiveGates.length` for 2/3/4; renders from broadcast data, so it follows for free |
| `tests/sim-baseline/competitive.spec.ts` + `harness.js`:506 | delegates to the real factory, so the fixture is a genuine test of this change |
| `tests/worker-competitive-tick.spec.js` | asserts layout shape |

**HAZARD A, pre-existing and found by this pass: the client's `passageZone` does not match the server's, and never has.** The shared layout computes it direction-aware (`gateWidth` 8 across the opening, `gateDepth` 4 through it, so a north gate spans `z +- 4`). The client hardcodes `minZ: z - 2, maxZ: z + 2` for **every** direction, so its passage zone is **half the server's depth** and is not rotated for east/west gates. The DO is authoritative and broadcasts retirements, so this self-corrects rather than desyncing, but it means the client predicts gate passage on a different volume than the server scores it. **Not this cycle's to fix** - record it, and do not make it worse.

**HAZARD B, and this one constrains Phase 2: the client hardcodes `width: 8` and `height: 4`.** They are not in the broadcast payload. **So gate width must stay fixed at 8 across all scenes, or it must start riding the wire.** A derivation that scales gate width with island size would silently desync the client's rendered gate from the server's passage zone. **Phase 2 keeps the width fixed**; if a future cycle wants scene-scaled gates, adding `width` to the payload is the migration and it is a real wire change with its own four pieces.

**Piece 4. The acceptance line confirming the story is implemented.** Added to Phase 4 below, and to the cycle's success criteria: *when an old-layout client joins a new-layout room, then it shall render the new layout from the broadcast payload, and no client-side layout computation shall exist.*

---

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

---

### PHASE 3 RECORD (written 2026-07-26)

**Item 1, the fixture: it did NOT move, and that is the better outcome the phase hoped for.** `tests/sim-baseline/competitive.json` is byte-identical, verified with `git status` at close. The harness calls `createCompetitiveGameState({ totalSheep }, playerIds)` with neither a boundary nor bounds, so it takes the Home Field default and Phase 2's bit-identity carries it. **No regeneration, no acceptance decision needed, `shared-sim.md`'s stricter bar never engaged.**

**What the islands actually resolve to**, measured:

| scene | kind | reach | safe reach | north gate | north pasture | pasture corner | bounds |
|---|---|---:|---:|---:|---|---:|---|
| Home Field | rect | 100 | 100 | z=100.00 | 102.00 to 130.00 | 133.42 | -100..100 |
| Rolling Hills | island | 180 | 140 | z=106.75 | 108.75 to 136.75 | **140.00** | -180..180 |
| Open Country | island | 380 | 310 | z=278.54 | 280.54 to 308.54 | **310.00** | -380..380 |

The corner landing exactly on the safe reach is the `sqrt(safe^2 - halfWidth^2)` anchor doing its job: the pasture's widest point is its corner, and that is what would otherwise touch the beach.

**Item 2, Open Country: it does not allow competitive at all** (`allowedModes: ['cooperative', 'timed']`), so the phase's question was moot as asked. **But it allows timed, and timed shares this layout**, so it changed anyway - and the old behaviour there was worse than anyone had recorded. Open Country's sheep spawn in an 8-cluster ring at **radius 240 m**, while `gameState.bounds` was **+-100**. Sheep spawned across the island and were clamped into a central square holding **8.8%** of it. The fix is unambiguous rather than a difficulty change: the pastures at 280 to 308 now sit just outboard of the spawn ring the scene already had.

**Item 3, the pen fence: recorded as deliberately NOT solid, per the phase's own alternative.** The `_penBarrier` null for competitive and timed stays, but **the comment justifying it was retired**, because it cited "Home Field geometry regardless of scene" and that is exactly what this cycle removed. The reason now is that `pen` is the **solo** destination - one enclosure, one gate, one flock - while these modes give every player their own pasture, so running the solo barrier there would drop an unrelated enclosure into an N-destination round. Making the N competitive pastures solid is N barriers where there is currently one, it moves the tick, and it therefore wants its own cycle rather than a ride on this one.

**Item 4, unplanned and load-bearing: Newsheepdogland would have been a new crash.** Its `allowedModes` contains competitive **and** timed, and its boundary is `coastline`, which the first draft of `measureBoundary` threw on. D19 gates the scene out of the entrance but `?scene=newsheepdogland` still reaches it, so that throw would have violated hard stop 4 on a reachable scene. Coastline now keeps the legacy rect **verbatim** - byte-for-byte today's behaviour, D23's broken-as-before - and a spec walks every scene whose `allowedModes` touches either mode and asserts a finite layout and finite bounds. Mutation-proved: restoring the throw fails that spec.

---

## Phase 4 - Multiplayer verification (~3hr)

Unit tests cannot catch a desync. This phase runs the thing.

1. A real room, real clients, the Worker's authoritative sim against the client predictor, on Rolling Hills competitive.
2. The migration story from Phase 1 gets exercised, not asserted: an old-protocol client against a new Worker.
3. Watch for the failure mode `shared-sim.md` describes: divergence surfaces several seconds late and only at scale, so a short clean run proves little.

**Acceptance (EARS):** When Phase 4 ships, then a multi-client competitive round shall have been played on Rolling Hills with no observed desync. When an old-layout client joins a new-layout room, then the behaviour shall match what Phase 1 recorded.

---

### PHASE 4 RECORD (written 2026-07-26)

`tests/competitive-island-room.spec.js`, 13 specs against the **real** `GameSimulation` from `worker/src/GameSim.js`.

**Ticked, not asserted.** 600 frames at 60Hz - ten seconds, past the point `shared-sim.md` says a divergence would surface - on Rolling Hills competitive, Rolling Hills timed and Open Country timed. Checked for the failure classes a bad layout actually produces: non-finite positions, sheep leaving the island, pastures whose corners fall outside the safe reach, gates outside the hard radial clamp, and any `console.error` during construction or ticking. None.

**The migration story is exercised rather than described.** `oldClientTransform` in that spec is `js/boot/initNetwork.js`:330-351 **copied verbatim** - the code that was already deployed before this cycle - applied to the payload this cycle now produces. It renders the island layout correctly, which is the whole claim: an old client joining a new-layout room takes the gates off the wire and draws them where the server put them.

Both hazards from Phase 1 are now pinned by specs that will fail if someone changes them without reading the story. **Hazard A** (the client's passage zone is 4 m deep where the server's is 8) is asserted **as it currently stands**, deliberately, so a future fix trips the assertion and goes and reads why. **Hazard B** (gate width must stay 8 until width rides the wire) is asserted across all three scenes.

**What was NOT done, plainly.** No real Durable Object over a real WebSocket with real browsers. The specs drive the authoritative sim in-process. **That gap is narrower than it sounds for this cycle specifically**: the wire format is unchanged, only the numbers inside an existing field moved, and the client provably computes no layout of its own. The residual risk a live room would cover is transport and timing, which this cycle does not touch. It is still a gap, and it is the honest reason the acceptance line above reads "a multi-client competitive round shall have been played" and this record cannot fully claim it.

**Found and not fixed: a third Home Field hardcode, in the spawn.** `shared/SpawnLogic.js`:190-216 places competitive spawn clusters at literal `+-50` / `+-40` / `+-30` coordinates on every scene. The layout is now scene-aware and the spawn is not, so as pastures scale outward with island size the flock still starts in a fixed central blob. **Not made worse by this cycle and fairness is preserved** (the clusters are symmetric about the axis separating the players, so the pre-existing south bias is unchanged in character), and timed mode does not use this path at all. Its own cycle.

---

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

- [x] When the cycle closes, all phases shall be shipped or explicitly deferred to [`BACKLOG.md`](BACKLOG.md) carryover. **4/4 shipped.**
- [x] When `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` run at cycle close, all four shall pass. **2361 passed / 11 skipped, 45 new.**
- [x] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [x] When Phase 1 ships, then all four `multiplayer.md` migration pieces shall be recorded here. **All four, above, written before any code.**
- [x] When Phase 1 ships, then the fence glob shall cover `tests/sim-baseline/competitive.json`. **Widened to `tests/sim-baseline/**/*.json`, with the reason the file lives at the root recorded so nobody "fixes" it by moving it.**
- [x] When Phase 2 ships, then Home Field's layout shall be bit-identical and `competitive.json` byte-identical. **Both. The old tables are transcribed verbatim into `tests/competitive-layout.spec.js` and compared with `Object.is` on every leaf, so a `-0` could not hide; the fixture never moved.**
- [x] When a scene declares bounds, then its competitive layout shall be derived from them rather than from a table. **Derived from `boundary`, which is what scenes actually declare - see correction 1c.**
- [x] When Phase 3 ships, then every Rolling Hills competitive pasture shall lie inside the island. **Every corner, at 2, 3 and 4 players, inside the safe reach rather than merely inside the clamp.**
- [x] When any fixture moves, then the decision shall be recorded here with the diff read. **No fixture moved.**
- [x] When Phase 4 ships, then a multi-client competitive round shall have been played with no observed desync. **PARTIAL, and recorded as such above:** 600 frames of the real authoritative sim on three island rooms, plus the deployed client transform run verbatim against the new payload. **No real DO over a real socket with real browsers.**
- [x] When the cycle closes, then competitive shall never crash on any scene. **Every scene whose `allowedModes` touches competitive or timed is walked by a spec. This caught a crash the first draft would have shipped on Newsheepdogland.**
- [x] When the cycle closes, then `bundle-sizes.json` shall be unmodified. **Verified.**

### Hard stops, checked at close

- [x] **No code before Phase 1's migration story was written.** The story is above; the first code commit followed it.
- [x] **Home Field bit-identical through Phase 2**, and it stayed that way through Phases 3 and 4.
- [x] **An island pasture outside the radial clamp is unreachable.** Corner-checked against the safe reach, not the clamp, so pastures are not on the beach either.
- [x] **No blanket fixture regenerate.** Nothing to regenerate.
- [x] **Competitive never newly crashes.** The one place it would have, it now does not.
- [x] **No `Math.random` and no unpinned transcendentals.** A spec greps the source with comments stripped, so the prose explaining why there is no trig cannot satisfy the check for it. `Math.sqrt` is used and is IEEE-754 spec-pinned.
- [x] **No ratchet bump.**

## References

- [`front-door-roadmap.md`](front-door-roadmap.md) - the Cycle 122 entry
- [`../DECISIONS.md`](../DECISIONS.md) - D23 (leave competitive as it is for now), D24 (N pastures, its own cycle)
- [`../.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - the deterministic-sim contract and the fixture discipline
- [`../.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) - the four pieces a contract change owes
- [`archive/cycles/cycle-117-plan.md`](archive/cycles/cycle-117-plan.md) - the square-versus-rect bit-identity proof shape Phase 2 reuses
