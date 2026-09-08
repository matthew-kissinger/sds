# Performance investigation — 2026-09-07

Scope: stabilize the current solo game and its 25/75/200 flock configurations.
Multiplayer, increased flock limits and future modes are outside this change.

## Readiness measurement and variable shader completion

Controlled follow-up first-use-1788835536473 alternates five pairs of the same
artifact with the optional parallel-compile extension present/unavailable in
tools only. Normal readiness is 2002.1–4662.9 ms; unavailable is 1428.4–1634 ms.
All ten fields render and hashes remain stable. Blocking LINK_STATUS calls cost
275–295.2 ms cumulatively without the extension versus 65.8–72.8 ms normally;
the alternative avoids the long completion-poll waits in this sample. Boot
Long Task maxima are also lower in the alternate set, but this is one browser,
GPU and diagnostic setup. The normal worst first run remains in the evidence.
Three exposes no parallel-compile constructor policy in the installed types;
no backend-field mutation or browser API override has been shipped. Loading
remains open pending a supported solution and device validation.

Follow-up first-use-1788835317817 traces existing WebGL2 compile/link/completion
calls. Two slow boots each contain a different program with completion false
until 819.4–820.5 ms after link, across 100 short polls (at most 0.1 ms per call).
Three faster boots have maximum program waits of 23.8–38.1 ms. Three awaits
pipelines sequentially during scene compilation, so these waits extend boot.
This establishes where the loading delay occurs, not the underlying browser or
driver cause. No runtime workaround was introduced. All five artifacts stayed
stable and nonblank; first-bark maxima were 16.7–25 ms, with no page errors.

The first-use probe now records readiness through an in-browser MutationObserver
instead of automation polling, retaining the latter as automationObservedReady.
Five unprofiled WebGL2 High/200 runs of index-D7vhFZIt.js show 109–331.7 ms polling
delay, with actual readiness 1895.3–2963.8 ms; four miss the 2-second target.
Receipt: first-use-1788835114878. Existing hub-presentation ready timings already
used the browser observer and need no correction.

The preceding five CPU profiles (first-use-1788834970631) show two scene-compile
stages around 1.58 seconds versus 0.74–0.77 seconds. Most additional sampled time
is idle, consistent with waiting rather than extra JS work. Three's installed
WebGLBackend awaits asynchronous shader completion by polling via rAF. Further
browser/driver tracing is needed to attribute that wait. Both trial sets have
first-bark maxima 16.7–25.1 ms and stable nonblank fields, but do not reproduce or
resolve the previous 66.7 ms first-bark outlier. CPU sampling is diagnostic;
tools/summarize-cpu-boot.mjs reports stage attribution, not GPU duration.

## Touch pause/resume regression

A production two-touch probe reproduced movement and sprint sticking after
pause removed the captured controls. Releasing touch state in a layout effect
when controls leave active play fixes the failing scenario. On isolated build
index-D9FFqgY3.js, pause and immediate resume positions match; normal stopping
inertia then settles, position stays fixed and stamina recovers. The artifact
remained stable and recorded no page errors. Receipt:
captures/stability/touch-interruption/report.json; prior failure: before.json.
This is desktop touch emulation with Escape pause, not physical-mobile evidence.

## First presented-frame loading cost

The current-build quiet-hub CPU trace first-use-1788833579136 includes
Performance.NavigationStart to align CPU sample timestamps with boot marks.
Between scene shaders ready (2,057.4 ms) and presented ready (2,202 ms), sampled
self time includes 61.4 ms in _completeCompile under BloomNode.updateBefore,
plus 3.2 ms under the final output render path. Shader/material setup also
appears in that window. This is measured postprocess initialization before Play,
not attribution of the intermittent bark hitch. The installed Three
RenderPipeline has no public async compile/prepare method; do not access its
private quad or weaken scene-ready gating to hide this cost. Profile sampling
adds overhead, so retain the unprofiled loading receipts as the acceptance data.

