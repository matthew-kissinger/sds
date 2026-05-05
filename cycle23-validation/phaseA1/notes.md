# Phase A1 — atmospheric polish

## Changes

1. **CameraController.getPitchDeg()** — new method reading `matrixWorld.elements[9]` (col2.y → forward.y); returns `asin` deg. 0 = horizon, +90 = looking down.
2. **TerrainBuilder._desat pitch-aware strength** — each frame in `updateGrassAnimation`, recompute `uDesatStrength = configured * lerp(1.0, _desatHighPitchFloor, smoothstep(25, 50, |pitch|))`. Configured 0.6, floor 0.2.
3. **Atmosphere prime fog color** — constructor calls `applyFogColor()` after `applyPreset` so first frame paints horizon-tinted fog (not 0xcccccc grey).
4. **Atmosphere scene-level fog override** — new `options.sceneFog` swaps the FogExp2 default for `THREE.Fog(color, near, far)` linear when the scene def supplies one.
5. **Field/RH/OC fog defs** — Field already had `{ color: '#cfd9e8', near: 220, far: 700 }` (was dead code, now wired). Added RH `{ color: '#d4c4a8', near: 200, far: 650 }` (warm dusk-tinted) and OC `{ color: '#b8c8d8', near: 220, far: 800 }` (cooler open horizon).
6. **Kiln impostor pitch-tilt** — billboard interpolates from `worldUp` (cylindrical, low pitch) to `cross(viewDir, billRight)` (spherical, high pitch) via `smoothstep(0.2, 0.7, |dirObj.y|)`. Closes Cycle 19.5 carryover #2(b).

## Validation

- vitest: 179/179 pass (+ 7 skipped) — sim-baseline byte-identical
- build: 826.89 KB / 247.43 KB gzip — delta +1.27 KB (target < +5 KB ✓)
- Hard-stop check: no Follow-cam regression risk — pitch-aware desat returns full strength for pitch < 25°, which is below Follow's typical pitch (~26°). At Follow's normal angle, behavior matches v1.3.0 within 1% of the smoothstep band.

## Files touched

- [js/CameraController.js](../../js/CameraController.js) — getPitchDeg
- [js/TerrainBuilder.js](../../js/TerrainBuilder.js) — _desatConfiguredStrength + per-frame pitch update
- [js/atmosphere/Atmosphere.js](../../js/atmosphere/Atmosphere.js) — sceneFog option + applyFogColor priming
- [js/main.js](../../js/main.js) — pass sceneDef.fog to Atmosphere ctor (init + scene-swap)
- [js/kiln-impostor-material.js](../../js/kiln-impostor-material.js) — pitch-aware billUp blend
- [shared/scenes/rolling-hills.js](../../shared/scenes/rolling-hills.js) — fog def
- [shared/scenes/open-country.js](../../shared/scenes/open-country.js) — fog def
