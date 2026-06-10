# Delta wire protocol design (P2-DELTA-DESIGN)

> Design doc for changed-sheep-only delta broadcasts plus periodic keyframes.
> Design only. Nothing in this doc is implemented yet. Implementation is
> P2-DELTA-IMPL (server) and P2-DELTA-CLIENT (client), gated on Matt's sign-off.
>
> Fence note: the wire protocol is fence-frozen. This doc supplies all four
> pieces the four-point rule in `.claude/rules/multiplayer.md` requires:
> (1) the named change, (2) the in-flight-session migration story, (3) the full
> consumer list, (4) the version-tag acceptance lines. See sections below.

## 1. The current protocol, as actually shipped

`.claude/rules/multiplayer.md` and `DECISIONS.md` item 5 claim "MessagePack over
WebSocket with delta-encoded sheep state". The delta-encoding half is
aspirational. What ships today:

- `worker/src/GameSim.js` ticks at 60Hz (`tickRate = 60`, line 136) and stores a
  full snapshot every tick: `broadcastGameState()` (line 1230) calls
  `createGameStateSnapshot()` (line 1349) and caches it as `this.lastGameState`.
- `worker/src/RoomDO.ts` runs a broadcast loop on a 16ms `setInterval`
  (`startBroadcastLoop`, lines 963-970), so 62.5 frames/s, each frame the FULL
  snapshot: `this.broadcast('gameStateUpdate', state)`. `broadcast()` (lines
  1109-1124) msgpack-encodes ONCE via `encodeMsg` (line 165,
  `@msgpack/msgpack`) and sends the same buffer to every socket.
- The snapshot shape (GameSim.js lines 1359-1488): top-level scalars
  (`v: PROTOCOL_VERSION`, `timestamp`, `sheepRetired`, `totalSheep`,
  `gameCompleted`, `isCompetitive`, `isTimedMode`), a `sheep` array with one
  record per sheep every frame (`id`, `x`, `z`, `vx`, `vz`, `state`, `facing`,
  `hasPassedGate`, `isRetiring`, conditional `killed`, `assignedGate`,
  `targetX`/`targetZ`; positions, velocities, and facing quantized to 2
  decimals), a `sheepdogs` array, and conditional `competitive`, `timedMode`,
  `objective`, `survival`, `wolves` blocks.
- There is no tick counter on the wire, only `timestamp`. Because the 16ms
  broadcast loop is slightly faster than the 60Hz sim, the same snapshot object
  is occasionally broadcast twice.
- `shared/protocol.js` defines `PROTOCOL_VERSION = 2` and
  `SURVIVAL_MIN_PROTOCOL_VERSION = 2`. The client sends `protocolVersion` on
  room create and join (`js/NetworkManager.js` lines 414, 452). The Worker
  forwards it on join only (`worker/src/index.ts` line 498); the create handler
  (lines 421-435) drops it. The DO reads it solely to refuse a too-old client
  from a survival room (`worker/src/RoomDO.ts` lines 488-499) and does NOT
  store it on the player record.
- Client receive: `js/NetworkManager.js` `_onWsMessage` (lines 171-257)
  msgpack-decodes, routes `gameStateUpdate` to `_handleGameStateUpdate`
  (lines 566-576), which strips `t`, rotates `previousServerState` /
  `lastServerState`, feeds the jitter estimator (`recordPacketArrival`, lines
  578-595, which drives `interpolationDelay`), and notifies. Unknown `t`
  values fall to the default case and are ignored (lines 253-255).
- Client apply: `js/boot/initNetwork.js` `handleMultiplayerGameState`
  (lines 198-280) maps `serverState.sheep[i]` onto `clientSheep[i]` BY ARRAY
  INDEX, treating most fields as optional (`!== undefined` guards). The
  wrapper is `js/main.js:2239`; dog reconciliation reads
  `networkManager.lastServerState.sheepdogs` (`js/main.js:2997, 3060`).
  `getInterpolatedGameState` / `_interpolateGameState`
  (`js/NetworkManager.js` lines 597-620) also lerp `prev.sheep[i]` against
  `curr.sheep[i]` by index.

Two load-bearing facts the delta design exploits:

1. **Sheep array indices are already positionally stable for the life of a
   round.** `gameState.sheep` is populated once at init (`GameSim.js:283-308`,
   the only `push`); competitive "removal" reuses the slot in place
   (`GameSim.js:1671-1689`, the `id` changes but the index does not); survival
   pre-allocates the full `maxFlock` pool and toggles a `dormant` flag. The
   client already depends on index identity. Delta frames key on the index.