## Extended run and 1440p coverage

The 1,802.7-second WebGPU High/200 soak on index-CZ45C4un.js completed 30 menu /
quality-remount cycles and six restarts with 37 nonblank checkpoints. Equivalent
post-menu DOM/listener counts returned to 821/215. Heap snapshots fluctuated and
did not show sustained growth; this does not prove GPU/audio resource release.
Per-checkpoint p95 <=8.4 ms and p99 <=8.5 ms; retain clear 49.9 and 41.7 ms frame
outliers plus three numerical-edge 33.4 ms values. Final receipt:
captures/stability/hub-receipts/first-use-1788831175580/.

Current index-C3zxvAzp.js subsequently passed 60-second frame-budget routes at
an actual 2560x1440 canvas on both backends, while keeping the native window
inside the hub display. Both p95/p99 values were 8.4 ms; WebGPU max 33.4 ms and
WebGL2 max 25 ms. Final-window draws were 40 each. One WebGPU load was 1,978.5 ms;
WebGL2 was 2,128.3 ms and failed startup. Neither one load nor this steady route
closes intermittent first-use or cross-device acceptance. See
webgpu-hidpi-1788833133146 and webgl2-hidpi-1788833260182 in the hub-receipts folder.

## Current-build quiet-hub revalidation

On index-CZ45C4un.js, ten High trials (five per backend) passed build identity,
backend, CPU/GPU preflight and 50 post-input/camera/resize nonblank checks.
Sampled native hub images show normal Follow and Classic framing. This narrows
the platform evidence without resolving first-frame Windows/mobile blanks:
screenshots occur after the timed input route, and Playwright retains default
focus emulation. Receipt: first-use-1788829329168 under captures/stability/hub-receipts/.

| Current High, 200 sheep, 1440x900 | WebGPU | WebGL2 |
| --- | --- | --- |
| Ready, five fresh browsers | 2,128–2,161 ms | 2,063–2,098 ms |
| First bark event-window maximum | 16.6–25.1 ms | 16.7–66.7 ms |
| Early movement maximum | 25–33.4 ms | 24.9–33.4 ms |

The 66.7 ms first WebGL2 trial is a retained failure signal; subsequent four
trials were 16.7 ms. No baseline comparison was run in this validation, so it
does not establish a regression caused by the HUD change. Five additional CPU
profile runs did not reproduce it (16.7–33.3 ms first bark, no bark Long Task).
Their 56–315 ms Long Tasks occurred during loading. Keep instrumentation timing
separate from baseline timing; do not infer GPU causation from absent Long Tasks.
Diagnostic receipt: first-use-1788830792531. Optional CPU-clock metrics were
added to the tool afterward for more precise future profile/event alignment;
these five existing profiles do not contain that mapping.

## Owner-requested control-label separation

The desktop reminder now has bordered keycaps, a distinct tokened key typeface,
8 px key-to-label gaps and 20 px action-group gaps. The compact warm strip stays
hidden on coarse pointers and during menus. Production default/remapped desktop
and portrait touch screenshots pass separate critical review. Current artifact
index-CZ45C4un.js passes lint, build, 737 tests and release probe. No timing claim
is inferred from this UI-only correction.

Native startup follow-up: native-visible-startup-1 recorded six nonblank WebGPU
images, but later states were hidden and camera transitions had not settled.
native-visible-startup-2 adds a visibility/focus gate and failure-state capture;
its initial field rendered, then it failed on hidden visibility. This is useful
evidence of foreground interference, not proof of the historical blank-scene
cause. Use an uninterrupted foreground lane for the next native comparison.

## Keyboard ownership and genuine focus recovery

The latest candidate, index-Cvb_JT-9.js, prevents gameplay keydown from stealing
text/select editing or native Space/Enter button activation. Keyup and blur
release remain unconditional. Persistent touch-button focus still allows W/C;
Bark and Camera accept detail-zero keyboard/assistive clicks alongside their
existing pointerdown path. Sprint's touch button still needs a keyboard hold
path before claiming all touch buttons support keyboard activation.

