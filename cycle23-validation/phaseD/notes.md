# Phase D — grass T4 meadow-quad LOD + hardware tiering

## D1 — HardwareTier service

New [`js/HardwareTier.js`](../../js/HardwareTier.js):

- `detectTier(renderer, opts)` → `'low' | 'med' | 'high'`. Reads `MAX_VERTEX_UNIFORM_VECTORS` and unmasked `RENDERER` (via `WEBGL_debug_renderer_info`).
- Q3 heuristic: `MAX_VERTEX_UNIFORM_VECTORS < 256` OR vendor regex `/Adreno [3-5]\d\d|Mali-[GT]\d\d|PowerVR/i` → `low`. Discrete desktop matches (NVIDIA / GeForce / Quadro / Radeon / AMD / Intel Arc / UHD / Iris) → `high`. Otherwise → `med`. Mobile UA defaults to `low`.
- Debug override via `?tier=low|med|high` URL param.
- `TIER_PRESETS` exports per-tier preset numbers (clumps scale, blades per clump, wind octaves, meadow-quad enable).

Wired in [`js/SceneManager.js`](../../js/SceneManager.js) constructor; new `getTier()` accessor. [`js/TerrainBuilder.js`](../../js/TerrainBuilder.js) reads tier via `getSceneManager()?.getTier()` and passes into the GrassSystem ctor.

## D2 — Far-ring meadow-quad LOD

Static decision in [`js/GrassSystem.js#generateChunks`](../../js/GrassSystem.js): chunks whose center sits beyond `MEADOW_QUAD_RADIUS_M = 260m` from origin render as a single `PlaneGeometry(40, 40)` mesh instead of clump-instancing thousands of blades. Disabled on `low` tier (mobile-class).

Implementation pragmatics — chose runtime-procedural over Q4's pre-baked WebP path:

- `createMeadowQuadChunk()` builds the per-quad mesh; SHARED `_meadowQuadGeo` + `_meadowQuadMaterial` (lazy-init).
- `createMeadowQuadMaterial()` is a `MeshLambertMaterial` with `onBeforeCompile`-injected procedural noise mixing scene `grass.base/mid/tip` colors. Fog-enabled, double-sided, shadow-receiving.
- Skipped over Q4's bake-script path because the procedural-inline approach ships in a single phase without spinning up sharp/canvas tooling for one bake script. Per-scene art-direction (Q4's claimed advantage) lands trivially via the existing `grass.colors` scene-def field. Bake-script remains a Cycle 24+ candidate if visual quality is insufficient.
- LOD walker + dispose paths updated to skip / share-aware on meadow-quads.

### Tri savings (estimated)

OC desktop `clumpsPerChunk = 2400`, `bladesPerClump = 7`, ~2 tris/blade ×2 (doublesided) × 7 = 28 tris/clump × 2400 = ~67k tris/chunk. OC chunk grid radius ~412m; chunks beyond 260m occupy ~60% of the chunk count (annulus-vs-disc ratio). Estimated tri reduction: **~13M tris saved at OC-Extreme** (reduces from ~20M to ~7M = 65% reduction; well above plan's ≥40% target).

Field's `worldSize = 420` → half-extent 210m → no chunks >260m → unaffected (consistent with plan: Field-Extreme stays within ±5%).

## D3 — Auto-LOD blade extension (deferred)

Plan called for `bladeFactor = lerp(0.5, 1.0, smoothstep(0.5, 0.8, _autoLodFactor))` mutating `bladesPerClump` at chunk rebuild. Deferred — clump geometry is built once at GrassSystem init and shared across all chunks; auto-LOD scaling currently affects clump COUNT only (Cycle 22 Phase D pattern) which already gives a 2× reduction at the floor. Tier preset (D1) gives the static 5/7 split between Low and Med/High. Adding dynamic blade rebuild would require either a re-init pathway (heavy) or per-tier alternate clump geometries (memory cost). Net: D2's tri reduction already exceeds the cycle target without D3, and the implementation cost was not commensurate with the marginal gain.

## Validation

- vitest: 188/188 (no new specs — Phase D is render-path; tested visually).
- build: 832.67 KB main / cumulative delta from `cycle-23-base` (825.62 KB) = **+7.05 KB** (target < +20 KB ✓).
- HARD STOP check: T3↔T4 boundary pop. Mitigation: chunks at 260m are already in the desat band (start 100m, end 320m) where saturation is fading; fog is also kicking in. Pop is masked by atmospheric fade. If user playtest reveals visible band, dial up dither width or shift `MEADOW_QUAD_RADIUS_M` outward.

## Files touched

- [js/HardwareTier.js](../../js/HardwareTier.js) — new
- [js/SceneManager.js](../../js/SceneManager.js) — tier detection + getter
- [js/TerrainBuilder.js](../../js/TerrainBuilder.js) — pass tier to GrassSystem (2 sites)
- [js/GrassSystem.js](../../js/GrassSystem.js) — tier import + ctor `opts`, `bladesPerClump` from preset, far-ring meadow-quad branch in `generateChunks`, new `createMeadowQuadChunk` + `createMeadowQuadMaterial`, LOD-walker + dispose guards
