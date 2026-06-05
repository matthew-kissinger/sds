# Cycle 57 — playthrough-repair

> Drafted 2026-06-04 after Cycle 56 closed. Authored from a paired diagnosis pass (live prod D1 + worker forensic tables + verified code traces). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. The full design rationale lives in the approved plan `~/.claude/plans/let-use-think-about-lovely-puppy.md`. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

A real 12-minute solo run on Sheep Dog Island looked lost: it never showed on the leaderboard, returning to the menu froze the screen and left a stale overlay layered over the menu, and there was no way to see or set a leaderboard name. This cycle repairs the entire end-of-run loop. Before: a paused run is silently hidden by a false anti-cheat flag, "back to main menu" freezes and leaves a ghost overlay, and the player is stuck as an anonymous "Player#NNNN" with no UI to change it. After: paused runs record and display correctly, the menu return is clean and covered, the player can view and set their leaderboard name in Settings, the end screen tells them whether their score saved, and "Play Again" actually replays. Single deploy at cycle close.

## How to read this plan

This doc fixes the shape and acceptance of the changes. The implementation choices were researched and verified against current code during the diagnosis pass (see the approved plan file). No fence-frozen `shared/` sim file is touched, no D1 migration is needed (rename is an UPDATE to existing columns; `pausedMs` is an optional JSON field on `additional_data`), no deterministic-sim / sim-baseline impact (the anomaly detector is worker-only), and no MessagePack wire-protocol change.

## Resolved before code (from the diagnosis pass)

1. **Q1: Skip the menu world-rebuild to kill the freeze?** No. Verified the menu renders the live built scene behind the hero and the next `startGame` reuses that world (`js/main.js:1181`, `:1490-1511`). Keep the rebuild; cover it with the already-wired `SceneSwapOverlay` plus a paint-yield.
2. **Q2: Fold rename into `registerPlayer`?** No. `registerPlayer` is on the score/room hot path and its forks deliberately preserve the name (TOFU-bind invariant has a test). Use a dedicated auth-gated `POST /api/rename`.
3. **Q3: Absent `pausedMs` (old cached clients)?** Skip the skew check rather than re-introduce the false positive; hard rejects and `fast_for_count` still apply.

## Immediate action — DONE 2026-06-04

Un-flagged the victim's stored run (`score_submissions` id=16) so it appears on the board: `UPDATE score_submissions SET score_anomalies = NULL WHERE id = 16`. Verified `0` flagged rows remain and the run now passes the leaderboard read (soloClassic / rolling-hills / 200 → `Player#0109`, 759.4s).

## Phase 1 — Leaderboard skew fix (~3hr) [autonomous]

Make the anti-cheat compare like-for-like so paused runs are not hidden.

1. **Client.** Thread `pausedMs` into the submit payload via `getGameTimer()?.pausedTime` in [`js/gamestate/completion.js`](../js/gamestate/completion.js) (payload :97-110); reuse the `getGameTimer` accessor in [`js/GameBridge.js`](../js/GameBridge.js).
2. **Worker.** In `detectScoreAnomalies` ([`worker/src/d1.ts`](../worker/src/d1.ts) :513-545) subtract credited pause before the skew compare, with the 80%-of-window cheat guard; skip when `pausedMs` absent; plumb `pausedMs` at the call site (:660-674).
3. **Tests.** Extend `detectScoreAnomalies` cases in [`tests/worker/d1-validation.spec.ts`](../tests/worker/d1-validation.spec.ts).

**Acceptance (EARS):**

- When a solo time-mode run submits with `pausedMs` and a real pause under 80% of the wall-clock window, the worker shall NOT add a `client_clock_skew` anomaly.
- If a submission sends `pausedMs` greater than 80% of the wall-clock window, then the worker shall ignore the credited pause and apply the raw-window skew check.
- When `pausedMs` is absent from `additionalData`, the worker shall skip the `client_clock_skew` check entirely.
- When `npx vitest run tests/worker/d1-validation.spec.ts` runs, all detectScoreAnomalies cases shall pass.

## Phase 2 — Menu return: overlay teardown + freeze cover (~2hr) [autonomous]

1. **Teardown.** Store the `createRoot` ref and export `disposeCompletionOverlay()` (unmount + remove) from [`js/boot/completionOverlay.js`](../js/boot/completionOverlay.js); route the two lazy-cleanup sites through it.
2. **Cover.** In `restartToMenu` ([`js/main.js`](../js/main.js) :1193-1229) call the teardown, then `await` a double `requestAnimationFrame` after `scene-swap-start` so `SceneSwapOverlay` paints before the synchronous rebuild.

**Acceptance (EARS):**

- When the player returns to the menu from the completion screen, the `#game-completion-overlay` node shall be removed from the DOM.
- When `restartToMenu` runs, the `SceneSwapOverlay` cover shall be visible before the dispose+rebuild block.
- If `restartToMenu` runs with no completion overlay mounted (mid-run quit), then `disposeCompletionOverlay()` shall be a no-op without throwing.