Six focused regression tests and the full 737-test suite pass. The production
native-focus probe passes name typing, select editing, Escape, Space activation
of Play/Pause/Resume, camera handoff and releasing held movement/sprint after a
real tab change without keyup in the game. See
captures/stability/keyboard-recovery/report.json for blur/visibility events and
camera recovery samples. Touch emulation screenshots show Space on Camera
switching to Follow and C returning to Classic; they do not prove exact action
counts, physical touch behavior or timing performance.

Harness correction: standard Playwright enables focus emulation, so bringing
another tab forward did not deliver the blur/visibility events required by the
test. The corrected probe launches a visible native Chrome and attaches over
CDP with noDefaults. A hidden native window also suppressed useful frame
progress. These failures were test artifacts, not evidence of stuck game input.
Revalidate intermittent blank rendering under this native setup before assigning
a cause; the separate blank-rendering gate remains open. Local PC functional
evidence remains separate from quiet-hub timing evidence.

## Latest controlled High comparison and desktop hint

The owner confirmed a concurrent PC Chrome web game and other agents. PC timings
must not certify performance. The hub is the timing lane; every new first-use
trial requires two consecutive samples with GPU <=5% and aggregate CPU <=15%.
Preflight showed no competing Chrome process, 0% GPU and low system load. The
twenty-run comparison completed with stable artifacts, matching backends and no
browser/request failures. OS/driver caches remain intact, so fresh browser
profiles do not imply cold driver caches.

High scene submission now uses an owned render target and texture node rather
than a nested PassNode. `renderHighScene` matches compile-time target, MRT, tone
mapping and working color space at top-level render depth, and restores state
in finally before the same bloom/grade chain. Independent review supports the
public-API design and sampled visuals. A local shader trace records zero new
programs during first bark; WebGPU synchronous pipeline creations drop 27 ->12.
These are structural diagnostics, not uncontended PC timing claims.

Hub five alternating pairs per backend, 200 sheep, 1440x900, High:

| Measurement | BIRd17K_ baseline | BTo1IfeC candidate |
| --- | --- | --- |
| WebGL2 first-bark maximum across each event window | 25–41.7 ms | 16.7–25.1 ms |
| WebGPU first bark | about 16.7 ms | about 16.7 ms |
| WebGL2 ready | 2,100–3,085 ms | 2,074–4,294 ms |
| WebGPU ready | 2,094–2,790 ms | 2,116–2,201 ms |

The 4,294 ms first WebGL2 candidate load is retained as an unresolved result,
not discarded as warmup. Loading remains failed; the smaller first-use gap does
not establish a net cold-start improvement. Receipt and sampled native captures:
`captures/stability/hub-receipts/first-use-1788826866432/`. The hub has no probe
browser left and returned to 0% GPU utilization afterward.

The explicit target retains the cleanup fix: new
`explicit-scene-lifecycle-{gpu,gl}` five-cycle probes have flat Low resource
counts, correct tiers/backends, no errors and eleven visible captures each.
Intermittent earlier blank output remains unresolved despite these passing runs.

The user-requested desktop hint is a binding-aware bottom-left row: movement,
bark, sprint, camera and pause. It is hidden during menus and on touch layouts.
`desktop-controls-probe.mjs` verifies normal labels, Q/F remapping, pause hiding
and mobile emulation retaining its camera button; independent visual review
supports the calm layout. This is not physical-mobile acceptance.

Current candidate passes 97 files / 731 tests, lint, build/client typecheck and
release probe. Initial JS gzip 623,591 bytes; estimated transfer 6,704,463 bytes.

## Quality-switch resource leak — confirmed and corrected

`HighPostProcessing` disposed only RenderPipeline's final quad material when
returning to Low. Its scene pass and bloom node own separate render targets.
The candidate now retains the bloom node and disposes all three owned objects.
Independent code review found no shared scene-asset disposal or double ownership.

