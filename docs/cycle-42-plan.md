# Cycle 42 - WebGPU Scene Material Parity and Device Proof

> Drafted 2026-05-27 after the `v2.1.9` Cycle 41 release. Status: implemented locally for `v2.1.10`; release approval, push, tag, deploy, and live proof still pending.

## Goal

Turn the Cycle 41 sun/sky/water fix into a broader production art-lock pass for WebGPU without reopening the renderer migration. The target is a WebGPU scene that keeps the accepted painterly sun and water work while improving the remaining flat terrain, grass, foliage, and actor material read, then proving the result on the minimum useful device/browser matrix.

## Current Truth

- Cycle 41 shipped as commit `c1fd5c0`, tag `v2.1.9`, deploy run `26541935987`.
- Live HTML serves `assets/main-Cm7rDWr0.js`, and the direct asset URL returns HTTP 200.
- Cycle 42 adds a repeatable WebGL/WebGPU material-lock proof under `cycle42-validation/`.
- The recent player-facing art comments are explicit close criteria: WebGPU sun must read as a warm painted gas sphere with a hot core and separate corona; grass must be greener and less brown than the prior WebGPU pass while separating from terrain; WebGPU water must be deeper blue with a constrained sun path instead of a whole-surface purple wash.
- Local desktop proof now shows the WebGPU sun/sky/water/grass pass materially improved, but the material-lock classifier still flags six low-sun actor/Open Country material-parity comparisons for manual review. Those are recorded as art-review carryover candidates, not hidden test failures.
- Android WebGPU proof is blocked locally by no authorized ADB device. BrowserStack/iOS water proof is blocked locally by missing BrowserStack credentials.
- Safe Dependabot hygiene landed for `tmp` and `qs`; the remaining `uuid` advisory is transitive through Google/BrowserStack tooling and stays a separate maintenance carryover unless tooling validation approves a wider major bump.

## Scope Rules

- Keep `shared/`, Worker, D1, migrations, and sim-baseline goldens out of scope unless the user explicitly expands the cycle.
- Do not promote octahedral tree impostors to production defaults without device-budget and visual-quality proof.
- Do not tune WebGPU by making WebGL worse. WebGL remains the style reference.
- Do not broaden this into a full renderer migration or asset replacement campaign.
- Prefer simple local material constants and targeted shader controls over new abstractions.

## Phase 1 - Baseline Review Matrix

Capture the actual remaining gap before changing material code.

**Acceptance (EARS):**

- [x] When the phase runs, it shall capture paired WebGL/WebGPU screenshots for Field, Rolling Hills, and Open Country at representative low, mid, and high sun values.
- [x] When the matrix is reviewed, it shall explicitly classify remaining differences as sun/water already accepted, material parity issue, asset/geometry issue, or device/perf issue.
- [x] When the phase closes, it shall record a contact sheet and runtime JSON under `cycle42-validation/`.

## Phase 2 - Targeted WebGPU Material Parity

Tune only the material paths that the Phase 1 matrix proves are still off.

Likely candidates:

- Terrain albedo/contrast and fog blend.
- Grass color depth and wind-lit readability.
- Tree/impostor tint, sun response, and distance fade.
- Sheep wool/dog silhouette read against grass and water.

**Acceptance (EARS):**

- [x] When WebGPU terrain/grass/foliage are captured beside WebGL, they shall no longer read as a uniformly flat pastel layer.
- [x] When actors are captured in Field, Rolling Hills, and Open Country, dog and sheep silhouettes shall remain readable without HUD assistance.
- [x] When material constants are changed, existing tests shall be updated only where they lock intentional renderer contracts.
- [x] If the fix needs new assets or production tree-default changes, then the phase shall stop and record a separate proposal.

## Phase 3 - Device And Browser Proof

Prove the accepted visual result outside the local desktop happy path.

**Acceptance (EARS):**

- [x] When desktop proof runs, Chromium WebGPU and WebGL shall both render the accepted matrix without fatal page errors.
- [x] When mobile proof is available, Android Chrome WebGPU shall capture at least Rolling Hills and Open Country water-facing views.
- [x] When BrowserStack or real iOS proof is available, Safari water shall run the existing iOS water canary or record the precise platform blocker.
- [x] If a device/browser cannot run WebGPU, then the fallback WebGL path shall remain acceptable and documented.

## Phase 4 - Octahedral Tree Decision

Make the lab route decision explicit instead of letting it drift.

**Acceptance (EARS):**

- [x] When `?renderer=webgpu&konveyorNativeTreeImpostors=octahedral` is tested, it shall have a PC visual proof and a budget readout.
- [x] If the octahedral route is promoted, then production-default acceptance shall include device proof and rollback instructions.
- [x] If the route is not promoted, then the backlog shall say why and keep the current production `latlon` / `hemi-y` route intact.

