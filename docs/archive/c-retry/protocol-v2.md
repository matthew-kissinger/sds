# Protocol v2 - SDS Multiplayer Wire Contract (C-retry)

> Status: DRAFT - prep artifact for the Cycle 2 retry of the Cloudflare Workers backend migration. Nothing in this doc has been implemented yet. Do not reference this as a description of production behavior.

This document is the single source of truth for the MessagePack-over-WebSocket message envelope used between the SDS browser client and the Cloudflare Workers + RoomDO backend. It exists because Cycle 1 shipped a protocol that partly matched what the client expected and partly did not, and the mismatches were only caught by an Opus audit after DNS was swapped. See `POSTMORTEM.md` Section 3 and `docs/cycle-1-audit.md` Critical section for the seven launch-blocking bugs that motivated this rewrite.

The writeup is intentionally exhaustive on the **state message field contract** because that is where Cycle 1 failed most of its bugs.

---

## 1. Envelope

- **Transport:** WebSocket (`wss://sheepdogsim.com/r/{roomCode}/ws` for room traffic; `wss://` not `ws://` in production; plain `ws://` for `wrangler dev`).
- **Encoding:** MessagePack (`@msgpack/msgpack`, `encode` / `decode`). Binary frames only. No JSON over WS.
- **Top-level shape:** every frame is a MessagePack-encoded object with at minimum:
  - `v: number` - protocol version. v2 = `2`. Server rejects frames whose `v` does not match with a `{t:'error', code:'proto_version', ...}` reply and closes with code `4001`.
  - `t: string` - message type tag (see Sections 2 and 3).
  - All other fields are type-specific payload.
- **Size limit:** server rejects any inbound frame > 32 KB. Outbound state frames are expected to stay < 8 KB with delta encoding. If a full snapshot is needed, it may exceed this; snapshots are fragmented only if they do, which is a later optimization and not in scope for the retry.
- **Error framing:** `{v:2, t:'error', code:<string>, msg:<string>}`. Codes are stable identifiers (`auth_required`, `proto_version`, `room_full`, `bad_input`, `internal`). `msg` is human-readable English, never user-facing without translation.
- **Heartbeat:** server calls `setWebSocketAutoResponse(new WebSocketRequestResponsePair('\x01ping', '\x01pong'))` so hibernation survives. Client sends the 5-byte literal string `\x01ping` (not MessagePack-encoded) every 25s; the leading `\x01` control byte makes it unambiguous vs any real MessagePack frame. Do not reuse `{t:'ping'}` as an envelope for hibernation-friendly heartbeats - those would wake the DO.
- **RTT measurement:** separate from heartbeat. Client emits `{v:2, t:'rtt', id, clientTs}` and server echoes it back unchanged as `{v:2, t:'rtt', id, clientTs, serverTs}`. This wakes the DO intentionally; rate limited to once every 5s.

---

## 2. Client-to-server messages

| `t`          | Payload fields                                                                                  | Direction | When sent                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| `hello`      | `v:2, playerId:string, persistentId:string, name:string, dogType:string, token:string, reconnect?:boolean, lastSeenTick?:number` | C->S      | First message after WS upgrade. See Section 5.                |
| `input`      | `v:2, t:'input', seq:number, dir:{x:number, z:number}, sprint:boolean, clientPos?:{x:number, z:number}, tick:number` | C->S      | Every local input frame (cap 60/s client-side).               |
| `start`      | `v:2, t:'start'`                                                                                | C->S      | Host only. Transitions room from `waiting` to `in-game`.      |
| `leave`      | `v:2, t:'leave'`                                                                                | C->S      | Player explicitly leaves a room. WS close also triggers leave. |
| `setDog`     | `v:2, t:'setDog', dogType:string`                                                               | C->S      | Lobby only. Rejected after `start`.                           |
| `modeLock`   | `v:2, t:'modeLock', locked:boolean, gameMode?:string`                                           | C->S      | Host only. Pins mode across public-room cycling.              |
| `rtt`        | `v:2, t:'rtt', id:number, clientTs:number`                                                      | C->S      | Every 5s for ping UI.                                         |

