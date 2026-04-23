# SDS Wire Protocol v1

Transport: MessagePack over WebSocket.
All messages are binary (ArrayBuffer). The string `"ping"` is handled by the DO's
`setWebSocketAutoResponse` pair and never reaches application code.

Every message includes `v: 1` at the top level for future versioning.

---

## Client -> Server

### `input`
Sent every frame the client has new input.

| Field | Type | Description |
|-------|------|-------------|
| `v` | `1` | Protocol version |
| `t` | `"input"` | Message type |
| `seq` | `number` | Monotonically increasing sequence number |
| `dir` | `{x, z}` | Movement direction (normalized or zero) |
| `sprint` | `boolean` | Sprint key held |
| `clientPos` | `{x, z}?` | Optional: client-predicted position when stopping |

Server guard: if `clientPos` is present and `sqrt((clientPos.x - serverX)^2 + (clientPos.z - serverZ)^2) > 5`,
the `clientPos` field is silently ignored (cheat guard). The input direction is still applied.

---

### `ready`
Signals the player is ready. Currently auto-ready; reserved for future use.

| Field | Type |
|-------|------|
| `v` | `1` |
| `t` | `"ready"` |

---

### `start`
Host-only. Starts the game if room is in `waiting` state with >= 2 players.

| Field | Type |
|-------|------|
| `v` | `1` |
| `t` | `"start"` |

---

### `leave`
Graceful disconnect. Server removes the player and migrates host if needed.

| Field | Type |
|-------|------|
| `v` | `1` |
| `t` | `"leave"` |

---

### `modeLock`
Host-only. Prevents mode cycling after game completion.

| Field | Type | Description |
|-------|------|-------------|
| `v` | `1` | |
| `t` | `"modeLock"` | |
| `locked` | `boolean` | Lock game mode |

---

### `setDog`
Change dog breed. Applied in lobby; ignored during game.

| Field | Type | Description |
|-------|------|-------------|
| `v` | `1` | |
| `t` | `"setDog"` | |
| `dogType` | `string` | Breed identifier (e.g. `"jep"`, `"collie"`) |

---

## Server -> Client

### `state`
Sent every tick (20Hz = every 50ms) during an active game.

| Field | Type | Description |
|-------|------|-------------|
| `v` | `1` | Protocol version |
| `t` | `"state"` | |
| `tick` | `number` | Monotonically increasing tick counter |
| `sheepDeltas` | `SheepDelta[]` | Only sheep that moved >0.1u or changed state since last broadcast |
| `dogs` | `DogState[]` | Full state for all sheepdogs (always sent) |
| `scores` | `Record<string, number>?` | Present when scores exist (competitive/timed modes) |
| `time` | `number?` | Milliseconds remaining (timed mode only) |

#### `SheepDelta`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Sheep ID |
| `x` | `number` | Position X (2 decimal places) |
| `z` | `number` | Position Z (2 decimal places) |
| `vx` | `number` | Velocity X |
| `vz` | `number` | Velocity Z |
| `state` | `number` | 0=active, 1=retiring, 2=grazing |
| `facing` | `number` | Facing angle (radians) |
| `hasPassedGate` | `boolean` | |
| `isRetiring` | `boolean` | |
| `assignedGate` | `number?` | Gate ID in competitive/timed mode |
| `targetX` | `number?` | Retirement target X |
| `targetZ` | `number?` | Retirement target Z |

#### `DogState`

| Field | Type | Description |
|-------|------|-------------|
| `playerId` | `string` | |
| `dogType` | `string` | Breed |
| `x` | `number` | |
| `z` | `number` | |
| `vx` | `number` | |
| `vz` | `number` | |
| `rotation` | `number` | Radians |
| `stamina` | `number` | 0-100 |
| `sprinting` | `boolean` | |
| `sequence` | `number` | Last applied input sequence |

---

### `lobby`
Sent on any room state change (player join/leave, mode lock, host change, game end).

| Field | Type | Description |
|-------|------|-------------|
| `v` | `1` | |
| `t` | `"lobby"` | |
| `roomCode` | `string` | 6-character code (e.g. `"ABC123"`) |
| `mode` | `string` | `"cooperative"`, `"competitive"`, or `"timed"` |
| `state` | `string` | `"waiting"`, `"in-game"`, or `"finished"` |
| `hostId` | `string?` | |
| `players` | `LobbyPlayerInfo[]` | |
| `modeLocked` | `boolean` | |

#### `LobbyPlayerInfo`

| Field | Type |
|-------|------|
| `id` | `string` |
| `name` | `string` |
| `dogType` | `string` |
| `isHost` | `boolean` |

---

### `start`
Broadcast when the host triggers game start.

| Field | Type | Description |
|-------|------|-------------|
| `v` | `1` | |
| `t` | `"start"` | |
| `mode` | `string` | Active game mode |
| `playerIds` | `string[]` | Ordered list of players |
| `competitiveGates` | `CompetitiveGateInfo[]?` | Gate layout for competitive/timed modes |

#### `CompetitiveGateInfo`

| Field | Type |
|-------|------|
| `id` | `number` |
| `x` | `number` |
| `z` | `number` |
| `playerId` | `string?` |
| `color` | `number` |
| `direction` | `string` |
| `pasture` | `{minX, maxX, minZ, maxZ}` |

---

### `complete`
Broadcast when the game ends (all sheep retired, threshold reached, or timer expired).

| Field | Type | Description |
|-------|------|-------------|
| `v` | `1` | |
| `t` | `"complete"` | |
| `winner` | `string?` | Player ID of winner (`null` for cooperative) |
| `scores` | `Record<string, number>` | Final scores |
| `winType` | `string?` | `"race"`, `"highest_score"`, or `"timeout"` |
| `sheepRetired` | `number?` | Cooperative: sheep retired |
| `totalSheep` | `number?` | Total sheep count |

---

### `hostChanged`
Broadcast when host migrates to another player.

| Field | Type |
|-------|------|
| `v` | `1` |
| `t` | `"hostChanged"` |
| `newHost` | `string` |

---

### `error`
Sent to the requesting client only on validation failures.

| Field | Type |
|-------|------|
| `v` | `1` |
| `t` | `"error"` |
| `msg` | `string` |

---

## Tick rate and timing

- Server ticks at 20Hz (every 50ms) using DO alarms (`ctx.storage.setAlarm`).
- Alarm is scheduled in the `startGame` method and rescheduled at end of each `alarm()` handler.
- Alarm loop stops when `gameCompleted = true` or room state leaves `in-game`.

## Delta encoding

Sheep state is only transmitted when:
- Position changed by >0.1 units in X or Z since last broadcast, OR
- `state`, `hasPassedGate`, or `isRetiring` changed

Dogs are always transmitted in full (small fixed count).

## Mode cycling (public rooms)

On game completion, public non-locked rooms cycle mode:
`cooperative -> competitive -> timed -> cooperative`

Private rooms do not cycle. Mode-locked rooms (`modeLocked: true`) do not cycle.