2. **Unknown message types and unknown fields are ignored by old clients.**
   The v2 additive precedent (Cycle 67) established this.

## 2. Baseline egress arithmetic (measured)

Measured with the repo's `@msgpack/msgpack` (`node -e` against representative
records; non-integer numbers encode as float64, 9 bytes, and the string keys
dominate at 51 bytes per sheep record):

| Item | Bytes |
|---|---|
| Full `gameStateUpdate`, 200 sheep + 4 dogs | 20,826 |
| One sheep record, moving (non-integer floats) | 102 |
| One sheep record, grazing (integer zero velocity) | 86 |
| One sheepdog record | 179 |
| Envelope (`t` + scalars, no entity arrays) | 129 |

Baseline per-room egress at 200 sheep / 4 players / 16ms broadcast interval
(62.5 frames/s):

```
per client:  20,826 B  x 62.5 /s  = 1,301,625 B/s  ~ 1.30 MB/s
per room:    1,301,625 x 4        = 5,206,500 B/s  ~ 5.2 MB/s
                                  ~ 312 MB/min, ~ 3.1 GB per 10-minute round
```

WebSocket framing overhead (~4 B/frame) is negligible against 20.8 kB payloads.
This is the number P2-DELTA-IMPL must beat by >= 50%, i.e. delta-path egress
<= 650,813 B/s per client over the measurement run (section 9).

Projected delta egress, assuming an average of 50 of 200 sheep changed per tick
(grazing flocks are mostly stationary; the wire quantum of 0.01 m means a
grazing drift below 0.625 m/s does not even cross the quantum every tick):

```
delta frame:  129 (envelope) + ~15 (tick fields) + 716 (4 dogs) + 50 x 106 (changed sheep + index key)
            ~ 6,160 B
per client:   1 keyframe (20,826) + 61.5 deltas x 6,160  ~ 400 kB/s   (69% drop)
```

Even at a sustained 100 changed sheep per tick the drop is ~47-50%, and the
section 4 degenerate-frame rule caps the worst case at keyframe size. The
realistic mixed-play measurement (section 9) is expected to land at 65-85%.

## 3. Frame design

### 3.1 Tick counter (additive, both frame kinds)

`GameSim` gains a monotonic `tick` counter incremented in `tick()`. Every
broadcast frame (full and delta) carries `tick`. Additive on the full snapshot,
so old clients ignore it (the Cycle 34/67 additive precedent).

### 3.2 Keyframe = today's full snapshot

A keyframe is the existing `t: 'gameStateUpdate'` frame, shape unchanged except
the additive `tick`. No new keyframe message type: this is what makes the
old-DO/new-client direction free (section 6).

### 3.3 Delta frame = new message type `gameStateDelta`

```
{
  t: 'gameStateDelta',
  v: PROTOCOL_VERSION,        // 3
  tick: <this frame's sim tick>,
  baseTick: <tick of the previous broadcast frame the diff was computed against>,
  timestamp, sheepRetired, totalSheep, gameCompleted, isCompetitive, isTimedMode,
  changed: [ { i: <sheep array index>, ...full quantized sheep record } , ... ],
  sheepdogs: [ ...full records, every frame... ],
  // conditional blocks exactly as on a full snapshot, every frame:
  competitive?, timedMode?, objective?, survival?, wolves?
}
```

Decisions baked into that shape:

- **Full sheep record per changed sheep, not per-field masks.** The win is
  dominated by omitting unchanged sheep (86-102 B each); a field mask would
  save a further ~30-50% on the changed minority at the cost of a second
  diffing layer and ambiguity against the existing conditional-key semantics
  (`killed`, `assignedGate`, `targetX`/`targetZ` already use absence to mean
  "not applicable"; reusing absence to also mean "unchanged" is a trap).
  Field masks remain a documented fallback lever if the 50% gate fails, which
  the projection says it will not.
- **The changed list is named `changed`, not `sheep`.** A delta can never be
  mistaken for a snapshot by a naive consumer; `changed[j].i` is the only
  index key.
- **`sheepdogs` and the conditional blocks ride every delta frame.** Dogs
  change essentially every tick anyway (716 B for 4), the blocks are small,
  the dog-reconciliation path reads `lastServerState.sheepdogs` every frame,
  and keeping their semantics identical to a snapshot means zero changes to
  their consumers.