Notes:

- `clientPos` is the client's claimed dog position; the server validates with the Track A 5-unit-squared distance guard (see `server/GameSimulation.js:293-301` for the pre-existing guard in the Geckos path, which must be reused in `RoomDO.onPlayerInput`).
- `tick` on client inputs is informational; server is authoritative.
- `hello` replaces Cycle 1's `ready` message, which had no server handler (audit: "RoomDO never handles the `'ready'` client message.").

---

## 3. Server-to-client messages

Every `file:line` reference below is in the **current post-rollback Geckos codebase**. The C-retry will rewire the client to consume these same callbacks from a new WebSocket/MessagePack adapter; this table is the contract that adapter must honor.

| `t`            | Purpose                                                              | Client consumer (file:line, post-rollback code)                                                                  |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `welcome`      | Sent after `hello` accepted. Carries resolved identity + room state. | New - maps to `notifyRoomUpdate` + sets `this.playerId` in `js/NetworkManager.js:216-219` analog.                |
| `lobby`        | Room-level metadata changed (players, host, mode, modeLocked).       | `js/NetworkManager.js:211-237` (`roomCreated`/`roomJoined`/`roomUpdated`).                                       |
| `playerJoined` | A peer entered the room.                                             | `js/NetworkManager.js:239-250`.                                                                                  |
| `playerLeft`   | A peer left the room.                                                | `js/NetworkManager.js:252-263`.                                                                                  |
| `hostChanged`  | Host migrated (old host left).                                       | `js/NetworkManager.js:265-272`. Must include `newHostName` (Cycle 1 set it null; audit Minor bullet 5).          |
| `modeLock`     | Host toggled mode-lock state.                                        | `js/NetworkManager.js:274-283`.                                                                                  |
| `gameStart`    | Host pressed Start. Includes initial scene topology.                 | `js/NetworkManager.js:286-291`; triggers `createCompetitiveStructures` via `js/main.js:1727-1755`.               |
| `state`        | Per-tick authoritative simulation state. 20 Hz.                      | `js/NetworkManager.js:293-295` -> `js/main.js:1076-1304` (`handleMultiplayerGameState`).                         |
| `gameComplete` | Sim finished. Carries final scores and summary.                      | `js/NetworkManager.js:297-311` -> `js/main.js:967-1037`.                                                         |
| `publicLobbies`| Response to `getPublicLobbies` (REST in v2, not WS - see below).     | `js/NetworkManager.js:473-480`.                                                                                  |
| `error`        | Server-initiated error.                                              | `js/NetworkManager.js:315-323`.                                                                                  |
| `rtt`          | Echo of client `rtt` ping.                                           | New - maps to `handlePingResponse` in `js/NetworkManager.js:683-695`.                                            |

REST endpoints (out of WS scope, listed for completeness):

- `POST /api/register` - request `{persistentId, displayName, nameType}`, response `{token, playerId, persistentId, displayName, discriminator}`. **Must insert into `players` table** (Cycle 1 Critical bullet: "New players cannot register into `players` table.").
- `POST /api/rooms` - request `{playerName, dogType, roomSettings:{maxPlayers,isPublic,roomName,gameMode}}`, response `{roomCode, playerId, token}`. **This endpoint must exist** (Cycle 1 Critical bullet: "The multiplayer room REST endpoints do not exist on the worker.").
- `POST /api/rooms/:code/join` - request `{playerName, dogType}`, response `{roomCode, playerId, token}`.
- `POST /api/score` - request `{gameMode, score, roomCode?}`, response `{ok:true, newBest?:boolean}`. **Must update materialized bests in `players`** (Cycle 1 Critical bullet: "Score writes don't update leaderboard ranks.").
- `GET /api/leaderboard?mode=X&limit=N` - response `[{persistentId, fullName, score, rank}]`.
- `GET /api/lobbies` - response `[{roomCode, hostName, playerCount, maxPlayers, gameMode, state}]`.