## Phase 3 — Menu warts: Play Again replay + local-2p/fallback wiring (~1.5hr) [autonomous]

1. **Replay.** Add `restartSameMode()` to [`js/main.js`](../js/main.js); wire `onPlayAgain` ([`js/boot/completionOverlay.js`](../js/boot/completionOverlay.js):81) to it.
2. **Wire.** Assign `window.gameInstance = this` near the instance registration (`setGameInstance`, main.js ~:657) so the inert fallback/local-2p buttons fire.

**Acceptance (EARS):**

- When the player clicks Play Again, the same mode and scene shall restart without a menu round-trip.
- When the local-2p or fallback completion "Main Menu" button is clicked, it shall invoke `restartToMenu` and tear down the overlay.

## Phase 4 — Username rename backend (~2.5hr) [autonomous]

1. **Worker.** Add `sanitizeDisplayName`, `ValidationError`/`NotFoundError`, and `renamePlayer` to [`worker/src/d1.ts`](../worker/src/d1.ts) (reuse `allocateDiscriminator` :263); add auth-gated `POST /api/rename` to [`worker/src/index.ts`](../worker/src/index.ts) (token-derived `persistent_id`, added to `rateLimited`).
2. **Tests.** Extend [`tests/worker/auth-register.spec.ts`](../tests/worker/auth-register.spec.ts) (or a sibling) for rename happy-path, idempotency, validation codes, discriminator collision, not-found, and the preserved TOFU-bind invariant.

**Acceptance (EARS):**

- When an authenticated player POSTs `/api/rename` with a valid new name, the worker shall update `display_name`, `discriminator`, and `full_name` for that `persistent_id`.
- If a rename request sends an empty or >20-codepoint name, then the worker shall return 400 with a machine code (`name_empty` / `name_too_long`).
- When a rename targets the player's current name, the worker shall return success without allocating a new discriminator.
- When `/api/rename` is called, the `persistent_id` shall be derived from the verified token, never from the request body.

## Phase 5 — Username Settings UI + propagation (~2.5hr) [autonomous]

1. **Network.** Add `renamePlayer(displayName)` to [`js/NetworkManager.js`](../js/NetworkManager.js) (`_ensureToken` + `_postJson('/api/rename')`).
2. **Persist.** Save `displayName`/`fullName`/`discriminator` on the post-register save in [`js/components/shared/playerIdentity.js`](../js/components/shared/playerIdentity.js).
3. **UI.** Add a "Display name" view+edit block to the Player profile section of [`js/components/StartScreen/SettingsPanel.js`](../js/components/StartScreen/SettingsPanel.js), reusing `SettingRow`, `Button`, and the existing `identity.*` i18n.

**Acceptance (EARS):**

- When the player opens Settings, the current display name shall be shown (the "check your name" surface).
- When the player saves a new name in Settings, the new name shall persist to localStorage and propagate to `players.display_name` via `/api/rename`.
- If the entered name is empty or too long, then the UI shall show the matching `identity.error*` string without a network call.
- While editing the name field, the game key handler shall be suppressed (`window.isTypingInInput`).

## Phase 6 — Completion submit feedback (~1.5hr) [autonomous]

Surface the leaderboard submit outcome on the end screen so a failed or hidden submit is never silent. Emit a `leaderboard-submit-result` event from the submit path ([`js/components/shared/playerIdentity.js`](../js/components/shared/playerIdentity.js):95-118 swallow site) and render a quiet status line in `CompletionScreen`.

**Acceptance (EARS):**

- When a score submit succeeds, the completion screen shall show a "saved to leaderboard" confirmation.
- If a score submit fails, then the completion screen shall show a non-blocking "could not save your score" line (no exclamation marks, no emoji).

## Phase 7 — Entrance "Playing as {name}" label (~1hr) [autonomous]

Add a read-only "Playing as {displayName}" label near the dog picker on the entrance screen ([`js/components/App.js`](../js/components/App.js) entrance screen ~:329), with a control that opens Settings to the name field.

**Acceptance (EARS):**

- When the entrance screen renders, the current display name shall be visible near the dog picker.
- When the player activates the name label, Settings shall open to the display-name field.

## Phase 8 — End-to-end verification, validate, deploy (~2hr) [paired at deploy]

