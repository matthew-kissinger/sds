# Burn-down and custom-harness notes

Working notes for the deliberate burn-down Matt called for (2026-06-16). Not a cycle
plan yet. The next pass aligns on the custom perf/diagnostic harness and compacts
these findings.

## The custom harness

A custom harness to drill into the game systematically, comparing across:

- **Game modes** (Just Play, Solo ladder, Counting Sheep, Survival, Multiplayer).
- **Per-scene differences that change the render/sim path.** The big one is terrain
  shape: Home Field is a flat rect (no `boundary.kind`); the others are islands /
  coastline. That single difference routes Home Field down a different foliage path
  (see finding 1).

Goal: stop discovering per-scene path divergences by accident (like the Home Field
impostor gap) and read them off a table on purpose.

### Scope boundary: this harness is NOT a perf harness

Perf (draw calls, instance counts, frame time, sustained-play metrics) is owned by
a separate effort. This harness deliberately stays out of it so the two never
contend for the GPU. What it reports is **categorical render-path structure**:
which foliage route a scene takes, whether it gets far impostors on the default
production path, loading shape, renderer pin, tree source.

### Status

- **Built - static layer:** [`tools/validation/scene-render-path-map.mjs`](../tools/validation/scene-render-path-map.mjs).
  Pure Node, no browser, no timing. Imports the real SceneDefs and prints a
  per-scene render-path table; `--json` writes an artifact. It mirrors the one
  routing predicate it needs (`usesConsolidatedTreeCull`) with a `SOURCE:` pointer,
  locked against the canonical predicate by
  [`tests/scene-render-path-map.spec.js`](../tests/scene-render-path-map.spec.js)
  so the mirror cannot drift. First run confirmed `field` is the lone non-consolidated
  row (`cull=N`, `farImp=N`) while the three islands are `Y/Y` - finding 1, on a table.
- **Scaffolded - runtime confirmation layer (not implemented):** on-device,
  genuine-WebGPU, structural-only (still no timing). Confirms the static prediction
  materialized at runtime (impostor groups present y/n, production-WebGPU boot gate
  pass/fail) by reusing the headed-Chrome launcher in
  [`tools/validation/screenshot-golden.mjs`](../tools/validation/screenshot-golden.mjs).
  Deferred to the impostor burn-down so it runs off the perf agent's GPU schedule.

## Finding 1: Home Field has no far-tree impostors + runaway draw calls

Confirmed root cause:

- `usesConsolidatedTreeCull(sceneDef)` is true only for `boundary.kind` of `island` or
  `coastline`. Home Field is a flat rect with no `boundary.kind`, so it is the only
  scene that returns false.
- In production WebGPU, `createTrees` routes every scene to
  `createNativeTreeInstancedMeshes`. Islands (consolidated) get far impostors from the
  cull path. Home Field (non-consolidated) hits the per-chunk fan-out, where the kiln
  impostor loads ONLY when `useProductionNativeImpostor` is true, and that is gated
  behind the `?webgpuNativeTreeImpostors=` dev URL flag.
- Net: Home Field renders all ~371 treeline trees as LOD0, per chunk. No impostors,
  and a draw-call count that scales with the per-chunk fan-out.

Why it is NOT a one-line fix (attempted and reverted this pass). Flipping
`useProductionNativeImpostor` on for non-consolidated scenes cascades:

1. The per-chunk impostor LOD chain needs a `mid-lod1` group, but Home Field's LOD1
   tree models only load under the same dev flag (`TerrainBuilder.js` ~521).
2. `impostorGroupsOk` (`TreePlacement.js` ~829) then asserts exact runtime properties
   (tileSelection, billboardProjection, terrainGroundedPivots).
3. `summary.ok` feeds the production WebGPU boot gate (`productionWebGpuBoot.js:206`
   -> `state.ok` -> `production-webgpu-gates-failed`). A miss there fails the WebGPU
   boot gate for Home Field, a worse regression than the slow-but-correct status quo.

Two fix options for the burn-down (decide deliberately, verify on-device):

- **A. Enable the per-chunk impostor route for Home Field properly.** Also load LOD1 for
  non-consolidated production-WebGPU scenes and confirm the runtime satisfies the
  `impostorGroupsOk` assertions so the boot gate stays green. Uses the latlon kiln
  (different look from the islands' octahedral impostors).
- **B. Extend the consolidated cull to Home Field.** Add a SceneDef opt-in flag (not a
  scene-id branch) so flat scenes can consolidate. Gives Home Field the same octahedral
  impostors as the islands and collapses the draw-call fan-out directly. Risk: the cull
  path may assume island/streaming setup; Home Field is all-cold, not streamed.

Either path needs on-device WebGPU verification (the boot gate and the look).

## Finding 2: Newsheepdogland switched off (in progress)

NSL was switched off this session (entrance "Coming soon", disabled Play, dropped from
multiplayer) pending its own regression burn-down. Scene + survival code is intact and
reachable via `?scene=newsheepdogland`. Its player-flow E2E tests are skipped until it
is back (`tests/e2e/foliage-streaming.spec.ts`, the NSL case in `tests/e2e/smoke.spec.ts`).

## Finding 3: impostor relight sun-intensity mismatch

The consolidated impostor's sun term is fed `atmosphere.sun.light.intensity` (SunSystem
DirectionalLight = 1.0), but the WebGPU LOD0 leaves are lit by the production bridge
directional at 1.1*PI (~3.46). The impostor sun is ~3.4x too weak; the shipped Rolling
Hills calibration (brightness 6) compensates. Principled cure: feed the impostor the
same sun intensity the leaves get, then the magic multiplier drops to ~1.7. Open Country
shares the Rolling Hills calibration unverified.
