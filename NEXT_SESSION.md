# Next Session - Post v2.2.4 live, no active cycle

> **Updated:** 2026-06-09
> **For:** Post-Cycle 83 handoff. Latest closed cycle: Cycle 83 `wolves-bark-night-polish`, archived at [`docs/archive/cycles/cycle-83-plan.md`](docs/archive/cycles/cycle-83-plan.md).
> **Pickup priority:** Start the next cycle from Matt's next target. Production proof for `v2.2.4` is complete.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/BACKLOG.md`](docs/BACKLOG.md) -> [`DECISIONS.md`](DECISIONS.md). There is no active cycle plan at this snapshot; create/scaffold the next one only after Matt gives the next direction.

## Where It Stands

**Cycle 83 (`wolves-bark-night-polish`) is CLOSED + SHIPPED LIVE (2026-06-09).** It merged PR #59 (`codex/cycle83-wolf-bark-feel`) and PR #60 (`codex/cycle83-night-arc`) into `main`, then shipped the player-visible `v2.2.4` release.

- Release tag: `v2.2.4` at commit `936531f` (`release(cycle83): ship wolf bark night polish v2.2.4`).
- Merged PRs: #59 wolf/bark feel via merge commit `a10fab2`; #60 night arc via merge commit `5a419d3`.
- Deploy proof: GH Actions Deploy run `27206254394` green on `main` (`Test`, `E2E (Chromium)`, `Migrate D1`, `Deploy Worker`, `Deploy Pages` all succeeded).
- Live Pages proof: `https://sheepdogsim.com/?proof=936531f` returned 200, live main bundle is `/assets/main-DVswN68n.js` (607,607 bytes) and contains the Cycle 83 markers for `range:24`, wolf repel/bark flee tuning, and the internal night preset.
- Live hero asset proof: `https://sheepdogsim.com/assets/scenes/entrance/newsheepdogland.webp` returned 200, `image/webp`, 195,732 bytes.
- Live Worker proof: `https://sds-worker.matt-m-kissinger.workers.dev/healthz` returned 200 with `{"ok":true,"worker":"sds-worker"}`.

What shipped:

- Wolves are now threat-readable in survival and `?wolf=1`: 1.35 m target height and grey-wolf material palette on the vetted CC0 Quaternius rig.
- Bark is audible and wired to the bark command: Web Audio resumes from the bark gesture, dog bark volume is raised, sheep react inside the existing cone out to 24 m, and wolves flee inside 45 m for 2.0 s.
- Newsheepdogland night is visibly darker: the internal `night` preset keys to the existing `NIGHT_T = 0.80`, the visual sun is below the horizon at night, and the sun billboard intensity is zero below horizon.
- Day/night visuals ease between keyframes, and co-op survival atmosphere smoothly approaches Worker `survival.t` instead of snapping.

Validation before release:

- `git diff --check` exit 0.
- `npm test` exit 0.
- `npm run lint` exit 0.
- `npm run build` exit 0 (`assets/main-DHXXnjcM.js` locally, 607.61 kB).
- `npx playwright test --project=chromium --grep-invert='@local-only' --reporter=line --workers=1` exit 0 locally (6 passed).
- PR browser proof covered `?wolf=1`, survival bark audio/repel at medium and long range, and morning/day/dusk/night luma (`night t=0.80` luma 31.81, `sunY=-0.13917`, billboard intensity 0).

Known validation caveat:

- Full local `npm run test:e2e` still does not complete reliably inside a 15-minute local command window. A broader local cross-browser sweep exposed current-main selector/WebKit issues documented in PR #60. The deploy gate uses the Chromium subset above and is green locally and in CI.

## Open Carryover

- Mobile WebGPU validation remains blocked on a real WebGPU-capable mobile device. The connected Galaxy Tab S9 FE exposed no `navigator.gpu`; mobile remains WebGL-pinned for the flagship.
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the next active cycle scopes it and records acceptance; sim-baselines stay byte-identical unless a future cycle explicitly accepts a golden change.
- The flagship renders on desktop WebGPU through the compute-cull path. Do not regress the mesh consolidation: `tools/webgpu-flagship-lift-gate-cycle81.mjs` (`GUARD=1`) asserts <= 30 render pipelines + <= 12 InstancedMeshes.
- Mobile keeps the WebGL pin until a real WebGPU-capable mobile device validates a within-budget flagship cold-load.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop dev/preview listeners after a probe.

## Reference Table

| Area | Source of truth |
|---|---|
| Latest closed cycle | [`docs/archive/cycles/cycle-83-plan.md`](docs/archive/cycles/cycle-83-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| The Cycle 81 lift decision | [`DECISIONS.md`](DECISIONS.md) Cycle 81 entry |
| The compute-cull modules | [`js/world/grassComputeCull.js`](js/world/grassComputeCull.js), [`js/world/treeComputeCull.js`](js/world/treeComputeCull.js), [`js/world/konveyorWebGpuModules.js`](js/world/konveyorWebGpuModules.js) |
| The tier-gate | [`js/utils/isMobileClient.js`](js/utils/isMobileClient.js) + [`js/main.js`](js/main.js) boot gate + swap guard + [`js/SceneManager.js`](js/SceneManager.js) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
