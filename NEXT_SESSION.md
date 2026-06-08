# Next Session - Cycle 74 webgpu-compile-reduction (stub - needs authoring)

> **Updated:** 2026-06-08
> **For:** Cycle 74 `webgpu-compile-reduction`. Plan: [`docs/cycle-74-plan.md`](docs/cycle-74-plan.md) (a STUB - pick the cycle focus, then fill Goal + Phases).
> **Pickup priority:** Cycle 73 (`feel-and-media-live`) is CLOSED. Its big finding: the flagship's beauty media (hero + cinematic) is WebGPU-gated, same as the load-time, so the WebGPU compile-reduction thread now unblocks BOTH. Decide Cycle 74 with Matt (compile-reduction spike, or the remaining LIVE taste items), then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-74-plan.md`](docs/cycle-74-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 73 (`feel-and-media-live`) is CLOSED (2026-06-08).** Run autonomously (Matt: "complete 73 autonomously and take the recordings and shots without me in the loop"). No `shared/` sim change; sim-baselines byte-identical; `tuning.js` untouched.

- **The flagship's beauty media is WebGPU-gated.** Captured 24 hero stills + a flythrough in a real GPU browser. Newsheepdogland's `HosekWilkieSkyDome` and water shader are WebGPU-only (konveyor node materials); on the WebGL pin they render as a dark dome + dark-speckled sea. Only tight ground-level pastoral framings read cleanly. So the dramatic hero + cinematic are blocked until the pin lifts. The shipped hero webp is KEPT (no clearly-better WebGL alternative); candidates + recipe in `cycle73-validation/`.
- **The 5-cycle-blocked `multiplayer.md` correction landed.** Matt's "correcting drift" directive lifted the agent-config guardrail. The migrations section now matches `deploy.yml`'s `migrate` job; the Auth line now matches P-SEC-1 (server-minted id + device `auth_secret` TOFU). Reality-checked against source.
- **Repo cleaned.** 3 merged local branches + 1 stale remote branch deleted; repo is `main` only, local and remote.
- **Survival feel reaffirmed, not retuned.** The Cycle 70 lever order still stands against unchanged constants; the LIVE retune stays Matt's (taste, needs a live wolf night).

Validation: `npm test` 1135 pass; `npm run lint` clean; `npm run build` clean. No `js/`/bundle change (docs + tools + rule file only). No player-visible change shipped this cycle.

## What To Pick Up Next

Cycle 74 is a STUB. Decide the focus with Matt (do not do both), then `/cycle-start`:

1. **webgpu-compile-reduction (autonomous spike):** cut the ~83-95s cold WebGPU compile on Newsheepdogland so the WebGL pin lifts. Cycle 73 raised the stakes: lifting the pin unblocks the flagship's marketing media too, not just load-time. Approaches: simplify the heavy grass/terrain/water shaders, or warm the Dawn pipeline cache at build time. Evidence base: `cycle72-validation/webgpu-cold-compile/` + `cycle73-validation/README.md`. High effort, uncertain payoff.
2. **feel-and-media-live LIVE items (paired, Matt's hands):** the survival feel LIVE retune, the two-dog co-op fun playtest, and the entrance hero FINAL blessing (pick from the Cycle 73 candidate set, or re-shoot once WebGPU lands).

## Open Carryover (deferred)

- The two Cycle 74 candidate threads above.
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the cycle explicitly scopes one with the four-piece migration story; the survival sim-baselines + every sim-baseline stay byte-identical otherwise.
- Don't remove the Newsheepdogland WebGL pin unless a within-budget WebGPU cold compile is actually verified on the RTX 3070 (the Cycle 72/73 hard stop carries forward; removing it is the live-crash class again).
- Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop the dev server after a probe.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-74-plan.md`](docs/cycle-74-plan.md) |
| Media WebGPU-gating finding | `cycle73-validation/README.md` (gitignored) + capture recipes `tools/hero-capture-cycle73.mjs`, `tools/flythrough-cycle73.mjs` |
| WebGPU cold-compile evidence | `cycle72-validation/webgpu-cold-compile/` (gitignored) |
| The WebGL pin (and why it stays) | [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) (`renderer:'webgl'`) + [`DECISIONS.md`](DECISIONS.md) Cycle 72 entry |
| Worker/MP contract (corrected) | [`.claude/rules/multiplayer.md`](.claude/rules/multiplayer.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-73-plan.md`](docs/archive/cycles/cycle-73-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
