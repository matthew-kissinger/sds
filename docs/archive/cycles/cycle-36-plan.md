# Cycle 36 - Konveyor Phase 0 Readiness

> Scoped 2026-05-14 from [`konveyor-sds.md`](konveyor-sds.md). Cold-start
> agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md), then
> [`konveyor-sds.md`](konveyor-sds.md), then this plan top-to-bottom. Prior
> cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Make SDS ready for a WebGPU and native-shipping campaign by repairing the
measurement loop, reconciling validation gates with actual tooling, proving the
native runtime assumptions, and opening only the smallest flag-gated WebGPU
hero-scene path that the evidence supports. After this cycle, a renderer
migration should have trustworthy numbers and a known platform target instead
of a stack of assumptions.

## How to read this plan

This is Konveyor Phase 0 only. It is not the tree rewrite, grass rewrite, sheep
compute path, native packaging build-out, Steam release, or WebGL fallback
decision. Those remain later Konveyor phases after measurement and runtime proof
are trustworthy.

## Open questions to resolve before renderer code

1. **Q1: Which desktop shell is the right target?** Author lean: Tauri 2 if
   Windows WebView2, macOS WebKit, and Linux WebKitGTK prove WebGPU and SDS
   behavior cleanly; Electron if SDS needs a bundled Chromium engine.
2. **Q2: How will mobile latency be enforced?** Author lean: keep the local
   desktop script, then add either a BrowserStack-backed or documented real
   device flow for the mobile p99 <= 50 ms gate.
3. **Q3: What is the WebGPU fallback rule during the cycle?** Author lean:
   WebGL stays default; `?renderer=webgpu` is explicit opt-in and must fail
   closed without breaking normal play.

## Architecture / shared changes

No deterministic sim changes are authorized. No `shared/**` module changes, no
sim-baseline fixture regeneration, and no Worker migration edits are in scope.

Renderer work, if any, stays under client boot/rendering code and behind an
explicit runtime flag.

## Phase 1 - Perf baseline repair

The existing baseline is not actionable because most configs time out. Repair
the harness before making optimization claims.

**Acceptance (EARS):**

- When `npm run perf:baseline` runs against the local dev server, then
  `tests/perf-baseline/baseline.json` shall contain all six default configs with
  `ok: true`.
- When a perf config succeeds, then its summary shall include `sampleCount`,
  `avgFrameTime`, `p95FrameTime`, `p99FrameTime`, `avgDrawCalls`,
  `avgTriangles`, and `avgActiveSheep`.
- If a config times out, then the phase shall fix the harness or the app entry
  flow before any renderer migration code is attempted.

**Status 2026-05-14:** Complete. `npm run perf:baseline` now completes all six
default configs with `ok: true` and 900 samples each in
[`tests/perf-baseline/baseline.json`](../tests/perf-baseline/baseline.json).
The fix was harness/app-entry repair, not renderer work.

## Phase 2 - Validation gate reconciliation

Make the campaign gates match the actual repo tools.

**Acceptance (EARS):**

- When `npm run validation:screenshots -- --diff` runs, then the threshold
  enforced by `tools/validation/screenshot-golden.mjs` shall match the
  threshold documented in `docs/konveyor-sds.md`.
- When `npm run validation:latency` runs, then the desktop p99 <= 33 ms target
  shall remain enforced.
- When the mobile p99 <= 50 ms target is documented, then the doc shall name
  the exact executable path or external device flow that enforces it.
- If a visual or latency threshold is changed, then the cycle shall record the
  reason in this plan or `DECISIONS.md`.

**Status 2026-05-14:** Latency enforcement is reconciled. `npm run
validation:latency` enforces desktop p99 <= 33 ms, and `npm run
validation:latency:mobile` now enforces mobile-profile p99 <= 50 ms through
[`tools/validation/input-latency.mjs`](../tools/validation/input-latency.mjs).

Screenshot enforcement is repaired but blocked by missing goldens:
`npm run validation:screenshots -- --diff` now fails when any of the 12 expected
cells are absent instead of falsely passing an empty matrix. Current result:
12/12 goldens missing in
[`cycle25-validation/phaseA/screenshots/diff-summary.json`](../cycle25-validation/phaseA/screenshots/diff-summary.json).
No screenshot goldens were regenerated.

## Phase 3 - Runtime and native platform proof

Do not choose native packaging from vibes. Prove the WebGPU/runtime surface.

