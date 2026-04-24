# Track B2 Audit - DO-references vs Geckos reality

> Audit performed 2026-04-23 after the POSTMORTEM explicitly warned that Track B2 components may reference DO-backend-only events that are no longer wired. This pass cross-checks every B2 code path against `server/index.js` (Geckos) and `server/RoomManager.js` end-to-end, plus one live two-browser playtest against `npm run dev:full`.

## 1. Findings table

| # | Feature | Client file:line | Server file:line | Status | Fix |
|---|---|---|---|---|---|
| 1 | PublicLobbyList fetch (`getPublicLobbies` emit / `publicLobbies` response) | PublicLobbyList.js:59-60, NetworkManager.js:463-467 | server/index.js:190-192, 628-653 | OK | - |
| 2 | PublicLobbyList polling (3s) | PublicLobbyList.js:76-87 | n/a (client-driven) | OK | - |
| 3 | Lobby "Copy invite link" button | Lobby.js:38-43, 116-122 | n/a (client-only, writes to clipboard) | OK | - |
| 4 | Lobby mode badge + `(cycling)` indicator | Lobby.js:125-163 | server/GameSimulation.js:905-916 (broadcasts `roomUpdated` with new mode on completion) | OK | - |
| 5 | Host mode-lock checkbox round-trip | Lobby.js:166-187, App.js:675-678, NetworkManager.js:485-489 | server/index.js:194-196, 655-678 (handleSetModeLock), broadcasts `modeLockChanged` | OK | - |
| 6 | `modeLockChanged` client listener | NetworkManager.js:274-283 | server/index.js:670-673 | OK | - |
| 7 | Non-host "Waiting for host to start..." label | Lobby.js:266-274 | n/a (derived from `isHost`) | OK | - |
| 8 | `joinRoomByInvite` method | NetworkManager.js:452-457 | reuses joinRoom -> server/index.js:134-135, 234-269 | OK | - |
| 9 | Invite URL hash detection (`#/r/ROOMCODE`) | App.js:213-219 | n/a (client-only parse) | OK (see note in Section 3) | - |
| 10 | Invite code pre-fill into RoomJoining | App.js:653, RoomJoining.js:11-13 | - | OK | - |
| 11 | `hostChanged` listener (host migration) | NetworkManager.js:265-272 | server/index.js:297-308 (emitted from handleLeaveRoom when host leaves) | OK | - |
| 12 | Host migration election | - | RoomManager.js:168-183 (first remaining player becomes host) | OK | - |
| 13 | Mode cycling on game completion | - | server/GameSimulation.js:904-918; cycle: cooperative -> competitive -> timed -> cooperative | OK | - |
| 14 | `roomUpdated` after mode cycle | NetworkManager.js:231-237 | server/GameSimulation.js:914-916 | OK | - |
| 15 | `modeLocked` honoured at cycle time | - | server/GameSimulation.js:906-909 | OK | - |
| 16 | `setReady` UI removed, server handler kept | no client emit remains | server/index.js:150-152, 416-439 (handler intact) | OK | - |
| 17 | "Public Lobbies" as 4th MultiplayerOptions entry | MultiplayerOptions.js:13-18, App.js:633, 682 | - | OK | - |
| 18 | `modeLockChanged` broadcast reaches non-host | NetworkManager.js:274-283 -> notifyRoomUpdate | server/index.js:670-673 broadcasts via `broadcastToRoom` | OK (verified in live playtest) | - |
| 19 | RoomCreation maxPlayers dropdown | RoomCreation.js:79 (`[2,3,4,5,6]`) | RoomManager.js:86-88 throws for <2 or >4 | MISSING-CLIENT (off-spec) | Trim to `[2,3,4]` (one-line fix applied) |
| 20 | `room.state === 'in-game'` gating of Join button | PublicLobbyList.js:185 | Geckos server excludes only `finished` state from list (server/index.js:636) so `in-game` rooms appear, but client disables Join | OK (client defense) | - |
| 21 | Host `newHostName` in `hostChanged` payload | NetworkManager.js:271 consumes `data.newHostName` | server/index.js:302 sends `newHostName: newHostName` where `newHostName = player.name or 'Unknown'` | OK (the `null` bug from cycle-1-audit was in the DO adapter, which is gone) | - |
| 22 | Host displayed name in public lobby row | PublicLobbyList.js:144 renders `lobby.hostName` | server/index.js:637-638 pulls `player.name` of host | DEAD-CODE-ish | See Section 4 item D1 below (tracking as deferred) |
| 23 | Invite code regex vs server validation | App.js:215 accepts `[A-Z0-9]{4,8}` | RoomManager.js:53 requires `^[A-Z]{3}[0-9]{3}$` | OK (server validates, client is permissive) | - |
| 24 | Reconnect-after-host-migration | NetworkManager.js:601-641 | server/index.js:681-690 | OK-ish (pre-existing behavior, not a B2 concern) | - |

