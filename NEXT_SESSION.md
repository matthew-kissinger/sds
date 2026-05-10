# Next Session - Cycle 33 Selection

> **Updated:** 2026-05-10 after Cycle 32 (`apple-platform-validation`) closeout.
> **For:** Cycle 33 planning.
> **Pickup priority:** Cycle 32 is closed as `v2.1.4`. Start by choosing the next cycle goal. The leading candidate is `mp-island-scenes`; the main parked operational item is proving BrowserStack Local through GitHub Actions / Linux before making the real-iOS canary push-gated or paying for Automate. There is also a post-push CI infra follow-up: the deploy workflow's Linux Chromium E2E job is red because `wrangler` is unavailable in the E2E web-server startup.

Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then this file. Cycle 32's closed plan is archived at [`docs/archive/cycles/cycle-32-plan.md`](docs/archive/cycles/cycle-32-plan.md). No `docs/cycle-33-plan.md` exists yet; draft it only after Matt picks the next goal.

## Cycle 32 Close Summary

Cycle 32 fixed the iPhone Safari water failure structurally instead of adding a capability fallback:

- Deleted `js/water/DepthPrePass.js`.
- Removed the per-frame water depth render pass from `SceneManager`.
- Rebuilt `js/water/AnimeWater.js` around scene-boundary shoreline math. Foam and shallow/deep color now derive from each island scene's circular `boundary` and `boundary.falloff`.
- Added deterministic shoreline tests in `tests/water-shoreline.spec.js`.
- Extended `glProbe` with `window.__sdsDiag.waterSample` and `waterSamples[]`.
- Added BrowserStack Automate support with `browserstack-node-sdk`, a secret-free `browserstack.yml`, `npm run test:ios-water`, and a manual GitHub workflow for the real iOS Safari canary.
- Kept multiplayer island scenes, shared sim files, worker objective code, wire format, and sim-baseline goldens untouched.

Player-visible delta: Rolling Hills and Open Country water no longer rely on the fragile depth pre-pass that could render as solid foam-white on iPhone Safari. Version bumped `2.1.3 -> 2.1.4`; details are in [`CHANGELOG.md`](CHANGELOG.md).

## Validation At Close

- `npm test` - 300 passed / 7 skipped.
- `npm run build` - clean production build.
- `npm run test:e2e -- --project=chromium --grep-invert @local-only` - 6 passed.
- `IOS_WATER_BASE_URL=https://sheepdogsim.com npm run test:ios-water` - passed on BrowserStack iPhone 15 Pro Max / iOS 17 / Safari. Latest sampled average RGB was `[26, 44, 11]`, `nearFoamWhite: false`.
- `git diff --name-only` showed no shared sim files, sim baselines, `.claude/rules/*`, or `docs/CYCLE_TEMPLATE.md` touched.

Known validation nuance: raw `npm run test:e2e -- --project=chromium` includes `@local-only` perf probes and failed on this workstation's noisy local perf path. CI/release smoke uses `--grep-invert @local-only`.

Post-push deployment status for commit `b1abe2531e4a1a4fe428d15c089efca59016fa33` / tag `v2.1.4`:

- GitHub Actions run [`25618264492`](https://github.com/matthew-kissinger/sds/actions/runs/25618264492) deployed Worker and Pages successfully, and the perf check passed.
- Production `https://sheepdogsim.com/` returned HTTP 200 and served the Cycle 32 build assets `/assets/main-COqIprCT.js` and `/assets/three-CknJ8WuT.js`.
- The same run's `E2E (Chromium)` job failed twice on the Linux runner. Logs show `sh: 1: wrangler: not found` during `npm run dev` startup, followed by timeout in `tests/e2e/smoke.spec.ts` for "solo classic game starts and 3D canvas renders". Treat this as CI/dev-server dependency drift until the artifact proves otherwise.

## Operational Notes

- BrowserStack credentials are expected in local `.env.local` or in GitHub Actions secrets as `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`.
- Public URL mode works: set `IOS_WATER_BASE_URL=https://sheepdogsim.com` and run `npm run test:ios-water`.
- Local tunnel mode on this Windows workstation hit `EBUSY` opening `C:\Users\Mattm\.browserstack\BrowserStackLocal.exe`. Do not buy a BrowserStack plan until the same canary runs reliably through the GitHub workflow / Linux runner or the Windows Local binary lock is resolved.
- BrowserStack artifacts are generated under `browserstack-artifacts/ios-water/`; this directory is gitignored.
- This site does not expose a useful `/asset-manifest.json`; verify live deploys from the latest GitHub Actions deploy run plus production HTML asset hashes.

## Carryover Candidates For Cycle 33

1. **MP island scenes** - Rolling Hills and Open Country in multiplayer. This is now the leading architecture candidate. It needs a proper shared-sim / worker / wire-format plan and an explicit sim-baseline regeneration decision before any frozen file changes.
2. **Deploy workflow E2E dependency drift** - inspect run `25618264492` artifacts and fix the Linux E2E startup so `wrangler` is available when `npm run dev` launches the worker. Local release smoke already passed; do not mark CI green until the GitHub job does.
3. **BrowserStack Local hardening** - run `.github/workflows/browserstack-ios-water.yml` manually on Ubuntu with the release branch/base URL. If it proves stable, decide whether the canary becomes a required manual release gate or a paid push gate.
4. **Modal-copy rewrite** - only if Google's recrawl still substitutes welcome-modal copy in the snippet after the Cycle 31 public-surface changes settle.
5. **`CYCLE_TEMPLATE.md` regex-collision fix** - small but fence-touched; Cycle 29/30/31 acceptance reconciliation hit the same template-header collision.
6. **Bespoke pixel-forge rocks**, **octahedral impostors v2**, **cross-module polygon-spawn dedup**, **build-time `displacedHeights` bake**, **inline `_groundY`** - still deferred; size and risk vary by topic.

## Reference Table

| Area | Source of truth |
|---|---|
| Latest closed cycle | [`docs/archive/cycles/cycle-32-plan.md`](docs/archive/cycles/cycle-32-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Apple water-bug research | [`docs/archive/research/apple-water-bug-research-2026-05-09.md`](docs/archive/research/apple-water-bug-research-2026-05-09.md) |
| Cross-platform tooling matrix | [`docs/cross-platform-testing.md`](docs/cross-platform-testing.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |

## Running Locally

```bash
npm run dev
npm test
npm run lint
npm run build
npm run test:e2e -- --project=chromium --grep-invert @local-only
npm run test:ios-water
```

Useful URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.