**Acceptance (EARS):**

- When Phase 3 ships, then `docs/archive/research/cycle-36-konveyor-runtime-proof.md`
  shall record current official-source facts for Tauri, Electron, Capacitor,
  WebView2, WKWebView, Android WebView, and Safari/WebKit WebGPU.
- When the runtime proof is recorded, then `DECISIONS.md` shall state whether
  Tauri remains the preferred desktop shell, Electron is preferred, or the
  decision is explicitly deferred with named blockers.
- When native assumptions are listed, then each assumption shall have either a
  local probe result, an official-doc citation, or a named not-yet-proven gap.
- If adding Tauri, Electron, or Capacitor dependencies becomes necessary, then
  the phase shall record bundle/install impact before committing the dependency.

**Status 2026-05-14:** Complete without adding native dependencies. Runtime
proof is recorded in
[`archive/research/cycle-36-konveyor-runtime-proof.md`](archive/research/cycle-36-konveyor-runtime-proof.md),
and `DECISIONS.md` explicitly defers the desktop shell choice with named
blockers.

## Phase 4 - WebGPU hero-scene spike

Open the renderer path only after Phases 1-3 give it a stable target.

**Acceptance (EARS):**

- When SDS loads without query params, then WebGL shall remain the default
  renderer.
- When SDS loads with `?renderer=webgpu&scene=rolling-hills` in a supported
  browser, then it shall either boot the Rolling Hills scene through the WebGPU
  path or produce a blocker report naming the exact Three.js, shader, or runtime
  constraint that prevents boot.
- If WebGPU is unsupported, then the app shall fail closed to WebGL or a clear
  unsupported-renderer state without breaking default play.
- When Phase 4 changes client imports or renderer boot code, then `npm test`,
  `npm run lint`, and `npm run build` shall pass before cycle close.

**Status 2026-05-14:** Hard-stopped before renderer boot code. The blocker
report is
[`archive/research/cycle-36-webgpu-hero-blocker.md`](archive/research/cycle-36-webgpu-hero-blocker.md).
Rolling Hills depends on broad GLSL `ShaderMaterial` and `onBeforeCompile`
surfaces, so booting it through WebGPU would require the shader rewrite this
cycle explicitly forbids. WebGL remains the default renderer.

## Dependencies

Phase 1 gates Phase 2 and Phase 4. Phase 3 gates any native-shell commitment.
Phase 4 must not start until the perf and validation gates are trustworthy
enough to evaluate a renderer change.

```
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4
```

## Frozen files

Durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) applies. Cycle 36
adds explicit non-authorization for:

- `shared/**`
- `tests/sim-baseline/__fixtures__/*.json`
- `worker/migrations/*.sql`

If the work appears to require any of these, stop and surface a fence-block note.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)).
Cycle-specific additions:

1. If the perf harness cannot be made to produce usable six-config output, stop
   before renderer migration code.
2. If the WebGPU spike requires a broad shader rewrite to boot Rolling Hills,
   stop and write the blocker report instead of expanding scope.
3. If runtime proof contradicts a native assumption in `docs/konveyor-sds.md`,
   update the doctrine and `DECISIONS.md` before implementation continues.
4. If `npm test` produces any sim-baseline diff, stop immediately.

## What NOT to do during this cycle

- Do not port grass, trees, sheep, water, atmosphere, or impostors to TSL as
  production work.
- Do not introduce a render-backend abstraction layer.
- Do not add native packaging skeletons unless Phase 3 proves they are needed
  for runtime proof.
- Do not regenerate screenshot goldens or sim-baseline fixtures as a shortcut.
- Do not change multiplayer protocol or Worker room behavior.
- Do not start Steam, App Store, or Google Play release prep.

## Success criteria (cycle close)

- [x] When the cycle closes, `docs/konveyor-sds.md` shall be linked from
  `NEXT_SESSION.md`, `docs/README.md`, and `DECISIONS.md`.
- [x] When `npm run perf:baseline` runs, all six default configs shall complete
  with usable summaries or the cycle shall contain an explicit blocker report.
- [x] When validation docs are read, screenshot and latency thresholds shall
  match the actual scripts or name the unimplemented enforcement gap.
- [x] When runtime proof is read, native shell assumptions shall be sourced and
  current, not inferred from prior memory.