- **Top-level scalars ride every frame** for the same reason (they are ~100 B).

### 3.4 "Changed" definition (precise)

Let `r_i(t)` be the quantized wire record `createGameStateSnapshot` builds for
sheep index `i` at broadcast tick `t` (positions, velocities, facing already
rounded to 0.01; booleans; conditional keys present or absent exactly as
today). Sheep `i` is **changed** at tick `t` iff `r_i(t)` differs from
`r_i(t_prev)` in any key's presence or value, where `t_prev` is the previous
broadcast frame (delta or keyframe).

Consequences, spelled out:

- The position/velocity epsilon is the existing wire quantum, 0.01. No second
  epsilon. A sheep whose rounded coordinates did not move does not ship.
- State-machine transitions (`state`), retirement (`isRetiring`,
  `targetX`/`targetZ` appearing or disappearing), gate passage
  (`hasPassedGate`), survival kills/dormancy (`killed` appearing), competitive
  reassignment (`assignedGate`), and competitive slot-reuse respawns (`id`
  changing in place, GameSim.js:1682) are all field differences, so all are
  changes. Nothing needs special-casing.
- The server keeps a `lastWire[i]` cache (200 records, rebuilt on keyframe) and
  does a flat key/value compare. No sim state is read beyond what the snapshot
  already reads.
- A retired or killed sheep stops changing and therefore stops shipping. That
  is where the 50%+ comes from.

### 3.5 Index stability invariant

The delta layer depends on the invariant in section 1 fact 1: `gameState.sheep`
never reorders, grows, or shrinks during a round. P2-DELTA-IMPL adds a comment
at the array's construction site and a unit assertion (section 9) so a future
refactor that splices the array fails loudly instead of desyncing silently.

### 3.6 Degenerate-frame rule

If the changed count exceeds 85% of the flock, send a keyframe instead of a
delta (and reset the cadence counter). A delta frame is then never meaningfully
larger than the baseline frame, bounding the worst case (mass panic, round
start) at today's cost.

### 3.7 Duplicate-tick frames

When the 16ms broadcast loop fires before the sim has ticked again
(`lastGameState.tick === lastBroadcastTick`), v3 clients get an empty delta
(`changed: []`, `baseTick === tick`'s previous value). ~850 B. The cadence is
preserved deliberately: the client jitter estimator
(`recordPacketArrival`) sizes `interpolationDelay` from packet intervals, and
silently skipping frames would distort it.

## 4. Keyframe cadence: N = 60 ticks (1 second)

- **Why keyframes at all:** the WS transport is reliable and ordered, so deltas
  are never lost in transit. Keyframes exist for (a) mid-game joins/rebinds,
  (b) client-local frame drops (the decode `catch` in
  `NetworkManager._onWsMessage` lines 177-180 silently discards a frame today),
  (c) defense against any reconstruction bug. They are drift insurance, not
  loss repair.
- **Why 60:** keyframe overhead is `20,826 B/s` per client, 1.6% of baseline
  egress at N=60, and worst-case drift repair latency is 1 s even if the
  on-demand path (section 5) fails. N=30 doubles the floor for a repair-latency
  improvement the on-demand path already provides; N=120 saves 0.8% of baseline
  for a worse worst case. 60 also aligns with the sim tick rate, so the rule is
  simply `tick % 60 === 0`.
- **Keyframe-on-start:** `gameStarted` already carries a full snapshot
  (`RoomDO.ts:954-957`); it gets the `tick` stamp and counts as the first
  keyframe.
- **Keyframe-on-join/rebind:** `bindSocket` unicasts a keyframe (via
  `send(ws, 'gameStateUpdate', ...)`) when a socket binds while
  `meta.state === 'in-game'` (mid-game reconnect after the grace window).
- **Keyframe-on-demand:** new inbound message `t: 'requestKeyframe'` handled in
  `handleClientMessage` (`RoomDO.ts:750+`), replying with a unicast keyframe.
  It passes the existing P-SEC-4 inbound rate limiter; additionally the DO caps
  unicast keyframes at 2 per second per client, because each request amplifies
  ~20.8 kB of egress and would otherwise be a cheap amplification lever.

Client drift detection: every frame carries `tick`; every delta carries
`baseTick`. The client applies a delta only when
`baseTick === lastAppliedTick`. On mismatch (a locally dropped frame) it
discards the delta, sends `requestKeyframe` (client-side cooldown 500 ms), and
ignores further deltas until a keyframe arrives. A keyframe unconditionally
replaces the reconstructed state and resets `lastAppliedTick`, so drift resets
to zero by construction.

Consistency note for unicast keyframes: the DO always keyframes from
`lastGameState` (the same state the shared delta stream is diffed against), so
a client that keyframes at tick T can apply the broadcast delta for tick T+1
directly. No per-client delta basis is ever needed; the delta stream stays a
single shared encode.

## 5. PROTOCOL_VERSION bump and per-client version strategy

`shared/protocol.js` changes:

```js
export const PROTOCOL_VERSION = 3;              // was 2
export const SURVIVAL_MIN_PROTOCOL_VERSION = 2; // unchanged; v3 satisfies it
export const DELTA_MIN_PROTOCOL_VERSION = 3;    // new
export const KEYFRAME_INTERVAL_TICKS = 60;      // new
```

Where the version lives in the handshake: the client already sends
`protocolVersion` in the REST create and join bodies
(`js/NetworkManager.js:414, 452`). Two gaps to close:

1. The Worker create handler must forward it: `worker/src/index.ts` lines
   421-435 add `hostProtocolVersion: body.protocolVersion` to the DO `/init`
   body (the join handler already forwards at line 498).
2. The DO must store it per session: `createRoom` (`RoomDO.ts:445-454`) and
   `joinRoom` (`RoomDO.ts:517-526`) add `protocolVersion` to the player record.
   `persist()` already serializes the players map (`RoomDO.ts:262`), so it
   survives DO restarts for free.

**Recommended strategy: per-client soft-degrade (version-tag per socket).**
The broadcast loop splits sessions into two cohorts by stored
`protocolVersion`:

- `>= DELTA_MIN_PROTOCOL_VERSION`: keyframes every 60 ticks as
  `gameStateUpdate`, `gameStateDelta` otherwise.
- `< 3` or absent (absent means legacy, matching the existing survival-check
  convention at `RoomDO.ts:492`): full `gameStateUpdate` every interval,
  byte-compatible with v2 except the additive `tick` field.

Each cohort's buffer is encoded once per interval and only when the cohort is
non-empty, preserving today's single-encode efficiency (`broadcast()`,
`RoomDO.ts:1109-1124`). A mixed room costs one extra encode per interval.

