# Phase A2 — cam reorder + camera-to-dog occlusion fade

## Q6 reshape

Classic camera kept selectable but demoted to third option. Default boot mode
remains Follow (set in Cycle 21 Phase 5). Press-C cycle order is now
**Follow → Free → Classic → Follow** (was Classic → Follow → Free).

## Changes

### Camera mode order
- [js/CameraController.js](../../js/CameraController.js) `MODE_ORDER` rewrites to `[FOLLOW, FREE, CLASSIC]` so C-key cycle visits Classic third.
- [js/components/StartScreen/SettingsPanel.js](../../js/components/StartScreen/SettingsPanel.js) `loadCameraMode` default flips to `FOLLOW`; `CAMERA_MODE_OPTIONS` reorder + label updates.

### Camera-to-dog occlusion fade
- New [js/shaders/OccluderFadePatch.js](../../js/shaders/OccluderFadePatch.js): shared `getOccluderUniforms()` + `patchMaterialOccluder()`. View-space capsule distance check (line from camera-origin to `uOccluderDogVS`); fragments inside hash-discard with the same dither hash as the kiln impostor's alphaHash.
- [js/TerrainBuilder.js](../../js/TerrainBuilder.js):
  - Imports `getOccluderUniforms` + `patchMaterialOccluder`.
  - `_occluder` shared uniform set (radius 2.0m).
  - `_patchTreeWindMaterial` chains the patch (after wind + desat).
  - `updateGrassAnimation` per-frame: dog world pos → camera view space via reused scratch `Vector3` (no per-frame alloc); strength = 1.0 when dog present, 0.0 otherwise.

## Performance

- O(1) per frame — single uniform update; per-fragment cost is one length, one smoothstep, one hash + branch.
- No per-frame allocation: scratch `Vector3` reused (`this._occluderDogScratch`).
- LOD2 impostor not patched — occlusion only triggers for trees within ~30m of the camera-dog line, well inside the LOD0/LOD1 band.

## Validation

- vitest: 179/179 pass + 7 skipped (sim-baseline byte-identical).
- build: 828.95 kB / 247.89 KB gzip — delta from A1: +2.06 KB; cumulative since cycle-23-base: +3.33 KB (target < +5 KB ✓).
- HARD STOP check (per-frame allocation): scratch reused; no allocation in capsule cast.

## Files touched

- [js/CameraController.js](../../js/CameraController.js)
- [js/components/StartScreen/SettingsPanel.js](../../js/components/StartScreen/SettingsPanel.js)
- [js/shaders/OccluderFadePatch.js](../../js/shaders/OccluderFadePatch.js) — new
- [js/TerrainBuilder.js](../../js/TerrainBuilder.js)