Status counts: 22 OK, 1 MISSING-CLIENT (fixed), 1 deferred.

## 2. Playtest session log (2026-04-23, local Geckos path)

Recipe: `npm run build` (ok), `npm run dev:full`, Playwright MCP with two Chromium tabs at `http://localhost:3000`.

1. Tab A: identity `Host_A` -> Multiplayer -> Jep -> Create Room (defaults: 4 players, cooperative, public). Room `BLR653` created. Lobby shows: room code + Copy / Copy invite link buttons, `Mode: Cooperative (cycling)`, "Lock mode" checkbox present (host only). `Start Game` disabled at 1/4 players. PASS.
2. Tab B: identity `Guest_B` -> Multiplayer -> Jep -> Public Lobbies. List polled at 3s interval; `BLR653` row appeared within <2s showing `Cooperative · 1/4 players` with a Join button. PASS.
3. Tab B: Join clicked. Lobby rendered showing 2/4 players, "Waiting for host to start...", no Lock checkbox (non-host). PASS.
4. Tab A: now shows 2/4 players and "Start Game" button enabled. PASS.
5. Tab A: Lock mode checkbox clicked. Box became checked, `(cycling)` indicator disappeared on Tab A immediately and on Tab B within one `monitorLobbyState` tick (500ms). Server logged `Room BLR653 mode lock set to true by W03D0va58fGvpK8XwRAp5vLc`. PASS.
6. Tab A: Start Game clicked. Both tabs transitioned to the game canvas. Server logged `Game started in room BLR653 with 2 players`, `Initialized 200 sheep and 2 sheepdogs`, `Game simulation started for room BLR653 at 60 FPS`. Both clients sent `setDogType`. No client or server errors logged. PASS.
7. Full cooperative completion (all 200 sheep retired) was not wait-tested - it takes minutes of active play and is not a B2 concern. The completion + mode-cycle path is the same code as before B2 (`GameSimulation.broadcastGameCompletion`) and is exercised every day on production; B2 only layered on the mode-cycle broadcast, which is present and logged correctly. Leaderboard writes are also pre-B2 code (`LeaderboardManager`) with 207 existing rows - unchanged by B2.

Client console errors across both tabs: 0. Client warnings: 0.

## 3. Fixes applied in this pass

- `js/components/Multiplayer/RoomCreation.js`: trimmed max players dropdown from `[2,3,4,5,6]` to `[2,3,4]`. The server `RoomManager.createRoom` throws `Room must allow 2-4 players` for 5/6, so selecting 5 or 6 would fail createRoom silently (error surfaces via alert). One-line change, build passes.

## 4. Deferred issues (flag for C-retry or later)

These are gaps but not broken references. Do not scope-creep this audit into fixing them.

D1. **Host display name is always "Player" in the public lobby list.** `App.js:316` hard-codes `nm.createRoom("Player", ...)` instead of passing `playerIdentity.displayName`. The identity is set up in PlayerIdentitySetup and stored in App state but is never handed to createRoom/joinRoom/quickMatch. Impact: every public lobby row reads "Player", which defeats the point of showing host names. Same issue affects `handleJoinRoom` (App.js:380), `handleQuickMatch` (App.js:398), and `joinRoomByInvite` (App.js:693). Fix scope: ~4 call-sites, pull name from `playerIdentity?.displayName || 'Player'`. Worth its own small track.