Production headed Chrome, 1440x900, 200 sheep, five normal Settings High/Low
cycles measured actual create/delete/destroy calls. No application debug globals
were added. Resource wrappers use WeakSets so instrumentation does not retain
the resources it measures. Counts at equivalent Low checkpoints:

| Backend/resource | Before fix, cycles 1–5 | After fix, cycles 1–5 |
| --- | --- | --- |
| WebGL2 textures | 19, 32, 45, 58, 71 | 6, 6, 6, 6, 6 |
| WebGL2 framebuffers | 15, 28, 41, 54, 67 | 2, 2, 2, 2, 2 |
| WebGL2 renderbuffers | 4, 6, 8, 10, 12 | 2, 2, 2, 2, 2 |
| WebGPU textures | 23, 37, 51, 65, 79 | 9, 9, 9, 9, 9 |

Receipts: `captures/stability/quality-lifecycle-{before,after}-{gl,gpu}/`.
All requested backends/tiers matched, artifact hashes stayed stable and no console
errors occurred. After-fix WebGL2 passes all eleven visible captures; independent
screenshot review supports correct High remounts and return to Low. WebGPU has
the same blank initial Low capture before and after this fix, followed by ten
visible captures after switching quality. Its aggregate visual probe correctly
remains failed; stable resource counts do not resolve startup rendering.
Independent WebGPU review also found no corruption in the first/fifth High and
fifth Low captures, supporting only the sampled post-switch behavior.

This proves explicit resource release and stable measured counts across the
sampled cycles, not immediate driver-memory reclamation or a 30-minute soak.
WebGPU retains one additional texture after its first quality cycle, then stays
flat; the recurring growth is eliminated, without claiming every cache is gone.
The regression tool asserts requested backend/tier, valid positive counters,
eleven captures, no later Low-checkpoint growth and unchanged built artifacts.

Candidate `index-BIRd17K_.js`: 96 files / 729 tests pass; lint, client and worker
typechecks, production build and release probe pass. Entry JS 2,240.79 kB,
622.85 kB gzip; full initial JS gzip 623,267 bytes; estimated first transfer
6,704,140 bytes. Resource probes are not frame-time benchmarks. Startup, motion,
physical-mobile and complete-session gates remain open.

### Startup isolation follow-up

The unchanged `index-BIRd17K_.js` later rendered all eleven captures in
`quality-lifecycle-inspected-gpu`, including initial Low, with the same stable
resource counts. Three separate startup camera/resize routes also rendered from
the start (`startup-camera-controls`, `startup-camera-resource-controls`,
`startup-no-inspector-controls`). They varied resource wrappers and React
inspection; the last had no React inspector. Consequently the prior blank is
intermittent, not currently a deterministic quality-cycle reproduction.

Visible initial Low state: frameloop always, priority zero, 28 draws, valid
WebGPU camera projection, no explicit target left bound, 1152x720 drawing buffer
for the expected 0.8 DPR. Post-switch High has priority one and 40 draws; Low
returns to the same initial camera and projection. These snapshots establish a
healthy comparison state, not the cause of a failed capture. The tools can now
record this state if the failure recurs, while preserving normal-control routes.
No runtime change was made to conceal or automatically retry blank rendering.

## First Space press

### Latest disposition: retain target preparation; reject extra warmup draw

The extra loading-time post-pipeline render was tested, not retained. It removed
the bird shader from isolated first-bark traces (approximately 7 ms, zero new
programs), and a further 20 paired hub High trials showed WebGL2 first bark
improving from 25–33.3 ms to 16.7–25 ms. Receipt:
`captures/stability/hub-receipts/first-use-1788823736535/`. All idle and artifact
checks passed; sampled native GPU/GL screenshots showed the field normally.

