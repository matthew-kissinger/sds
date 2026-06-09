# Phase 3 - Retention & Maintainability

> **Rationale:** Now that it is stable and observable, invest in
> why-players-return and in paying down the structural debt that slows every
> future feature.

## DAG

```
P3-ACHIEVE-DATA ─→ P3-ACHIEVE-UI
                └─→ P3-ACHIEVE-UNLOCK
P3-MP-COORD ──────────────── (refactor, independent)
P3-KONVEYOR ──────────────── (refactor, independent)
P3-LISTENER-AUDIT ─→ P3-SOAK
P3-GSV-SPLIT ─────────────── (refactor, sim, independent)
P3-BOUNDARY-DRY ──────────── (refactor, sim, independent)
```

---

## [P3-ACHIEVE-DATA] Achievement model + persistence

- **Owner hint:** gameplay agent
- **Status:** pending
- **Deps:** none
- **Files:** new achievements module, localStorage schema (with versioning; current settings have none)

Acceptance:

- [ ] When a qualifying event occurs (pen 200 on each biome, survive 5 nights, win a competitive room), then the achievement shall be recorded and survive reload.

---

## [P3-ACHIEVE-UI] Achievement surfacing

- **Owner hint:** frontend agent
- **Status:** pending
- **Deps:** P3-ACHIEVE-DATA

Acceptance:

- [ ] When an achievement unlocks, then a non-blocking toast shall show.
- [ ] A list shall be viewable from the menu.

---

## [P3-ACHIEVE-UNLOCK] Tie dog/cosmetic unlocks to achievements (optional)

- **Owner hint:** gameplay agent
- **Status:** pending
- **Deps:** P3-ACHIEVE-DATA
- **Note:** Optional scope. If cut, record the decision here and in `docs/BACKLOG.md`.

Acceptance:

- [ ] When a gated achievement unlocks, then its associated dog/cosmetic shall become selectable.

---

## [P3-MP-COORD] Extract MultiplayerCoordinator from main.js

- **Owner hint:** frontend agent
- **Status:** pending
- **Deps:** none
- **Files:** `js/main.js:2910-3120` -> new `js/multiplayer/MultiplayerCoordinator.js`
- **Risk:** medium. Touches the per-frame loop; gate with MP e2e specs. Note `.claude/rules/scene-and-render.md` protects main.js's per-frame update loop and mode dispatch; this is a boot/coordination extraction, which is explicitly fair game, but do not reorder the loop itself.

Acceptance:

- [ ] When extraction lands, then `updateOtherPlayer`/`reconcileWithServerState`/`removeOtherPlayer` shall live in a unit-testable class.
- [ ] `wc -l js/main.js` shall drop materially.

---

## [P3-KONVEYOR] Consolidate 31 material adapters + surface fallback errors

- **Owner hint:** render agent
- **Status:** pending
- **Deps:** none
- **Files:** 31x `js/**/konveyor*MaterialAdapter.js` -> one `createKonveyorAdaptedMaterial` helper

Acceptance:

- [ ] When a WebGPU material factory is missing/invalid, then the degradation shall be surfaced (console.warn + telemetry), not buried in `window.__sdsG`.
- [ ] When the helper lands, then adapter boilerplate shall be defined once.

---

## [P3-LISTENER-AUDIT] AbortController-ize all listeners + verify dispose

- **Owner hint:** frontend agent
- **Status:** pending
- **Deps:** none
- **Files:** ~92 addEventListener sites (notably `js/main.js:637,643`, `js/SceneManager.js:172`), `js/OptimizedSheep.js` dispose, `js/boot/loadScene.js`

Acceptance:

- [ ] When a scene swaps, then every listener registered for that scene shall be torn down via the scene AbortController.
- [ ] When `OptimizedSheepSystem.dispose()` runs, then InstancedMesh geometry+material shall be released.

---

## [P3-SOAK] Room-hop memory soak test

- **Owner hint:** infra/qa agent
- **Status:** pending
- **Deps:** P3-LISTENER-AUDIT
- **Files:** new e2e under `tests/e2e/mp/`

Acceptance:

- [ ] When 50 scene/room swaps run in sequence, then JS heap shall not grow monotonically beyond a bound.

---

## [P3-GSV-SPLIT] Split GameStateValidation.js [FENCE: shared/]

- **Owner hint:** sim agent
- **Status:** pending
- **Deps:** none
- **Files:** `shared/GameStateValidation.js` -> `GameStateValidation.js` (state machines), `SpawnLogic.js`, `CompetitiveMode.js`
- **Risk:** medium. Mechanical move only; baseline is the guard. No regeneration authorized.
- **Fence:** `shared/GameStateValidation.js` is fence-frozen. Migration story (re-export shim plan, consumer list) required in this block; human sign-off before merge.

Migration story (fill before implementation):

- File:
- Why:
- Alternative considered:
- Consumer updates:

Acceptance:

- [ ] When the split lands, then each module shall be < ~250 lines.
- [ ] Exports shall be re-exported for compatibility.
- [ ] The sim-baseline shall be byte-identical (pure move, no behavior change).

---

## [P3-BOUNDARY-DRY] DRY BoundaryCollision rect-force math [FENCE: shared/]

- **Owner hint:** sim agent
- **Status:** pending
- **Deps:** none
- **Files:** `shared/BoundaryCollision.js:87-127, 215-263`
- **Fence:** `shared/BoundaryCollision.js` is fence-frozen. Migration story required in this block; human sign-off before merge. No regeneration authorized.

Migration story (fill before implementation):

- File:
- Why:
- Alternative considered:
- Consumer updates:

Acceptance:

- [ ] When refactored, then rect-force logic shall exist once.
- [ ] The sim-baseline shall be byte-identical.

---

## Gate

- [ ] `npm test` green
- [ ] `npm run build` green
- [ ] Players have a reason to return (achievements live)
- [ ] main.js and the render layer are meaningfully lighter
- [ ] No scene-swap leaks (soak test green)

Gate result: (record date, commit, and evidence here)