- [x] When the cycle closes, WebGL shall remain the default renderer.
- [x] When `npm test` runs at cycle close, all vitest specs shall pass.
- [x] When `npm run lint` runs at cycle close, `eslint shared/` shall be clean.
- [x] When `npm run build` runs at cycle close, production build shall be clean
  and `mainKB` shall not regress by more than 5KB vs Cycle 35's 590.33.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall
  succeed via GH Actions.

Closeout local validation on 2026-05-14:

- `npm test`: 308 passed, 7 skipped.
- `npm run lint`: passed.
- `npm run build`: passed, `main` chunk 590.65 KB, +0.32 KB vs Cycle 35.
- `npm run validation:latency`: passed, desktop p99 27.20 ms.
- `npm run validation:latency:mobile`: passed, mobile-profile p99 17.80 ms.
- `npm run validation:perf`: passed as informational gate, p99 16.69 ms after
  3000 ms warmup.
- `npm run validation:screenshots -- --diff`: failed as intended on 12/12
  missing goldens.

## Post-foundation redirect

Matt redirected Konveyor after this foundation pass into a full autonomous run
on `exp/konveyor-webgpu-migration`. This plan is now completed evidence. The
active branch-level handoff is
[`konveyor-autonomous-run.md`](konveyor-autonomous-run.md).

Later branch evidence has moved beyond this foundation cycle. As of 2026-05-15,
the branch has a guarded production WebGPU boot scout at
[`../cycle36-validation/runtime/production-webgpu-boot-scout.json`](../cycle36-validation/runtime/production-webgpu-boot-scout.json):
it proves the normal `main.js` entry can construct `SheepDogSimulation` with
injected WebGPU `SceneManager` options under
`?renderer=webgpu&diagnostic=1&konveyorProductionBootScout=1&testNoCanvas=1`,
and with `konveyorProductionSceneBody=1` it runs Home Field scene-body init once
and renders a nonblank WebGPU frame for terrain, grass, atmosphere/cloud, and
sheep. The later guarded proof also enables `konveyorNativeInstancing=1` and
`konveyorProductionLoopScout=1`, renders production tree/rock placement through
native `THREE.InstancedMesh`, records no suppressed `InstancedMesh2` objects,
and advances 12 controlled async WebGPU frames through
`SheepDogSimulation.runFrame(deltaTime)` with grass time moving from 0 to 0.2,
`sharedFrameStep: true`, and no frame, console, or page errors. It now also
records a bounded 12-frame `requestAnimationFrame` scout through the same shared
frame step with monotonic timestamps, grass time advancing from 0.2 to 0.3347,
and no frame, console, or page errors. That remains guarded scene-loop evidence
only; this foundation plan still does not authorize default production WebGPU
boot.

Later branch evidence also adds
[`../cycle36-validation/runtime/production-webgpu-gameplay-scout.json`](../cycle36-validation/runtime/production-webgpu-gameplay-scout.json):
the same diagnostic production WebGPU route runs without `testNoCanvas=1`,
autostarts solo Classic play through the normal constructor `init()` plus
`animate()` path, advances `performanceFrameCount` from 6 to 68, records a
60-frame normal-loop timing sample (`avgMs: 11.64`, `p95Ms: 14.9`,
`p99Ms/maxMs: 53.6` from an initial warmup spike), creates the player dog plus
200 sheep, and records no init, console, or page errors. This is still guarded
scout evidence, not a perf threshold gate or default renderer enablement.
Follow-up scene-matrix evidence now covers Rolling Hills and Open Country with
the same guarded gameplay-start route. Open Country legitimately places zero
rocks after island filtering, so the native-rock gate accepts
`emptyPlacement: true` instead of requiring a mesh group.

Post-foundation update 2026-05-15: the autonomous branch repaired the screenshot
baseline blocker recorded above. `tools/validation/golden/` now contains the
initial 12-cell deterministic Konveyor goldens, and
`npm run validation:screenshots -- --diff` passed with no missing cells. The
latest gameplay-scout validation run passed 12/12 with mean SSIM 0.9945007926542798 after
starting Vite with `SDS_SUPPRESS_BROWSER_OPEN=1` to avoid automation-created
Chrome tabs.

Post-foundation renderer update 2026-05-15: production renderer setup moved out
of the `SceneManager` constructor into `js/rendering/sceneRendererSetup.js`.
The default renderer remains WebGL, but the WebGL-only setup assumptions are now
guarded and test-covered, and proof runs can inject an explicit renderer factory
before any later scene-bound WebGPU proof.

