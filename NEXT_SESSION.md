# Next Session - Cycle 92 intake (nsl-frame-floor)

> **Updated:** 2026-06-11
> **For:** Cycle 92 (`docs/cycle-92-plan.md`, scaffolded - needs Goal + Phases)
> **Pickup priority:** Matt reviews the Cycle 91 visual queue (tree remake, canopy shadows, ground noise, wolf gradient - surveys in `cycle91-validation/`, report in `cycle91-validation/REPORT.md`), then fill the Cycle 92 plan and run `/cycle-start`.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-92-plan.md`](docs/cycle-92-plan.md) (scaffold + intake candidates) -> [`docs/BACKLOG.md`](docs/BACKLOG.md) Cycle 91 entry -> `git log --oneline -10`.

## Where It Stands

**Cycle 91 closed 2026-06-11** (plan archived at `docs/archive/cycles/cycle-91-plan.md`). Shipped autonomously end-to-end: tree pipeline remake on ez-tree main, runtime LOD chain (LOD0 within 200m / kiln impostors beyond, ~108 controllers -> appendable per-type), first WebGPU canopy shadows (sole-caster cross-billboards), per-frame waste batch (LUT bakes 132/s -> ~2/s), load/boot fixes, dist 121 -> 58.7 MB, dog/wolf/farmhouse re-bakes, and the gridded-ground fix (sine lattice -> rotated hash value noise, after the first perlin fix regressed the field rail and was bisected + replaced per hard stop 2).

**Numbers at close:** NSL driven survival median 144.9 at full quality with shadows; field rail 77.4 mean 1%-low / 20.9ms worst, PASS. 1518 vitest green, ratchet at main 620 / other 551 KiB (deliberate bumps recorded).

**The Experimental (WIP) pill STAYS on NSL.** The gate (5-run mean 1%-low >= 55, worst <= 45ms) passed one battery (70.5 / 16.8ms) and failed the shipping-build re-run (54.2 / 145.9ms); an A/A control proved the gap is box-state drift, not code. Cycle 92's center of gravity: find what moves NSL 1%-low between 54 and 70 on identical code (GC suspect - heap-drop hitch fraction 0.37-0.44, intermittent ~146-160ms stall), fix it, re-run the gate on a controlled box state.

## Cycle 92 intake candidates (from BACKLOG carryover)

1. NSL frame floor: 1%-low variance + intermittent stall + heap-drop growth investigation, then the pill decision re-run.
2. P8 lighting items: keyframed hemisphere ambient (survey-gated, own pass), sky-dome render-order A/B (needs a fill-rate-bound target).
3. Rock re-bake behind a collider-parity harness; KTX2 textures pending visual approval.
4. Golden re-capture (stale since 2026-05-16) - AFTER Matt approves the Cycle 91 look.

## Matt review queue

- New NSL look on the live site: tree remake, canopy shadows, value-noise ground, wolf gradient, far-impostor silhouette ring. Surveys: `cycle91-validation/asset-survey/`, `cycle91-validation/lighting-survey/`; numbers: `cycle91-validation/REPORT.md` (scale-back levers listed, canopy shadows cost ~10 median FPS and are one toggle).
- Launch posting from `docs/launch/` (drafts ready, Matt's voice).
- S24+ device pass (standing).

## Working Contract

- No `shared/` deterministic-core edits without the sim-change ritual; sim-baselines stay byte-identical.
- Matt publishes every player-facing artifact.
- Agent-launched Vite/Playwright sets `SDS_SUPPRESS_BROWSER_OPEN=1`; close every probe page/listener after use.
- Perf probes drive input; idle-camera numbers must not gate. GPU probes never run concurrently.
- `renderer.compute()` is a `queue.submit()` - batch compute passes into one call per frame.
- Tree bakes need the sibling clones: `../ez-tree` (pinned 48dc193, `npm run build:lib`) and `../pixel-forge` (compiled CLI at `packages/cli/dist/index.js`).
- CI e2e runs with `--grep-invert='@local-only'`. NSL e2e specs arm the world via the carousel before every Play.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-92-plan.md`](docs/cycle-92-plan.md) (scaffold) |
| Jitter probe + rail | `tools/cycle89-jitter-probe.mjs`, `npm run perf:jitter [-- --check]` |
| Cycle 91 evidence | `cycle91-validation/` (local, gitignored) incl. `REPORT.md` |
| Tree bake pipeline | `tools/bake-trees.mjs` (+ `bake-trees/bake.html`), `tools/bake-tree-lod1.mjs`, `tools/bake-tree-impostors.mjs` |
| Closed cycles | [`docs/BACKLOG.md`](docs/BACKLOG.md) + [`docs/archive/cycles/`](docs/archive/cycles/) |
| Launch drafts (Matt to post) | [`docs/launch/`](docs/launch/) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
