# Cycle 40 - Sun Coherence + Octahedral Tree Lab

> Drafted from Matt's 2026-05-22 implementation request. Cycle 40 depends on Cycle 39 Phase E's final 12-PNG gameplay matrix and keeps device proof, production tree defaulting, and broader tree-art variety out of scope.

## Summary

Finish the visual follow-through from Cycle 39 and start the Pixel Forge v2 tree-impostor path as a PC lab only. The player-visible target is that the water glint, cloud highlights, and sun disc read from the same atmosphere-provided sun color. The tree target is a gated SDS route for Pixel Forge v2 octahedral sidecars without changing production defaults.

## Scope rules

- No `shared/` changes.
- No Worker, D1, migration, sim-baseline, or production-default changes.
- No Android or iOS device proof in this cycle.
- Existing v1 `latlon` / `hemi-y` tree sidecars remain the production contract.
- `?renderer=webgpu&konveyorNativeTreeImpostors=octahedral` is lab-only.

## Key changes

- Extend water runtime update shape from `update(timeSec, sunDirection)` to `update(timeSec, sunDirection, sunColor)`.
- Add and route `uSunColor` for WebGL water.
- Add a live `sunColor` node uniform for WebGPU water controls.
- Keep cloud `sunColor` plumbing, but source rim/highlight color from the atmosphere frame rather than independent amber literals.
- Tune the sun billboard core so the visible disc reads as an actual sun, not just a brighter sky patch.
- Add Pixel Forge v2 assets beside existing assets:
  - `assets/models/trees/octahedral/tree1.imposter.*`
  - `assets/models/trees/octahedral/tree2.imposter.*`
- Add lab routing:
  - `?renderer=webgpu&konveyorNativeTreeImpostors=octahedral` loads the v2 sidecars.
  - `?konveyorNativeTreeImpostors=1` keeps current v1 behavior.
- Branch tree-impostor runtime selection by sidecar layout:
  - v1 `latlon` / `hemi-y` uses the existing selector.
  - v2 `octahedral` uses octahedral tile selection.

## Phases

### Phase 0 - Cycle 39 Phase E precondition

Closed before Cycle 40 implementation. Final gameplay baseline captured locally at `cycle39-validation/screenshots/phase5-painterly-final/` with 12 PNGs across `{field, rolling-hills, open-country} x {sun=0.20, 0.35, 0.50, 0.75}`. Runtime JSONs live at `cycle39-validation/runtime/phase5-painterly-final-sun-*.json`.

### Phase 1 - Sun packet plumbing

**Status: complete.**

Water now receives atmosphere `sunColor` per frame. WebGL and WebGPU water material adapters expose the same sun-color packet shape, and runtime probe metadata reports that water color is sourced from `skyFog.sunColor`.

### Phase 2 - Water and cloud visual coherence

**Status: complete.**

Water glint and cloud highlight/rim color now use the atmosphere frame sun color. The WebGPU desktop matrix was captured locally for `{rolling-hills, open-country} x {sun=0.20, 0.35, 0.75}` at shoreline and horizon poses. Proof paths:

- `cycle40-validation/runtime/sun-water-cloud-matrix-sun-0.20.json`
- `cycle40-validation/runtime/sun-water-cloud-matrix-sun-0.35.json`
- `cycle40-validation/runtime/sun-water-cloud-matrix-sun-0.75.json`
- `cycle40-validation/screenshots/sun-water-cloud-matrix/`

### Phase 3 - Pixel Forge v2 sidecar staging

**Status: complete.**

Pixel Forge CLI built successfully, then SDS `tree1.glb` and `tree2.glb` were baked with:

```bash
kiln bake-imposter --layout octahedral --grid 8x8 --tile-size 256 --aux-layers normal,depth --bg transparent --color-layer baseColor --edge-bleed 2 --deterministic
```

Both sidecars validated with Pixel Forge `kiln validate-imposter`. The v2 sidecar contract is additive; the v1 sidecar spec remains unchanged.

### Phase 4 - Octahedral runtime lab route

**Status: complete.**

`konveyorNativeTreeImpostors=octahedral` now loads the v2 base path and reports layout/version in tree runtime summaries. `TreeImpostorRuntime` selects tiles by layout, preserving the v1 path while routing v2 through octahedral selection. The route remains explicitly lab-gated.

### Phase 5 - PC proof and closeout

**Status: complete locally; deploy verification happens after the close commit lands.**

Local proof paths:

- `cycle40-validation/runtime/octahedral-tree-lab-proof.json`
- `cycle40-validation/screenshots/octahedral-tree-lab/`

The proof confirms nonblank renders, zero fatal console errors, v2 sidecars active, tile selections varying across camera poses, and no production default switch.

## Test plan

Focused specs covered:

- Water material adapter.
- Atmosphere/cloud adapter.
- Impostor material adapter.
- Tree impostor runtime.
- v1 sidecar contract.
- v2 sidecar contract.

Full gates passed:

- `npm run build` - clean; main bundle stayed within the existing `mainKB=592` ratchet after GLSL comment trimming.
- `npm test` - 54 passed files, 1 skipped; 498 passed specs, 7 skipped.
- `npm run lint` - clean.

Capture gates passed locally:

- Desktop WebGPU sun/water/cloud matrix.
- Desktop WebGPU octahedral tree lab matrix.

## Acceptance

- [x] Cycle 39 Phase E gameplay baseline exists locally before Cycle 40 visual comparison.
- [x] Water runtime receives `sunColor` from the atmosphere frame.
- [x] WebGL water has a `uSunColor` route.
- [x] WebGPU water has a live `sunColor` node uniform route.
- [x] Runtime probes can prove water glint uses `skyFog.sunColor`.
- [x] Cloud rim/highlight chroma no longer depends on separate amber literals.
- [x] The visible sun disc reads as a sun disc in the gameplay matrix.
- [x] Pixel Forge v2 octahedral sidecars are staged beside the existing assets.
- [x] v1 `latlon` / `hemi-y` sidecar spec remains unchanged.
- [x] `konveyorNativeTreeImpostors=octahedral` selects the v2 sidecars only in the lab route.
- [x] `konveyorNativeTreeImpostors=1` keeps current v1 behavior.
- [x] Runtime summaries report sidecar layout/version.
- [x] Octahedral tile selections vary across camera poses.
- [x] No production tree default changed.
- [x] `npm test`, `npm run lint`, and `npm run build` pass locally.

## Deferred

- Android proof.
- BrowserStack iOS proof.
- Renderer telemetry gate.
- Production default switch to octahedral tree impostors.
- Broader tree art/species variety.
- Open Country paired two-client playtest.
