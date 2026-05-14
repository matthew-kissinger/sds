# Konveyor Autonomous Run

> Active handoff for the experimental SDS WebGPU, optimization, and native
> shipping campaign. This is not a normal numbered cycle. It is the branch-level
> operating brief for autonomous work on `exp/konveyor-webgpu-migration`.

## Branch

Work on:

```bash
git switch exp/konveyor-webgpu-migration
```

Do not run the full Konveyor campaign on `main`. Keep `main` available for
ordinary site fixes, releases, and paired production work.

## Objective

Carry SDS from its current WebGL-first implementation toward the destination in
[`konveyor-sds.md`](konveyor-sds.md): WebGPU-first rendering, recovered
performance headroom, and a native packaging path for desktop and mobile, while
preserving game feel, visual identity, deterministic multiplayer, and the
single git tree.

This run should continue autonomously through ordinary blockers. Do not stop
because a phase boundary was reached. Do not stop because a prior cycle plan
ended. Stop only for the hard stops below or when the campaign objective is
actually complete.

## Current proof packet

Cycle 36 completed the foundation pass and is now evidence, not the active
control surface:

- [`cycle-36-plan.md`](cycle-36-plan.md) records the foundation closeout.
- [`archive/research/cycle-36-konveyor-runtime-proof.md`](archive/research/cycle-36-konveyor-runtime-proof.md)
  records current runtime and native-shell facts.
- [`archive/research/cycle-36-webgpu-hero-blocker.md`](archive/research/cycle-36-webgpu-hero-blocker.md)
  records why Rolling Hills production rendering should not be the first
  WebGPU boot target.
- [`../tools/probe-webgpu-runtime.mjs`](../tools/probe-webgpu-runtime.mjs)
  probes browser WebGPU adapter/device creation.
- [`../progress.md`](../progress.md) records the completed foundation steps.

The important conclusion: installed Chrome 148 can create a WebGPU device on
the current Windows machine, but Playwright's bundled Chromium 147 exposes
WebGPU and fails `requestDevice()`. Device creation is the gate.

Native-readiness now has a code seam:

- `BUILD_TARGET=native npm run build` builds with relative asset paths and
  service-worker registration disabled.
- `SDS_WORKER_BASE=<origin>` can override the live worker origin at build time.
- `js/runtimeConfig.js` owns Worker HTTP origin, Worker WebSocket origin, and
  telemetry enablement.
- `npm run native:check` builds the native target and verifies the generated
  bundle with `tools/native-preflight.mjs`.

## Next autonomous direction

The next agent should not try to boot Rolling Hills through WebGPU first. The
honest next step is to create a tiny, isolated WebGPU/TSL island that proves the
renderer path, then expand compatibility one material system at a time.

Recommended order:

1. **Commit the foundation and native-readiness packet on this experimental branch.** Review the
   dirty worktree, keep unrelated `.agents/skills/*` folders out of the commit,
   run the web and native checks, then commit the Cycle 36 proof, docs, and
   native build seam so later agents have a stable base.
2. **Establish a WebGPU diagnostic boot path.** Add a route or query-driven
   diagnostic scene that renders a minimal WebGPU-compatible Three scene without
   touching production Rolling Hills shaders. Keep WebGL default.
3. **Build a shader-surface inventory.** Turn the blocker report into a
   migration map of every GLSL `ShaderMaterial`, `RawShaderMaterial`, and
   `onBeforeCompile` patch, with risk, dependencies, visual gate, and likely
   WebGPU/TSL replacement approach.
4. **Pick the smallest production-adjacent material island.** Prefer cosmetic
   or isolated systems first. Do not start with terrain + grass + water + sky
   all at once.
5. **Keep measurement attached to every change.** Run the relevant perf,
   latency, screenshot, test, lint, and build gates before claiming progress.
6. **Advance through the Konveyor phase outline.** Keep moving from diagnostic
   WebGPU to cosmetic shader compatibility, trees, grass, sheep/high-count
   rendering, compute experiments, native packaging, and web fallback/release
   decisions as evidence allows.

## Hard stops

Stop and surface only when one of these happens:

- A change requires a frozen file in `docs/INTERFACE_FENCE.md` without explicit
  authorization.
- `tests/sim-baseline/__fixtures__` drift unexpectedly.
- The validation or perf harness is broken and cannot be routed around.
- A required native or WebGPU platform claim contradicts current official docs
  or local probe results.
- The work requires paid-store submission, production deployment, credential
  rotation, destructive D1 changes, or a public release decision.
- The campaign objective is actually complete.

Everything else is normal engineering work. Record the blocker, choose the next
safe route, and keep moving.

## Non-negotiables

- WebGL stays the default until the campaign records a fallback decision.
- WebGPU work stays feature-flagged or diagnostic until gates pass.
- Native build-target plumbing may advance without choosing Tauri, Electron, or
  Capacitor. Shell dependencies still require a scoped proof step.
- No `shared/**` deterministic sim changes without explicit operator
  authorization.
- No sim-baseline or screenshot-golden regeneration as a shortcut.
- No render-backend abstraction layer for hypothetical engines.
- No broad shader rewrite hidden behind "boot the hero scene."
- No Steam, App Store, Google Play, or production deploy action without an
  explicit user request.

## Fresh-agent goal

Use this exact goal for the next autonomous run:

```text
/goal On branch exp/konveyor-webgpu-migration, continue the SDS Konveyor autonomous campaign from docs/konveyor-autonomous-run.md and docs/konveyor-sds.md until the full objective is reached or a documented hard stop is hit. Treat docs/cycle-36-plan.md as completed foundation evidence, not the active stopping point. First stabilize and commit the foundation/native-readiness packet on the experimental branch while excluding unrelated .agents/skills folders and verifying npm test, npm run lint, npm run build, and npm run native:check. Then build a minimal WebGPU/TSL diagnostic boot path instead of forcing Rolling Hills through WebGPU, inventory and migrate shader/material systems incrementally, keep WebGL default and all WebGPU work flag-gated, preserve deterministic shared sim and multiplayer contracts, run the relevant perf/latency/visual/test/build/native gates before claiming progress, and keep moving through optimization, native packaging proof, and web fallback decisions without stopping at cycle boundaries.
```