Why not the alternatives:

- **Refuse old clients:** non-survival rooms accept implicit-v1 clients today;
  refusing v<3 would hard-break every player holding a cached pre-deploy bundle
  during the Pages/Worker skew window, for no protocol necessity (the old
  format remains cheap to produce). Refusal is the right tool when an old
  client would MIS-RENDER (the survival precedent); here it would merely cost
  bandwidth.
- **Room-wide soft-degrade:** one old client would drag all four players back
  to full snapshots, and the room's behavior would change when someone joins.
  Per-client is deterministic per session and costs at most one extra encode.

## 6. In-flight-session migration story (the deploy window)

Pages (client bundle) and the Worker deploy in the same push but land at
slightly different moments, and players hold cached bundles for longer than
that. All four pairings:

| Client | DO | Behavior |
|---|---|---|
| v2 (old bundle) | old | Today's protocol, unchanged. |
| v2 (old bundle) | new | Client sends `protocolVersion: 2` (or nothing); the DO tags the session legacy and sends full `gameStateUpdate` every 16 ms, identical to today plus the ignored additive `tick`. Zero behavior change. |
| v3 (new bundle) | old | Old DO ignores `protocolVersion: 3` (it only checks the survival minimum, which 3 satisfies) and broadcasts v2 full frames. The v3 client treats every full `gameStateUpdate` as a keyframe regardless of cadence and never receives a `gameStateDelta`, so it plays exactly as today. No negotiation, no special case. |
| v3 (new bundle) | new | Target protocol: keyframes + deltas. |

Mid-game sessions across a Worker deploy: a DO code swap evicts the in-memory
sim (existing behavior, not changed here). Room meta and player records
rehydrate from storage; player records persisted before the deploy carry no
`protocolVersion`, which the DO conservatively treats as legacy, i.e. full
snapshots. Correct by default.

Required client property making the third row safe: the v3 client must treat
ANY full `gameStateUpdate` as an unconditional keyframe (replace + reset
`lastAppliedTick`), never requiring deltas to exist. P2-DELTA-CLIENT carries an
acceptance line for this.

## 7. Client reconstruction design

