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
- **Status:** pending
- **Deps:** none
- **Files:** `js/GamepadManager.js`, Settings UI

Acceptance:

- [ ] When a gamepad is connected, then Settings shall allow button/axis remap and deadzone adjustment.

---

## [P4-CTX-RESTORE] WebGL context-loss recovery

- **Owner hint:** render agent
- **Status:** pending
- **Deps:** none
- **Files:** `js/rendering/sceneRendererSetup.js:60-67`

Acceptance:

- [ ] When the WebGL context is lost and restored, then geometry/textures shall rebuild (or an automatic reload prompt shall appear) instead of a gray screen.

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
- **Status:** pending
- **Deps:** none
- **Files:** `index.html`

Acceptance:

- [ ] When the page loads, then modulepreload/preconnect hints shall shorten the first-load waterfall.

---

## [P4-REPO-CLEAN] Strip committed artifacts

- **Owner hint:** infra agent
- **Status:** pending
- **Deps:** none
- **Files:** repo root (86 committed PNGs, stale `cycleN-validation/`)
- **Note:** `docs/archive/` and frozen validation evidence are out of scope; only loose root screenshots and stale validation dirs that are not referenced as evidence. When in doubt, list candidates and surface to Matt before deleting.

Acceptance:

- [ ] When the cleanup lands, then `git ls-files` shall return zero loose root screenshots.

---

## [P4-BUNDLE-GATE] Bundle-size CI threshold

- **Owner hint:** infra agent
- **Status:** pending
- **Deps:** none
- **Note:** Codify the informal Cycle-80 baseline guard. The current local ratchet is main-*.js <= 593 KiB and three at 604 KiB (per `docs/cycle-85-plan.md`); confirm current values before pinning.

Acceptance:

- [ ] When a chunk exceeds its per-chunk budget, then CI shall warn/fail.

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
