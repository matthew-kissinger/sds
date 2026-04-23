# Multiplayer Lobby UX Design

## 1. Problem Statement

The current flow forces players through four sequential screens with no shareable URL. There is no public room list; players must exchange a 6-character code out-of-band. Quick Match ignores preferred game mode. The host's only share mechanism is a bare room code; there is no link to paste. Host disconnect in the lobby silently migrates internally with no UI feedback. These frictions make casual drop-in play nearly impossible.

---

## 2. URL Schema

**Current state (GitHub Pages):** hash route `#/r/ABC123`.

Hash routes are processed entirely client-side. GitHub Pages serves `index.html` for any path; because the hash never reaches the server, no 404 is possible. This is the correct choice until Track F.

**Track F state (Cloudflare Pages):** migrate to path route `/r/ABC123`. CF Pages supports a `_redirects` file or `[[redirects]]` in `wrangler.toml` to rewrite unmatched paths to `index.html`, so the path form works cleanly.

Migration at Track F: swap the regex in `main.js` from `/#\/r\/([A-Z]{3}[0-9]{3})$/` to `/^\/r\/([A-Z]{3}[0-9]{3})$/` and clear the hash after parsing. No changes to the Lobby component or server.

Share URL format: `https://sheepdogsim.com#/r/ABC123` (today), `https://sheepdogsim.com/r/ABC123` (Track F+).

---

## 3. Flow Diagrams

### Main menu - public lobby list - join

```
[Main Menu]
    |
    v
[Multiplayer Options]  (existing MultiplayerOptions)
    |
    +-- "Public Lobbies" -->  [PublicLobbyList]  (new)
                                  |  polls getPublicLobbies every 3s
                                  |  shows {hostName, mode, X/4 players}
                                  |
                          [Join row button] --> joinRoom(roomCode) --> [Lobby]
```

### Invite URL - direct join

```
Browser loads sheepdogsim.com#/r/ABC123
    |
    v
main.js startup: detect hash pattern
    |
    +-- identity not set? --> [PlayerIdentitySetup] --> auto-continue to join
    |
    +-- already in a lobby? --> auto-leaveRoom first, then joinRoomByInvite(ABC123)
    |
    v
joinRoom(ABC123, playerName, dogType)
    |
    +-- room full / not found? --> show error toast, navigate to [MultiplayerOptions]
    |
    +-- success --> [Lobby] (hash cleared via history.replaceState)
```

### Quick Match

```
[MultiplayerOptions] -- "Quick Match" -->
    |
    v
server: findQuickMatchRoom()
    |
    +-- public room exists (waiting, has space, any mode) --> joinRoom --> [Lobby]
    |
    +-- no room exists --> createRoom(isPublic=true, mode=cooperative) --> [Lobby]
                               client shows "Waiting for players..."
```

### Host starts game

```
[Lobby] - all players see player list
    |
    host sees:  [Start Game] button  (disabled if < 2 players)
    non-hosts:  "Waiting for host to start..."  label where button would be
    |
    host clicks Start --> emit startGame --> server validates --> broadcast gameStarted
    |
    v
[Game]  (all clients simultaneously)
```

### Host disconnects mid-lobby

```
[Lobby] - host disconnects
    |
    server: handleLeaveRoom -> RoomManager.leaveRoom
               -> room.players still has members
               -> newHostId = first remaining player
               -> emit hostChanged {newHostId, newHostName} to room
    |
    v
Clients receive hostChanged:
    - NetworkManager.isHost updated
    - Lobby re-renders: new host sees Start button, others see waiting label
    - Toast: "{name} is now the host"
```

### Completion - return to lobby - auto-cycle mode

```
[Game ends]
    |
    server: room.finishGame() -> broadcastGameCompletion
    |
    clients: navigate to [PostGame / scoreboard]
    |
    [Return to Lobby] button (or auto after 10s countdown)
    |
    server (public room, modeLocked=false):
        nextMode = { cooperative->competitive, competitive->timed, timed->cooperative }
        room.gameMode = nextMode
        room.state = 'waiting'
        broadcast roomUpdated {room}
    |
    server (private room):
        room stays in 'finished' state
        cleanup after 30s idle if no rejoin
    |
    [Lobby] shows updated mode badge
        host can lock mode via checkbox before next start
```

---

## 4. Component Delta

### Keep as-is

- `MultiplayerScoreboard.js` - in-game overlay, no lobby concerns
- `GlobalLeaderboard.js` - separate flow, no changes needed
- `PlayerIdentitySetup.js` - unchanged; invite URL flow waits for identity before joining

### Modify

**`Lobby.js`** - add:
- "Copy invite link" button that writes `sheepdogsim.com#/r/{roomCode}` to clipboard (replaces plain room-code copy)
- Mode badge showing current game mode with cycling indicator for public rooms
- Host-only "Lock mode" checkbox (`room.modeLocked`); when checked, mode does not cycle on completion
- Non-host waiting label in place of the Start button
- Toast notification when host changes mid-lobby

**`MultiplayerOptions.js`** - add "Public Lobbies" as a fourth option alongside Create Room, Join by Code, Quick Match

**`RoomJoining.js`** - accept an optional pre-filled `initialCode` prop so invite-URL flow can skip manual entry

