# Phase 4 - Final Polish & Pre-Launch Validation

> **Rationale:** Last-mile UX and the load/chaos validation wanted before
> pointing traffic at it. This phase's gate is the launch gate.

## DAG

```
P4-GAMEPAD-UI ───────────── (independent)
P4-CTX-RESTORE ──────────── (independent)
P4-SW-TOAST ─────────────── (independent)
P4-PRELOAD ──────────────── (independent)
P4-REPO-CLEAN ───────────── (independent)
P4-BUNDLE-GATE ──────────── (independent)
P4-LOADTEST ─→ P4-CHAOS  (both gate launch)
```

---

## [P4-GAMEPAD-UI] Gamepad config

- **Owner hint:** frontend agent
- **Status:** complete (2026-06-09)
- **Deps:** none
- **Files:** `js/GamepadManager.js`, `js/gamepadPrefs.js` (new), `js/components/shared/gamepadCapture.js` (new), `js/components/shared/settings.js`, `js/components/StartScreen/SettingsPanel.js`, `js/locales/*/index.js`, `tests/ui/gamepadPrefs.spec.ts` (new)

Acceptance:

- [x] When a gamepad is connected, then Settings shall allow button/axis remap and deadzone adjustment.

Evidence (2026-06-09):

- Mapping design: GamepadManager's hardcoded `buttonMap`/`axisMap` values are now driven by a prefs model (`js/gamepadPrefs.js`, pure, zero imports). Settings edits action names (sprint, bark, zoomIn, zoomOut, bank, cameraCycle, note, pause + moveX/moveY axes); `applyGamepadPrefs` translates them onto the legacy physical-name maps, so every existing consumer (`main.js wasJustPressed('Y')`, SceneManager zoom, pause edge) follows a remap with zero call-site changes. Sprint keeps the legacy RT-axis heuristic only while sprint sits on its default button, so a remap wins.
- Persistence: `gamepad: { deadzone, buttons, axes }` under the existing `sds-settings` blob (same pattern as `keyBindings`), normalized on every load (deadzone clamped to 0.05-0.5, default 0.15 unchanged; indices validated; stale keys dropped). GamepadManager reads localStorage at init (mirrors InputHandler) and applies live updates from `gamepad-prefs-changed` (panel edits) and `settings-changed` (Reset All path).
- Settings UI (Controls tab): when no pad is connected the pre-existing support note renders, unchanged. When a pad is connected (gamepadconnected/disconnected listeners + initial `navigator.getGamepads()` scan): deadzone slider (0.05-0.5) with a live post-deadzone stick meter (120ms poll, only while the tab is open), per-action button capture (click, then press a button; 50ms poll against a baseline snapshot so held buttons do not self-assign), movement axis capture (move a stick; baseline-relative so resting triggers at -1 do not self-assign), conflict rejection with the keyboard-rebinder's feedback pattern, and a reset-to-default. Escape cancels a capture; disconnection mid-capture cancels cleanly (poll sees no pad + the section unmounts). While a capture is armed, an `sds-gamepad-capture` event suppresses GamepadManager's game-facing reads so binding Start/A does not also toggle pause/zoom.
- Locales: 21 new `settings.*` leaf keys translated in all 5 locales (en/es/ja/pt/zh-CN); locale parity ratchet green with no allowlist additions.
- Tests: `tests/ui/gamepadPrefs.spec.ts` (24 tests, mock Gamepad objects): remap round-trip, deadzone clamp, normalize repair of corrupt blobs, capture baseline/detection, conflict detection, settings round-trip, GamepadManager init read + live event application + remapped reads + capture suppression.
- Validation: `npm run lint`, `npm run typecheck`, `npm test` (1417 passed, 8 skipped), `npm run build` all green.
- Bundle attribution (measured by building with and without this task's diff at the same tree state): main +1,918 B (616,150 vs 614,232; the prefs model + GamepadManager wiring - capture helpers were deliberately split into `gamepadCapture.js` so they ride the lazy chunk instead), SettingsPanel lazy chunk +5,689 B (19,635 -> 25,324; verified still a separate lazy chunk), i18n +3,498 B (the 5-locale strings). The remaining main delta vs the P4-BUNDLE-GATE capture (614,232 vs 611,027) belongs to concurrent P4 work (context-loss recovery). The fixture budgets (main 602, i18n 130, other 530 KiB) match this combined measured state.

---

## [P4-CTX-RESTORE] WebGL context-loss recovery

- **Owner hint:** render agent
- **Status:** done
- **Deps:** none
- **Files:** `js/rendering/sceneRendererSetup.js:60-67`

Acceptance:

- [x] When the WebGL context is lost and restored, then geometry/textures shall rebuild (or an automatic reload prompt shall appear) instead of a gray screen.

Evidence (2026-06-09):

- Before: the `webglcontextlost` handler in `sceneRendererSetup.js` only logged and `preventDefault()`ed; `webglcontextrestored` only logged. A Playwright probe (dev server, `?renderer=webgl`, `WEBGL_lose_context`) showed Three.js keeps the rAF loop alive and self-restores most resources on `webglcontextrestored`, but baked-once `WebGLRenderTarget` textures (far-tree billboard bakes in `TreePlacement.js`, cached across scene swaps in `_bakeImpostorCache`) stay invalid, and when the browser never fires restored (common for real driver resets) the player sat on a silently frozen frame forever. The WebGPU path had the same gap: boot preflights a throwaway device but nothing watched the live renderer's `device.lost`.
- Design chosen: automatic recovery overlay + reload (option b), not in-place re-bake. `js/rendering/webglContextRecovery.js`: on `webglcontextlost` show a small warm-glass overlay ("Graphics context lost / Restarting the renderer..."), then `location.reload()` (URL params preserved) as soon as `webglcontextrestored` fires, or after a 2s timeout if it never does. WebGPU: `watchWebGpuDeviceLost` polls for the live GPUDevice and reloads on `device.lost` (skipping reason `destroyed`). One overlay, one telemetry event, one reload per loss, guarded against double-install across configure passes.
- Telemetry: `context_lost` event with `{ renderer: webgl|webgpu, outcome: reload-restored|reload-timeout|reload-device-lost }`, sent keepalive so it survives the reload.
- Strings: `contextLost.title` / `contextLost.body` in all 5 locales.
- After-probe: scenario A (lose then restore in 800ms) showed the localized overlay during loss, reload on restore, world re-booted clean. Scenario B (lose, never restore) showed the overlay and reloaded via the 2s timeout. No silent gray screen in either path.
- Tests: `tests/ui/webglContextRecovery.spec.ts` (14 specs - state machine, device-lost watch, listener wiring). Lint, typecheck, full unit suite, build all green.
- Bundle note: `tests/refactor-baseline/__fixtures__/bundle-sizes.json` regenerated (main 597 -> 602 KiB, i18n 126 -> 130, other 524 -> 530); deliberate growth from this task's recovery module + locale strings plus the concurrent P4-GAMEPAD-UI additions, recorded here per the ratchet convention.

---

## [P4-SW-TOAST] Service-worker update notification

- **Owner hint:** frontend agent
- **Status:** pending
- **Deps:** none

Acceptance:

- [ ] When a new SW takes control (controllerchange), then a "new version, refresh" toast shall appear.

---

## [P4-PRELOAD] Resource hints

- **Owner hint:** infra agent
- **Status:** complete (2026-06-09)
- **Deps:** none
- **Files:** `index.html`, `vite.config.js`

Acceptance:

- [x] When the page loads, then modulepreload/preconnect hints shall shorten the first-load waterfall.

Evidence (2026-06-09):

- Waterfall mapped: Vite already injects modulepreload for the entry's STATIC imports only (three, vendor) and rewrites the Cycle-82 entrance-hero preload to the hashed asset. The React entrance is reached through two serialized dynamic-import hops (entry -> `App.js` -> the 38-chunk `Promise.all` wave in `initReactUI`), so none of those chunks even start downloading until `main-*.js` (597 KiB) has downloaded and executed; by then main has also kicked off the background world boot (4 MB terrain `.bin`, GLBs, GrassSystem), which the UI chunks then share bandwidth with.
- Hints added, with justification:
  - `entranceModulePreloadPlugin` in `vite.config.js` (build-pipeline, since chunk names are hashed): injects `<link rel="modulepreload">` for the App chunk + its direct dynamic-import wave + their static closure, computed from the bundle graph at build time (58 links, ~1.05 MB raw). Every one of these gates the entrance's first render (the `Promise.all` in `App.js` resolves before anything mounts), so they are critical-path by construction, never speculative. Game-world chunks (GrassSystem, scenes, terrain, GLBs, locales beyond the bundled i18n chunks) are NOT in App's wave and are NOT hinted, per the do-not-fight-bandwidth rule. Web builds only (itchio/native use `./` base). `about.html` untouched (0 injected).
  - `index.html`: upgraded the Worker-origin `dns-prefetch` to `preconnect crossorigin` (main.js POSTs `renderer_mode_resolved` telemetry to `/api/event` during boot, so DNS+TLS is on the first-load path; dns-prefetch kept as older-browser fallback); removed the stale `unpkg.com` preconnect (nothing references unpkg; it only burned a socket at boot). Hero-image preload and Google Fonts preconnects were already present and correct; no font-file preload added (the css2 woff2 URL is not stable).
- Measured (Playwright vs `npm run preview`, fresh context + cache disabled per run, navigationStart -> entrance visible = first child mounted into `#react-overlay`, 3 runs each, medians):
  - Unthrottled localhost: 741 ms -> 326 ms.
  - 20 Mbps / 40 ms RTT (CDP emulation): 8,771 ms -> 912 ms. Before-numbers reproduced in a second pass (8,710 ms median), so the win is stable: the hints both remove the two serialized discovery hops and let the UI chunks front-run the multi-MB world-boot downloads they previously queued behind.
- SW interplay: `sw.js` treats hashed `/assets/*.js` as immutable cache-first, so on repeat visits the preloads are served from the SW cache (no double-fetch; browsers dedupe modulepreload against the module map within a load). On first visit the SW registers after `load` and caches as the preloads stream through. No SW change needed.
- Validation: `npm run lint` green, `npm test` green (145 files passed, 2 skipped; an earlier transient bundle-ratchet failure was the concurrent P4-CTX-RESTORE/P4-GAMEPAD-UI growth, resolved by their recorded budget bump), `npm run build` green. Probe pages/contexts closed and the preview listener on :4173 killed after measurement.

---

## [P4-REPO-CLEAN] Strip committed artifacts

- **Owner hint:** infra agent
- **Status:** complete (2026-06-09)
- **Deps:** none
- **Files:** repo root (86 committed PNGs, stale `cycleN-validation/`)
- **Note:** `docs/archive/` and frozen validation evidence are out of scope; only loose root screenshots and stale validation dirs that are not referenced as evidence. When in doubt, list candidates and surface to Matt before deleting.

Acceptance:

- [x] When the cleanup lands, then `git ls-files` shall return zero loose root screenshots.

Evidence (2026-06-09):

- Inventory: `git ls-files` matched **0** root-level `*.png|jpg|jpeg|gif|webp|mp4` files. The "86 committed PNGs" claim was stale: prior cleanups already landed (`c7a3a42` untracked `cycle*-validation/`, `1756668` deleted cycle19 dead artifacts). All 86-ish loose PNGs that motivated the spec exist today only as 44 untracked, already-gitignored scratch files in the primary checkout's working tree (regenerable probe screenshots; never in git).
- Moved: none (no committed root artifact was referenced anywhere, because none was committed).
- Deleted from git: none needed. Committed images all live in legitimate homes: `assets/` (49), `sandbox/native-capacitor-proof/` Android res (26), `tools/validation/golden/` (12, golden-screenshot harness), `native/desktop-electron/build/icon.png` (1).
- Stale `cycle*-validation/` dirs: zero committed (pattern ignored since `c7a3a42`); none present in this worktree.
- Recurrence guard (.gitignore additions): root-anchored `/*.png /*.jpg /*.jpeg /*.gif /*.webp /*.mp4` (legit images in `assets/`, `public/`, `docs/`, `tools/`, `sandbox/`, `native/` unaffected - verified `git ls-files | git check-ignore --stdin` matches nothing tracked) plus `.playwright-cli/` (tool droppings seen untracked in the primary checkout).
- Validation: `npm test` and `npm run build` green post-change (see gate notes).

---

## [P4-BUNDLE-GATE] Bundle-size CI threshold

- **Owner hint:** infra agent
- **Status:** complete (2026-06-09)
- **Deps:** none
- **Note:** Codify the informal Cycle-80 baseline guard. The current local ratchet is main-*.js <= 593 KiB and three at 604 KiB (per `docs/cycle-85-plan.md`); confirm current values before pinning.

Acceptance:

- [x] When a chunk exceeds its per-chunk budget, then CI shall warn/fail.

Evidence (2026-06-09):

- Confirmed current values before pinning: main is 611,027 bytes (596.7 KiB, so the legacy round-semantics `mainKB: 597` stands; the plan's 593 was stale), three is 618,777 bytes (604.3 KiB, `threeKB: 604` stands).
- Gap verified: the spec's bundle block self-skips when `dist/` is absent, and the test jobs in both `.github/workflows/deploy.yml` and `.github/workflows/preview.yml` ran `npm test` without building, so the gate never fired in CI. Fixed by adding `npm run build` before `npm test` in both test jobs (build is ~6s locally; the pages jobs already run it on the same runner class). CRLF preserved in deploy.yml; both workflows js-yaml parse clean.
- Per-chunk budgets added to `tests/refactor-baseline/__fixtures__/bundle-sizes.json` (`chunkBudgetsKiB`); families match the name prefix before the Rollup hash, multi-chunk families are summed (i18n ships 2 chunks), unmatched chunks sum into `other`. Budget = measured size rounded up to the next KiB (the sub-KiB rounding is the only headroom; bumps are deliberate, recorded decisions). Legacy `mainKB`/`threeKB` round-semantics keys kept so history reads continuously.

| Chunk family | Measured (bytes) | Budget (KiB, ceil) |
|---|---|---|
| main | 611,027 | 597 |
| three | 618,777 | 605 |
| client | 180,806 | 177 |
| ui | 129,928 | 127 |
| i18n (2 chunks) | 128,990 | 126 |
| webgpuDiagnostic | 86,087 | 85 |
| vendor | 60,793 | 60 |
| App | 26,073 | 26 |
| other (88 chunks) | 536,491 | 524 |

- Failure UX verified by tripping the client budget to 10: `Chunk family "client" is 177 KiB, over its 10 KiB budget. If the growth is deliberate, bump the budget in tests/refactor-baseline/__fixtures__/bundle-sizes.json and record the decision (ratchet convention: bumps are deliberate, recorded decisions).` Fixture restored after the probe.
- Validation: `npm run build` green, `npx vitest run tests/refactor-baseline/baseline.spec.ts` 17/17 green (3 terrain + 3 scatter + 2 legacy + 9 per-chunk), full `npm test` green (1379 passed, 8 skipped).

---

## [P4-LOADTEST] Concurrent-room load test

- **Owner hint:** qa/backend agent
- **Status:** pending
- **Deps:** none within this phase, but run after the Phase 2 cost work (guaranteed by phase ordering)

Acceptance:

- [ ] When ~100 concurrent rooms are simulated, then DO CPU and egress shall stay within target and no room shall desync.

---

## [P4-CHAOS] DO-eviction chaos test

- **Owner hint:** qa/backend agent
- **Status:** pending
- **Deps:** P4-LOADTEST

Acceptance:

- [ ] When random DOs are evicted mid-game, then reconnect grace and survival-progress resume shall behave per spec.

---

## Gate (launch gate)

- [ ] `npm test` green
- [ ] `npm run build` green
- [ ] Controls/recovery/update UX are complete
- [ ] The repo is clean
- [ ] The backend has survived load + chaos validation

Gate result: (record date, commit, and evidence here)