Post-foundation WebGPU proof update 2026-05-15:
`cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json` records
installed Chrome injecting `WebGPURenderer` into production `SceneManager` under
`?renderer=webgpu&diagnostic=1&konveyorSceneManagerProof=1`, rendering through
`SceneManager.whenRendererReady()` and `SceneManager.render()` with the async
WebGPU render path, routing production
`Atmosphere` sky/cloud/fog constructors through WebGPU node-material factories
and routing production `SunBillboard`, `TerrainBuilder.createTerrain()`, and
`AnimeWater.createAnimeWater()` construction plus representative
`PortalEffect`, `CorralZapEffectPool`, tree/rock GLB
material-replacement/native-instancing, `GrassSystem`, and
`OptimizedSheepSystem` construction plus a representative Kiln impostor
material/geometry slice through the diagnostic-installed
`window.__sdsKonveyor*MaterialFactories` WebGPU supply on the `SceneManager`
scene, then rendering a nonblank 320x180 proof frame with a
visible compact tree/rock/sheep/Kiln/terrain/water/grass/effects slice. The proof
adds WebGPU-module lights
only inside the diagnostic harness because the injected renderer uses the
vendored WebGPU Three module. This is still diagnostic proof, not default
production WebGPU boot.

Post-foundation gameplay parity update 2026-05-16:
`cycle36-validation/runtime/production-gameplay-parity-proof.json` records
Field, Rolling Hills, and Open Country production WebGL versus guarded
production WebGPU captures with `ok: true` and `defaultReady: true`.
Default-readiness is now based on capture/runtime gates plus semantic regional
sky/horizon/ground chroma and ground-luma checks; full-frame SSIM remains an
advisory diagnostic because alpha-hashed foliage and grass are structurally
different across renderers. The same proof records the Rolling Hills terrain
repair (`camera.aboveSurface: 12`, sheep `matrixSurfaceAbsMax: 0`,
`belowWaterMatrices: 0`). The Chromium scene-swap e2e passes after the frame
clock reset and 0.05s client delta cap, which prevents rebuild stalls from
throwing a fresh flock to an island boundary.

Post-foundation production request update 2026-05-16:
`cycle36-validation/runtime/production-webgpu-request-proof.json` records Field,
Rolling Hills, and Open Country running at
plain `?renderer=webgpu&autostart=1&mode=classic` with
`effective: "webgpu-production"`, no fallback, centralized WebGPU factory
application, native `THREE.InstancedMesh` tree/rock placement, nonblank
screenshots, and no console/page errors. The same manifest confirms the default
URL stays WebGL with no fallback and proves a simulated no-`navigator.gpu`
browser fails closed to WebGL with `fallbackReason: "webgpu-unavailable"` plus
a simulated `requestDevice()` failure falls back to WebGL with
`fallbackReason: "webgpu-device-request-failed"`.

Post-foundation production WebGPU perf update 2026-05-16:
`cycle36-validation/runtime/production-webgpu-perf-proof.json` records the same
explicit production WebGPU route after 5000 ms scene warmup and a perf-harness
reset. Field, Rolling Hills, and Open Country each pass the local desktop budget
of average <= 22 ms, p95 <= 30 ms, and at least 240 samples over an 8000 ms
window. Latest installed-Chrome proof after explicit device preflight captured
Field `avgFrameTime=6.956 ms`, `p95=7.067 ms`; Rolling Hills
`avgFrameTime=6.944 ms`, `p95=6.952 ms`; Open Country
`avgFrameTime=6.944 ms`, `p95=6.952 ms`.

Post-foundation multiplayer WebGPU update 2026-05-16:
`cycle36-validation/runtime/production-webgpu-mp-proof.json` captures a real
two-client host/guest room against local Vite + Wrangler without `testNoCanvas`.
Both clients reach `roomState: "in-game"` and `effective: "webgpu-production"`,
render nonblank canvases for room scene `field`, and record clean console/page
state. The proof closed the host scene-sync gap and now refreshes production
WebGPU state after in-process scene rebuilds.

## References

- [`konveyor-autonomous-run.md`](konveyor-autonomous-run.md) - active autonomous branch handoff
- [`konveyor-sds.md`](konveyor-sds.md) - campaign doctrine
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - cycle plan template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) - pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
- [`docs/archive/cycles/cycle-35-plan.md`](archive/cycles/cycle-35-plan.md) - prior cycle