---

## 4. State message field-by-field contract

This is the centerpiece of the doc. Every Cycle 1 rubber-banding or HUD-zero bug traces back to a missing or mis-scoped field on the tick state message. The server MUST send a `state` message at 20 Hz during `in-game`, shaped as follows. `*` marks fields that MUST appear in every frame (not only on game start or on change).

```ts
interface StateMsg {
  v: 2;
  t: 'state';
  tick: number*;          // monotonically increasing, starts at 0 at gameStart.
  now: number*;           // server unix ms, for client-side lag estimation.
  mode: 'cooperative' | 'competitive' | 'timed'*;  // explicit mode tag, see Section 7.
  sheep: SheepDelta[]*;   // delta: only entries whose state/position changed since last tick sent to this viewer.
  sheepFull?: SheepState[];  // full snapshot; emitted once on gameStart and on reconnect; not per tick.
  dogs: DogState[]*;      // always full for all dogs (few in number, cheap).
  sheepRetired: number*;  // SEE BELOW. Server-authoritative coop count. MUST be present in every frame for every mode.
  totalSheep: number*;
  gameCompleted: boolean*;
  competitiveGates: GateState[]*;  // MUST be present every frame when mode != 'cooperative'. Empty array when coop.
  playerScores?: Record<string, number>;  // ONLY present when mode !== 'cooperative'. See Section 7.
  winCondition?: WinConditionState;       // ONLY present when mode === 'competitive'.
  timedMode?: { timeRemaining: number; gameDuration: number };  // ONLY present when mode === 'timed'.
}

interface SheepDelta {
  id: number;            // stable sheep id, matches SheepState.id.
  x?: number; z?: number;
  vx?: number; vz?: number;
  state?: 0 | 1 | 2;     // 0 = active, 1 = retiring, 2 = grazing.
  facing?: number;
  hasPassedGate?: boolean;
  isRetiring?: boolean;
  assignedGate?: number | null;
  targetX?: number; targetZ?: number;
}

interface DogState {
  playerId: string;
  dogType: string;
  x: number; z: number;
  vx: number; vz: number;
  rotation: number;
  stamina: number;
  sprinting: boolean;
  sequence: number;             // last client input seq the server has applied.
  interpolatingToClient: boolean;  // REQUIRED - see Cycle 1 gap below.
}

interface GateState {
  id: number;
  x: number; z: number;
  playerId: string | null;      // owner of this gate (competitive/timed only).
  color: number;
  direction: 'north' | 'south' | 'east' | 'west';
  pasture: { x: number; z: number; radius: number };
}

interface WinConditionState {
  type: 'race' | 'highest_score';
  threshold?: number;           // 2-player race-to-101.
  maxScore: number;
  progress: number;             // 0..1.
  isComplete: boolean;
  totalCollected?: number;      // 3-4 player mode.
  totalSheep?: number;
}
```

### Field-by-field source/consumer mapping

