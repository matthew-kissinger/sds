# Cycle 24 — mp-audit-and-test-coverage

> Drafted 2026-05-05 after Cycle 23 closed as `v1.4.0` (overhead polish, occluder fade, grass T4 LOD, MP cap extension). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Three research docs commissioned for this cycle's scope shaping live alongside this plan: [`cycle-24-research-mp-testing.md`](cycle-24-research-mp-testing.md), [`cycle-24-research-foliage.md`](cycle-24-research-foliage.md), [`cycle-24-research-batched-webgpu.md`](cycle-24-research-batched-webgpu.md). Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Codify the Cycle 23 MP cheap wins behind a Playwright two-tab regression suite so they don't bit-rot. Add a real reconnect grace window (Cycle 23 audit found `RoomDO.handlePlayerDisconnect` evicts immediately — a guest backgrounding their phone in an elevator gets dropped). Verify multiplayer dog selection asset mapping is correct end-to-end (each user sees the right dog mesh for every other user, including after scene-swap). Optionally spike a `?renderer=webgpu` feature flag and a render-texture grass-trample prototype to give Cycle 25+ a green/red signal without committing.

User-visible difference: MP guests can now backgrounds their browser tab for ~15 seconds without losing their session. Each player sees the correct dog mesh for every other player — no "everyone is jep" rendering bug. The Cycle 23 cheap MP wins (sheep cap to 5000, mobile-guest gate, cinematic-flag invite strip, Insane/Chaos labels) get test-protected so a future refactor can't silently regress them.

## How to read this plan

Phases are mostly serial; Phase 5 (foliage spike) is independent and can run in parallel with the MP work. Each phase has Build + Validation + Acceptance + Hard-Stop markers, same shape as Cycle 23. Iteration artifacts save under `cycle24-validation/<phase>/`. Matt reviews end-to-end at Phase 6.

## Open questions to resolve before writing code

1. **Q1: Reconnect grace duration?** Author lean (per [`cycle-24-research-mp-testing.md`](cycle-24-research-mp-testing.md)): **15 seconds, in-game only.** Lobby (`state === 'waiting'`) stays at 0s. Colyseus default 10–20s, Nakama 5s, AAA "relaunch reconnect" is a different pattern (3–5min) and not what we need. 15s covers 95% of mobile background events without leaving zombie sessions.
2. **Q2: Two-tab harness target — local Playwright or Browserbase?** Author lean: **local Playwright.** Browserbase Developer tier is Chromium + Firefox only (no WebKit), our existing `playwright.config.ts` already runs all three engines locally, and `npm run dev` (Wrangler v3 = Miniflare) gives full DO + WS parity with prod on localhost. Browserbase adds latency, regresses engine coverage, solves no problem we have.
3. **Q3: Dog-selection asset wiring — verify-only or refactor?** Per Matt's mid-cycle directive: ensure each player sees the correct dog mesh for every other player on both browsers, with their selected dog correctly displayed. Author lean: **verify-only first** (Phase 4 adds explicit two-tab regression specs); refactor only if specs surface a real wiring bug.
4. **Q4: Foliage Cycle 24 scope — none / spike / adopt?** Per [`cycle-24-research-foliage.md`](cycle-24-research-foliage.md), no major rewrite warranted. Two optional spikes worth a 1-phase budget each: **(a) render-texture grass-trample** prototype (complement, not replace, the 220-uniform path; AC Shadows + Ghost of Yōtei pattern), **(b) octahedral impostor A/B** vs current 4×4 lat-lon (drop-in `agargaro/octahedral-impostor` package). Author lean: **spike (a) only**; defer (b) to Cycle 25.
5. **Q5: WebGPU feature flag?** Per [`cycle-24-research-batched-webgpu.md`](cycle-24-research-batched-webgpu.md), Safari 26 (Sept 2025) shipped WebGPU on iOS/macOS, BUT BatchedMesh per-instance LOD has not advanced since Cycle 22's research. A `?renderer=webgpu` spike (~3hr, no shader rewrites, just verify the renderer swap doesn't regress) gives a green/red signal for Cycle 25+ without committing. Author lean: **yes, include as Phase 5b** — cheap insurance.

These resolve at /cycle-start.

## Architecture / shared changes