**`NetworkManager.js`** - add `joinRoomByInvite(roomCode, playerName, dogType)` that auto-calls `leaveRoom()` first if currently in a room; add `getPublicLobbies()` method

### Create

**`PublicLobbyList.js`** - fetches `getPublicLobbies` on mount and every 3s; renders a scrollable list of rows each showing host name, mode, player count, Join button; shows empty-state "No open games. Start one." with a Create Room shortcut

### Delete

- The `setReady` / `playerReadyChanged` UI path in the lobby (server already defaults `isReady: true`; the ready event handler on server stays but the client-side UI toggle is removed)

---

## 5. Server Event Surface

### Current events (from server/index.js) - client-to-server

| Event | Decision | Notes |
|---|---|---|
| `createRoom` | keep | add `modeLocked` field to roomSettings |
| `joinRoom` | keep | no change |
| `leaveRoom` | keep | no change |
| `quickMatch` | keep | already pre-leaves; works as-is |
| `startGame` | keep | host-only guard stays |
| `setReady` | keep server / remove UI | server handler stays; client stops emitting |
| `playerInput` | keep | |
| `setDogType` | keep | |
| `registerPlayer` | keep | leaderboard |
| `submitScore` | keep | leaderboard |
| `getLeaderboard` | keep | leaderboard |
| `getAllLeaderboards` | keep | leaderboard |
| `ping` | keep | |
| `getStats` | keep | |

### Current events - server-to-client

| Event | Decision | Notes |
|---|---|---|
| `roomCreated` | keep | |
| `roomJoined` | keep | |
| `roomUpdated` | keep | emit after mode cycle |
| `playerJoined` | keep | |
| `playerLeft` | keep | |
| `hostChanged` | keep | already exists in NetworkManager listener; ensure payload includes `{newHostId, newHostName, isHost}` for current player |
| `gameStarted` | keep | |
| `gameStateUpdate` | keep | |
| `gameComplete` | keep | |
| `roomLeft` | keep | |
| `playerReadyChanged` | keep server / client stops consuming | |
| `error` / `roomError` | keep | |
| `playerRegistered` / leaderboard responses | keep | |
| `pong` / `serverStats` | keep | |

### New events

**`getPublicLobbies`** (client-to-server, no payload)

Response - `publicLobbies` (server-to-client):
```
{
  lobbies: [
    {
      roomCode: string,       // "ABC123"
      hostName: string,       // display name of current host
      playerCount: number,    // current players
      maxPlayers: number,     // room setting
      gameMode: string,       // "cooperative" | "competitive" | "timed"
      state: string           // "waiting" | "in-game"
    }
  ]
}
```

Server assembles the list by iterating `roomManager.publicRooms` and mapping each room's `getSerializableState()`. Rooms in state `finished` are excluded. For Track C, `LobbyDO` replaces this iteration.

**`modeLockChanged`** (server-to-client, broadcast to room):
```
{ modeLocked: boolean, gameMode: string }
```
Emitted when host toggles the lock checkbox.

**Transport note:** all new events use the same string-event / JSON pattern as existing events. Track C replaces the transport layer; event names and payload shapes carry forward unchanged.

---

## 6. Public Lobby List

Server-side implementation for current Geckos world: a new `getPublicLobbies` handler in `server/index.js` that iterates `this.roomManager.publicRooms`, filters to `state !== 'finished'`, and returns the shaped list.

No separate `LobbyRegistry` singleton needed in the Geckos server - the `publicRooms` Set already exists on `RoomManager`. A singleton becomes natural in Track C when `LobbyDO` holds the registry and `RoomDO` instances call its RPC to upsert/remove entries.

Client polls every 3s via `getPublicLobbies` in `PublicLobbyList.js`. If the server is unreachable, show a retry state rather than crashing.

---

## 7. Game-Mode Cycling Policy

**Public rooms (isPublic=true):**
- On game completion, if `room.modeLocked === false`: advance mode per `cooperative -> competitive -> timed -> cooperative`.
- If `room.modeLocked === true`: mode stays, room returns to waiting.
- Host can toggle `modeLocked` at any point in the lobby via a checkbox; emits `setModeLock {locked: boolean}` to server; server broadcasts `modeLockChanged`.
- Room state resets to `waiting`, simulation is stopped and nulled, `roomUpdated` is broadcast.

**Private rooms (isPublic=false):**
- No mode cycling.
- On completion, room enters `finished` state.
- If all players leave within 30s, room is cleaned up immediately.
- If room sits idle in `finished` state for 30s with no activity, `performMaintenance` cleans it up (lower the existing 30-minute stale threshold only for finished private rooms).

**Quick Match rooms** are always public, so they cycle.

---

## 8. Out of Scope for B2

- **Ready-up UI** - `isReady` defaults to `true` server-side; no per-player ready toggle will be added.
- **In-lobby chat** - no text or emoji chat.
- **Spectator mode** - no watch-only connection type.
- **Friends list** - no social graph, no friend invites beyond the shareable URL.
- **Voice chat** - no audio channels.
- **Room password / private invite** - invite URL is sufficient for private coordination this cycle.
- **Max player count selection in lobby** - room max is set at creation only.
- **Rejoin after mid-game disconnect** - reconnect logic exists in NetworkManager but lobby UX for it is deferred.
