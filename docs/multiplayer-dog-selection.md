# Multiplayer dog selection

> Cycle 24 Phase 4. Documents the dogType propagation path from each
> player's UI selection through to every peer's rendered RemoteDog mesh.
> Anchors the regression specs in [`tests/e2e/mp/dog-selection.spec.ts`](../tests/e2e/mp/dog-selection.spec.ts).

## Canonical dog ids

The same five ids are the contract end-to-end:

| id                    | display name        | source of truth                                      |
|-----------------------|---------------------|------------------------------------------------------|
| `jep`                 | Jep                 | [`js/components/StartScreen/DogSelection.js`](../js/components/StartScreen/DogSelection.js) DOGS list, [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) `DOG_TYPES` |
| `pip`                 | Pip                 | same                                                 |
| `sally`               | Sally               | same                                                 |
| `shiloh`              | Shiloh              | same                                                 |
| `george_washington`   | George Washington   | same                                                 |

Adding/removing an id requires touching both files (UI list + worker
allowlist). Mismatches surface as the worker silently coercing unknown
ids to `'jep'` via `DOG_TYPES.has(...) ? ... : 'jep'` in
[`worker/src/RoomDO.ts:206`](../worker/src/RoomDO.ts) and `:259`.

## Path: UI selection → rendered RemoteDog mesh

Numbered to track the wire-format jumps. "Field name" indicates what the
data is called at each hop.

1. **DogSelection card click** → [`js/components/StartScreen/DogSelection.js:165`](../js/components/StartScreen/DogSelection.js)
   Calls `onSelect(dog.id)` with one of the five ids. Field name: `id`.

2. **MenuController.selectDog** → [`js/MenuController.js:200`](../js/MenuController.js)
   Stores in `this.selectedDog`, persists to `localStorage.selectedDog`.
   Field name: `selectedDog` / `dogType`.

3. **NetworkManager.createRoom / joinRoom** → [`js/NetworkManager.js:341`](../js/NetworkManager.js), `:382`
   The `dogType` arg becomes the body's `dogType` field on POST
   `/api/rooms` (host) or POST `/api/rooms/{code}/join` (guest). Field
   name: `dogType` (in REST body).

4. **Worker REST routes** → [`worker/src/index.ts:173`](../worker/src/index.ts) (host create), `:336` (quick-match)
   For host create, the worker remaps `body.dogType` → `hostDogType` in
   the DO `/init` payload. For guest join the field stays `dogType`.

5. **RoomDO.initRoom** → [`worker/src/RoomDO.ts:206`](../worker/src/RoomDO.ts)
   `players[hostId].dogType = body.hostDogType ?? 'jep'`.

6. **RoomDO.joinRoom** → [`worker/src/RoomDO.ts:259`](../worker/src/RoomDO.ts)
   `players[playerId].dogType = body.dogType ?? 'jep'`.

7. **Mid-session change** (in lobby) → WS `setDogType` →
   [`worker/src/RoomDO.ts:417`](../worker/src/RoomDO.ts)
   `player.dogType = msg.dogType`. Broadcasts `roomUpdated` with the full
   serializable state (including all peers' dogType).

8. **NetworkManager.onMessage `'roomUpdated'`** → [`js/NetworkManager.js:198`](../js/NetworkManager.js)
   `this.currentRoom = msg.room`. Triggers `notifyRoomUpdate`. Field
   name on the wire: still `dogType`, nested under `room.players[].dogType`.

9. **MultiplayerState propagation** → [`js/MultiplayerState.js`](../js/MultiplayerState.js)
   Subscribers receive room updates and refresh React state.

10. **Lobby render** → [`js/components/Multiplayer/Lobby.js:232`](../js/components/Multiplayer/Lobby.js)
    Each player card reads `player.dogType` to look up the icon.

11. **In-game RemoteDog** → guest's view of the host (and vice-versa)
    reads `dogType` from the per-player record to select which `.glb`
    mesh to render.

## Probe surface

`window.__sdsMpProbe()` exposes `peers[].dogType` for each peer
(including self via `peers.find(p => p.isMine)`), populated from
`networkManager.currentRoom.players[].dogType`. This is the field
end-to-end specs assert on — no DOM scraping required.

Probe install: [`js/main.js:1030`](../js/main.js) (`_installMpProbe`),
gated on `?perfMode=1` or `?mpProbe=1`.

## Failure modes (and what to look for)

- **Unknown id reaching the worker** → silently coerced to `'jep'`. UI
  shows the player as Jep; `peers[].dogType === 'jep'` even though
  `localStorage.selectedDog` says otherwise. Symptom: opening a fresh
  browser, picking Pip, peer sees Jep.
- **Asset 404 (`/assets/dogs/<id>.webp` or `.glb`)** → DogAvatar's
  `onError` swaps to the SVG fallback (UI graceful degrade). The
  `dogType` value stays correct on the wire — game just renders fallback
  mesh.
- **Mid-game setDogType race** → client may briefly render the prior
  dog if a `roomUpdated` is in flight when the React frame commits.
  Self-corrects on the next broadcast (every WS tick in-game).

## Regression coverage

[`tests/e2e/mp/dog-selection.spec.ts`](../tests/e2e/mp/dog-selection.spec.ts)
covers:

- Two-player propagation: host=`pip`, guest=`sally` → each side's
  probe sees the other's dogType correctly.
- Default-dog fallback: navigateToMultiplayer without explicit pick →
  both sides see `dogType === 'jep'` (default per
  MenuController.loadDogSelection).
