# Next Session - Cycle 39 (TBD)

> **Updated:** 2026-05-20
> **For:** Cycle 39
> **Pickup priority:** Cycle 39 plan is scaffolded as a stub. Fill in Goal + Phases before running `/cycle-start`. Seed scope from Cycle 38 carryover: octahedral tree-impostor sidecar v2 + Kiln material projection (PC-implementable), OR a paired mobile-readiness cycle for Phases 5/6 (Android matrix, iOS Safari canary, OC MP playtest).

## Cold-start orientation

Read in order: [`AGENTS.md`](AGENTS.md) → [`CLAUDE.md`](CLAUDE.md) → this
file → the active cycle plan at [`docs/cycle-39-plan.md`](docs/cycle-39-plan.md).
Closed-cycle plans live under [`docs/archive/cycles/`](docs/archive/cycles/).

Don't write code until orientation is complete. The cycle-39 plan is a
stub - it needs Goal + Phases filled in before any work begins.

## Cycle 38 close summary (2026-05-20)

Closed autonomously per Matt's directive "complete autonomously without
human check-in, focus on the game in general and test on PC this cycle."
PC-scope phases shipped, mobile-scope phases carried over.

PC-scope shipped:

- **Phase 2 water grid/alignment fix.** Root cause and fix in
  [`js/water/konveyorAnimeWaterNodeMaterial.js`](js/water/konveyorAnimeWaterNodeMaterial.js)
  (three-rotated wavefront directions replace world-axis sines). Captures
  under `cycle38-validation/screenshots/cycle38-phase2-pc-water-grid-after/`.
- **Phase 2 other visual gates.** Sun glint sync verified by code review;
  OC terrain seams clean across follow-close / classic-max /
  horizon-terrain-seam; dog readable + tree coherence preserved.
- **Phase 3 tree budgets.** `tree-assets.spec.js` locks 7700/1924 tris on
  tree2 LOD0/LOD1.
- **Phase 4 quality-governor hysteresis.** 4 new tests in
  [`tests/render-cost-report.spec.js`](tests/render-cost-report.spec.js)
  plus proof artifact at
  `cycle38-validation/runtime/quality-governor-hysteresis-proof.json`.

Mobile-scope carryover (operator hardware or deploy required):

- Octahedral tree-impostor sidecar v2 + Kiln node material octahedral
  projection (pixel-forge has no static-octahedral mode; needs a custom
  baker, ~1+ week).
- Android matrix at `?konveyorNativeTreeImpostors=1` (depends on the
  octahedral baker).
- Multi-Android profiles + iOS Safari WebGPU canary (Phase 5).
- OC paired two-client sheep-driving playtest; post-deploy iOS water
  canary; renderer telemetry readout (Phase 6).
- Water lighting time-of-day reproducibility (`?sun=0.5`-locked capture
  matrix for cleaner A/B regression baselines).

## Frozen files

Durable fence applies in full ([`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md)).
No cycle-39 specific exceptions until the plan stub is filled in.

## Operational notes

- **Cloudflare creds:** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
  in `~/.config/mk-agent/env` (load via
  `set -a && source ~/.config/mk-agent/env && set +a`). Token scopes:
  `Zone Settings:Edit`, `D1:Read`, `Workers Scripts:Read`. For Web Analytics
  / RUM lifecycle, use the dashboard cookie session (Claude in Chrome).
- **D1:** `npx wrangler d1 execute sds-db --remote --command "..." --json`
  for read-only inspection. Database id
  `513aa937-e60a-4fb6-b499-9f3814149e88`.
- **Android phone (when mobile work resumes):** plug in `R5CX4028VGJ`,
  authorize USB debugging, then `adb reverse tcp:3000 tcp:3000`. Vite must
  bind IPv4 (`vite --port 3000 --host 127.0.0.1`) or the reverse can't
  reach it.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-39-plan.md`](docs/cycle-39-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-38-plan.md`](docs/archive/cycles/cycle-38-plan.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Durable rules | [`.claude/rules/`](.claude/rules/) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |

## Running locally

```bash
npm run dev
npm test
npm run lint
npm run build
npm run test:e2e -- --project=chromium --grep-invert @local-only
npm run test:ios-water
npm run test:integration
```

Useful URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`,
`?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`,
`?tonemap=aces|neutral|linear|none`.
