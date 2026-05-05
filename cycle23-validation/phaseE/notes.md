# Phase E — MP cheap wins

## Q5 — extend sheep cap + add UI gate

`ALLOWED_SHEEP_COUNTS` extended in [`worker/src/RoomDO.ts`](../../worker/src/RoomDO.ts) to `[200, 250, 500, 1000, 3000, 5000]`. New `MOBILE_GUEST_MAX_SHEEP_COUNT = 1000` constant.

WebSocket upgrade handler in `handleWebSocket` rejects mobile-UA upgrades when `meta.sheepCount > 1000`. Same UA regex as `SceneManager.detectMobileDevice` for parity.

[`js/components/Multiplayer/RoomCreation.js`](../../js/components/Multiplayer/RoomCreation.js):
- `SHEEP_COUNT_OPTIONS` reshapes from bare numbers to `{ value, label }` pairs with semantic labels:
  - 200 — Classic
  - 250
  - 500
  - 1000 — Extreme
  - 3000 — Insane (desktop guests only)
  - 5000 — Chaos (desktop guests only)
- Amber warning text appears under the dropdown when host picks > 1000: "Mobile players will be unable to join this room. All guests must be on desktop."

[`js/components/Multiplayer/GlobalLeaderboard.js`](../../js/components/Multiplayer/GlobalLeaderboard.js) — `SHEEP_FILTER_OPTIONS` mirrors the room-creation list so cooperative/competitive boards at the new counts are filterable.

## Cinematic-flag strip on invite-hash join

[`js/main.js`](../../js/main.js): IIFE at module-import time. If `location.hash.startsWith('#/r/')` AND `?cinematic=1` is in `location.search`, strip the flag via `history.replaceState` BEFORE SceneManager constructs (which reads `?cinematic=1` synchronously to set `preserveDrawingBuffer`). Console-logs the strip for diagnostics.

## Pine 404 sweep — clean

`grep -rn 'pine\.glb|pine_lod1|pine\.imposter|'pine'|"pine"' js/ shared/ worker/src/ public/`:

- `shared/TreePlacement.js:79` — only a comment ("the old 'pine' biome ring becomes a wider deciduous fade"). Not a runtime reference.
- No pine asset files under `public/` or `assets/`.

Conclusion: Cycle 22 Phase A pine removal was complete. No 404s expected on guest cache invalidation.

## "No-drift" audit (per user mid-cycle directive)

Verified MP sheep-count implementation paths agree end-to-end:

| Layer | Source | Counts | Notes |
|---|---|---|---|
| Worker validate | `RoomDO.ts` `ALLOWED_SHEEP_COUNTS` | 200, 250, 500, 1000, 3000, 5000 | Default 200 |
| Host UI dropdown | `RoomCreation.js` `SHEEP_COUNT_OPTIONS` | same set, labeled | Default 200 |
| Leaderboard filter | `GlobalLeaderboard.js` `SHEEP_FILTER_OPTIONS` | same set + "Any size" (0) | Filterable for coop/comp boards |
| Solo modes | `worker/src/d1.ts` | Classic 200, Extreme 1000, Insane 3000, Chaos 5000, Timed 200 | Fixed per mode |

All game modes (`cooperative` / `competitive` / `timed`) remain selectable via the existing `gameMode` dropdown — no path changes. Camera modes (Follow / Free / Classic) are global per-client state managed by `CameraController` and unaffected by MP.

## Validation

- vitest: 188/188 (no MP-specific test added; would belong to Cycle 24's MP test suite per plan).
- worker `tsc --noEmit`: clean.
- build: clean (no measurable delta from Phase D).

## Files touched

- [worker/src/RoomDO.ts](../../worker/src/RoomDO.ts) — extended cap, mobile gate
- [js/components/Multiplayer/RoomCreation.js](../../js/components/Multiplayer/RoomCreation.js) — labeled options + warning
- [js/components/Multiplayer/GlobalLeaderboard.js](../../js/components/Multiplayer/GlobalLeaderboard.js) — extended filter
- [js/main.js](../../js/main.js) — cinematic-flag strip on invite

## Deferred to Cycle 24 (`mp-audit-and-test-coverage`)

Per plan, the full MP audit + Playwright two-tab harness gets its own cycle.
What this phase did NOT do:

- Live two-tab smoke at 3000/5000 sheep
- Full network-trace .har capture
- WS reconnect/grace audit
- Scene-swap multiplayer regression suite
