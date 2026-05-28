# Cycle 43 — retire-webgpu-scaffolding

> Drafted 2026-05-28 after Cycle 42 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

WebGPU shipped as the proven production default in Cycle 42 (`v2.1.10`). The migration left behind a boot-scout recorder and a set of `konveyor*` proof routes, flags, and one-time tool runners that were only ever stepping-stones to that proof. This cycle deletes that scaffolding while preserving every load-bearing production WebGPU path. There is **no user-visible difference** before vs after: the same WebGPU game ships. The difference is internal: ~600 fewer lines of diagnostic-only code, no dead `konveyorProductionBootScout` route in the runtime gate, and a smaller, clearer boot path. Production native instancing rides `isKonveyorProductionWebGpuActive()` plus the `konveyorNativeTreeImpostors` route, not the scout query, so removing the scout pieces cannot regress the shipped renderer.

## How to read this plan

This is a deletion cycle, not a feature cycle. The "shape" being fixed is *what gets removed* and *what is provably load-bearing and must stay*. Every phase is grep-verifiable: a string either survives in production code or it does not.

## Open questions to resolve before writing code

1. **Q1: What surviving route should the `konveyor-instancing-adapter` scene-body tests repoint to?** **Resolved (2026-05-28).** The three production scene-body tests (`placeTrees`, `placeEnvironmentDetails` x2, plus the empty-island case) gate on `shouldUseKonveyorProductionNativeInstancing()`, which reads `window.location.search`. They pass today only because `NATIVE_INSTANCING_SEARCH` satisfies the `explicitScoutRoute` clause being removed. The NEXT_SESSION lean (`?renderer=webgpu&konveyorNativeTreeImpostors=octahedral`) is **wrong** for these tests: that route flips `useProductionNativeImpostor = true` in [`TreePlacement.js`](../js/world/TreePlacement.js), forcing the kiln-impostor + hybrid-LOD path, which the plain `treeRoot()` box fixtures cannot satisfy (`ok` goes false). The correct repoint is the **production WebGPU window globals** (`window.__sdsRendererMode.effective = 'webgpu-production'` + `window.__sdsG.productionWebGpu.enabled = true`), mirroring `setProductionWebGpuWindow()` in [`konveyor-runtime-mode.spec.js`](../tests/konveyor-runtime-mode.spec.js). That satisfies the gate via `isKonveyorProductionWebGpuActive()` and preserves the `lod0-only` / `route: 'konveyor-production-scene-body'` code path the assertions expect. This is strictly better coverage: the test now exercises the real ship gate instead of a dead scout query.

## Architecture / shared changes

None. No `shared/` sim core, no `SceneDef` schema, no wire protocol, no D1 migration is touched. The deterministic-sim boundary and the sim-baseline fixtures are untouched, so no regeneration is required.

## Phase 1 — Remove scout boot path (runtime) (~1hr)

**Independently testable.** This is the live runtime wiring. It comes first because Phase 2's file deletion would leave dangling imports if the runtime references were still present.

1. **`index.html` bootstrap.** Drop the `productionBootScout` request parse, the `effective: 'webgpu-production-boot-scout'` branch, and `__sdsG.productionBootScout`. Keep `productionWebGpu` and the `webgpu-production` effective mode verbatim. [`index.html`](../index.html)
2. **`js/main.js` DOMContentLoaded dispatch.** Drop the `if (window.__sdsG?.productionBootScout)` branch and the `recordProductionBootScoutSequence` var + dynamic `import('./diagnostics/konveyorProductionBootScoutRecorder.js')` call. Keep the `else if (window.__sdsG?.productionWebGpu)` production path verbatim. [`js/main.js`](../js/main.js)
3. **`js/rendering/konveyorRuntimeMode.js`.** Remove only the `explicitScoutRoute` clause from `shouldUseKonveyorProductionNativeInstancing()`. Keep `explicitTreeImpostorRoute` (`konveyorNativeTreeImpostors`) and the `isKonveyorProductionWebGpuActive()` gate. [`js/rendering/konveyorRuntimeMode.js`](../js/rendering/konveyorRuntimeMode.js)
4. **`js/rendering/konveyorProductionWebGpuBoot.js`.** Remove `renderer.domElement.dataset.konveyorProductionBootScout = '1'` (~line 139). Keep `dataset.konveyorProductionWebGpu = '1'` (~line 138) and every exported function. [`js/rendering/konveyorProductionWebGpuBoot.js`](../js/rendering/konveyorProductionWebGpuBoot.js)