| Field                        | Set by (current Geckos server)               | Read by (current client)                             | Cycle 2 requirement                                           |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `sheep[].x,z,state,...`      | `server/GameSimulation.js:977-993`           | `js/main.js:1085-1140`                               | Delta OK, but first frame is full snapshot.                   |
| `dogs[].interpolatingToClient` | `server/GameSimulation.js:1007`            | `js/main.js:1166`                                    | MUST be present every frame. Cycle 1 bug.                     |
| `sheepRetired`               | `server/GameSimulation.js:970`               | `js/main.js:1019, 1281-1284, 1830, 1869, 1875, 1882` | MUST be present every frame in ALL modes. Cycle 1 bug.        |
| `totalSheep`                 | `server/GameSimulation.js:971`               | `js/main.js:1031`                                    | Present every frame.                                          |
| `gameCompleted`              | `server/GameSimulation.js:972`               | `js/main.js:1023, 1025`                              | Present every frame; becomes true on the final tick.          |
| `competitiveGates`           | `server/GameSimulation.js:1018-1026`         | `js/main.js:1215-1256, 1584-1589, 1727-1755`         | MUST be present every frame (not just gameStart). Cycle 1 bug.|
| `playerScores`               | `server/GameSimulation.js:1015`              | `js/main.js:1181, 1191-1212, 1269`                   | **Omit in coop.** Cycle 1 bug.                                |
| `winCondition`               | `server/GameSimulation.js:1029`              | `js/main.js:1260-1265, 1272-1274`                    | Only in competitive.                                          |
| `timedMode`                  | `server/GameSimulation.js:1042-1045`         | `js/main.js:1287-1303`                               | Only in timed.                                                |
| `mode`                       | (not present in current Geckos snapshot)     | **new for v2**                                       | Disambiguates coop vs competitive vs timed unambiguously.     |

### Delta vs full

- `sheep` is always a delta against the last `state` frame **sent to this specific viewer** (per-viewer `prevSnapshots` map in RoomDO). Entries are included if any field changed or if position moved > 0.1 units.
- On `gameStart` the server sends one `state` frame with `sheepFull` populated and `sheep: []`. Subsequent frames use `sheep` only.
- On reconnect (see Section 6) the server sends a full snapshot frame before resuming deltas.

---

## 5. Identity handshake

