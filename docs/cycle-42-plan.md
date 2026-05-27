# Cycle 42 - WebGPU Scene Material Parity and Device Proof

> Drafted 2026-05-27 after the `v2.1.9` Cycle 41 release. Status: pending Matt approval. Do not implement this plan until approved or edited by the user.

## Goal

Turn the Cycle 41 sun/sky/water fix into a broader production art-lock pass for WebGPU without reopening the renderer migration. The target is a WebGPU scene that keeps the accepted painterly sun and water work while improving the remaining flat terrain, grass, foliage, and actor material read, then proving the result on the minimum useful device/browser matrix.

## Current Truth

- Cycle 41 shipped as commit `c1fd5c0`, tag `v2.1.9`, deploy run `26541935987`.
- Live HTML serves `assets/main-Cm7rDWr0.js`, and the direct asset URL returns HTTP 200.
- The Cycle 41 art-lock contact sheet proves WebGPU sun/water/sky are no longer in the tiny-sun/washed-out state.
- The remaining visual gap is broader WebGPU material language: terrain, grass, foliage, sheep/dog silhouettes, and scene contrast still read flatter and less painterly than WebGL in some views.
- Mobile/iOS WebGPU water proof, octahedral tree production promotion, and Open Country paired two-client playtest are still deferred.
- GitHub reported two moderate Dependabot findings on `main` after the push; treat that as release hygiene, not as a hidden blocker for visual scope.

## Scope Rules

- Keep `shared/`, Worker, D1, migrations, and sim-baseline goldens out of scope unless the user explicitly expands the cycle.
- Do not promote octahedral tree impostors to production defaults without device-budget and visual-quality proof.
- Do not tune WebGPU by making WebGL worse. WebGL remains the style reference.
- Do not broaden this into a full renderer migration or asset replacement campaign.
- Prefer simple local material constants and targeted shader controls over new abstractions.

## Phase 1 - Baseline Review Matrix

Capture the actual remaining gap before changing material code.

**Acceptance (EARS):**

- [ ] When the phase runs, it shall capture paired WebGL/WebGPU screenshots for Field, Rolling Hills, and Open Country at representative low, mid, and high sun values.
- [ ] When the matrix is reviewed, it shall explicitly classify remaining differences as sun/water already accepted, material parity issue, asset/geometry issue, or device/perf issue.
- [ ] When the phase closes, it shall record a contact sheet and runtime JSON under `cycle42-validation/`.

## Phase 2 - Targeted WebGPU Material Parity

Tune only the material paths that the Phase 1 matrix proves are still off.

Likely candidates:

- Terrain albedo/contrast and fog blend.
- Grass color depth and wind-lit readability.
- Tree/impostor tint, sun response, and distance fade.
- Sheep wool/dog silhouette read against grass and water.

**Acceptance (EARS):**

- [ ] When WebGPU terrain/grass/foliage are captured beside WebGL, they shall no longer read as a uniformly flat pastel layer.
- [ ] When actors are captured in Field, Rolling Hills, and Open Country, dog and sheep silhouettes shall remain readable without HUD assistance.
- [ ] When material constants are changed, existing tests shall be updated only where they lock intentional renderer contracts.
- [ ] If the fix needs new assets or production tree-default changes, then the phase shall stop and record a separate proposal.

## Phase 3 - Device And Browser Proof

Prove the accepted visual result outside the local desktop happy path.

**Acceptance (EARS):**

- [ ] When desktop proof runs, Chromium WebGPU and WebGL shall both render the accepted matrix without fatal page errors.
- [ ] When mobile proof is available, Android Chrome WebGPU shall capture at least Rolling Hills and Open Country water-facing views.
- [ ] When BrowserStack or real iOS proof is available, Safari water shall run the existing iOS water canary or record the precise platform blocker.
- [ ] If a device/browser cannot run WebGPU, then the fallback WebGL path shall remain acceptable and documented.

## Phase 4 - Octahedral Tree Decision

Make the lab route decision explicit instead of letting it drift.

**Acceptance (EARS):**

- [ ] When `?renderer=webgpu&konveyorNativeTreeImpostors=octahedral` is tested, it shall have a PC visual proof and a budget readout.
- [ ] If the octahedral route is promoted, then production-default acceptance shall include device proof and rollback instructions.
- [ ] If the route is not promoted, then the backlog shall say why and keep the current production `latlon` / `hemi-y` route intact.

## Phase 5 - Gameplay Regression Sweep

Run one focused playtest surface after the visual tuning stabilizes.

**Acceptance (EARS):**

- [ ] When Open Country solo Classic is playtested, sheep driving and objective readability shall still work with the new material balance.
- [ ] When a paired two-client Open Country playtest is feasible, it shall record room setup, scene/mode, and any objective or sync issue.
- [ ] If paired multiplayer is not feasible this cycle, then the blocker shall be named and carried forward honestly.

## Phase 6 - Release Hygiene

Keep the release train honest while avoiding unrelated churn.

**Acceptance (EARS):**

- [ ] When local validation closes, `npm test`, `npm run lint`, `npm run build`, Chromium smoke, and the release-safe Chromium e2e lane shall pass or have named blockers.
- [ ] When GitHub Dependabot advisories are triaged, safe patch-level dependency updates shall be applied only if they do not expand runtime scope; otherwise open a separate security-maintenance cycle.
- [ ] When the cycle ships, `CHANGELOG.md`, version/tag, deploy run, live HTML asset, and direct asset URL shall be recorded.

## Non-Goals

- No deterministic sim changes.
- No new scene or game-mode work.
- No broad UI redesign.
- No new WebGPU default policy change unless device proof demands it.
- No asset-replacement campaign beyond material tuning and lab-route proof.

## Carryover Candidates If Scope Gets Tight

- BrowserStack iOS water proof.
- Open Country paired two-client playtest.
- Octahedral tree production promotion.
- Dependabot advisory fixes if they are not patch-level and low risk.

## Approval Questions

- Should Cycle 42 prioritize visual material parity first, or should mobile/iOS proof take the first implementation slot?
- Should Dependabot triage be included as a small release-hygiene phase, or split into a separate maintenance cycle?
- Should octahedral tree promotion remain a decision-only phase, or become a production promotion target?