- **`window.__sdsMpProbe()`** — new test-only global mirroring the existing `__sdsSwapProbe` pattern. Exposes `{ playerId, peers: [{id, dogType, position, isMine}], roomState, sheepCount, gameMode }` so Playwright tests can assert on game state without decoding msgpack frames in-test (binary on the wire makes `page.on('websocket')` brittle). Gated on `?perfMode=1` or new `?mpProbe=1`.
- **`RoomDO.handlePlayerDisconnect`** — new behavior: schedule a 15s grace timeout (game-state only); if the player rebinds via `bindSocket` before timeout fires, cancel the eviction. Does NOT delete from `simulation.sheepdogs` during the grace window — the dog stays in-world, just stops receiving inputs. Lobby state gets immediate eviction (no grace) since pre-game disconnect = explicit leave.
- **MP dog wiring contract** — formalize the host→guest dog-type propagation path so tests can assert it. Touch-points: `js/components/StartScreen/DogSelection.js` (UI write), `js/MultiplayerState.js` (WS payload), `worker/src/RoomDO.ts` (broadcast), `js/RemoteDog.js` or wherever guest renders peers (asset selection from `dogType`). Document the path in a new `docs/multiplayer-dog-selection.md`.

## Phase 1 — Lobby lifecycle test coverage (~3hr)

**Independently testable.** Cheapest signal-per-minute. Picks up the Cycle 23 cheap-win shapes and locks them in.

### Build