Cycle 1 stripped identity from the WS URL entirely (`/r/:code/ws` with no query string) and the REST layer `playerId` was discarded on upgrade (audit Significant bullet: "Reconnect logic will loop and never succeed on DO backend." and the critical consequence: every connection got randomized credentials from RoomDO's perspective). v2 fixes this by moving identity off the URL and into a mandatory first WS message:

**Flow:**

1. Client calls `POST /api/register` (or reuses a stored token from localStorage). Response includes `token` and `playerId`.
2. Client calls `POST /api/rooms` or `POST /api/rooms/:code/join` with `token`. Response confirms `playerId` and `roomCode`.
3. Client opens `wss://.../r/{roomCode}/ws`. No query string; no identity in the URL.
4. Within 5 seconds of the upgrade, the client MUST send `{v:2, t:'hello', playerId, persistentId, name, dogType, token}`.
5. Server verifies `token` (JWT HMAC over `{persistentId, exp}`), looks up `playerId` in room state set during the REST join, confirms they match, and replies with `{v:2, t:'welcome', playerId, roomState}`.
6. If `hello` is missing, malformed, token invalid, or playerId mismatch, server sends `{t:'error', code:'auth_required'}` and closes with WS code `4003`.

Rationale for hello-in-WS vs query-string:

- URL query strings end up in CF logs; tokens in query strings are a finger-wagger.
- The REST `join` call has already put `(playerId, token-exp, name, dogType)` into RoomDO storage; `hello` is strictly a session-binding, not a credential handoff.
- Reconnect (Section 6) reuses the same `hello`, with `reconnect:true` and `lastSeenTick`.

---

## 6. Reconnect contract

When the client detects a WS close outside an explicit `leave`:

1. Client keeps `roomCode`, `playerId`, `token`, `name`, `dogType`, and `lastSeenTick` (highest `tick` from any received `state` message).
2. Client reopens `wss://.../r/{roomCode}/ws`.
3. Client sends `{v:2, t:'hello', playerId, persistentId, name, dogType, token, reconnect:true, lastSeenTick}`.
4. Server verifies:
   - Token still valid (not expired).
   - `playerId` still in the room's player list (RoomDO storage). If the grace window expired and the slot was freed, reply `{t:'error', code:'expired_session'}` with WS code `4004`.
5. Server reattaches the WS to the existing player slot, emits `welcome`, then one `state` frame with `sheepFull` populated, then resumes 20 Hz delta stream.
6. Grace window: 30 seconds. RoomDO keeps the player's slot alive for 30s after WS close before electing a new host or broadcasting `playerLeft`.

Server-reconstructed state after a clean reconnect:

- Dog position + velocity + stamina: from `sheepdogs.get(playerId)` - unchanged during the grace window.
- Input sequence: server uses the next tick's sequence; client's prediction buffer is cleared on reconnect.
- `competitiveGates` and player's assigned gate: unchanged during grace.

---

## 7. Fields Cycle 1 missed and how v2 closes them

The following is a direct mapping from every Critical-severity failure in `docs/cycle-1-audit.md` to the v2 provision that prevents its recurrence. Numbering matches the seven-item list in `POSTMORTEM.md` Section 3.

1. **`POST /api/rooms` and `POST /api/rooms/:code/join` did not exist.** v2 Section 3 lists both endpoints as mandatory contract. A C-retry implementation that passes its 2-client integration test cannot omit them - the test depends on the response shape `{roomCode, playerId, token}`.
2. **`POST /api/score` did not update materialized bests.** v2 Section 3 documents `/api/score` response as `{ok:true, newBest?:boolean}` - the `newBest` flag is only truthful if the handler does the `UPDATE players SET ..._best = ...` write. Any handler that only inserts into `score_submissions` cannot honestly return `newBest`.
3. **`POST /api/register` did not insert into `players`.** v2 Section 3 documents the response as including `discriminator`, which is allocated at insert time in the droplet's `LeaderboardManager.assignDiscriminator`. The handler must port that logic.
4. **WS join stripped identity.** v2 Section 5 (Identity handshake) replaces the URL-query-string anti-pattern with a mandatory `hello` message. Reconnect (Section 6) also uses `hello` with `reconnect:true`.
5. **Adapter routed coop as competitive.** v2 Section 4 requires `mode: 'cooperative' | 'competitive' | 'timed'` on every `state` message. `playerScores` is omitted in coop. A client that routes by "does `playerScores` exist?" cannot see a falsey-but-present `playerScores` and misroute.
6. **`competitiveGates` sent only once at gameStart.** v2 Section 4 makes `competitiveGates` a per-frame field. A server that sends it only in `gameStart` fails the v2 contract and a 2-client test that verifies gate rendering on a client that joined mid-match.
7. **`interpolatingToClient` stripped from DogState.** v2 Section 4's `DogState` interface lists `interpolatingToClient: boolean` as required (no `?`). The C-retry server must emit it every frame the same way the droplet code does at `server/GameSimulation.js:1007`.

Secondary gaps also closed:

- **`sheepRetired` not on the wire in coop.** v2 Section 4 requires `sheepRetired: number` every frame, all modes. Server-authoritative; client never infers from sheep array.
- **`hostChanged.newHostName` null.** Section 3 requires `newHostName` be populated (see `js/NetworkManager.js:271` consumer).
- **`ReadyMsg` dead on the wire.** Removed from v2; `hello` is the post-upgrade handshake.

---

## 8. Verification checklist (for the implementer)

Before merging a v2 implementation, the implementer must walk this list with **two real browser sessions** (see `POSTMORTEM.md` Section 5.1):

- [ ] Host creates room; invite URL works; peer joins via `POST /api/rooms/:code/join`.
- [ ] Both clients receive `welcome` within 1s of WS upgrade.
- [ ] Start game; peer receives `gameStart` with `competitiveGates` (in competitive mode).
- [ ] Peer joins mid-match after reconnect; receives `sheepFull` snapshot and then delta stream.
- [ ] Coop mode: `sheepRetired` counter in HUD matches server truth every second.
- [ ] Competitive mode: gate meshes render on both clients.
- [ ] Stop the dog; no rubber-banding in either window (`interpolatingToClient` reconciliation works).
- [ ] Host disconnects; `hostChanged` fires with populated `newHostName`.
- [ ] Run the 2-client integration test from `POSTMORTEM.md` Section 5.3 against `wrangler dev` before any production API call.
