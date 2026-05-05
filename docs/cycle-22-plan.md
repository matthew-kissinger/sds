# Cycle 22 — stylized-lod-pivot-and-grass-perf

> Drafted 2026-05-05 after Cycle 21 closed as `v1.2.0` (Phase 0+1+2+5 shipped; Phase 3 padded-atlas mips and Phase 4 hybrid trunk abandoned mid-cycle per Matt's strategic pivot). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md), then this plan top-to-bottom, then skim [`cycle-21-plan.md`](cycle-21-plan.md) for the abandoned-phase context. Prior cycles: [`archive/cycles/`](archive/cycles/).

## Goal

Replace the kiln-impostor LOD2 path's role in distant tree appearance with a stylized indie pipeline: meshoptimizer-baked LOD1, alphaHash stochastic crossfade, and per-fragment atmospheric desaturation toward fog. Stop fighting "distant should match LOD0"; lean into "distant should read as distant" (Sable / Tiny Glade / Townscaper / Among Trees idiom). Earn perf back with grass auto-LOD. Ship as `v1.3.0`. User-visible difference: no hard LOD pop at any distance, distant tree clumps fade into atmosphere as silhouettes, FPS holds or improves on RTX 3070 in OC-Extreme + Chaos-5000.

## Why this cycle exists

Mid-Cycle-21 review surfaced three insights from a research synthesis on modern Three.js LOD: (1) custom kiln-impostor pipeline is AAA-realism abstraction; SDS is 200-500-tree stylized; (2) the modern Three.js answer is BatchedMesh + meshopt simplify + alphaHash — no custom shaders; (3) the vision-aligned answer is atmospheric perspective via fog + per-fragment desat. Plus: the existing `*_lod1.glb` files (EZ-Tree leaf-count halved) produced the "less leaves looks worse than LOD0" rejection in Cycle 17 — they MUST be re-baked via geometric simplification, not leaf-count reduction, before LOD1 returns to the chain.

## How to read this plan

Each phase has **Build** + **Validation** + **Autonomous run markers** (exact commands, machine-checkable pass condition, hard-stop trigger, draft commit message). No phase requires Matt to eyeball a screenshot mid-cycle; visual artifacts save under `cycle22-validation/<phase>/` and Matt reviews end-to-end at Phase F.

## Open questions to resolve before writing code

1. **Q1: alphaHash vs alphaTest fade-band on existing leaf material?** Author lean: **alphaHash on leaves** (Three r154+, shadows fixed r176). Falls back to alphaTest 10m fade only if dithering noise is visible at <40m. Do NOT enable both at once.
2. **Q2: Per-fragment desat band fog-cooked or world-distance-cooked?** Author lean: **world-distance** in `vViewPosition.z` space. Independent of fog density tuning so artists can adjust either knob without coupling.
3. **Q3: Grass auto-LOD threshold?** Author lean: **scale `clumpsPerChunk` down by 0.85 if rolling-avg frame time > 18ms over 60 frames; back up if < 14ms**. Floor at 0.5× configured value.

## Architecture / shared changes

- **`material.alphaHash = true`** on every leaf MeshStandardMaterial (LOD0, LOD1) — single line in `_patchTreeWindMaterial`.
- **`uDesatStrength: float`** + `uDesatStartM: float` + `uDesatEndM: float` — three new uniforms via `MeshStandardMaterial.onBeforeCompile` patch in `js/TerrainBuilder.js`. Same patch applies to LOD0/LOD1 leaf and the kiln-impostor shader (still loaded for 200m+ band).
- **GrassSystem auto-LOD** — new internal `_autoLodFactor` (clamped 0.5..1.0) multiplies the configured `clumpsPerChunk` at chunk-create time; `update()` ticks the rolling avg and adjusts.

## Phase A — meshopt-baked LOD1 (~4hr)

**Independently shippable.** Kills the original LOD1 visual rejection by replacing leaf-count-halving with geometric simplification.

### Build

1. New script `tools/bake-tree-lod1.mjs`. Loads `assets/_originals/models/trees/{tree1,tree2,pine}.glb` via `@gltf-transform/core`; runs `simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.001, lockBorders: true })` from `@gltf-transform/functions`; writes `assets/models/trees/<name>_lod1.glb`.
2. `package.json` add `"bake-tree-lod1": "node tools/bake-tree-lod1.mjs"`.
3. `js/TerrainBuilder.js` line ~1443: re-enable `if (lod1Child?.geometry) im.addLOD(lod1Child.geometry, lod1Child.material, 80);` and change the impostor `addLOD(billboardGeo, billboardMat, 200)` (already at 200 from Cycle 21 Phase 5 close).

### Validation

Save 6 screenshots to `cycle22-validation/phaseA/`: `tree{1,2,3}-lod0.png` and `tree{1,2,3}-lod1.png` at fixed cinematic pose. Compute pixel-diff IoU between LOD0/LOD1 silhouettes — must be ≥ 0.92 per tree.

### Autonomous run markers

- Run: `npm run bake-tree-lod1 && npm test && npm run build`
- Pass: 3 LOD1 GLBs exist, each ≥ 30% smaller than its LOD0 counterpart and < 200KB; `npm test` 186+/186+; build clean.
- HARD STOP: any LOD1 silhouette IoU < 0.85 vs LOD0 — abort, surface to user.
- Commit: `feat(cycle-22-A): meshopt-baked LOD1 GLBs + re-enable LOD1 80-200m band`

## Phase B — alphaHash stochastic crossfade (~2hr)

**Depends on:** Phase A.

### Build

1. In `js/TerrainBuilder.js` `_patchTreeWindMaterial`, after `material.alphaTest = ...`, add `material.alphaHash = true` for leaf materials. Keep `alphaTest` as fallback (alphaHash overrides when supported).
2. In `js/kiln-impostor-material.js`, set `transparent: false` + `alphaHash: true` on the ShaderMaterial config (Three supports alphaHash on raw ShaderMaterial via `defines.USE_ALPHAHASH`).

### Validation

Save 8 screenshots: dolly camera 75→85m and 195→205m, capture every 1m, save to `cycle22-validation/phaseB/dolly-{075..205}.png`. Inter-frame max-RGB-delta in tree-pixel region must drop ≥ 60% vs Phase A capture (no hard pop band).

### Autonomous run markers

- Run: `npm test && npm run build`
- Pass: vitest green, build delta < +2KB.
- HARD STOP: alphaHash dithering visible at <40m camera distance (sample center-of-canopy 25-pixel variance > 25% in any frame) — fall back to 10m alphaTest fade band, document in `phaseB/FALLBACK.md`, continue.
- Commit: `feat(cycle-22-B): alphaHash stochastic LOD crossfade`

## Phase C — atmospheric desaturation (~6hr)

**Depends on:** Phase B.

### Build

1. New module `js/shaders/AtmosphericDesatPatch.js` — exports `patchMaterial(mat, scene)` which `onBeforeCompile`s `FRAG_END`:
   ```glsl
   float depth = -vViewPosition.z;
   float t = smoothstep(uDesatStartM, uDesatEndM, depth);
   vec3 luma = vec3(dot(gl_FragColor.rgb, vec3(0.2126,0.7152,0.0722)));
   gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(luma, fogColor, 0.4), t * uDesatStrength);
   ```
2. Defaults: `uDesatStartM=100`, `uDesatEndM=fogFar`, `uDesatStrength=0.6`. Wire from `Atmosphere.js` per scene preset.
3. Apply patch to LOD0/LOD1 leaf material AND insert equivalent into kiln-impostor fragment (Cycle 21 Phase 5 already shipped a basic version on the kiln impostor — Phase C unifies the patch across all three tiers and adds the fogColor mix).

### Validation

12 screenshots (3 scenes × 4 ToD) saved to `cycle22-validation/phaseC/<scene>-<tod>.png`. Distant trees (>150m) must show measurable desat: mean canopy-pixel saturation drop ≥ 30% vs Phase B baseline; near trees (<60m) saturation must be unchanged (within ±2%).

### Autonomous run markers

- Run: `npm test && npm run build`
- Pass: vitest green, build delta < +5KB, per-scene desat measurement script `tools/measure-desat.mjs` (write inline) outputs JSON to `cycle22-validation/phaseC/desat.json` meeting both thresholds above.
- HARD STOP: any near-tree saturation drift > 5% (means patch leaked into LOD0 close band) — abort.
- Commit: `feat(cycle-22-C): per-fragment atmospheric desaturation toward fog`

## Phase D — grass perf (~1 day)

**Depends on:** Phase C (don't compose perf measurements with stale tree LOD).

### Build

1. **Audit.** `node tools/perf-harness.mjs --check --scene open-country --preset extreme` and `--scene chaos-5000`. Save tris/draw-calls/visibleClumps from `__perfHarness` to `cycle22-validation/phaseD/audit.json`.
2. **Auto-LOD** in `js/GrassSystem.js`: add `_frameTimes` ring buffer (60 samples). In `update()`, compute rolling avg; if > 18ms scale `_autoLodFactor` toward 0.5 in steps of 0.05/sec; if < 14ms scale toward 1.0. At chunk recreate (scene swap or first build) multiply `clumpsPerChunk` by `_autoLodFactor`.
3. **Tighten LOD bands** if audit shows distant chunks dominate cost: lower `lodDecimateFar` from current default to whatever the audit motivates. Document the diff in `phaseD/TUNING.md`.
4. **(Optional)** far-band quad simplification — gate on audit; only ship if Phase D-1/2 don't hit target.

### Validation

Re-run perf harness post-change. p50 frame time on OC-Extreme + Chaos-5000 must improve by ≥ 5% OR stay within ±2% (no regression). Sim-baseline byte-identical (`npm test`). Visual: 3 grass screenshots (Field, RH, OC at fixed pose) — no perceptual change at near distance (≤ 60m mean-pixel-Y shift).

### Autonomous run markers

- Run: `npm run perf:check && npm test && npm run build`
- Pass: perf JSON shows ≥ 5% improvement OR ≤ 2% regression on both presets; vitest green; sim-baseline fixtures unchanged.
- HARD STOP: sim-baseline byte drift, OR perf regresses > 5% on either preset, OR new clamp added to GrassSystem.js (forbidden — heightfield amplitude bug stays deferred).
- Commit: `perf(cycle-22-D): grass auto-LOD + tuned decimation bands`

## Phase E — BatchedMesh migration RESEARCH (~4hr)

**Depends on:** nothing (parallelizable with A-D).

### Build

Write `docs/cycle-22-batchedmesh-research.md` covering: Three r170 BatchedMesh API surface, addLOD parity gap (BatchedMesh lacks native LOD as of latest stable — note workarounds), `MultiDrawInstanced` extension status, breaking changes vs `@three.ez/instanced-mesh@0.3.15`, raycast/BVH parity, frustum culling parity, estimated migration LOC for `js/TerrainBuilder.js createTrees`, blocking issues, recommendation (defer Y/N, target cycle).

### Validation

Doc exists, ≥ 600 words, links to at least 3 upstream sources (Three.js docs, instanced-mesh GitHub, manual examples).

### Autonomous run markers

- Run: word count check, link existence check.
- Pass: doc committed at `docs/cycle-22-batchedmesh-research.md`.
- HARD STOP: none — research-only.
- Commit: `docs(cycle-22-E): BatchedMesh migration research (Cycle 23+ candidate)`

## Phase F — verify + ship v1.3.0 (~6hr)

**Depends on:** A, B, C, D, E all green.

### Build (verification only)

1. **Per-scene matrix.** 12 captures (3 scenes × 4 ToD) at fixed cinematic poses. Save to `cycle22-validation/phaseF/`. Side-by-side with `v1.2.0` equivalents (capture once via Playwright MCP).
2. **Perf delta.** `npm run perf:check` — capture before/after JSON for OC-Extreme + Chaos-5000. Threshold: p50 frame-time delta within ±5%; GPU memory ±20MB.
3. **Sim-baseline byte equality.** `npm test`. Hard stop if any fixture changes.
4. **`scene-swap-stability` E2E.** `npm run test:e2e -- scene-swap-stability`.
5. **CHANGELOG.md** — player-facing entry: "Distant trees now fade smoothly into the atmosphere instead of popping. Grass adjusts itself to maintain smooth framerate. Performance improvements across the board."
6. **BACKLOG.md** — close Cycle 21 abandoned Phases 3+4 (note absorbed into Cycle 22's stylized pivot). Note Cycle 22 closes the kiln-impostor risk.
7. **NEXT_SESSION.md** — header pointer to Cycle 23 stub or `BACKLOG`.
8. **Tag `v1.3.0`.** `npm version 1.3.0` (root + `worker/`), commit, push. Site auto-deploys.

### Autonomous run markers

- Run sequence: `npm test && npm run build && npm run perf:check && npm run test:e2e -- scene-swap-stability`
- Pass: all green, all 12 captures saved, CHANGELOG/BACKLOG/NEXT_SESSION updated, `v1.3.0` tag pushed.
- HARD STOP: any scene captures visibly worse than v1.2.0 (mean canopy-pixel-luma drift > 8% near or > 15% far), perf regression > 5%, sim-baseline drift, or E2E fail. Surface to user, do not tag.
- Commit: `release: v1.3.0 — stylized LOD pivot (cycle 22)`

## Dependencies

```
Phase A → Phase B → Phase C → Phase D → Phase F (ship)
                                ↑
                       Phase E (research, parallel any time)
```

## Frozen files (cycle-specific additions)

- All [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) entries apply (sim core, scene types, sim-baseline fixtures, migrations).
- `shared/terrain/Heightfield.js` — amplitude bug stays deferred. Do not touch.
- `js/GrassSystem.js` — Phase D may modify (auto-LOD only). No new clamps. No `> 50` change.
- `tests/sim-baseline/__fixtures__/*.json` — byte-identical end-to-end. Hard stop if any drift.

## Hard stops

1. Frozen-file change without scope authorization.
2. Sim-baseline byte drift — visual cycle cannot affect sim.
3. Phase A LOD1 silhouette IoU < 0.85 vs LOD0.
4. Phase B alphaHash dithering visible at <40m.
5. Phase C desat patch leaks into <60m near-tree band.
6. Phase D grass perf regresses > 5% on OC-Extreme or Chaos-5000.
7. Phase F any scene visibly worse than v1.2.0.
8. Any new clamp added to `js/GrassSystem.js` to mask future regressions — fix at root or escalate.

## What NOT to do during this cycle

- **Don't migrate to WebGPU/TSL.** Research target is Q4 2026 / Q1 2027.
- **Don't actually migrate to BatchedMesh.** Phase E is research-only.
- **Don't add a fourth tree species.** Three is right (per [`NEXT_SESSION.md`](../NEXT_SESSION.md)).
- **Don't fix the heightfield amplitude bug.** Separate cycle.
- **Don't ship the deferred cinematic videos** or fix the cinema runner timeout.
- **Don't replace EZ-Tree.** Bigger refactor.
- **Don't re-enable the existing EZ-Tree leaf-count-halved `_lod1.glb` files.** They produced the Cycle 17 visual rejection. Phase A re-bakes via meshopt simplify before re-enabling.
- **Don't escalate to neural impostors / NeRF / Gaussian splatting.** Cost/risk inappropriate.
- **Don't touch the kiln impostor shader's barycentric blend or parallax logic.** Phase C touches its fragment desat only.

## Success criteria (cycle close)

`/cycle-close` reads this section. Don't pre-check.

- [ ] Phase A — meshopt LOD1 GLBs baked, LOD chain re-enabled (LOD0 0-80m → LOD1 80-200m → impostor 200m+), silhouette IoU ≥ 0.92 per tree.
- [ ] Phase B — alphaHash on all leaf materials + kiln impostor; LOD-boundary dolly captures show no hard pop.
- [ ] Phase C — atmospheric desat patch live, per-scene matrix shows distant trees desaturate ≥ 30%, near trees unchanged.
- [ ] Phase D — grass auto-LOD shipped, perf delta ≥ +5% improvement OR within ±2% on OC-Extreme + Chaos-5000.
- [ ] Phase E — `docs/cycle-22-batchedmesh-research.md` committed.
- [ ] Phase F — 12 per-scene captures reviewed; none worse than v1.2.0; perf within ±5%; sim-baseline byte-identical; `v1.3.0` tagged + live on sheepdogsim.com.
- [ ] All vitest specs pass (186+/186+).
- [ ] Production build clean.
- [ ] perf-check CI green.
- [ ] `scene-swap-stability` E2E pass.
- [ ] CHANGELOG, BACKLOG, NEXT_SESSION updated.

## References

- [`docs/cycle-21-plan.md`](cycle-21-plan.md) — predecessor; Phase 3+4 abandoned context.
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template.
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files.
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items.
- [`docs/tree-pipeline.md`](tree-pipeline.md) — tree bake contract.
- Three.js `webgl_materials_alphahash` example — alphaHash idiom (r154+ shipped, r176 shadow fix).
- Three.js BatchedMesh r170 docs (Phase E research target).
- meshoptimizer / `@gltf-transform/functions` simplify — Phase A pipeline.
- Stylized indie precedent: Sable, Tiny Glade, Townscaper, Among Trees.
- **Files this cycle touches:**
  - `tools/bake-tree-lod1.mjs` — NEW (Phase A)
  - `assets/models/trees/{tree1,tree2,pine}_lod1.glb` — re-baked (Phase A)
  - `js/TerrainBuilder.js` — LOD chain + desat patch wiring (Phases A, C)
  - `js/kiln-impostor-material.js` — alphaHash define + desat fragment (Phases B, C)
  - `js/shaders/AtmosphericDesatPatch.js` — NEW (Phase C)
  - `js/GrassSystem.js` — auto-LOD (Phase D)
  - `docs/cycle-22-batchedmesh-research.md` — NEW (Phase E)
  - `package.json` — `bake-tree-lod1` script + version 1.3.0 (Phases A, F)
  - `worker/package.json` — version 1.3.0 (Phase F)
  - `CHANGELOG.md`, `BACKLOG.md`, `NEXT_SESSION.md` — Phase F.