1. **New Playwright config project `mp`.** Adds `tests/e2e/mp/` directory + a `tests/e2e/mp/_helpers.ts` exporting `seedHost(page)`, `seedGuest(page, roomCode)`, `expectRoomState(page, expected)`. Each helper opens a fresh `browser.newContext()` (NOT two pages in one context — they'd share localStorage and silently break the identity setup that `scene-swap-stability.spec.ts` relies on).
2. **Lobby specs** — create room → join via code → join via invite link → host kicks guest → guest leaves → host closes room. Assert `RoomDO.meta.state` transitions `waiting → in-game → terminated`.
3. **Sheep cap allow-list spec** — host picks Insane (3000) and Chaos (5000); assert worker accepts both, asserts amber warning visible in dropdown when >1000.
4. **Cinematic-flag invite-strip spec** — guest visits `?cinematic=1#/r/<code>`, asserts `location.search` has been stripped on App boot.

### Validation
- 8-10 specs green
- Save spec runs to `cycle24-validation/phase1/`
- Acceptance: all green on local Playwright (Chromium/WebKit/Firefox) with `npm run dev:lan` running.

### Hard stop
- WebKit-specific failure that doesn't reproduce on Chromium → file as a bug, don't gate the phase on it.

## Phase 2 — In-game + scene-swap MP coverage (~4hr)

**Depends on:** Phase 1 helpers.

### Build

1. **In-game specs** — host + guest both start, sheep visible to both, both dogs render at correct positions, sheep counts agree, retire one sheep and assert both clients see the count tick.
2. **Scene-swap stability under MP** — host swaps scene mid-game; guest reconnects to new scene. Assert no orphaned remote dogs, no zombie sheep meshes. Same shape as `scene-swap-stability.spec.ts` but with two contexts.
3. **Sim-baseline cross-check** — run a deterministic 60-tick MP session via the harness; assert per-frame state matches what `tests/sim-baseline/baseline.spec.ts` computes for the same input sequence. (May surface real divergence between client-prediction and authoritative server — that's findings, not a hard stop.)

### Validation
- 5-7 specs green
- Save artifacts to `cycle24-validation/phase2/`

### Hard stop
- Sim-baseline cross-check fails by more than ±2px or ±1 sheep count → surface to Matt before continuing.

## Phase 3 — Reconnect grace window (~4hr)

**Depends on:** Phase 1 helpers (uses two-tab pattern).

### Build

1. **`RoomDO.handlePlayerDisconnect` 15s grace timer.** Schedule a per-playerId timeout in `handlePlayerDisconnect`; clear it when `bindSocket` replaces the WS for that playerId. Do not call `simulation.sheepdogs.delete` during grace.
2. **Lobby vs in-game branch.** When `meta.state === 'waiting'`, evict immediately (no grace). Pre-game disconnect = explicit leave.
3. **New spec** — guest connects, host starts game, simulate guest WS drop (close), wait 10s, reconnect, assert dog-state preserved + game state intact. Then a second spec where guest waits 20s (past grace) → asserts evicted.
4. **Telemetry** — log grace-period activations + evictions to RoomDO storage so production can audit.

### Validation
- 3-4 specs green
- Save logs to `cycle24-validation/phase3/`

### Hard stop
- Grace timer leaks (timeout fires after room is destroyed) → fix before merge; this would silently consume DO compute.

## Phase 4 — MP dog selection wiring + display (~3hr)

**Depends on:** Phase 1 helpers. Independent of Phase 2/3.

Per Matt's mid-cycle directive: ensure each player sees the correct dog mesh for every other player on both browsers, with their selected dog correctly displayed. Cycle 23 didn't touch this path; codifying it under test now keeps the Cycle 24 cheap-win shape consistent.

### Build

1. **Audit + document the dog-selection wiring path.** New `docs/multiplayer-dog-selection.md`. Trace: `js/components/StartScreen/DogSelection.js` → `js/MultiplayerState.js` (WS payload `setDogType`) → `worker/src/RoomDO.ts` (broadcast to peers) → guest's `RemoteDog` constructor → asset selection from `dogType` → mesh attached to guest's view of host. Document the field name + canonical values (`jep`, `pip`, `sally`, `shiloh`, `george_washington` per `worker/src/RoomDO.ts:DOG_TYPES`).
2. **`window.__sdsMpProbe()` exposes `peers[].dogType`** so specs can assert without DOM scraping.
3. **Two-tab dog-mapping specs:**
   - Host picks `pip`, guest picks `sally` → assert host's view of guest renders `sally` mesh, guest's view of host renders `pip` mesh.
   - Three-player permutation: host=`jep`, g1=`pip`, g2=`shiloh` → all three views correct.
   - After scene-swap, dog-type assignments must persist across the swap.
   - Asset 404 test: simulate a missing dog GLB → guest sees fallback mesh, no exception.
4. **Verify-only first.** Refactor only if specs surface a real wiring bug.

### Validation
- 4-5 specs green
- New `docs/multiplayer-dog-selection.md` checked in
- Save 2-tab screenshots to `cycle24-validation/phase4/` showing each player's view of the others (3 captures per scene × 3 scenes = 9 images; pick one per scene if Matt prefers)

### Hard stop
- Real wiring bug surfaces (dog type doesn't propagate, asset 404 crashes the page) → escalate to Matt before fixing in this phase.

## Phase 5 — DEFERRED to polish program

**Cycle 24 rev 2 (2026-05-06):** the original Phase 5a (grass-trample spike) and Phase 5b (WebGPU spike) are deferred into the **polish program** ([`polish-program.md`](polish-program.md)) rather than landing in Cycle 24. Reason: Cycle 24's scope is MP testing + reconnect grace + dog wiring; the foliage/renderer spikes don't compose with that scope and dilute the cycle. The polish program (Cycles 25-30) absorbs them as Cycle 26+ candidates after the LOD truth + atmospheric truth foundations land.

Specifically:

- **Render-texture grass-trample** — re-evaluated as Cycle 26+ candidate after the aerial-perspective LUT lands (the trample displacement composes with the LUT's height-fog density output for proper dust-kick atmospherics). See [`cycle-24-research-foliage.md`](cycle-24-research-foliage.md).
- **WebGPU spike** — re-evaluated as Cycle 27+ candidate after the impostor 8×4 re-bake lands (some BatchedMesh-on-WebGPU patterns assume per-instance LOD which the new impostor approach makes optional). See [`cycle-24-research-batched-webgpu.md`](cycle-24-research-batched-webgpu.md).

Cycle 24 Phase 5 is intentionally empty. Phase 6 (ship `v1.5.0`) is the next phase after Phase 4.

## Phase 6 — Adversarial regression gates + ship v1.5.0 (~3hr)

**Depends on:** Phases 1-3 (4 if shipped).

### Build

1. **Risk-driven specs** (per [`cycle-24-research-mp-testing.md`](cycle-24-research-mp-testing.md) Risks worth explicit tests):
   - Host-migration race (two guests, host close, deterministic ordering)
   - `/meta` GET vs WS-bind window after `/join`
   - MessagePack frame type coercion (`ArrayBuffer | Uint8Array | Blob` paths in `bindSocket`)
   - Two simultaneous `/init` POSTs to the same room code (LobbyDO race)
   - Ping floor regression (>50ms on localhost = synchronous await leaked into broadcast loop)
2. **CHANGELOG `[1.5.0]` entry** above `[1.4.0]`.
3. **Version bumps** root + worker `package.json` 1.4.0 → 1.5.0.
4. **Tag** `v1.5.0` + push.
5. **Matt's deferred Cycle 23 playtest items.** Ask Matt to confirm the 5 deferred items: Classic-overhead Home Field reads as zen, sprint stops on depletion, OC HUD no overlap, MP can host Insane/Chaos modes, stats panel shows correct tree tris. Surface regressions to Cycle 25's BACKLOG carryover if any.

### Validation
- vitest + new MP specs all green
- Build clean, delta documented
- Live deploy green via GH Actions
- 5 Cycle 23 playtest items confirmed by Matt

## Dependencies

```
Phase 1 (lobby) ──→ Phase 2 (in-game + swap) ──→ Phase 6 (ship v1.5.0)
                ├─→ Phase 3 (reconnect grace)
                └─→ Phase 4 (MP dog wiring)

Phase 5  ── DEFERRED to polish program (Cycles 25-30)
```

Phase 1's helpers gate 2/3/4. Phase 6 closes once 1+2+3 (and 4 if shipped) are green. Polish program ([`archive/polish-program.md`](archive/polish-program.md)) kicks off at Cycle 25 after `v1.5.0` ships.

## Frozen files (cycle-specific additions)

All [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) entries apply.

- **`shared/MovementPhysics.js` `updateMovement`** — no obstacle-composition changes.
- **`tests/sim-baseline/__fixtures__/`** — don't regenerate without understanding the diff.

## Hard stops

1. Frozen-file change without scope authorization.
2. Sim-baseline byte drift from any MP test.
3. Reconnect grace timer leak (timeout fires after DO is destroyed).
4. Dog-asset 404 in MP that isn't already a known issue — surface before patching.
5. ~~Phase 5 spike accidentally landing on `main`~~ — Phase 5 deferred to polish program; this hard-stop no longer applies.

## What NOT to do during this cycle

- **Don't reintroduce pine.** Cycle 22 removal stays.
- **Don't merge `canStartSprint` and `canContinueSprint`.** Cycle 7 settled decision.
- **Don't touch the `_sprintLockOut` boundary** without the Cycle 23 Phase B context — re-merging into a single auto-resume gate produces the v1.3.0 stutter-sprint visual bug.
- **Don't remove the camera-to-dog occluder fade** unless playtest specifically rejects it.
- **Don't add new clamps to GrassSystem.** Hard-Stop #8 from Cycle 19 still applies.
- **Don't rearchitect multiplayer.** It works. Add tests + the cheap reconnect-grace fix only.
- **Don't migrate to BatchedMesh.** Per [`cycle-24-research-batched-webgpu.md`](cycle-24-research-batched-webgpu.md): no per-instance LOD has landed since Cycle 22.
- **Don't rewrite the kiln impostor.** Per [`cycle-24-research-foliage.md`](cycle-24-research-foliage.md): octahedral A/B is a Cycle 25 candidate, not Cycle 24 scope.
- **Don't fix the heightfield amplitude bug** without Matt's explicit go-ahead. Visual character of game depends on amplified state across ~14 cycles.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks Matt to confirm each item. Don't pre-check.

- [ ] All phases shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] All vitest specs pass.
- [ ] New MP test suite (Phases 1-3, optionally 4) runs green on local Playwright across Chromium/WebKit/Firefox.
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions, `v1.5.0` tag pushed.
- [ ] Matt confirms Cycle 23 deferred playtest items (Classic-overhead trees, sprint exit, OC HUD, MP modes, tree tris) — regressions to Cycle 25 BACKLOG if any.
- [ ] Two-tab manual smoke: host=`pip` + guest=`sally` show correct meshes on both screens.

## References

- [`docs/cycle-24-research-mp-testing.md`](cycle-24-research-mp-testing.md) — Playwright two-tab patterns, Browserbase tradeoff, reconnect-grace research, 5 risk-driven specs
- [`docs/cycle-24-research-foliage.md`](cycle-24-research-foliage.md) — octahedral-impostor candidate, render-texture trample, occluder-fade idiom literature, EZ-Tree v1.1.0
- [`docs/cycle-24-research-batched-webgpu.md`](cycle-24-research-batched-webgpu.md) — BatchedMesh status (no movement), WebGPU/TSL state, Codrops False Earth as compute-grass reference
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template's source
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-23-plan.md`](archive/cycles/cycle-23-plan.md) — predecessor (overhead polish + grass T4 + MP cap fix)