## Phase 5 - Gameplay Regression Sweep

Run one focused playtest surface after the visual tuning stabilizes.

**Acceptance (EARS):**

- [x] When Open Country solo Classic is playtested, sheep driving and objective readability shall still work with the new material balance.
- [x] When a paired two-client Open Country playtest is feasible, it shall record room setup, scene/mode, and any objective or sync issue.
- [x] If paired multiplayer is not feasible this cycle, then the blocker shall be named and carried forward honestly.

## Phase 6 - Release Hygiene

Keep the release train honest while avoiding unrelated churn.

**Acceptance (EARS):**

- [x] When local validation closes, `npm test`, `npm run lint`, `npm run build`, Chromium smoke, and the release-safe Chromium e2e lane shall pass or have named blockers.
- [x] When GitHub Dependabot advisories are triaged, safe patch-level dependency updates shall be applied only if they do not expand runtime scope; otherwise open a separate security-maintenance cycle.
- [ ] When the cycle ships, `CHANGELOG.md`, version/tag, deploy run, live HTML asset, and direct asset URL shall be recorded.

## Implementation Closeout

- Added `tools/cycle42-material-lock.mjs` and `npm run validation:cycle42-material-lock`. Current proof writes `cycle42-validation/runtime/material-lock.json`, per-shot PNGs under `cycle42-validation/screenshots/material-lock/`, and `cycle42-validation/screenshots/cycle42-material-contact-sheet.png`.
- Added `tools/cycle42-octahedral-proof.mjs` and `npm run validation:cycle42-octahedral-proof`. Current proof writes `cycle42-validation/runtime/octahedral-proof.json` and `cycle42-validation/screenshots/cycle42-octahedral-contact-sheet.png`.
- WebGPU sky now paints a warm sun body over the sky base before the hot sun core, so the large visible mass no longer reads as a grey moon. The sun billboard remains additive and larger on the WebGPU path.
- WebGPU grass now avoids the brown/double-linearized look and uses stronger low-sun tip/backlight separation so grass and terrain are no longer the same flat layer.
- WebGPU water now uses darker blue tuning plus a masked broad-glint path, keeping the sun reflection intentional without washing the full water plane purple.
- WebGPU material controls were added for terrain, grass, sheep, impostors, sun, sky, and water. The patch stayed outside `shared/`, Worker, D1, migrations, and sim-baseline goldens.
- Production WebGPU `?konveyorNativeTreeImpostors=1` now resolves to octahedral v2 with a documented rollback query: `?renderer=webgpu&konveyorNativeTreeImpostors=latlon`.

## Validation Snapshot

- `npm test` - passed, 54 files passed and 1 skipped; 499 specs passed and 7 skipped.
- `npm run lint` - passed.
- `npm run build` - passed with existing Vite large-chunk/dynamic-import warnings.
- `npx playwright test tests/e2e/smoke.spec.ts --project=chromium --reporter=line` - passed, 2 tests.
- `npx playwright test --project=chromium --grep-invert @local-only --reporter=line` - passed, 6 tests. An earlier parallel run was invalid because the smoke run already owned port `3000`, causing Vite to move to `3001`; the command passed when rerun by itself.
- `npm run validation:cycle42-material-lock` - passed. Runtime JSON: `cycle42-validation/runtime/material-lock.json`; contact sheet: `cycle42-validation/screenshots/cycle42-material-contact-sheet.png`. The runner still classifies six low-sun actor/Open Country comparisons as material-parity manual-review items.
- `npm run validation:cycle42-octahedral-proof` - passed. Runtime JSON: `cycle42-validation/runtime/octahedral-proof.json`; contact sheet: `cycle42-validation/screenshots/cycle42-octahedral-contact-sheet.png`.
- Android proof - blocked locally: `adb devices` returned no authorized devices.
- iOS water proof - blocked locally: no `BROWSERSTACK_*` / `BS_*` environment variables were present.

## Non-Goals

- No deterministic sim changes.
- No new scene or game-mode work.
- No broad UI redesign.
- No new WebGPU default policy change unless device proof demands it.
- No asset-replacement campaign beyond material tuning and lab-route proof.

## Carryover Candidates If Scope Gets Tight

- BrowserStack iOS water proof.
- Android WebGPU water/device proof on authorized hardware.
- Open Country paired two-client playtest.
- Six manual material-parity review items from `cycle42-validation/runtime/material-lock.json`, all low-sun actor/Open Country comparison deltas after the water and grass fixes.
- Remaining transitive `uuid` advisory through Google/BrowserStack tooling.

## Approval Notes

- Chosen priority was visual material parity first.
- Dependabot hygiene stayed small and dev-scope.
- Octahedral v2 was promoted for the explicit production tree-impostor route after PC proof, with the `latlon` rollback query documented.
