# Next Session - Cycle 39 (sun, scorched-earth)

> **Updated:** 2026-05-21
> **For:** Cycle 39
> **Pickup priority:** Execute [`docs/cycle-39-plan.md`](docs/cycle-39-plan.md) Phase A (strip the disc to a disc). Rip the halo math, dual color uniforms, camera-warp visualDirection block, and WebGL/WebGPU renderer-path divergence out of [`js/effects/SunBillboard.js`](js/effects/SunBillboard.js) and [`js/effects/konveyorSunNodeMaterial.js`](js/effects/konveyorSunNodeMaterial.js). The disc becomes one small soft-edged radial falloff with a single color uniform; the broad glow moves to the sky shader as a Mie aureole in Phase B.

## Cold-start orientation

Read in order: [`AGENTS.md`](AGENTS.md) → [`CLAUDE.md`](CLAUDE.md) → this file → the active cycle plan at [`docs/cycle-39-plan.md`](docs/cycle-39-plan.md). Closed-cycle plans live under [`docs/archive/cycles/`](docs/archive/cycles/).

## Cycle 39 shape

Goal: rip the radial-splotch sun and rebuild on physical principles. The disc is just the disc; the broad glow lives in the sky shader as Mie scattering near the sun direction; bloom paints the warm halo. Render-only cycle. PC desktop scope. No `shared/` sim, no `SunSystem.js` directional-light changes. Bloom config IS in scope (lifted from the original cycle-39 stop after Matt's scorched-earth call on 2026-05-21).

Phases (≤ 4hr each, all autonomous):

A. **Strip the disc to a disc** (Phase A). Delete halo math, dual color uniforms, camera-warp, renderer-path divergence. New stub `js/atmosphere/sunChromaticity.js`.
B. **Mie aureole in the sky shader** (Phase B, depends on A). Henyey-Greenstein phase function on `dot(viewDir, sunDirection)` replaces the ad-hoc `physicalSunGlow` smoothstep. Horizon glow falls out at low altitude.
C. **Single sun-chromaticity source** (Phase C, depends on B). Disc and sky both read from `sunChromaticity.js`. No duplicated literals.
D. **Bloom audit + tune** (Phase D, depends on C). 12-PNG capture matrix; tune bloom threshold/strength if golden-hour reads anemic.
E. **Coherence + final 12-PNG baseline** (Phase E, integration).

Hard stops specific to this cycle:

1. If bloom can't deliver the warm-at-golden-hour read after tuning, surface to Matt before shipping. Do **not** bake a halo back into the disc shader.
2. If any phase reaches into `shared/` to chase a visual difference, stop and surface.
3. No `?sunMode` query-param scaffolding. Replace legacy outright; git diff is the A/B.
4. No `painterlyPalette.js` reintroduction. The single source of truth is `sunChromaticity.js` + the Mie phase function in the sky shader.

Cloud rim-light + water glint were in the original cycle-39 plan; they are **deferred to cycle 40**. If the principles in this cycle hold, they become single-line reads from `sunChromaticity.js` later.

## Cycle 38 close summary (2026-05-20)

Closed autonomously per Matt's directive "complete autonomously without human check-in, focus on the game in general and test on PC this cycle." PC-scope phases shipped, mobile-scope phases carried over.

PC-scope shipped:

- **Phase 2 water grid/alignment fix.** Three-rotated wavefront directions replace world-axis sines in [`js/water/konveyorAnimeWaterNodeMaterial.js`](js/water/konveyorAnimeWaterNodeMaterial.js). Captures under `cycle38-validation/screenshots/cycle38-phase2-pc-water-grid-after/`.
- **Phase 2 other visual gates.** Sun glint sync verified by code review; OC terrain seams clean; dog readable; tree coherence preserved.
- **Phase 3 tree budgets.** `tree-assets.spec.js` locks 7700/1924 tris on tree2 LOD0/LOD1.
- **Phase 4 quality-governor hysteresis.** 4 new tests in [`tests/render-cost-report.spec.js`](tests/render-cost-report.spec.js) plus proof at `cycle38-validation/runtime/quality-governor-hysteresis-proof.json`.

Mobile-scope carryover (deferred past cycle 39's render-only scope; revisit in cycle 40 or later):

- Octahedral tree-impostor sidecar v2 + Kiln node material octahedral projection.
- Android matrix at `?konveyorNativeTreeImpostors=1`.
- Multi-Android profiles + iOS Safari WebGPU canary.
- OC paired two-client sheep-driving playtest; post-deploy iOS water canary; renderer telemetry readout.
- Water lighting time-of-day reproducibility (`?sun=0.5` locked capture matrix for cleaner A/B baselines).

## Frozen files

Durable fence applies in full ([`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md)). No cycle-39 specific exceptions. The four materials this cycle touches (`SunBillboard.js`, `konveyorSunNodeMaterial.js`, `konveyorSkyNodeMaterial.js`, `konveyorCloudNodeMaterial.js`, `konveyorAnimeWaterNodeMaterial.js`) and the new `painterlyPalette.js` are all outside the durable fence.

## Operational notes

- **Cloudflare creds:** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `~/.config/mk-agent/env` (load via `set -a && source ~/.config/mk-agent/env && set +a`). Token scopes: `Zone Settings:Edit`, `D1:Read`, `Workers Scripts:Read`. For Web Analytics / RUM lifecycle, use the dashboard cookie session (Claude in Chrome).
- **D1:** `npx wrangler d1 execute sds-db --remote --command "..." --json` for read-only inspection. Database id `513aa937-e60a-4fb6-b499-9f3814149e88`.
- **Android phone (when mobile work resumes):** plug in `R5CX4028VGJ`, authorize USB debugging, then `adb reverse tcp:3000 tcp:3000`. Vite must bind IPv4 (`vite --port 3000 --host 127.0.0.1`) or the reverse can't reach it.

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

Useful URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.
