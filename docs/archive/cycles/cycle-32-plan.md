# Cycle 32 Plan: Apple Platform Water Validation

## Summary

Cycle 32 primary goal is `apple-platform-validation`: make the iPhone Safari water bug reproducible, fix it structurally by removing the fragile depth pre-pass, and add a real-device BrowserStack gate so this class of Apple/WebGL regression is caught before Matt sees it on a phone.

Current validation: `.env.local` contains BrowserStack credentials, API auth is valid, account is `Free`, 5 parallels, 0 running. Free is enough for the proof spike; do not buy a plan until the iOS water canary runs reliably.

## Closeout Status - 2026-05-10

Cycle 32 shipped as `v2.1.4`.

- BrowserStack Automate provider proof is green for public URL runs on `iPhone 15 Pro Max / iOS 17 / Safari`.
- The iOS water canary exists at `tests/browserstack/ios-water.spec.ts` and is exposed through `npm run test:ios-water`.
- `AnimeWater` no longer depends on screen depth or a per-frame depth render target. Foam and water color now derive from each island scene's circular boundary and falloff.
- `glProbe` records `window.__sdsDiag.waterSample` / `waterSamples[]` under `?debug=gl`.
- The canary stays manual while the account is free. Push gating waits until the BrowserStack path proves stable enough to justify paid Automate minutes.
- BrowserStack Local on the Windows workstation hit an `EBUSY` lock opening `C:\Users\Mattm\.browserstack\BrowserStackLocal.exe`. Public URL mode passed. Use the GitHub workflow / Linux runner for the next local-build tunnel proof.
- MP island scenes stayed out of scope. No shared sim files, worker objective code, wire format, or sim-baseline goldens changed.
- Post-push deploy run [`25618264492`](https://github.com/matthew-kissinger/sds/actions/runs/25618264492) published Worker and Pages, and production served the expected Cycle 32 asset hashes. The run remains red because Linux Chromium E2E cannot start the worker side of `npm run dev` (`wrangler: not found`) before the Solo Classic canvas smoke times out. That is parked as CI/dev-server dependency drift for the next pass.

## Implementation Changes

- Add BrowserStack automation support using `browserstack-node-sdk`, not dashboard-only Live testing.
  - Commit a secret-free `browserstack.yml`.
  - Add `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` as GitHub Actions secrets from local `.env.local`.
  - Add `npm run test:ios-water` for one real-device Safari probe.
- Add one iOS water canary against `iPhone 15 Pro Max / iOS 17 / Safari`.
  - First run against local build through BrowserStack Local by default; `IOS_WATER_BASE_URL` can point it at production.
  - Load `/?scene=rolling-hills&debug=gl&cinematic=1&ui=off&sun=0.55`, seed player identity, start Solo Classic, wait for canvas.
  - Save screenshot + pixel sample JSON.
  - Fail when the sampled water region is near solid `#eaf6ff`.
- Rearchitect `js/water/AnimeWater.js` to remove screen-depth dependency.
  - Delete `DepthPrePass` from the render loop and water creation path.
  - Replace `uDepthTex`, `uResolution`, `uCameraNear`, and `uCameraFar` with scene-boundary shoreline uniforms.
  - For current SDS island scenes, use the scene's circular `boundary` as the shoreline source of truth: foam is distance from `boundary.radius`; shallow/deep color is distance from shore over the scene's `boundary.falloff`.
  - Keep ripples, sparkles, fog, sun-glint, palette, and mobile segment counts.
- Extend `glProbe` with a water-specific sample.
  - Under `?debug=gl`, record `window.__sdsDiag.waterSample` with region pixels, average RGB, and `nearFoamWhite` flag.
  - BrowserStack and Safari smoke attach this JSON through `window.__sdsCaptureSample`.
- Keep MP island scenes out of Cycle 32 implementation.
  - Treat MP island support as Cycle 33 architecture work. No shared sim, worker objective, wire-format, or sim-baseline changes in this cycle.

## Phases

1. **Provider Proof**
   - Set GitHub secrets, add BrowserStack SDK config, and get one real-iOS Safari smoke path using BrowserStack Automate.
   - If BrowserStack iOS sessions keep timing out after SDK setup, stop and switch provider research before building around it.

2. **Current-Bug Canary**
   - Add the Rolling Hills iOS water canary and capture the current failure or current pass.
   - Keep it manual/dispatch-only while the account is free.

3. **Water Unit Tests**
   - Add deterministic tests for the new shoreline math: at the shoreline foam is allowed, beyond the foam band water is not foam-white, and deep water trends toward `uDeepColor`.

4. **Water Rearchitecture**
   - Remove `DepthPrePass` from `SceneManager` and scene boot.
   - Update `AnimeWater` uniforms and shader math.
   - Remove depth-pre-pass extension assumptions from WebGL tests.

5. **Real iOS Gate**
   - Make the BrowserStack water canary usable for manual workflow dispatch and release validation.
   - Keep push gating optional until a paid Automate plan exists.

6. **Runtime Health + Docs**
   - Extend `glProbe`.
   - Update `docs/cross-platform-testing.md`.
   - Record the rule: no per-frame render-to-texture shader dependency on Apple-facing render paths without a real-device gate.

## Test Plan

- `npm test`
- `npm run build`
- `npm run test:e2e -- --project=chromium --grep-invert @local-only`
- `npm run test:ios-water`
- Manual check of BrowserStack artifacts: screenshot, session URL/details, and `waterSample` JSON.
- No sim-baseline regeneration expected. If sim-baseline changes, that is an emergency stop.

Closeout validation:

- `npm test` - 300 passed / 7 skipped.
- `npm run build` - clean production build.
- `npm run test:e2e -- --project=chromium --grep-invert @local-only` - 6 passed.
- `IOS_WATER_BASE_URL=https://sheepdogsim.com npm run test:ios-water` - passed on real iOS Safari; latest sampled average RGB `[26, 44, 11]`, `nearFoamWhite: false`.
- GitHub Actions Worker + Pages deploy jobs - passed for run `25618264492`; Linux Chromium E2E remains red due `wrangler: not found` in CI startup.

## Hard Stops

- BrowserStack accepts auth but cannot complete a stable iOS Safari navigation after SDK setup.
- The iOS water canary consumes most free minutes before producing a usable artifact.
- Any change touches frozen `shared/` sim files, sim baselines, `docs/CYCLE_TEMPLATE.md`, or `.claude/rules/*` without explicit authorization.
- `npm run build` increases the production bundle unexpectedly.
- Desktop Chromium, macOS Safari smoke, or BrowserStack iOS shows a new visual water regression after the rearchitecture.

## Assumptions

- BrowserStack Automate is the selected provider.
- Free account is used for proof only; paid Automate is deferred until the canary is proven useful.
- The proper engineering fix is A1: remove the depth pre-pass. A2 capability-check fallback is rejected unless A1 proves impossible in Phase 4.
- Player-visible outcome: Rolling Hills and Open Country water no longer turn solid foam-white on iPhone Safari.

## References

- [BrowserStack iOS Playwright docs](https://www.browserstack.com/docs/automate/playwright/playwright-ios/nodejs)
- [BrowserStack GitHub Actions docs](https://www.browserstack.com/docs/automate/playwright/github-actions)
- [BrowserStack free-trial usage limits](https://www.browserstack.com/support/faq/plans-pricing/usage-plans-pricing/is-usage-limited-and-if-so-what-are-those-limits)
