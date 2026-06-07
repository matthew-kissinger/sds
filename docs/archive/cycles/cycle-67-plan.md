# Cycle 67 - coop-survival

> Drafted 2026-06-07 after Cycle 66 (`newsheepdogland-survival`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom, then [`AGENTS.md`](../AGENTS.md) + [`CLAUDE.md`](../CLAUDE.md). This cycle touches the deterministic-sim boundary, the wire protocol, the Durable Object, and D1, so also read [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) + [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) before writing code. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 66 shipped the survival game on Newsheepdogland as a **solo, client-only** layer (the day/phase clock, the run economy, the night wolves, and the pen containment all live in `js/gamestate/` and run only in the player's browser). This cycle makes survival a **co-op mode**: 2-4 dogs share one flock, herd it home before dusk, and survive the wolf night together, with the Cloudflare Worker Durable Object as the single authority and clients rendering the broadcast. Before: survival is single-player only. After: you can share an invite link and survive the wolves as a pack.

The core move is **promotion**: the survival economy, the wolf AI, and the pen barrier become pure `shared/` modules so the Worker `GameSim` can run them (the Worker cannot import `js/` - it pulls Three.js). The DO ticks survival authoritatively, broadcasts the run state + the wolves in the state frame, and clients render them the same way they already render the server's sheep and the other players' dogs. This is a real deterministic-sim + wire-protocol cycle and must respect both rule files in full.

## How to read this plan

This doc fixes the *shape* of the changes (which modules move to `shared/`, the authority model, the wire contract, the acceptance criteria), not every implementation choice. Research current best practice, measure on the actual targets (RTX 3070 desktop, mid-tier mobile), and pick the simplest thing that meets the budget. Treat suggested techniques as starting points.

**The grounding map below is verified against the current code (2026-06-07). Trust the file:line references but re-confirm before editing - the tree moves.**

## The authority model (the load-bearing decision)

**Wolves, the survival run economy, the day/phase clock, and the pen containment all run AUTHORITATIVELY on the DO only, and are broadcast in the state frame. Clients do NOT predict them - they render-from-snapshot, exactly like the server's sheep ([`js/OptimizedSheep.js`](../js/OptimizedSheep.js) `forceUpdateSheepPositions`) and the other players' dogs today.**

Why this is the right model and not full client prediction:

- **It sidesteps cross-engine trig determinism.** The deterministic-sim contract ([`shared-sim.md`](../.claude/rules/shared-sim.md)) forbids `Math.sin/cos/atan2` in any path the client and Worker must agree on, because trig is not ULP-pinned across V8/JSC/SpiderMonkey. The wolf spawn ring and facing use trig. If wolves are authoritative-only (one authority computes them, everyone renders the result), there is no cross-engine agreement requirement for the wolf math, so the trig is fine. Only the things the client PREDICTS (its own dog, via `shared/MovementPhysics.js`) need byte-identical determinism, and those are untouched this cycle.
- **It matches the existing co-op shape.** In multiplayer the client already renders the DO's sheep from the snapshot (with a short velocity extrapolation to hide latency), not a local flock sim. Wolves slot into the identical render-from-snapshot path; a `WolfRenderer` mirrors `OptimizedSheep`.
- **Seeded, not byte-identical.** Even authoritative-only, the shared survival modules still obey the no-`Math.random` rule (seed from `room.seed` via `shared/Random.js` mulberry32) so a run is reproducible for replays/debugging and the DO is deterministic given its seed. This is hygiene, not a cross-engine requirement.

The promotion to `shared/` exists so the **DO can run the logic**, not so the client can re-simulate it. The client keeps a thin renderer + reads the snapshot for its HUD/minimap.

## Grounding map (verified 2026-06-07 - do not rebuild these)

### Worker authoritative sim
- **[`worker/src/GameSim.js`](../worker/src/GameSim.js)** `class GameSimulation`. `tick()` (~line 363) runs at 60Hz off its own `setInterval` (`start()` ~line 343); calls the shared sheep/dog/flock/collision/bark modules each frame. `tickObjective(...)` (~line 391) is the precedent for a per-tick subsystem gated on a scene flag - **survival ticks here the same way.**
- **`createGameStateSnapshot()`** (~lines 1230-1338): builds the broadcast frame. Full sheep array (quantized to 2dp, NOT delta-encoded), `sheepdogs`, and OPTIONAL blocks: `competitive`, `timedMode`, `objective`. **The survival + wolves blocks are added here as new optional blocks (P5).**
- **`applyPlayerInput()`** (~lines 429-532): applies a player's input; the **bark edge** (~lines 516-529) cooldown-gates then calls `applyBarkImpulse(...)`. **The DO-side wolf-repel-on-bark mirrors this (P3).**
- **[`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts)**: `initRoom` (~332-434), `startGame` (~758-868) builds the GameSim adapter + `new GameSimulation(adapter)` + `startBroadcastLoop` (the 16ms loop that polls `getLatestGameState()` and broadcasts). Mode gate at ~line 359 (`['cooperative','competitive','timed']` - **survival is added here, P4**). Reconnect grace 15s; persists only `{ meta, players }`; an in-game room resets to `waiting` on a worker redeploy (the live sim is in-memory, like all co-op state today). `onSubmitScores` (~818-847) is the **submit-from-DO** path (P7).
- The DO/GameSim get the scene via `loadScene(room.sceneId)` ([`shared/scenes/index.js`](../shared/scenes/index.js)); `getSceneById(...).survival` + `.dayNight` + `.pen` are already there.

### Wire protocol
- `@msgpack/msgpack`. Messages tagged `t`. Client->server send: [`js/NetworkManager.js`](../js/NetworkManager.js) `_send` (~261); `playerInput` shape ~542-557 (direction, sprint, sequence, timestamp, clientPosition, `bark`). Server->client decode: `_onWsMessage` (~175) -> `gameStateUpdate` -> [`js/boot/initNetwork.js`](../js/boot/initNetwork.js) `handleMultiplayerGameState` (~181-258) unpacks sheep + dogs. **This unpacker gains the survival + wolves blocks (P6).**
- **NO protocol version tag exists today.** The handshake is URL-only (`wss://.../r/<code>/ws?playerId=&ticket=`); no `hello`, no version negotiation. **P5 adds a version tag** and the migration story.
- **[`tests/worker/snapshot-shape.spec.ts`](../tests/worker/snapshot-shape.spec.ts)** locks the snapshot wire shape - **P5 updates it** for the new blocks.

### Client predict/reconcile + the dual-call-site template
- [`js/main.js`](../js/main.js) MP branch (~2291-2337): predicts the player's own dog (`sheepdog.move`), sends input, reconciles (`reconcileWithServerState` ~2941). Sheep render-from-snapshot via the velocity-extrapolation block (~2452-2478) + `forceUpdateSheepPositions`. Other dogs interpolate (~2372-2411).
- **The template:** [`shared/BarkImpulse.js`](../shared/BarkImpulse.js) `applyBarkImpulse` is imported and called from BOTH [`js/main.js`](../js/main.js) (~2251, solo predictor) AND [`worker/src/GameSim.js`](../worker/src/GameSim.js) (~529, authoritative). The new `shared/survival/*` modules follow this exact dual-import shape.

### The 4 modules to promote (determinism audit, verified)
- **[`js/gamestate/survivalRun.js`](../js/gamestate/survivalRun.js)** - CLEAN (pure arithmetic, no `Math.random`/`Date.now`/DOM/Three). Ready to move to `shared/` as-is.
- **[`js/gamestate/wolfBehavior.js`](../js/gamestate/wolfBehavior.js)** - CLEAN. Ready to move as-is (uses `Math.hypot`, which is sqrt-based and fine).
- **[`js/gamestate/penContainment.js`](../js/gamestate/penContainment.js)** - **ONE violation:** `Math.random()` in `_settleSpot()` (~line 119). Must become a seeded draw (a `mulberry32` seeded from `room.seed + sheep.id`, or a deterministic hash of the sheep id). Otherwise pure.
- **[`js/gamestate/wolfPack.js`](../js/gamestate/wolfPack.js)** - seeded RNG already (`mulberry32`), but **Three.js-coupled** (it owns `Wolf` render instances) and uses `Math.atan2/cos/sin` for facing + spawn ring. Split into a pure `shared/survival/wolves.js` (positions + state machine + hunt/kill/flee/retreat, seeded) and a thin `js/` `WolfRenderer` (the Three.js layer: facing yaw via atan2 lives here, render-only).

## Open questions (strawman answers - the implementing agent confirms, or Matt's taste pass does)

1. **Q1: Authority model for wolves/run/pen?** Author lean: **authoritative-only on the DO, broadcast, render-from-snapshot** (see "The authority model" above). Not client-predicted. Strong lean; this is the spine of the cycle.
2. **Q2: Survival as its own room mode, or co-op-on-a-survival-scene?** Author lean: a distinct **`survival` co-op game mode** added to `RoomDO` allowedModes + `newsheepdogland.allowedModes`. It reuses the cooperative room machinery (host start, host migration, the shared flock) but flags the GameSim to run the survival tick. Clean separation from plain cooperative time-trials.
3. **Q3: Co-op survival leaderboard identity?** Author lean: keep the `survival` game_mode (Cycle 66) and add an **append-only migration for a `party_size` column** on `score_submissions`; survival boards partition by `(scene, party_size)` so solo (party 1) and co-op boards stay separate. Each player posts their run's `peakFlock` on death via `onSubmitScores`.
4. **Q4: Wire-protocol versioning + migration story?** Author lean: add a `v: <PROTOCOL_VERSION>` field to `gameStateUpdate` (and a constant shared by client + worker). Since `survival` is a NEW mode an old client has no UI to create or join, the migration risk is low; the DO **refuses a survival room join from a client below the survival-capable version** (clean error), and non-survival frames stay byte-compatible (the new blocks are optional/absent). This satisfies the `multiplayer.md` four-piece wire-change requirement.
5. **Q5: Reconnect persistence of the run?** Author lean: the run lives in **GameSim memory** (matches all existing co-op state; it survives the 15s reconnect grace because the sim instance persists, and is lost only on a worker redeploy, exactly like today's co-op sheep). Full DO-storage persistence of multi-day run state is **deferred** (note it in BACKLOG). Don't over-build reconnect this cycle.
6. **Q6: Does the client predict the pen barrier for herding feel?** Author lean: **no** - sheep are render-from-snapshot in MP, so the pen correction runs on the DO and clients render the corrected sheep. Keeps one authority for sheep positions.

## Architecture / shared changes

A new `shared/survival/` namespace holds the promoted pure logic (so the Worker can run it and the deterministic-sim discipline is scoped):

- `shared/survival/run.js` - the run economy (from `survivalRun.js`, unchanged).
- `shared/survival/wolfBehavior.js` - the pure AI helpers (from `wolfBehavior.js`, unchanged).
- `shared/survival/wolves.js` - the wolf state machine (extracted from `wolfPack.js`: an array of wolf records + spawn/hunt/kill/flee/retreat, seeded, NO Three.js).
- `shared/survival/pen.js` - the pen barrier + retirement math (from `penContainment.js`, with the `Math.random` settle spot made seeded).

The `js/gamestate/*` Cycle 66 files become thin shims/renderers over these so **solo survival keeps working unchanged**:
- `js/gamestate/wolfPack.js` -> a `WolfRenderer` that, in solo, drives the shared wolf sim locally and renders it; in co-op, renders broadcast wolf state (no local sim).
- `js/gamestate/survivalRun.js`, `penContainment.js`, `wolfBehavior.js` -> re-export the `shared/survival/*` modules (keep existing import paths working).

The sheep sim cores ([`shared/MovementPhysics.js`](../shared/MovementPhysics.js), `FlockingAlgorithms.js`, `BoundaryCollision.js`, `GameStateValidation.js`) are **NOT touched** - survival is additive, so the 9 committed sim-baseline fixtures stay byte-identical (hard stop).

## Phase 1 - Promote the deterministic cores to `shared/survival/` (~3hr)

**Independently testable. Do first - everything downstream imports these.**

1. Create `shared/survival/run.js` (move `js/gamestate/survivalRun.js`) and `shared/survival/wolfBehavior.js` (move `js/gamestate/wolfBehavior.js`), unchanged (both audited CLEAN). Leave `js/gamestate/survivalRun.js` + `wolfBehavior.js` as one-line re-export shims so existing imports keep working.
2. Create `shared/survival/pen.js` (move the pen barrier + retirement math from `js/gamestate/penContainment.js`), replacing the `Math.random()` in `_settleSpot()` with a seeded draw (a `mulberry32` passed in, seeded from a run seed + the sheep id). `js/gamestate/penContainment.js` re-exports it.
3. Add the ESLint `no-restricted-imports` guard (if not already present) so `shared/survival/**` cannot import `js/` or Three.js (the `shared-sim.md` boundary).
4. Unit tests for each shared module (the Cycle 66 `survival-run.spec.js` + `pen-containment.spec.js` move/extend; assert the seeded settle spot is reproducible for a fixed seed).

**Acceptance (EARS):**

- When `shared/survival/run.js`, `wolfBehavior.js`, and `pen.js` are imported, then they shall pull no `js/`, Three.js, DOM, `Math.random`, or `Date.now` (grep + ESLint clean).
- When the seeded settle spot runs twice with the same `(seed, sheepId)`, then it shall return byte-identical coordinates.
- When `npm test` runs, then the survival + pen specs shall pass against the new `shared/survival/*` paths.
- When solo survival loads on Newsheepdogland, then it shall behave exactly as Cycle 66 (the shims preserve every import).

## Phase 2 - Extract the wolf AI to `shared/`, refactor `js/wolfPack.js` into a renderer (~4hr)

**Depends on P1.** The hardest promotion - splitting pure state from Three.js rendering.

1. Create `shared/survival/wolves.js`: the wolf state machine as pure data (an array of `{ id, x, z, vx, vz, state, target, killCd, fleeT, age }` + `spawnNight(day, sheep, rng)`, `update(dt, sheep, dog, pen)`, `repel(x, z, ...)`, `retreatAll()`). Seeded via the passed-in `mulberry32`. NO Three.js, NO DOM, NO `atan2`/`cos`/`sin` in any path a client would re-run (spawn-ring trig is fine here because wolves are authoritative-only - see the authority model - but keep facing out of the shared state; the renderer derives it).
2. Refactor [`js/gamestate/wolfPack.js`](../js/gamestate/wolfPack.js) into a `WolfRenderer`: owns the `Wolf` Three.js instances, reads a wolf-state array (from the local shared sim in solo, or from the broadcast in co-op), and updates meshes (position via `groundY`, facing via `atan2` here, gait via `setSpeed`). It no longer owns the AI.
3. Solo wiring ([`js/boot/initWorld.js`](../js/boot/initWorld.js)): solo drives `shared/survival/wolves.js` locally each frame (seeded from the scene/run) and feeds the state to the `WolfRenderer`. The minimap + HUD read the same local state.
4. Unit tests for `shared/survival/wolves.js` (spawn count escalation, hunt/kill selection, flee, retreat) - port the Cycle 66 `wolf-behavior.spec.js` and add state-machine tests.

**Acceptance (EARS):**

- When `shared/survival/wolves.js` runs a seeded night, then the wolf positions + kills shall be reproducible for a fixed `(seed, day)`.
- When solo survival plays on Newsheepdogland, then wolves shall spawn, hunt, kill, flee from the bark, and retreat exactly as Cycle 66 (browser smoke, zero console errors).
- When `grep` runs over `shared/survival/wolves.js`, then it shall contain no Three.js / DOM / `Math.random` import or call.
- When `npm test` runs, then the wolves state-machine spec shall pass.

## Phase 3 - Worker authoritative survival tick in GameSim (~4hr)

**Depends on P1 + P2.** The DO becomes the survival authority.

1. In [`worker/src/GameSim.js`](../worker/src/GameSim.js), when the room's scene has `survival` + the mode is `survival`, run a per-tick survival subsystem (gated like `tickObjective`): a server-owned day/phase clock (from `scene.dayNight.secondsPerDay`), `shared/survival/run.js` driven off the phase transitions, `shared/survival/wolves.js` ticked each frame (seeded from `room.seed`), and `shared/survival/pen.js` correcting sheep + tracking pen membership. Kills feed the run; dawn grows the flock; a 33%+ night loss ends the run for the room.
2. DO-side wolf-repel-on-bark: when a player's `bark` edge arrives (the existing `applyPlayerInput` path), also call the shared wolves' `repel(...)` alongside `applyBarkImpulse` for sheep.
3. Completion: on run death, mark the game complete and call `onSubmitScores` with each player's `peakFlock` (wired fully in P7).
4. A Node test drives a `GameSimulation` on a survival room through morning -> day -> dusk -> night (wolves spawn, kill) -> dawn (grow or die) and asserts the run economy + that the snapshot exposes the survival + wolves state.

**Acceptance (EARS):**

- When a survival room ticks past dusk, then the DO shall spawn wolves (seeded from `room.seed`) and hunt sheep outside the pen.
- While a sheep is inside the closed pen on the DO, then no wolf shall reach it.
- When a player barks near wolves in a survival room, then the DO shall break the wolves' pursuit (authoritative repel) and reflect it to all clients.
- When a survival night ends with a 33%+ flock loss, then the DO shall end the run and invoke `onSubmitScores` with each player's peak flock.
- When the sheep sim runs, then the 9 committed sim-baseline fixtures shall stay byte-identical (survival is additive; the sheep cores are untouched).

## Phase 4 - The `survival` co-op room mode + lobby (~3hr)

**Depends on P3.** Make a survival room creatable, joinable, startable.

1. [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts): add `survival` to the allowed game modes (~line 359) and to [`shared/scenes/newsheepdogland.js`](../shared/scenes/newsheepdogland.js) `allowedModes`. A survival room reuses the cooperative lobby/host-start/host-migration machinery; it flags the GameSim to run the survival tick (P3).
2. Client lobby/entrance: a co-op survival room can be created (invite URL), joined from the public lobby, and started by the host. The survival run starts at the scene's `startFlock` regardless of the cooperative sheep-count selector (survival has no count selection - mirror the Cycle 66 entrance rule).
3. Worker tests for the survival room lifecycle (create -> join -> host start -> survival tick begins; mode validated against the scene).

**Acceptance (EARS):**

- When a host creates a `survival` room on Newsheepdogland, then the DO shall accept it and the public lobby shall list it.
- When 2-4 players join and the host starts, then the DO shall begin the survival tick with one shared flock at `startFlock`.
- If a client requests a `survival` room on a scene whose `allowedModes` omits survival, then the DO shall reject it with a clean 400.
- When the host disconnects mid-run, then host migration shall hand the room to another player and the run shall continue.

## Phase 5 - Additive wire frame + protocol version tag (~3hr)

**Depends on P3.** The fence-frozen wire change, with the full migration story.

1. [`worker/src/GameSim.js`](../worker/src/GameSim.js) `createGameStateSnapshot()`: add an optional `survival` block (`day`, `phase`, `flock`, `peak`, `timeRemaining`) and a `wolves` array (`id`, `x`, `z`, `state`, quantized 2dp like sheep), present only on survival rooms.
2. Add a `PROTOCOL_VERSION` constant shared by client + worker; stamp `v` on `gameStateUpdate` (and check it on the survival-room join). Migration story (the four `multiplayer.md` pieces): (a) the change is named here; (b) in-flight non-survival sessions are unaffected (the new blocks are absent, the frame is byte-compatible); (c) consumers updated = client `handleMultiplayerGameState` (P6), worker `createGameStateSnapshot` (this phase), `snapshot-shape.spec.ts`; (d) the DO refuses a survival-room join from a client below the survival-capable `PROTOCOL_VERSION`.
3. Update [`tests/worker/snapshot-shape.spec.ts`](../tests/worker/snapshot-shape.spec.ts) to lock the new survival + wolves block shapes (quantization, optionality) and the `v` field.

**Acceptance (EARS):**

- When the DO broadcasts a survival room frame, then it shall include the `survival` block + the `wolves` array + the `v` version field.
- When the DO broadcasts a non-survival room frame, then the frame shall be byte-compatible with the pre-cycle shape (no `survival`/`wolves` blocks).
- If a client below the survival-capable `PROTOCOL_VERSION` requests a survival room, then the DO shall refuse with a clean version error.
- When `npm test` runs, then `snapshot-shape.spec.ts` shall pass with the new blocks locked.

## Phase 6 - Client: render wolves + the survival HUD/minimap from the broadcast (~4hr)

**Depends on P2 + P5.** Make co-op survival visible and playable client-side.

1. [`js/boot/initNetwork.js`](../js/boot/initNetwork.js) `handleMultiplayerGameState`: unpack the `survival` block + the `wolves` array. In a survival room, drive the `WolfRenderer` (P2) from the broadcast wolf state (render-from-snapshot, no local wolf sim), mirroring how sheep are applied.
2. The survival HUD ([`js/components/GameHUD/DayNightChip.js`](../js/components/GameHUD/DayNightChip.js)) + the minimap ([`js/components/GameHUD/Minimap.js`](../js/components/GameHUD/Minimap.js)) read the broadcast run state + wolf positions in co-op (today they read local game state). Wire a co-op path that feeds them from the snapshot.
3. Browser smoke: two clients (two preview tabs, or one + a scripted second session) in one survival room - both see the same flock, the same wolves, the same day clock; herding by either dog moves the shared flock; the bark repels wolves for both.

**Acceptance (EARS):**

- When a client is in a co-op survival room, then it shall render the DO's wolves from the broadcast (no local wolf AI running).
- While the run advances, then both clients' survival HUD + minimap shall show the same day, flock, and wolf positions.
- When one player herds a sheep through the gate, then both clients shall see it retire in the pen.
- When the minimap renders in co-op, then it shall show all players' dogs (not just the local one), pointer-events none, no console error.

## Phase 7 - Survival co-op leaderboard (partySize) + submit-from-DO (~3hr)

**Depends on P3 + P6.** The append-only D1 work.

1. New append-only migration `worker/migrations/0009_*.sql` adding a `party_size` column to `score_submissions` (default 1, so existing rows = solo). Survival boards partition by `(scene, party_size)`.
2. [`worker/src/d1.ts`](../worker/src/d1.ts): `submitScore` records `party_size` from `additionalData`; `getLeaderboard` / `getAllLeaderboards` partition survival by it. On run death the DO's `onSubmitScores` submits each player's `peakFlock` with the room's `party_size`.
3. Client: the GlobalLeaderboard surfaces co-op survival boards (a party-size tab or row), and the run-summary shows the co-op board.
4. Worker tests for the party-size partition (solo vs co-op survival stay separate; migration append-only).

**Acceptance (EARS):**

- When a co-op survival run ends, then each player's peak flock shall post to the `(newsheepdogland, survival, party_size=N)` partition.
- When a solo survival score and a co-op score exist, then they shall rank on separate boards (party_size partitions).
- When the migration is added, then it shall be a new sequence-numbered file (`0009_*.sql`), never an edit to an applied migration.
- When `npm test` runs, then the party-size partition tests shall pass.

## Phase 8 - Validation + browser smoke + ship (~3hr)

**Depends on all prior phases.**

1. Full validation: `npm test`, `npm run lint`, worker `tsc`, `npm run build` (record any bundle ratchet in [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json)). Confirm the 9 sheep sim-baseline fixtures are **byte-identical** (survival is additive; any diff is a leak - stop and find it).
2. Two-client co-op browser smoke (preview on a fresh build, `SDS_SUPPRESS_BROWSER_OPEN=1`, close every tab/listener after): create a survival room, a second client joins, host starts, both herd the shared flock, race dusk, survive a wolf night together, grow the flock, then lose the run and see the co-op leaderboard. Zero console errors. Save proof under `cycle67-validation/`.
3. Ship: commit per phase, push to `main`, confirm the deploy is green (the worker deploy applies migration 0009 to remote D1), verify on prod (a survival room creates + a second client joins).

**Acceptance (EARS):**

- When `npm test`, `npm run lint`, worker `tsc`, and `npm run build` run at cycle close, then all shall pass.
- When the sheep sim-baseline suite runs, then all 9 fixtures shall be byte-identical (no deterministic sheep-sim change).
- When the two-client co-op smoke completes, then a full shared survival run (join, herd, retire, wolf night, growth, death, co-op score) shall be verified with no console error, proof under `cycle67-validation/`.
- When the close commit lands on `main`, then the deploy shall succeed and co-op survival shall be live on Newsheepdogland.

## Dependencies

```
P1 (shared cores) -> P2 (wolf AI + renderer) -> P3 (DO tick) -> P4 (room mode)
                                                      |              |
                                                      +-> P5 (wire) -+-> P6 (client render/HUD)
                                                                          |
                                                            P7 (leaderboard) -+-> P8 (validate + ship)
```

P1 -> P2 -> P3 is the serial spine. P4 (room mode) and P5 (wire) both depend on P3 and can run in parallel. P6 needs P5. P7 needs P3 + P6. P8 is last.

## Frozen files (cycle-specific authorization)

The durable fence is [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). This cycle is **authorized** to touch:

- **The `shared/` deterministic boundary** - by ADDING the new `shared/survival/*` modules (they must obey the full `shared-sim.md` contract: no `js/`/Three/DOM/`Math.random`/`Date.now`/un-pinned trig in any predicted path). The existing sheep cores (`MovementPhysics`, `FlockingAlgorithms`, `BoundaryCollision`, `GameStateValidation`) are NOT touched.
- **The wire protocol** ([`worker/src/GameSim.js`](../worker/src/GameSim.js) `createGameStateSnapshot` + the client unpacker) - the additive survival + wolves blocks + the `v` version tag, with the four-piece migration story in P5.
- **[`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts)** - the `survival` mode gate + the survival tick wiring.
- **D1 migrations** ([`worker/migrations/`](../worker/migrations/)) - new append-only file only (`0009_*.sql`).
- **[`shared/scenes/newsheepdogland.js`](../shared/scenes/newsheepdogland.js)** `allowedModes` - add `survival`.

## Hard stops

Durable stops apply ([`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. **The sheep sim stays byte-identical.** This cycle does not change the deterministic sheep cores. The 9 sim-baseline fixtures must not move. Any drift is a leak - find it, do not regenerate.
2. **No `Math.random` / `Date.now` / un-pinned trig in `shared/survival/*` predicted paths.** Seed from `room.seed`. Wolves are authoritative-only, so their spawn-ring trig is tolerated; but if any survival code starts being client-PREDICTED, the trig must go.
3. **The wire change is fence-frozen.** No wire-format edit ships without the four-piece migration story (named change, in-flight-session story, consumer list, version-tag acceptance) - see P5. Without those, stop and surface.
4. **D1 migrations are append-only.** New sequence-numbered file only; never edit an applied migration.
5. **Don't decompose `GrassSystem` / `OptimizedSheep`.** Cohesive by design.
6. **No version bump** unless Matt explicitly calls it.

## What NOT to do during this cycle

- Don't make wolves/the run client-PREDICTED (the authority model is render-from-snapshot - Q1). That is the whole point of the cycle's simplicity.
- Don't touch the deterministic sheep sim or regenerate the sheep sim-baselines.
- Don't build full DO-storage persistence of the multi-day run for worker-redeploy resilience (deferred - Q5); in-memory matches existing co-op.
- Don't tackle the whole-island grass rearch here (separate perf spike, in BACKLOG).
- Don't reach for Blender / external tools; reuse `Wolf.glb` + the existing assets.
- Don't auto-bump the version or auto-post devlog/marketing.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each. Don't pre-check.

- [ ] When the cycle closes, all 8 phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When `shared/survival/*` is imported, then it shall pull no `js/`/Three/DOM/`Math.random`/`Date.now` (ESLint + grep clean).
- [ ] When solo survival plays on Newsheepdogland, then it shall behave exactly as Cycle 66 (the promotion is behavior-preserving for solo).
- [ ] When a co-op survival room runs, then the DO shall be authoritative for the run, the wolves, and the pen, and clients shall render them from the broadcast.
- [ ] When 2-4 players play a survival night, then they shall share one flock, see the same wolves + day clock, and a bark by any player shall repel wolves for all.
- [ ] When a co-op run ends, then each player's peak flock shall post to the party-size-partitioned survival leaderboard.
- [ ] When `npm test`, `npm run lint`, worker `tsc`, and `npm run build` run, then all shall pass and the 9 sheep sim-baselines shall be byte-identical.
- [ ] When the close commit lands on `main`, then the deploy shall succeed (migration 0009 applied) and co-op survival shall be live.

## References

- [`docs/archive/cycles/cycle-66-plan.md`](archive/cycles/cycle-66-plan.md) - the solo survival cycle this promotes
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - the deterministic-sim contract (the spine of P1/P2)
- [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) - the DO/wire contract (the four-piece wire-change rule, P5)
- [`shared/BarkImpulse.js`](../shared/BarkImpulse.js) - the dual-call-site template (client predictor + worker authoritative)
- [`worker/src/GameSim.js`](../worker/src/GameSim.js) - the authoritative tick + snapshot
- [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) - the room lifecycle + `onSubmitScores`
- [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) - the render-from-snapshot pattern the `WolfRenderer` mirrors
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the plan template
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
