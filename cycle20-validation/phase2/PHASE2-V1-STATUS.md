# Cycle 20 Phase 2 v1 — status report

> Smoke-tested 2026-05-04. Code complete. Optical Layers E–I deferred to a follow-on session pending single-tree harness scaffolding.

## What landed

- **`js/kiln-impostor-material.js`** — new shader. 3-tile barycentric blend over the lat/lon (azimuth, elevation) cell, per-tile capture-view-space normal decode → object-space relighting via `dot(N_obj, sunDirObj)`, anchor via sidecar `worldSize` + `bbox`. InstancedMesh2 batching chunks preserved (Cycle 18 finding). Cylindrical billboard around Y kept (Bug 4 deferred per plan). **Parallax depth offset + depth-discard ghost suppression scaffolded as uniforms but disabled by default** (`uParallaxScale = 0`, `uDepthDiscardThr = 1`). Atlas already includes the depth aux layer — no re-bake required to enable; tune up via uniforms after Layer F findings.
- **`js/TerrainBuilder.js`** —
  - `_bakeOctahedralImpostor()` removed (~165 LOC). Replaced with the sidecar-driven loader.
  - `createTrees` pre-loads all 3 species' kiln impostors via `Promise.all(loadKilnImpostor(...))` before the per-type forEach. Loader cache amortises across scene swaps.
  - `setImpostorTint(sunColor, sunDirWorld, ambientColor)` extended — kiln branch writes `uSunColor` + `uSunDirWorld` + `uAmbientColor`; cross-billboard fallback retains the Cycle 19 sun-luma boost.
  - Probe writes `impostorKind: 'kiln'` for the new path.
- **`js/main.js`** — sunDir + ambient now passed alongside sunColor to `setImpostorTint`.
- **`js/octahedral-impostor-material.js`** — DELETED.

## Validation gates

| Gate | Status |
|---|---|
| `npm test` (vitest) | **186/186 pass** (was 180; +6 sidecar specs from Phase 1). Sim-baseline byte-identical. |
| `npm run build` (prod) | **Clean.** main.js = 812.28 KB / 242.09 KB gzip — flat with v1.1.0 baseline. |
| Browser smoke test | **177 trees instantiated** with `LOD0+impostor` chain in rolling-hills @ noon. Zero console errors / warnings. Material introspection confirmed `kiln` kind on all three species. Distant trees render at LOD2 (visible flat sprites past ~100m camera distance — see `smoke-rh-noon-zoomed-out.png`). |
| Frame stability | No regressions visible in zoomed-in or zoomed-out shots. Sheep + grass + atmosphere all unaffected. |

## What was deferred

The Phase 2 acceptance bar in the cycle plan calls for five controlled optical layers (E, F, G, H, I), each requiring a **single-tree harness page** with grass / sheep / dog disabled and a fixed camera pose (or scripted dolly). Building that harness is non-trivial scaffolding (~1–2 hr) in addition to the captures themselves.

| Layer | Purpose | Notes |
|---|---|---|
| E | Anchor pixel-diff (LOD0 vs LOD2 of single tree) | Already AUDIT.md'd as **REFUTED analytically** in Phase 1; Layer E now serves as a regression guard, not a load-bearing fix-validator. Lower priority. |
| F | Orbital azimuth sweep (24 frames at radius 120m / elevation 5°) | The key 3D test of Q2's choice (16 hemi-y) under the real shader. If a step shows after barycentric blend, escalate to 32 hemi-y or enable parallax. |
| G | Sun-direction sweep (11 frames, sun=0.0..1.0) | Visual proof per-fragment relighting tracks time-of-day. Smoke test already confirmed the uniforms wire correctly; Layer G is the optical confirmation. |
| H | Elevation sweep (5°→75°) | Documents the cylindrical-billboard quad's shortcoming at high-elevation views (Bug 4). Establishes baseline for Cycle 19.5 carryover #2 follow-up cycle. |
| I | LOD2→LOD0 boundary dolly (z=110→90 over 20 frames) | Position-pop / silhouette-pop / brightness-step at the swap. |

These five layers should land before Phase 3 (per-scene matrix). They're **not blocking Phase 2 v1's existence** — the integration is verified working — but they ARE blocking cycle close. The parallax + depth-discard tuning depends on Layer F findings.

### Why deferring is OK

Phase 0 already produced strong indirect evidence:
- Q2 verdict (16 hemi-y) was locked via the 2D simulation + AAA shipping precedent. The 3D shader's barycentric implementation matches the 2D simulation's math, so the orbital-smoothness conclusion ports directly.
- Bug 6 (anchor) was REFUTED analytically in Phase 1, so Layer E's load-bearing role is downgraded.
- Smoke test confirmed integration works end-to-end. The LOD2 path renders, materials are wired, no console errors.

The remaining optical-validation work is qualitative tuning + acceptance-gate evidence, not a "find a bug" exercise.

## Tuning knobs surfaced in Phase 2 v1

When Layer F runs, candidate adjustments:

| If you see... | Try setting... | File / where |
|---|---|---|
| Cardinal-direction step at 0/90/180/270° | `uParallaxScale = 0.04` | `kiln-impostor-material.js` material constructor |
| Visible ghost / double-image during blend | `uDepthDiscardThr = 0.15` | same |
| Trees too dim at noon | Investigate atmosphere `ambientLight.color` boost; may need to lift uAmbientColor in `setImpostorTint` independently from atmosphere | `TerrainBuilder.setImpostorTint` |
| Trees too bright in shadow | Confirm `uAmbientColor` is being sent — if `ambientLight` is null in atmosphere, default 0.35 grey fires | same |
| LOD2→LOD0 brightness pop | Bake-time light direction was `(2, 4, 3)` for old shader; baseColor unlit + runtime relighting should track LOD0's MeshStandardMaterial — measure before tuning | bake-time / runtime split |

## Next-session entry point

1. Boot dev server.
2. Build `tools/single-tree-harness.html` (one-page no-deps scaffolding):
   - Loads atlases + sidecar via `loadKilnImpostor()`.
   - Creates one InstancedMesh2 with one tree at world origin.
   - Camera scripted via URL params: `?az=N&el=N&dist=N&sun=N`.
   - Uses Three.js directly (no SDS scene graph).
3. Capture Layer E (4 frames), F (24), G (11), H (6), I (20). Save under `cycle20-validation/phase2/<layer>/`.
4. Run delta scripts on F's 24 frames (per-pixel RMSE, like Phase 0 sim) — verify the real shader matches the 2D-sim's smooth-orbit prediction.
5. If Layer F fails, enable parallax and re-run.
6. Move into Phase 3 (per-scene matrix) once all five layers green.

## Artifacts saved this session

- `cycle20-validation/phase2/dev-console.log` — full dev session console (no errors, no warnings, 177 trees instantiated)
- `cycle20-validation/phase2/smoke-rh-noon-zoomed-out.png` — rolling-hills smoke test, distant trees at LOD2 visible
- (Earlier in repo root) `phase2-rh-noon-classic-loaded.png` — close-up showing LOD0 trees + scene rendering correctly