However, repeated Windows WebGPU runs of this candidate produced a blank field.
Switching High -> Low -> High restored it. The earlier target-only artifact
rendered correctly in the same test (`target-reference-high-gpu`). Waiting a
frame before warmup, or advancing the normal R3F frame for warmup, did not resolve
the failure. Those additions have been removed; no blank-render candidate is
accepted. Crucially, the rebuilt candidate after removing all extra warmup also
renders blank (`restored-high-gpu`, `index-AFArC80o.js`), with no console error.
The earlier artifact's single visible comparison does not prove a causal source
difference. Extra warmup is not an established cause, and rollback is not a
verified rendering fix. Repeat controlled original/candidate visual checks and
compare uninstrumented normal play before attributing this to app initialization,
browser/GPU behavior or probe instrumentation.

Subsequent sequential headed Chrome controls all rendered visibly at 1440x900,
High, 200 sheep, with no debug query: current artifact with GPU wrappers disabled,
current artifact with wrappers enabled, earlier target-only artifact with wrappers
disabled, then current artifact with wrappers and the probe GPU launch flags.
All build-stability checks passed and console errors were empty. Receipts:
`unpatched-current-high-gpu`, `patched-current-high-gpu-control`,
`unpatched-reference-high-gpu-control`, `flagged-current-high-gpu-control`, under
`captures/stability/`. The first current screenshot was visually inspected and
shows the field and normally framed dog. These single controls do not establish
that the intermittent failure is fixed, or caused by instrumentation or flags.
They retain 167–354 ms post-readiness startup gaps; none is a performance pass.
The diagnostic now records channel, native/forced GPU configuration and wrapper
state, and supports `--unpatched-gpu` to avoid patching GPU or scheduler APIs.

Two other experiments were rejected: skipping async compilation made WebGL2
startup shorter but produced a 2,048 ms loading task; seating the camera in a
layout effect did not remove movement programs and also had a failed GPU capture.
The existing Follow framing correction remains; the bootstrap-camera experiment
does not. Do not repeat these approaches without new causal evidence.

A concrete keyboard/lifecycle defect is fixed: title controls are now inert
until scene readiness. Previously invisible Settings could be reached by Tab and
Enter, allowing a quality switch to unmount an active compiler. The production
`tools/loading-focus-probe.mjs` holds a heightfield request, verifies 12 Tab/Enter
attempts cannot reach controls or open a dialog, then releases loading and proves
Settings opens/closes normally. Receipt: `captures/stability/loading-focus/`.
Readiness publication also checks that its component remains alive.

Remaining priorities: responsive full-scene preparation without new programs
during movement; startup budgets; independent Windows/mobile rendering diagnosis;
full lifecycle/soak coverage. The quality-switch ownership lead was subsequently
measured and corrected as documented above; broader leak/soak acceptance remains
open.


### Controlled follow-up, 2026-09-07

The quiet hub completed 60 sequential fresh-browser trials, alternating original
and bark-plus-camera candidate artifacts, five pairs per backend/quality. Receipt:
`captures/stability/hub-receipts/first-use-1788822509438/report.json`.
Both builds remained unchanged; all requested backends matched and no browser or
network failures were reported. These are measurements, not a stabilization pass.

- WebGL2 Auto (resolved Low): original first bark 25–41.7 ms; candidate 16.7–16.8 ms.
- WebGL2 Low: original 25–33.3 ms; candidate 16.7–16.8 ms.
- WebGL2 High: candidate still reaches 58.3 ms; this gate remains failed.
- WebGPU Low: candidate approximately 16.7 ms; High/Auto results overlap the
  original at 16.7–25 ms. Auto selected different tiers between some paired runs,
  so do not interpret Auto as a fixed-quality causal comparison.
- Candidate movement windows reach approximately 33.4 ms. Repeat bark, sprint
  and camera-switch windows stay at or below approximately 16.7 ms in this route.

The pre-launch GPU utilization samples include the previous browser's averaging
interval. The revised tool requires two consecutive samples at <=5% before each
new browser. The 20-run High-only comparison completed using that gate, comparing
the camera candidate against the render-target candidate below. All idle checks
passed and artifact hashes were stable. Receipt: first-use-1788823188181 under
captures/stability/hub-receipts. WebGPU first-bark ranges overlap at 16.7–25 ms;
WebGL2 changed from 25–41.7 ms to 24.9–33.4 ms. Residual compilation remains.

