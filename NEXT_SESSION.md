# Next Session - Cycle 34 (`mp-island-scenes`)

> **Updated:** 2026-05-10 after Cycle 33 (`operational-hardening`) closeout.
> **For:** Cycle 34 (`mp-island-scenes`).
> **Pickup priority:** Read [`docs/mp-island-scenes-design.md`](docs/mp-island-scenes-design.md) (shipped Cycle 33 Phase 5), then fill in [`docs/cycle-34-plan.md`](docs/cycle-34-plan.md) using the design doc's "Suggested Cycle 34 phase shape" as the starting frame. The plan stub already points at the design doc and notes the 5-phase / ~7.5hr engineering shape.

Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then this file, then [`docs/mp-island-scenes-design.md`](docs/mp-island-scenes-design.md), then fill out [`docs/cycle-34-plan.md`](docs/cycle-34-plan.md). Cycle 33's closed plan is archived at [`docs/archive/cycles/cycle-33-plan.md`](docs/archive/cycles/cycle-33-plan.md).

## Cycle 33 Close Summary

Cycle 33 closed the operational backlog before the next architecture lift. Five phases, all autonomous, no player-visible delta, no version bump.

- **Phase 1 — GHA Node 20 deprecation bump.** `actions/checkout`, `actions/setup-node`, `actions/upload-artifact` from `@v4` to `@v5` across [`deploy.yml`](.github/workflows/deploy.yml) and [`macos-safari.yml`](.github/workflows/macos-safari.yml). [`browserstack-ios-water.yml`](.github/workflows/browserstack-ios-water.yml) was already on `@v5`. `cloudflare/wrangler-action@v3` left alone. Beats the 2026-06-02 forced-upgrade cutoff.
- **Phase 2 — BrowserStack workflow self-sufficiency on Linux.** Reworked [`browserstack-ios-water.yml`](.github/workflows/browserstack-ios-water.yml) to support both modes from a single dispatch: public URL (release smoke, `base_url=https://...`) or local-tunnel (pre-release verification, empty `base_url` triggers `npm run build` + `http-server dist -p 3000`). Workflow now echoes its run mode for observability.
- **Phase 3 — Dependabot/security hygiene.** Pinned `@tootallnate/once` to `^3.0.0` via `package.json` `overrides`, clearing alert #21 (was `2.0.1`, transitive of `browserstack-node-sdk → @google-cloud/compute`). Documented the remaining `aws-sdk@2` advisory (alert #20) as accepted risk in [`docs/security-acceptance.md`](docs/security-acceptance.md): no patched v2 exists, the only fix path is upstream BrowserStack migrating to v3, and we never import aws-sdk directly. Re-evaluation trigger: every BrowserStack SDK upgrade.
- **Phase 4 — `cycle-close-reconcile` regex collision fix.** [`.claude/hooks/cycle-close-reconcile.mjs`](.claude/hooks/cycle-close-reconcile.mjs) now iterates over every `## (Success|Acceptance) criteria` heading and picks the first one containing `- [ ]` items, instead of falling on the explainer block that the template ships at the top. Verified against archived cycle-31 plan (returns 8 items, was 0). [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) stayed untouched (fence-frozen and the heading is fine; the bug was in the hook).
- **Phase 5 — MP island scenes design doc.** Shipped [`docs/mp-island-scenes-design.md`](docs/mp-island-scenes-design.md) (13 sections). Verified gaps against current code: OC's `objective` block is unused server-side, no sim-baseline coverage for island boundaries, wire format has no objective-stage fields, `RoomDO.initRoom` does not enforce `scene.allowedModes`. Suggested 5-phase Cycle 34 shape (~7.5hr engineering) with author leans on Q1–Q6. Zero implementation drift in `shared/`, `worker/src/`, or `js/network/`.

## Validation At Close

- `npm test` — 300 passed / 7 skipped (flat vs Cycle 32 close).
- `npm run lint` — clean (eslint shared/).
- `npm run build` — clean, mainKB 589.60 / threeKB 617.77 (byte-identical to Cycle 32 close `main-COqIprCT.js` + `three-CknJ8WuT.js`).
- `npm run test:e2e -- --project=chromium --grep-invert @local-only` — 6 passed in 3.5m.
- `npm audit` — 1 alert remaining (aws-sdk@2 v2, low, documented accepted-risk).
- `git diff --name-only HEAD~10 HEAD -- shared/ worker/src/ js/network/ tests/sim-baseline/ worker/migrations/ docs/CYCLE_TEMPLATE.md .claude/rules/ .claude/commands/` — zero entries (no fence drift).

## Operational Notes

- The cycle 33 branch is `cycle-33-ops-hardening`. After push it should be merged to `main` for the deploy and the action-version annotation to confirm clean.
- Phase 2's local-tunnel canary path needs a manual `gh workflow run browserstack-ios-water.yml` dispatch on Ubuntu after merge to confirm BrowserStack Local works end-to-end (was the original "prove BrowserStack Local on Linux before paying for Automate" gate from Cycle 32). Public-URL mode was already validated in Cycle 32; the local-tunnel path is the new Phase 2 surface area.
- The "next Deploy run shall not emit Node 20 deprecation annotations" success-criteria item is a post-merge check; flag it when the next push lands.

## Carryover Candidates For Cycle 34

The leading and only foreground candidate is **MP island scenes**, scoped in [`docs/mp-island-scenes-design.md`](docs/mp-island-scenes-design.md). The design-doc author leans answer Q1–Q6; the cycle plan author should confirm or override before phase 1.

Background candidates remaining in [`docs/BACKLOG.md`](docs/BACKLOG.md) (not in scope unless explicitly chosen):

1. **Modal-copy rewrite** — only if Google's recrawl still substitutes welcome-modal copy in snippets after Cycle 31 settles further.
2. **Bespoke pixel-forge rocks**, **octahedral impostors v2**, **cross-module polygon-spawn dedup**, **build-time `displacedHeights` bake**, **inline `_groundY`** — long-tail polish, all deferred since their respective cycles.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-34-plan.md`](docs/cycle-34-plan.md) (stub — fill from design doc) |
| Cycle 34 design doc | [`docs/mp-island-scenes-design.md`](docs/mp-island-scenes-design.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-33-plan.md`](docs/archive/cycles/cycle-33-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Security advisory acceptance log | [`docs/security-acceptance.md`](docs/security-acceptance.md) |
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