All reconstruction lives in `js/NetworkManager.js`, so every downstream
consumer keeps seeing full snapshots:

- The manager keeps a reconstructed full snapshot plus `lastAppliedTick`.
- On `gameStateUpdate` (keyframe or legacy-DO full frame): replace wholesale,
  reset `lastAppliedTick = tick ?? null` (old DOs send no tick; deltas only
  ever follow frames that have one).
- On `gameStateDelta` with `baseTick === lastAppliedTick`: build a NEW
  top-level object with a NEW `sheep` array; unchanged entries share the
  previous record references (records are treated as immutable once received),
  changed entries are the delta's records with `i` stripped, placed at index
  `i`. Scalars, `sheepdogs`, and conditional blocks come from the delta.
  The fresh-array rule matters because `_handleGameStateUpdate` rotates
  `previousServerState` / `lastServerState` and `_interpolateGameState`
  (lines 606-620) lerps prev against curr by index; in-place mutation would
  alias the two and flatten interpolation.
- On `baseTick` mismatch: discard, request keyframe (500 ms cooldown), drop
  deltas until the next keyframe.
- The reconstructed snapshot then flows through the EXISTING
  `_handleGameStateUpdate` body (state rotation, `recordPacketArrival`,
  `notifyGameStateUpdate`). `js/boot/initNetwork.js`
  `handleMultiplayerGameState`, `js/main.js` reconciliation, the survival
  drive path, and the interpolation path are deliberately untouched.

## 8. Determinism note (transport-only, stated explicitly)

The delta layer is pure transport. It serializes the output of
`createGameStateSnapshot` differently; it reads nothing the snapshot does not
already read and writes nothing into the sim. **No file in the deterministic
core (`shared/MovementPhysics.js`, `shared/BoundaryCollision.js`,
`shared/FlockingAlgorithms.js`, `shared/GameStateValidation.js`,
`shared/Vector2D.js`, `shared/ObjectiveLogic.js`, `shared/objective.js`,
`shared/terrain/Heightfield.js`) is touched. The only `shared/` edit is
constant additions to `shared/protocol.js`, which is not a sim core and not
covered by sim-baseline fixtures. `tests/sim-baseline/` fixtures must pass
byte-identical with zero regeneration; any sim-baseline diff during
P2-DELTA-IMPL is a hard stop.** Client prediction also remains untouched: the
predictor runs the shared sim as today, and reconciliation consumes the
reconstructed full snapshot, which P2-DELTA-CLIENT proves is identical to the
pre-delta shape.

## 9. Test plan

Unit, server (vitest, `tests/worker/`):

- **Round-trip:** drive a seeded `GameSimulation` (the
  `tests/worker/snapshot-shape.spec.ts` adapter pattern); at each of ~200
  ticks build the delta, apply it to the previous reconstructed snapshot with
  a reference apply function, and `expect(reconstructed).toEqual(fullSnapshot)`.
  Covers retirement, competitive respawn (id change in slot), survival
  kill/dormancy, and conditional-key gain-then-lose (the staleness trap
  snapshot-shape already locks for full frames).
- **Delta shape lock:** extend `tests/worker/snapshot-shape.spec.ts` with the
  `gameStateDelta` key set (`changed[j]` carries `i` plus exactly the snapshot
  record keys, conditional keys only when set).
- **Changed-set correctness:** a stationary grazing sheep produces no entry; a
  0.01-quantum move produces one; the 85% degenerate rule flips to a keyframe.