### High render-target candidate

Local startup tracing attributes 1,338 ms of a 1,488 ms compile stage to waiting
for 37 serial asynchronous pipeline creations. Scheduler yields were available
and none exceeded 2 ms in that diagnostic. CPU sampling was predominantly idle.
Receipts: `captures/stability/startup-async-high/` and `startup-cpu-high/`.

High postprocessing renders into a pass target with different color state from
the ordinary canvas. Readiness now lives beside its actual render path, and the
compiler uses the configured target, samples, output type, dimensions and color
state, restoring state and hidden-effect visibility even on rejection. It skips
boot work after sceneReady, preserving manual quality changes during play.

Candidate `index-CgW7aIpk.js`: 96 files / 729 tests, lint, typecheck, build and
release probe pass. Local WebGPU synchronous pipeline creations fell 47 -> 27;
readiness remains around 2.45 s, above budget. WebGL2 first bark still produced a
34.7 ms local frame, so target-correct compilation is only a partial correction.

Shader-source tracing identifies the remaining first-bark program as the nine
instanced birds. Its shader differs from a startup-compiled program only in
generated buffer node identifiers. The installed renderer includes nested render
call depth in its render-context key, and instanced cache keys include that
context. Investigate a loading-time render of the marked hidden effects through
the actual post pipeline, using its public render method, before hiding them and
publishing readiness. Do not modify Three internals or claim the cause resolved
without tracing the next first bark. Also keep the bootstrap-camera mismatch
open: CameraRig currently seats on its first frame after compilation.


The production startup compiler skipped both initially hidden bark effects.
`BarkRing` and `BirdLift` first became eligible for material compilation when
the player barked. The local candidate opts these two objects into compilation
while the existing startup render loop is paused, restoring visibility in
`finally`. Frustum policy, assets, animation and simulation are unchanged.

Fresh Chromium processes, 200 sheep, 1440x900, three trials per backend:

| Setting | First-bark maximum frame gap | Later bark windows |
| --- | --- | --- |
| Original Auto WebGPU | 34.6–41.6 ms | usually 7.1 ms |
| Original Auto WebGL2 | 41.6–41.7 ms | 7.0–7.1 ms |
| Candidate Auto WebGPU | 7.0–7.1 ms | 7.1 ms |
| Candidate Auto WebGL2 | 7.1 ms | 7.1 ms |
| Candidate High WebGPU | 13.9–14.0 ms | 7.0–7.1 ms |
| Candidate High WebGL2 | 27.7–27.8 ms | 7.1 ms |

These are browser animation-frame intervals around real keyboard Space events,
not GPU execution timings or physical input-to-display latency. Auto selected
medium on WebGPU and low on WebGL2. Each process uses a fresh browser profile;
OS/driver shader caches are not cleared. Other desktop applications remained
open, so this is local comparative evidence, not isolated hardware certification.
One briefly overlapping exploratory profiler was stopped; baseline WebGPU
numbers are provisional. WebGL2 and candidate runs were sequential.

Evidence: `captures/profiling/first-bark-{baseline,warmup,warmup-high}/report.json`.
The reusable `node tools/first-bark-profile.mjs LABEL [auto|high|low] [--mobile]`
uses normal controls, mocks score APIs, checks the actual backend and records
build digests. It rejects bark-window gaps above 33.4 ms. That threshold is a
regression alarm, not a claim that every frame meets a 60 Hz budget.

Independent code review found no blocker in visibility restoration or lifecycle.
High postprocessing uses a different render target, so its remaining first-use
cost is a follow-up; the default-target warmup does not prove every pipeline is
cached. Driver traces are needed before changing that path.

## Broader findings and remaining acceptance

