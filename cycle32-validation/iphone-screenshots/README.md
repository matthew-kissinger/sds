# cycle32-validation/iphone-screenshots

Source artifacts for Cycle 32's apple-platform-validation work. Captured live on the user's iPhone (work-managed device, 5G+, iOS version not yet captured).

## Files

| File | Captured | What it shows |
|---|---|---|
| `iphone-rh-water-2026-05-09.jpg` | 2026-05-09 ~16:23 EDT (sent via Slack DM 2026-05-09 16:23:38) | Rolling Hills, Follow camera looking out across water. Water region renders as solid `#eaf6ff` off-white; land strip (golden grass, dark green slope, dog) renders correctly; shoreline reads as a hard binary edge. Same build renders correctly on Android Chrome + Windows Chrome. |

## What this folder is for

This is the **artifact** folder for Cycle 32. Live screenshots, `__sdsDiag` JSON dumps captured during Phase 0, perf comparisons before/after the Track A architecture change, and any LambdaTest-captured iPhone screenshots all land here.

Naming convention: `<source>-<scene>-<symptom>-<YYYY-MM-DD>.<ext>` (e.g. `iphone-rh-water-2026-05-09.jpg`, `lambdatest-rh-water-2026-05-10.png`, `iphone-rh-diag-2026-05-10.json`).

## Linked context

- [`docs/apple-water-bug-research-2026-05-09.md`](../../docs/apple-water-bug-research-2026-05-09.md) - bug analysis + proposed engineering fix + tooling decisions
- [`docs/cycle-32-plan.md`](../../docs/cycle-32-plan.md) - cycle plan with Apple-platform-validation elevated to leading candidate
- [`docs/cross-platform-testing.md`](../../docs/cross-platform-testing.md) - updated tooling matrix
- [`docs/archive/research/mac-bug-research.md`](../../docs/archive/research/mac-bug-research.md) - Cycle 12 prior chapter

## Captured-from-Slack note

The `iphone-rh-water-2026-05-09.jpg` source was a Slack DM image (Slack file ID `F0B2WB300UU`) routed via Google Drive auto-backup, downloaded to `~/Downloads/20260509_133647.jpg`, then renamed + moved here. Original camera-roll timestamp: `20260509_133647`.