**Acceptance (EARS):**

- When Phase 1 ships, then `grep -rn "productionBootScout" index.html js/main.js js/rendering/` shall return 0 matches.
- When Phase 1 ships, then `grep -n "webgpu-production-boot-scout" index.html` shall return 0 matches.
- While the production path is unchanged, `grep -c "productionWebGpu" js/main.js` shall return a non-zero count (the `else if` production branch survives).
- When Phase 1 ships, then `grep -n "explicitScoutRoute" js/rendering/konveyorRuntimeMode.js` shall return 0 matches and `grep -n "explicitTreeImpostorRoute" js/rendering/konveyorRuntimeMode.js` shall still match.

## Phase 2 — Delete scout-only files (~0.5hr)

**Depends on:** Phase 1 (the runtime no longer imports the recorder).

1. **Delete** [`js/diagnostics/konveyorProductionBootScoutRecorder.js`](../js/diagnostics/konveyorProductionBootScoutRecorder.js) (557 lines, diagnostic-only).
2. **Delete** [`tools/konveyor-production-boot-scout.mjs`](../tools/konveyor-production-boot-scout.mjs) (one-time proof runner, no `package.json` script reference).
3. **Delete** [`tools/konveyor-production-gameplay-parity-proof.mjs`](../tools/konveyor-production-gameplay-parity-proof.mjs) (one-time proof runner, no `package.json` script reference).

**Acceptance (EARS):**

- When Phase 2 ships, then `js/diagnostics/konveyorProductionBootScoutRecorder.js` shall not exist.
- When Phase 2 ships, then neither `tools/konveyor-production-boot-scout.mjs` nor `tools/konveyor-production-gameplay-parity-proof.mjs` shall exist.
- If any surviving source file still imports a deleted file, then `npm run build` shall fail and the phase shall not be considered done until the import is gone.

## Phase 3 — Repoint + prune tests (~1hr)

**Depends on:** Phase 1 (the gate no longer accepts the scout route).

1. **Repoint** the three scene-body tests in [`tests/konveyor-instancing-adapter.spec.js`](../tests/konveyor-instancing-adapter.spec.js). Replace the `NATIVE_INSTANCING_SEARCH` scout query + the `setWindowSearch` helper with a production-WebGPU-window setup (per Q1): set `window.__sdsRendererMode.effective = 'webgpu-production'` and `window.__sdsG.productionWebGpu.enabled = true`. Do **not** delete the three tests; they remain the only coverage that `placeTrees` / `placeEnvironmentDetails` build native `THREE.InstancedMesh` (not `InstancedMesh2`) on the production route.
2. **Remove** the "keeps the guarded scout native-instancing route intact" test (lines ~37-41) in [`tests/konveyor-runtime-mode.spec.js`](../tests/konveyor-runtime-mode.spec.js). Keep the production-route test and the tree-impostor-route test.

**Acceptance (EARS):**

- When Phase 3 ships, then `grep -rn "konveyorProductionBootScout\|konveyorProductionSceneBody" tests/` shall return 0 matches.
- When `npm test` runs after Phase 3, then the three scene-body tests in `konveyor-instancing-adapter.spec.js` shall still pass (coverage preserved, route repointed).
- If repointing reddens a previously-green test, then the agent shall stop and surface (do not adjust expectations to paper over a behavior change).

## Phase 4 — Docs (~0.5hr)

**Depends on:** Phases 1-3 (docs describe the end state).