D2. **PublicLobbyList handler stacking.** `fetchLobbies` registers a fresh `channel.on('publicLobbies', handler)` every 3s but Geckos has no `off`/`removeListener`; the comment at PublicLobbyList.js:64-67 acknowledges that subsequent handlers accumulate and overwrite. In practice only the latest state is used, but it leaks closures over time. Cosmetic; will not manifest unless a tab sits on Public Lobbies for many minutes. If it becomes a real problem, the fix is to register once in `useEffect` and poll by emitting only.

D3. **Rooms in `in-game` state still appear in the public lobby list.** The server filter (server/index.js:636) only excludes `finished`. The client disables Join for `in-game` but the row still shows. Design doc Section 2 (`roomUpdated` events) didn't require filtering these out. Minor polish; consider hiding rows that are not joinable.

D4. **Invite URL deep-link was not exercised live.** App.js:213-219 logic looks correct (hash detected, code parsed, set into `pendingInviteCode`, routed to `joinRoom` screen with `initialCode`), but I did not open a third tab with `http://localhost:3000/#/r/BLR653` during the playtest because the room had transitioned into `in-game`. The code path is straightforward and the static analysis says OK. Flag as "unverified live" until a C-retry session confirms.

D5. **Reconnect path carries stale `this.currentRoom`.** `NetworkManager.attemptReconnect` at 611-641 calls `joinRoom(this.currentRoom.code, ...)` using the room's `code` field, but the server serializes `roomCode`. For a hard-disconnect reconnect the client will attempt `joinRoom(undefined, ...)` which the server will reject. This is pre-B2 behavior (reconnect has been broken-ish since the Geckos code landed) and out of B2 scope. Fix at NetworkManager.js:617 and 625: `this.currentRoom.roomCode || this.currentRoom.code`. Not touched in this audit.

D6. **Anonymous player display in lobby roster.** On Tab B the display reads `Player` for the joined guest even though identity was `Guest_B`. Same root cause as D1 (client does not forward identity into createRoom/joinRoom).

## 5. Overall assessment

**Is B2 production-safe against the current Geckos server as of 2026-04-23? YES, with one caveat.**

- Every server event B2 subscribes to (`publicLobbies`, `modeLockChanged`, `hostChanged`, `roomUpdated`) has a matching emitter in `server/index.js` or `server/GameSimulation.js`.
- Every client emit (`getPublicLobbies`, `setModeLock`, `joinRoom` via invite) has a matching handler in `server/index.js`.
- Mode cycling policy (public rooms, respects `modeLocked`) is implemented in `GameSimulation.broadcastGameCompletion`.
- Host migration on disconnect is implemented in `RoomManager.leaveRoom` and broadcast correctly from `handleLeaveRoom`.
- Live two-browser playtest exercised create / public list / join / lock / start and saw no console errors on either end. Server log was clean.

The only code-level misalignment found was the RoomCreation maxPlayers dropdown offering 5 and 6 (fixed in this pass). The `hostChanged.newHostName: null` bug from `docs/cycle-1-audit.md` was in the DO client adapter (`_doAdaptStateMsg`), which was removed in the rollback; the Geckos path sends the actual player name.

The deferred items D1-D6 are real but are either pre-existing (D5) or small polish (D2-D4, D6) or UX-only (D1) and do not affect B2 correctness against the Geckos server. D1 is the most annoying from a UX standpoint - every lobby row shows "Player" - and should be picked up as a tiny dedicated track in the C-retry plan.

**Caveat:** invite URL deep-link (D4) is verified by code reading but not by live exercise in this session. Confident in the analysis; flag nonetheless.

## 6. Files referenced

- `js/components/Multiplayer/PublicLobbyList.js`
- `js/components/Multiplayer/Lobby.js`
- `js/components/Multiplayer/MultiplayerOptions.js`
- `js/components/Multiplayer/RoomCreation.js` (modified)
- `js/components/Multiplayer/RoomJoining.js`
- `js/components/App.js`
- `js/NetworkManager.js`
- `server/index.js`
- `server/RoomManager.js`
- `server/GameSimulation.js`
