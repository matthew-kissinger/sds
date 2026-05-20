# Next Session - Cycle 38 (`polished-webgpu-production-readiness`)

> **Updated:** 2026-05-20
> **For:** Cycle 38
> **Pickup priority:** continue Cycle 38 toward shippable WebGPU production readiness. The autonomous Definition-of-Done checklist lives in the cycle plan; top concrete next steps are water grid/alignment fix, sun glint sync, Open Country terrain seams, true octahedral sidecar v2, and Android matrix close.

## Cold-start orientation

Read in order: [`AGENTS.md`](AGENTS.md) → [`CLAUDE.md`](CLAUDE.md) → this
file → the active cycle plan at [`docs/cycle-38-plan.md`](docs/cycle-38-plan.md).
The plan carries the Autonomous Completion Brief (authorization scope,
Definition of Done, validation gates, close-out ritual, hard stops, artifact
paths). Closed-cycle plans and the Konveyor campaign archive are under
[`docs/archive/`](docs/archive/); read only if a regression points there.

Don't write code until orientation is complete. When invoked autonomously
("run cycle 38 autonomously" or equivalent), follow the brief end-to-end
without check-ins; pause only on hard stops or for the Phase 5 + 6
carryovers that require the operator or a deploy.

## Current state (recent activity, not durable contract)

- 2026-05-20: connected-phone spot-check on `R5CX4028VGJ` (Galaxy S24+,
  Android 16) confirmed the desktop visual contracts (grass interactor
  coordinate/overlap mode, sheep lower-leg gait + body-only wool, water
  `ripple-normal-sun-camera-v2` glint, `SunBillboard` ownership) carry on
  Android with 0 console/page errors and 6/6 nonblank screenshots. Budgets
  remain red against high-mobile (`p95 <= 18.5 ms`): RH 33.4-33.5 p95, OC
  shoreline-glint 50.2 p95 / 66.8 p99. Water grid/alignment-line artifact
  reproduces on phone. Artifact:
  `cycle38-validation/runtime/android-webgpu-phone-reconnect-spotcheck.json`.
- 2026-05-20 housekeeping: cycle*-validation moved to .gitignore (491
  files), stale branches deleted, `.git/` collapsed 1.45 GiB → 637 MiB,
  v2.1.7 tagged, Konveyor campaign docs folded into
  [`docs/archive/konveyor-campaign.md`](docs/archive/konveyor-campaign.md),
  `progress.md` archived, NEXT_SESSION + cycle plan slimmed to contract
  shape.

PR [#52](https://github.com/matthew-kissinger/sds/pull/52) is historical
merged evidence, not a current approval to deploy future mobile-readiness
work. Do not call SDS mobile-ready yet.

## Open carryovers (require operator or deploy)

1. **OC paired two-client sheep-driving playtest.** Operator at the
   keyboard, two browser tabs, OC cooperative room, drive sheep into the
   round-up zone at `(0, 50)`, confirm `roundup → drive` flips server-side
   at `hold=2.0s` and the portal at `z=295` opens. Carryover from Cycle 35.
2. **Post-deploy iOS Safari water canary.**
   `IOS_WATER_BASE_URL=https://sheepdogsim.com npm run test:ios-water`
   after the next deploy. Hard stop if `nearFoamWhite: true`.
3. **Renderer telemetry readout.**
   `npm run konveyor:renderer-telemetry -- --days=7` after deployed traffic.

## Frozen files

Durable fence applies in full ([`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md)).
Cycle-38-specific exception: `shared/TreePlacement.js` +
`tests/refactor-baseline/__fixtures__/scatter-positions.json` for the
2026-05-16 tree-placement amendment (see cycle plan).

## Operational notes

- **Cloudflare creds:** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
  in `~/.config/mk-agent/env` (load via
  `set -a && source ~/.config/mk-agent/env && set +a`). Token scopes:
  `Zone Settings:Edit`, `D1:Read`, `Workers Scripts:Read`. For Web Analytics
  / RUM lifecycle, use the dashboard cookie session (Claude in Chrome).
- **D1:** `npx wrangler d1 execute sds-db --remote --command "..." --json`
  for read-only inspection. Database id
  `513aa937-e60a-4fb6-b499-9f3814149e88`.
- **Android phone:** plug in `R5CX4028VGJ`, authorize USB debugging, then
  `adb reverse tcp:3000 tcp:3000`. Vite must bind IPv4
  (`vite --port 3000 --host 127.0.0.1`) or the reverse can't reach it. CDP
  port `9222` may already be held; pass `--cdpPort=9333` to
  `tools/android-webgpu-perf.mjs`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-38-plan.md`](docs/cycle-38-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-37-plan.md`](docs/archive/cycles/cycle-37-plan.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Durable rules | [`.claude/rules/`](.claude/rules/) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
| Konveyor campaign archive | [`docs/archive/konveyor-campaign.md`](docs/archive/konveyor-campaign.md) |

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
