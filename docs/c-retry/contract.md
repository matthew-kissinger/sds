# C-Retry Client/Server Contract

> Source of truth for the Cycle 2 Cloudflare Workers + Durable Objects + D1
> backend. Every endpoint and WebSocket message the client speaks must match
> this doc. If the server diverges from this table on a field the client reads,
> the cycle fails the pre-merge checklist in Section 5.
>
> Grounded in the current post-rollback client (`js/NetworkManager.js`,
> `js/main.js`, `js/components/**`) and in what Cycle 1 attempted but shipped
> broken (see `docs/cycle-1-audit.md`). The Cycle 1 client code itself was
> reverted; the C-retry client will reintroduce `fetch` + native `WebSocket`
> calls that match these shapes.

## Conventions

- JSON over HTTP, MessagePack over WebSocket (Decision 5, AGENT_PLAN section 2).
- WS message discriminator field is `t` (short string). Every message has a `t`.
- Persistent identity: `persistent_id` in localStorage (`js/components/shared/playerIdentity.js:8-16`), JWT issued by Worker `/api/register`, carried on WS upgrade via query string.
- File:line references point at the current (post-rollback) tree unless prefixed with `(C1)`. `(C1)` markers are facts about the broken Cycle 1 implementation, recorded here so the retry does not repeat them.

---

## 1. HTTP endpoints