- **Cadence + cohorts:** keyframe at `tick % 60 === 0`; a `protocolVersion: 2`
  session receives only `gameStateUpdate`; a v3 session receives the
  keyframe/delta mix; a mixed room receives both correctly (extend
  `tests/worker/room-do-messages.spec.ts`'s socket-stub harness).
- **requestKeyframe:** unicast keyframe reply; the 2/s cap; fits the P-SEC-4
  inbound caps (extend `tests/worker/dos-caps.spec.ts`).
- **Index-stability assertion:** simulate a full round per mode and assert
  `gameState.sheep.length` and slot object identity never change.

Unit, client (vitest, `tests/`):

- **Reconstruction:** keyframe + delta sequence reproduces the server's full
  snapshots exactly; `previousServerState` and `lastServerState` never alias
  the same `sheep` array.
- **Drift reset:** drop one delta from the feed; the client sends
  `requestKeyframe`, ignores deltas, and converges on the next keyframe with
  zero residual diff. Cooldown respected.
- **Legacy DO:** a stream of full v2 frames (no `tick`, no deltas) plays
  through unchanged.

Egress measurement (the >= 50% gate, new
`tests/worker/delta-egress.spec.ts`):

- Drive a seeded 200-sheep / 4-player `GameSimulation` for 60 sim-seconds
  (3,600 ticks) with scripted dog inputs that include herding bursts (dogs
  orbiting and pressing the flock, not idle), so the changed-set is honest.
- Per tick, encode BOTH the legacy full frame and the delta-path frame
  (keyframe or delta per the cadence rules) with `@msgpack/msgpack` and sum
  `byteLength` for each path.
- Assert `deltaBytes <= 0.5 * fullBytes` and print both totals plus B/s so the
  number lands in the gate evidence. The baseline sum should reproduce
  section 2 within a few percent (62.5/60 cadence scaling noted in the
  harness).

Integration / e2e:

- Extend `tests/integration/` (the `wsClient.ts` + harness pattern) with a
  mixed-cohort room: one v2-joining client asserts full frames every interval,
  one v3 client asserts keyframe cadence and delta application.
- `tests/integration/coop-survival.spec.ts` and `tests/e2e/mp/` must pass with
  the new protocol (they consume `gameStateUpdate`; the integration helper
  needs `gameStateDelta` awareness, see consumer list).

## 10. Full consumer list

Server encode path:

- `worker/src/GameSim.js` - `tick()` (tick counter), `broadcastGameState()`
  (~1230), `createGameStateSnapshot()` (~1349, gains `tick`), new delta
  builder + `lastWire` cache.
- `worker/src/RoomDO.ts` - `startBroadcastLoop()` (963-970, cohort split),
  `broadcast()` / `send()` / `encodeMsg()` (165, 1101-1124), `createRoom`
  (445-454) + `joinRoom` (517-526) protocolVersion storage, `persist()` (255,
  free via players map), `bindSocket` (~653-731, keyframe-on-rebind),
  `handleClientMessage` (750+, `requestKeyframe`), `gameStarted` send
  (954-957, tick stamp).
- `worker/src/index.ts` - create handler (421-435) forwards
  `hostProtocolVersion`; join handler (486-501) already forwards.

Shared constants:

- `shared/protocol.js` - `PROTOCOL_VERSION` 3, `DELTA_MIN_PROTOCOL_VERSION`,
  `KEYFRAME_INTERVAL_TICKS`, doc comment update. Not a deterministic-sim core;
  no sim-baseline interaction.

Client decode path:

- `js/NetworkManager.js` - `_onWsMessage` switch (184-257, new
  `gameStateDelta` case), `_handleGameStateUpdate` (566-576), new
  reconstruction state + drift detection + `requestKeyframe` sender;
  `getInterpolatedGameState` / `_interpolateGameState` (597-620) unchanged but
  re-verified against reconstructed states.
- `js/boot/initNetwork.js` - `handleMultiplayerGameState` (198-280) unchanged
  by design (receives reconstructed full snapshots); verify only.
- `js/main.js` - `handleMultiplayerGameState` wrapper (2239) and
  dog-reconciliation reads of `lastServerState.sheepdogs` (2997, 3060)
  unchanged; verify only.

Tests asserting payload shape (all need review; starred ones need edits):

- `tests/worker/snapshot-shape.spec.ts` * - wire-shape lock; asserts `v` at
  lines 213/232 (tracks the bump); gains the delta shape lock.
- `tests/worker-objective-snapshot.spec.js` - objective block in
  `gameStateUpdate`; passes as-is (keyframes keep the shape), verify.
- `tests/worker/survival-room.spec.ts` * - version-refuse tests (lines
  108-133); add a v3-joins-survival case.
- `tests/worker/room-do-messages.spec.ts` * - broadcast-observation harness;
  gains cohort + `requestKeyframe` cases.
- `tests/worker/dos-caps.spec.ts` * - inbound caps; `requestKeyframe` cases.
- `tests/integration/coop-survival.spec.ts` * - asserts
  `dayA.v === PROTOCOL_VERSION` (line 151) and polls `gameStateUpdate` frames
  (102-110); must tolerate the keyframe/delta mix or pin its asserts to
  keyframes.
- `tests/integration/helpers/wsClient.ts` * - frame collector; gains
  `gameStateDelta` awareness.
- `tests/integration/harness.spec.ts` - verify.
- `tests/e2e/mp/_helpers.ts` + `tests/e2e/mp/` specs - real-client e2e; should
  pass unchanged once the client ships; verify.
- `tools/sds-test.mjs` * - CLI smoke client listens for `gameStateUpdate`
  (lines 30-36); joins as v3 (imports nothing today, sends no version, so it
  lands in the legacy cohort and keeps working; optionally teach it deltas).

Docs to update (P2-DELTA-DOC, after ship):

- `.claude/rules/multiplayer.md` - the "delta-encoded sheep state" claim
  becomes true; rewrite the wire-protocol paragraph to describe the actual
  mechanism (changed-sheep deltas, 60-tick keyframes, per-client soft-degrade).
  Rule file, fence-frozen: the P2-DELTA-DOC task is the authorization vehicle.
- `DECISIONS.md` - item 5 claims delta encoding shipped at the foundational
  pass; append a date-stamped entry recording when it actually shipped and the
  design choices here (append-only, do not rewrite item 5).
- `ARCHITECTURE.md` - the protocol description (~lines 10, 199, 339).
- `docs/hardening/phase-2-scale-backend.md` - status + gate evidence.

## 11. Acceptance lines for the implementing tasks

> Boxes checked 2026-06-09 (Cycle 86 Phase 1) per the post-hoc adversarial
> review ([`review-dossiers-2026-06-09.md`](review-dossiers-2026-06-09.md));
> each was verified against tests and code at review. The egress-gate line
> stays open: it holds from ~65% round progress, not at round start (see
> Deviations). The section 4 unicast consistency note was found wrong at
> review (dossier F1) and fixed in Cycle 86 Phase 2 with basis-aligned
> unicast keyframes.

P2-DELTA-IMPL (server):

- [x] When the DO broadcasts at a tick where `tick % 60 !== 0`, then v3 clients
      shall receive a `gameStateDelta` containing exactly the sheep whose
      quantized wire record changed since the previous broadcast frame, keyed
      by array index.
- [x] When `tick % 60 === 0`, when a game starts, when a socket binds mid-game,
      and when a client sends `requestKeyframe`, then the DO shall send a full
      `gameStateUpdate` keyframe stamped with `tick`.
- [x] While a session joined with `protocolVersion < 3` (or absent) is
      connected, the DO shall send it full `gameStateUpdate` frames every
      broadcast interval, byte-compatible with the v2 protocol except the
      additive `tick` field (version-tag / soft-degrade acceptance per the
      four-point rule).
- [ ] When the `delta-egress` harness runs 200 sheep / 4 players for 60
      sim-seconds with scripted herding input, then summed delta-path bytes
      shall be <= 50% of summed full-snapshot bytes (baseline 20,826 B/frame,
      ~1.30 MB/s per client).
- [x] If the changed-sheep count exceeds 85% of the flock, then the DO shall
      send a keyframe instead of a delta.
- [x] If a client sends more than 2 `requestKeyframe` messages per second, then
      the DO shall drop the excess requests.
- [x] When `npm test` runs, then `tests/sim-baseline/` fixtures shall pass
      byte-identical with zero regeneration (transport-only change).
- [x] When `PROTOCOL_VERSION` reads 3, then `SURVIVAL_MIN_PROTOCOL_VERSION`
      shall remain 2 and a v3 client shall join a survival room successfully.

P2-DELTA-CLIENT:

- [x] When a keyframe (any full `gameStateUpdate`) arrives, then the client
      shall replace its reconstructed snapshot wholesale and reset
      `lastAppliedTick` (drift resets to zero).
- [x] When a `gameStateDelta` with `baseTick === lastAppliedTick` arrives, then
      the client shall reconstruct a full snapshot deep-equal to the server's
      snapshot at that tick (round-trip unit test), and downstream consumers
      (`handleMultiplayerGameState`, interpolation, dog reconciliation) shall
      receive the identical shape they receive today.
- [x] If a `gameStateDelta` arrives with `baseTick !== lastAppliedTick`, then
      the client shall discard it, send `requestKeyframe` at most once per
      500 ms, and ignore further deltas until a keyframe arrives.
- [x] While connected to a pre-delta (v2) DO, the client shall play normally on
      full snapshots and never require a delta frame (in-flight migration
      acceptance per the four-point rule).
- [x] When `previousServerState` and `lastServerState` are compared after a
      delta apply, then they shall not alias the same `sheep` array.

## 12. Open items for sign-off

> 2026-06-09 (Cycle 86 Phase 1): all four were accepted by the acting
> reviewer during the autonomous run and re-verified at post-hoc review
> (dossier). They remain listed for Matt's own pass.

1. Confirm per-client soft-degrade over refuse (section 5 recommendation).
2. Confirm N = 60 (section 4).
3. Confirm full-record-per-changed-sheep over field masks (section 3.3), with
   field masks held as the fallback lever if the egress gate fails.
4. Confirm the 85% degenerate-frame threshold (any value 75-90% is defensible;
   85% keeps bursty herding in delta mode).

## Deviations (P2-DELTA-IMPL, 2026-06-09)

Recorded by the implementing task. The protocol shipped exactly as specified
in sections 3-6; the deviations below are measured-reality corrections to the
section 2 projection and the resulting egress-gate evidence.

1. **Factual error in the section 2 changed-set projection.** The projection
   assumed "grazing flocks are mostly stationary" with an average of ~50 of
   200 sheep changed per tick. Measured against the real `GameSimulation`
   (field scene, seed 424242, zero dog input): 199-200 of 200 sheep change
   EVERY tick, indefinitely. The MP server has no grazing state for
   cooperative play - every unretired sheep runs the boid pipeline every
   tick, and the cohesion/separation equilibrium never settles below the
   0.01 wire quantum (per-tick key-change counts: x ~200/200, z ~190/200,
   facing ~165/200, vx/vz ~50-90/200). A fully active flock therefore rides
   the section 3.6 degenerate rule into keyframes every frame.
2. **Egress gate evidence is round-progress-dependent.** Measured by
   `tests/worker/delta-egress.spec.ts` (200 sheep / 4 players / 60
   sim-seconds / scripted gate-herding, both paths encoded with the
   production msgpack encoder):
   - Round start, fully active flock: delta path = 100.0% of baseline
     (75,594,056 B both paths; the degenerate rule held the never-worse
     bound). The <= 50% gate FAILS for this state.
   - 120/200 retired: 53.7% of baseline.
   - 140/200 retired (the asserted scenario): 43.4% of baseline
     (25,762,858 B vs 59,296,181 B; 429,381 B/s vs 988,270 B/s per client;
     mean changed per delta 59.5 of 200).
   The 50% crossover sits near 65% retired. Savings accrue over the back
   half of a round and are ~0% at round start. The protocol's win comes
   from retired/killed/dormant sheep exactly as section 3.4 stated; the
   "mostly stationary grazing" contribution does not exist in this sim.
   Survival rooms (10-50 active of a 200 pool) sit deep in the winning
   regime from tick 1.
3. **What was NOT done about it.** The section 3.3 fallback lever (per-field
   masks) was not pulled: at 200/200 changed per tick, masked records with
   float64 values land near the gate line (~46-49% projected), so the lever
   does not confidently clear the gate either, and pulling it changes the
   reviewed wire shape mid-implementation. The honest levers, for a future
   decision: (a) fixed-point integer encoding of quantized floats (x100 as
   int, ~3-5 B vs 9 B float64), (b) a server-side calm/settle behavior for
   unpressured sheep (a sim-core change, fence-gated, with its own desync
   story), (c) accept progress-scaled savings. Surfaced for Matt's review
   alongside the owed design sign-off.
4. **`sheepRecordChanged` uses `Object.is`, not `===`.** A sheep stopping
   leaves `vx = -0`; msgpack encodes `-0` (float64) and `0` (fixint)
   differently, so a `0 <-> -0` flip must count as a change or the client's
   reconstructed snapshot diverges byte-wise from the server's. Object.is
   makes the round-trip exact (locked by the round-trip unit test).
5. **Test-plan file placement.** The cohort/cadence/bind/rehydration RoomDO
   coverage lives in a new `tests/worker/delta-broadcast.spec.ts` (reusing
   the room-do-messages socket-stub harness) rather than appended to
   `room-do-messages.spec.ts`, which stays P-SEC-2-scoped. The
   `requestKeyframe` cap cases extended `tests/worker/dos-caps.spec.ts` as
   planned; the delta shape lock extended `snapshot-shape.spec.ts` as
   planned; the delta-builder unit coverage is `delta-protocol.spec.ts`.
6. **Quick-match forwarding included.** Section 5 named only the create
   handler gap; the quick-match route also creates/joins rooms, so
   `worker/src/index.ts` forwards `protocolVersion` there too (the current
   client sends none on quick-match, so those sessions stay legacy until
   P2-DELTA-CLIENT adds it).