1. Cover the full loop with deterministic tests rather than a single flaky browser e2e (the close-pairing ask was a more realistic AND repeatable proof). Three artifacts:
   - A real-SQLite worker scenario ([`tests/worker/score-flow.spec.ts`](../tests/worker/score-flow.spec.ts)) over a reusable harness ([`tests/worker/helpers/d1-sqlite.ts`](../tests/worker/helpers/d1-sqlite.ts), built on Node's `node:sqlite`). It applies the committed migrations to an in-memory DB and mocks a win through the actual `registerPlayer → submitScore → getLeaderboard → renamePlayer` path. This is the test that would have caught the incident: the pre-existing worker specs mocked D1 with canned rows, so the load-bearing SQL (`WHERE s.score_anomalies IS NULL`, the `GROUP BY` aggregation) never ran.
   - A client payload guard ([`tests/completion-submit-payload.spec.ts`](../tests/completion-submit-payload.spec.ts)) that locks `pausedMs` + the client window into the submit payload, so a future refactor cannot silently re-disarm the worker's pause crediting.
   - The overlay-teardown unit test ([`tests/ui/completionOverlay.dispose.spec.tsx`](../tests/ui/completionOverlay.dispose.spec.tsx)) for the menu-return contract.
2. Run `/validate`. Single worker + client deploy. Re-verify prod (paused repro not flagged, run shows, rename round-trips).

**Acceptance (EARS):**

- When the score-flow scenario runs, it shall assert a paused win is recorded and shown on the board, a forged run stays hidden from the public board (but visible to an admin read), a pre-Cycle-57 client without `pausedMs` is not re-flagged, and a rename propagates to the board.
- When the overlay-dispose test runs, it shall assert the `#game-completion-overlay` node is removed on menu return.
- When `/validate` runs at cycle close, `npm test` and `npm run build` shall both pass.
- When the close commit lands on `main`, the sheepdogsim.com deploy shall succeed.

**Recorded fixture decision (refactor-baseline):** the new features (rename UI, submit-status line, menu replay/teardown, entrance name label) grow `main-*.js` by ~1 KB. The `tests/refactor-baseline/__fixtures__/bundle-sizes.json` `mainKB` ratchet was bumped 546 → 547 intentionally; `threeKB` is unchanged, and the terrain-mesh / scatter-position goldens are untouched (no sim or placement code changed).

## Dependencies

```
Phase 1 (independent) ─┐
Phase 2 → Phase 3      ├─→ Phase 8 (verify + deploy)
Phase 4 → Phase 5 ─────┤
Phase 6 (after 5)      │
Phase 7 (after 5) ─────┘
```

Phase 1 is fully independent and can land first. Phases 2/3 (menu) and 4/5 (identity) are independent tracks. Phases 6 and 7 depend on the identity/submit plumbing from Phase 5. Phase 8 closes.

## Frozen files (cycle-specific additions)

None. The durable fence ([`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)) is sufficient. No `shared/` sim file, `SceneDef`, sim-baseline fixture, or MessagePack wire format is touched. The `/api/rename` route is a new additive endpoint; the `additionalData` `pausedMs` field is a backward-compatible JSON addition (not the frozen wire protocol).

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. If any sim-baseline fixture diff appears, stop — Phase 1 must be worker-only; a fixture change means the edit leaked into a shared sim path.
2. If `detectScoreAnomalies` changes cause an existing legitimate-cheat test to pass-through, stop and re-check the cheat guard before proceeding.
3. The `/api/rename` route must reject a body-supplied `persistent_id`; if a test can rename another player's row, stop and fix the auth derivation.

## What NOT to do during this cycle

- Don't add a blocking first-run name gate (respects [`archive/cycles/cycle-51-plan.md`](archive/cycles/cycle-51-plan.md):30 deferred-identity decision). The Settings field is opt-in only.
- Don't add server-side profanity filtering beyond control-char stripping in v1 (flag as follow-up).
- Don't reclaim old `discriminators` rows on rename (harmless; avoids races).
- Don't touch the MP/DO score path or the MessagePack protocol.
- Don't regenerate sim-baseline fixtures.

## Success criteria (cycle close)

- [x] When the cycle closes, all 8 phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [x] When `npm test` runs at cycle close, all vitest specs shall pass. (906 passed, 7 skipped — the live-worker integration spec.)
- [x] When `npm run build` runs at cycle close, the production build shall be clean. (main 547 KiB, within the ratchet.)
- [x] When the close commit lands on `main`, the sheepdogsim.com deploy shall succeed. (Deploy run 26987595694 green: Test + Deploy Worker + Deploy Pages + E2E. Worker version 8c6a4ebe; `/api/rename` live, returns 401 without a token. Pages deployed.)
- [x] When a paused solo run is completed after deploy, it shall appear on the leaderboard (not hidden as `client_clock_skew`). (Worker logic live and proven end-to-end by `tests/worker/score-flow.spec.ts`; prod board clean, 0 flagged rows, the incident run id=16 restored. A live paused-run smoke remains as Matt's next-play confirmation.)
- [x] When the player returns to the menu after a run, no stale overlay shall remain and the transition shall be covered. (Teardown locked by `tests/ui/completionOverlay.dispose.spec.tsx`; SceneSwapOverlay paint-yield in `restartToMenu`.)
- [x] When the player sets a name in Settings, it shall be visible there and propagate to the leaderboard. (Rename propagation proven end-to-end by `tests/worker/score-flow.spec.ts`.)

## References

- Approved design plan: `~/.claude/plans/let-use-think-about-lovely-puppy.md`
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) — deterministic-sim contract
- [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) — worker/DO contract