1. **`ARCHITECTURE.md`.** Remove the boot-scout paragraph (~144-164). Soft-fence file: this is the sanctioned "update when a module is removed" edit. [`ARCHITECTURE.md`](../ARCHITECTURE.md)
2. **`DECISIONS.md`.** Append a NEW dated entry recording the retirement (what was removed, why it was safe, what stayed). Do **not** rewrite the existing boot-scout entry. Append-only frozen file. [`DECISIONS.md`](../DECISIONS.md)
3. **`tools/validation/README.md`.** Drop the scout-runner references. [`tools/validation/README.md`](../tools/validation/README.md)

**Acceptance (EARS):**

- When Phase 4 ships, then `grep -n "boot-scout\|bootScout" ARCHITECTURE.md` shall return 0 matches.
- When Phase 4 ships, then `DECISIONS.md` shall contain a new dated entry whose text references the boot-scout retirement, and the prior boot-scout entry shall remain unmodified (append-only).
- When Phase 4 ships, then `grep -rn "konveyor-production-boot-scout\|konveyor-production-gameplay-parity-proof" tools/validation/README.md` shall return 0 matches.

## Dependencies

```
Phase 1 → Phase 2 + Phase 3 (parallel) → Phase 4
```

Phase 1 (runtime) must land before Phase 2 (file deletion) so no dangling import survives, and before Phase 3 (the gate must already reject the scout route). Phases 2 and 3 are independent of each other. Phase 4 (docs) describes the end state, so it lands last.

## Frozen files (cycle-specific additions)

These are authorized for this cycle, per-phase only:

- **[`DECISIONS.md`](../DECISIONS.md)** (Phase 4) — append a new dated entry only. No rewrite of prior entries. This is the standard append-only authorization.
- **[`ARCHITECTURE.md`](../ARCHITECTURE.md)** (Phase 4) — soft fence; remove the paragraph for the deleted module.

No hard-fence schema, sim-core, or test-ratchet file is touched. The `tests/*.spec.js` files in Phase 3 are ordinary specs, not `tests/sim-baseline/` or `tests/refactor-baseline/` ratchets.

## Hard stops

Durable hard stops apply on every cycle (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific additions:

1. If `npm run build` fails after Phase 2 with a missing-module error, then a production file still imported a deleted scout file. Stop, find the live import, and remove it before continuing (do not re-add the deleted file).
2. If repointing the scene-body tests in Phase 3 changes any assertion other than the window/route setup (for example `ok`, `route`, or `lod` flips), then the repoint hit a different code path. Stop and surface; do not edit the assertions to match.
3. If `grep` shows `konveyorNativeInstancing` dropping to 0 in `js/world/`, stop: that string is the production native-instancing marker on `userData`, not a scout artifact, and must survive.

## What NOT to do during this cycle

- Do not remove `konveyorNativeTreeImpostors` / `explicitTreeImpostorRoute`. That is the live octahedral-v2 impostor route promoted in Cycle 42.
- Do not remove `isKonveyorProductionWebGpuActive()` or the `webgpu-production` effective mode. That is the production gate.
- Do not touch `js/world/konveyorNativeInstancingAdapter.js`, `TreePlacement.js`, or `RockPlacement.js` placement logic. Only the test that drives them is repointed.
- Do not bump the version or ship a release. This is internal cleanup; no `CHANGELOG` player entry.
- Do not expand into a broader `konveyor*` rename or a wider diagnostics sweep. Other `konveyor*` diagnostics that are not boot-scout scaffolding are out of scope.

## Success criteria (cycle close)

- [ ] When the cycle closes, all four phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass (scene-body coverage preserved, scout-route test removed).
- [ ] When `npm run build` runs at cycle close, the production build shall be clean with no missing-module errors.
- [ ] When `grep -rn "productionBootScout" index.html js/ tests/ tools/` runs at cycle close, it shall return 0 matches.
- [ ] When the close commit lands on `main`, the sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the cycle closes, the shipped WebGPU renderer shall be byte-for-byte the same production path as `v2.1.10` (no user-visible change), confirmed by the surviving production gate tests.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