The candidate's three 60-second, 200-sheep production-preview runs used normal
W movement. They are route samples, not a completion or full-field traversal:

| Scenario | Ready | Frame p95 | Maximum gap | Peak API draws |
| --- | --- | --- | --- | --- |
| 2560x1440 High Classic WebGPU | 2,509 ms | 7 ms | 83.4 ms | 53 |
| 2560x1440 High Follow WebGL2 | 4,967 ms | 7 ms | 76.2 ms | 54 |
| 844x390 DPR3 Low WebGL2, 4x CPU/9 Mbps | 6,744 ms | 14 ms | 76.3 ms | 42 |

All three fail startup budgets. All pass the older 100 ms maximum-gap gate,
but contain noticeable-hitch-sized outliers. No runtime/network errors and no
build changes during the sweep. Report and active-play screenshots are under
`captures/profiling/stability-warmup/`. The profiler now retains gap timestamps
and long-task timelines for the production route so follow-up tracing can
identify whether these are initial render work, scripting or driver delays.

A subsequent 10-second trace reproduced one 83.2 ms WebGPU gap at sample frame
106 and one 76.5 ms WebGL2 gap at frame 113, with no reported Long Tasks. These
early movement outliers are reproducible; this does not yet identify their
cause. Evidence: `captures/profiling/stability-gap-trace/report.json`.

The audio lifecycle probe passes all eleven checks: one context, gesture
unlock, pause/resume, mute/volume, restart, visibility, positional bark, no
duplicate loops, correct loop rates and no media-play rejection. Evidence:
`captures/audio/stability-audio/`. This does not replace long-session listening.

Independent screenshot review rejected the first mobile WebGPU capture because
it contains only the background and HUD. Mobile WebGL2 and desktop Follow show
the scene. Treat mobile WebGPU visual acceptance as open even though its frame
timings passed. The bark probe now rejects blank central captures and preserves
both initial and follow-up screenshots so a readback issue cannot silently pass.
The repeated mobile capture probe fails this new visual gate; the initial and
250 ms follow-up WebGPU capture remain blank. This rules out a single missed
screenshot, but not a headless compositor/readback problem. Preserve that
distinction until a headed/physical-device check isolates it. Evidence:
`captures/profiling/first-bark-mobile-capture-check/report.json`.

Validation for the local runtime change: lint, TypeScript, production build,
95 test files / 724 tests and release probe pass. Initial JS gzip is 622,906
bytes; estimated transfer is 6,703,776 bytes. Probe processes and their local
servers were closed. No whole-game performance acceptance is claimed.

- The existing profiler's 100 ms active-play ceiling can pass a noticeable hitch.
  Keep its catastrophic-stall gate, but assess event windows and missed frames
  separately. A low p95 alone cannot certify polish.
- Startup has repeatedly missed the spec's 2 s desktop / 5 s mobile budgets in
  historical STATUS receipts. New measurements must remain separate from those
  older builds; loading work must not merely move into the first player action.
- `RuntimeQualityGovernor` conflicts with spec/08's boot-only quality decision.
  Preserve the shipped behavior pending an explicit product decision. Its reset
  branch also allocates an object every frame when inactive; profile allocation
  pressure before treating that small allocation as a hitch cause.
- `calculateFlockingForce` allocates a zero vector when no neighbors exist,
  despite the surrounding scratch-vector policy. This is a potential steady
  allocation source, not a measured cause of the first-bark stall.
- The simulation uses a fixed timestep with a five-step catch-up limit and
  preallocated presentation buffers. Preserve deterministic traces during any
  optimization. Rendering, simulation, input and audio require separate timings.
- A complete stabilization gate still needs physical Android/iOS testing,
  25/75/200 long sessions, repeated restart/customization/quality changes,
  completion, context-loss recovery and memory trend checks. Browser emulation
  on a desktop GPU cannot establish mobile thermal or driver stability.

No deployment is included. The measured candidate must be reviewed before an
exact-SHA release is authorized.