| Method | Path | Request (JSON) | Response (JSON) | Client consumers (file:line) |
|--------|------|----------------|-----------------|------------------------------|
| POST | `/api/register` | `{ persistent_id: string, display_name: string, name_type: 'custom'\|'random'\|'anonymous' }` | `{ token: string (JWT, 24h), playerProfile: { persistent_id, displayName, fullName, discriminator } }` | `js/components/StartScreen/PlayerIdentitySetup.js:38,48-50,83,93-95,142-146,156-158`; `js/components/shared/playerIdentity.js:62-67` |
| POST | `/api/rooms` | `{ token, playerName, dogType, roomSettings: { maxPlayers, isPublic, roomName, gameMode } }` | `{ roomCode: string (6 char), playerId: string, isHost: true, room: Room }` | to be added in C-retry `NetworkManager.createRoom` replacement (mirrors today's `createRoom` emit at `js/NetworkManager.js:338-377`). **`(C1)` missing entirely** — `cycle-1-audit.md` item 1 |
| POST | `/api/rooms/:code/join` | `{ token, playerName, dogType }` | `{ roomCode, playerId: string, isHost: boolean, room: Room }` | to be added in C-retry replacement of `js/NetworkManager.js:379-408`. **`(C1)` missing entirely** — `cycle-1-audit.md` item 1 |
| POST | `/api/rooms/quick-match` | `{ token, playerName, dogType }` | `{ roomCode, playerId, isHost, room }` (same shape as join) | replaces today's `quickMatch` emit at `js/NetworkManager.js:410-438` |
| GET | `/api/lobbies` | — | `{ lobbies: [{ roomCode, hostName, gameMode, playerCount, maxPlayers, state: 'waiting'\|'in-game' }] }` | `js/components/Multiplayer/PublicLobbyList.js:54,130-188` (consumes `hostName`, `gameMode`, `playerCount`, `maxPlayers`, `state`, `roomCode`) |
| POST | `/api/score` | `{ token, gameMode, score, additionalData }` | `{ success: true, isNewRecord: boolean, newRank?: number }` | `js/components/shared/playerIdentity.js:79-84` (reads `isNewRecord`); server **MUST** update `players` materialized-bests row, not only insert into `score_submissions` — `(C1)` bug 2 |
| GET | `/api/leaderboard?mode=<mode>&limit=<n>` | — | `{ entries: [{ rank, displayName, fullName, formattedScore, persistent_id }] }` | optional, single-mode variant. Not used by the current client; kept for parity with the old `getLeaderboard` channel call (`js/NetworkManager.js:839-864`). |
| GET | `/api/leaderboards?limit=<n>` | — | `{ leaderboards: { soloClassic:[], soloExtreme:[], timed:[], competitive:[], cooperative:[] } }` where each array entry is `{ rank, displayName, fullName, formattedScore, persistent_id }` | `js/components/Multiplayer/GlobalLeaderboard.js:44-47,68,82-83,122,131,138,149` (reads `rank`, `displayName`, `fullName`, `formattedScore`); `js/NetworkManager.js:882` unwraps `data.leaderboards` |

`Room` shape (referenced from multiple endpoints and pushed by server via `room` WS message):
`{ code, hostId, hostName, gameMode, modeLocked, isPublic, maxPlayers, players: [{ id, name, dogType, ready, isHost }], state }`. Consumed at `js/main.js:923,948-955,1058-1060`; `js/components/Multiplayer/RoomJoin*/*` via `multiplayerUI.updatePlayers`.

---

## 2. WebSocket: client → server

Upgrade URL: `wss://api.sheepdogsim.com/r/:code/ws?token=<jwt>&playerId=<id>&name=<encoded>&dogType=<slug>&public=<0|1>`. The `playerId`, `name`, `dogType` **must** be honored by the DO and **must not** be regenerated server-side — `(C1)` audit item "reconnects create strangers" (`cycle-1-audit.md` Critical #4; Significant "Reconnect logic will loop").

| `t` value | Payload | When sent | Notes |
|-----------|---------|-----------|-------|
| `ready` | `{}` | Immediately after WS open, post-REST-join | Server **must** have a `case 'ready'` handler. `(C1)` bug: RoomDO fell through `default: break` — `cycle-1-audit.md` Critical #4 |
| `input` | `{ direction: {x,z}, sprint: bool, timestamp: number, clientPosition: {x,z}\|null }` | Per-frame while moving or just after stopping (`js/main.js:1363-1376`) | `clientPosition` only sent on the final frame after stopping; server clamps at 5-unit radius per Track A fix |
| `startGame` | `{}` | Host clicks start (`js/NetworkManager.js:491-495`) | Server ignores if sender is not host |
| `setDogType` | `{ dogType: string }` | Dog selection in lobby (`js/NetworkManager.js:498-503`) | |
| `setModeLock` | `{ locked: bool }` | Host toggles mode cycling (`js/NetworkManager.js:485-489`) | |
| `leaveRoom` | `{}` | Leave button / room switch (`js/NetworkManager.js:440-447`) | |
| `ping` | `{ id, timestamp }` | Every 5 s (`js/NetworkManager.js:665-680`) | Server echoes to `pong`. Do not rely on CF `setWebSocketAutoResponse('ping','pong')` — `(C1)` dead config, `cycle-1-audit.md` Minor |

---

## 3. WebSocket: server → client

| `t` value | Payload fields the client reads | Client consumers (file:line) |
|-----------|----------------------------------|-------------------------------|
| `roomCreated` | `{ room, playerId }` | `js/NetworkManager.js:211-219` (stores `room`, `playerId`, `isHost=true`) |
| `roomJoined` | `{ room, playerId, isHost }` | `js/NetworkManager.js:221-229` |
| `roomUpdated` | `{ room }` | `js/NetworkManager.js:231-237`; `js/main.js:946-955` |
| `playerJoined` | `{ room, playerId, playerName }` | `js/NetworkManager.js:239-250`; `js/main.js:961-962` |
| `playerLeft` | `{ room, playerId, playerName }` | `js/NetworkManager.js:252-263`; `js/main.js:963-966` |
| `hostChanged` | `{ newHostId, newHostName, isHost, room }` | `js/NetworkManager.js:265-272`; `js/StartScreen.js:77-79`. `newHostName` must be a real name, not `null` — `(C1)` audit item "hostChanged.newHostName set to null" |
| `modeLockChanged` | `{ modeLocked, gameMode }` | `js/NetworkManager.js:274-283` |
| `gameStarted` | `{ competitiveGates?, playerScores?, winCondition?, gameMode, ... }` | `js/NetworkManager.js:286-291`; `js/main.js:967-1013,1584-1590,1245-1249`. `competitiveGates` **must** be retained client-side — `(C1)` bug 6: adapter dropped them |
| `state` (60→20 Hz tick) | `{ sheep: [{ state, hasPassedGate, isRetiring, assignedGate, x, z, vx, vz, targetX, targetZ, facing }], sheepdogs: [{ playerId, x, z, vx, vz, rotation, sprinting, interpolatingToClient, stamina }], sheepRetired?, competitive?: { playerScores, gates, winCondition }, timedMode?: { timeRemaining, gameDuration } }` | `js/main.js:1085-1303` consumes every listed field by name. **Every field matters:** `interpolatingToClient` at `js/main.js:1166` — `(C1)` bug 7; `sheepRetired` top-level at `js/main.js:1281-1283` — `(C1)` bug 5; `competitive.gates` retained across states at `js/main.js:1215-1257` — `(C1)` bug 6; `assignedGate` at `js/main.js:1109-1111`; `timedMode.timeRemaining` at `js/main.js:1288-1301` |
| `gameComplete` | `{ isCompetitive?, isTimedMode?, competitive?: { winner, finalScores }, sheepRetired?, gameCompleted }` | `js/NetworkManager.js:297-312`; `js/main.js:967-1036`. `finalScores[playerId]` read at `main.js:989,1010` |
| `publicLobbies` | `{ lobbies: [...] }` (same shape as REST `/api/lobbies`) | `js/components/Multiplayer/PublicLobbyList.js:53-57` |
| `pong` | `{ id }` | `js/NetworkManager.js:331-334,683-695` |
| `roomError` | `{ message }` | `js/NetworkManager.js:320-323,369-372,400-403,430-433` |
| `error` | `{ message }` | `js/NetworkManager.js:315-318` |

---

## 4. Contract invariants

These are "must-hold" properties. Each one corresponds to a Cycle 1 bug in `docs/cycle-1-audit.md`. Any retry impl that fails one of these fails the pre-merge checklist.

1. **Register inserts a player row.** `POST /api/register` must `INSERT OR REPLACE INTO players(persistent_id, display_name, full_name, discriminator, created_at) ...` **before** the JWT is returned. Every `persistent_id` in a JWT must have a matching row in `players`. `(C1)` bug 3.
2. **Score writes update materialized bests.** `POST /api/score` inserts a `score_submissions` row *and* updates the matching `players.<mode>_best` / `competitive_wins` column in one transaction. `GET /api/leaderboard` reads only from `players`. `(C1)` bug 2.
3. **Room endpoints exist.** `POST /api/rooms`, `POST /api/rooms/:code/join`, and `POST /api/rooms/quick-match` return 200 on the happy path. A 404 on any of these is a launch-blocker. `(C1)` bug 1.
4. **WS upgrade honors REST identity.** The `playerId`, `name`, `dogType` on the WS query string must be adopted verbatim by the RoomDO. The DO must not synthesize a fresh playerId on upgrade. `(C1)` Critical #4 + Significant "Reconnect logic".
5. **Cooperative mode never takes the competitive branch.** `state.competitive` must be **absent** (not present-but-empty) when `gameMode === 'cooperative'`. The client routes on `serverState.competitive && serverState.competitive.playerScores` (`js/main.js:1181`); a zero-filled `playerScores` map will mis-route. `(C1)` bug 5.
6. **`competitiveGates` ride every state broadcast or are mirrored in `state.competitive.gates`.** The client code at `js/main.js:1215-1257,1584-1590` expects gates in every frame (or retained client-side by the adapter). `(C1)` bug 6.
7. **`DogState` includes `interpolatingToClient`.** Any tick where the server is interpolating toward a client-reported stop must set this flag true so the client can skip reconciliation (`js/main.js:1166,1383`). `(C1)` bug 7.
8. **Cooperative `sheepRetired` is server-authoritative.** Server computes and ships a top-level `sheepRetired: number` in every cooperative `state` broadcast. Client reads at `js/main.js:1281-1283`. Do not infer on the client.
9. **Tick-rate behavior is playtested before cutover.** 20 Hz makes per-tick rotation/interp steps 3x larger than the 60 Hz droplet. Two-client playtest with real sheep counts is required before any DNS move (`POSTMORTEM.md` 5.1).
10. **CORS allowlist includes all origins the client ships from.** `https://sheepdogsim.com`, `https://*.sheepdogsim.pages.dev`, `http://localhost:3000`, and the explicit preview URL for the PR. `(C1)` Significant item "CORS allowlist".
11. **Rollback is one command.** Frontend flag must not be build-baked; use a runtime `/config.json` or a `wrangler route delete`-level rollback. `(POSTMORTEM 5.5)`.
12. **`isPublic` is set once at room creation.** Reconnect/WS upgrade must not flip `room.isPublic` based on query string. `(C1)` Significant item "Public flag is only read on first WS connection".

---

## 5. Pre-merge checklist (from `POSTMORTEM.md` 5.2)

Tick every box before a C-retry PR merges. An unchecked box blocks the merge.

- [ ] For every `fetch()` URL referenced in Section 1, there is a matching Worker route in `worker/src/index.ts` and a curl against local `wrangler dev` returns the documented response shape.
- [ ] For every WS `t` the client sends (Section 2), there is an explicit `case` in `RoomDO.handleMessage` (**not** `default: break`). Grep for each `t` literal in the DO source.
- [ ] For every WS `t` the server broadcasts (Section 3), there is a client dispatch branch; grep confirms each `t` literal appears in `NetworkManager.js` or the C-retry equivalent.
- [ ] For every field listed in Section 3's "client reads" column, a two-client integration test reads the same field from a live server response — not just a unit fixture.
- [ ] Every invariant in Section 4 has an integration test: register → row in `players`; submit score → bump in `players.*_best`; cooperative game → no `competitive` key in `state`; etc.
- [ ] Contract doc has been re-grepped against the client source on the PR branch; every `file:line` above still resolves to the cited code.
- [ ] Rollback sequence is documented in the PR body as a single-command action.

---

## 6. Where to look when this doc drifts

- Client fetch calls: `js/NetworkManager.js`, `js/components/StartScreen/PlayerIdentitySetup.js`, `js/components/shared/playerIdentity.js`, `js/components/Multiplayer/GlobalLeaderboard.js`, `js/components/Multiplayer/PublicLobbyList.js`.
- Client WS consumers: `js/main.js` `handleMultiplayerGameState` (`main.js:1076-1304`), `onPlayerUpdate` (`main.js:960-1070`), `updateOtherPlayer` (`main.js:1563-1609`).
- Server (when the retry lands): `worker/src/index.ts` REST handlers, `worker/src/RoomDO.ts` WS handlers, `worker/src/protocol.ts` MessagePack shapes.
- Previous failure inventory: `docs/cycle-1-audit.md`.
- Process rules: `POSTMORTEM.md` sections 5.1-5.9.
