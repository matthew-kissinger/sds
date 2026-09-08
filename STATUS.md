# Sheepdog Sim 3 release status

## Bounded stabilization release candidate — 2026-09-07

Owner requested closeout, commit, push and exact-version deployment rather than
expanding the investigation. This section supersedes historical active-process
and broad acceptance requirements below. The candidate improves first-bark
warmup, High render-context reuse/disposal, follow-camera framing, desktop keycap
hints, keyboard/touch interruption handling and graphics-loss recovery. Auto
sampling resets reuse storage; the existing Auto-only policy is unchanged.

Independent final runtime review found no blocking regressions or unfinished
diagnostic hooks. Final local lint, client/worker typechecks, build and static
release probe passed. Full local suite: 102 files / 746 tests (includes four
unrelated discovery-verifier tests that are not part of these commits).
Logs: captures/stability/final-{lint,typecheck,worker-typecheck,build,tests,release}.log.
Runtime artifact remains index-V7kFoDsD.js, SHA256
4701b6b5d936e201c5fc7f2b40cda12527e65e4698817bcf5e46a71d78589ad8.
JS gzip 624385 bytes; estimated first transfer 6705256 bytes.

Final quiet-hub smoke: first-use-1788838025523, one High/200 run per backend,
unchanged artifact, zero page errors, both follow/classic and resize/return
rendered. First bark maximum gap 16.7 ms on both; sampled interaction p95
8.4 ms, largest movement gap 25.1 ms. This short smoke is regression evidence,
not a replacement for the earlier performance receipts. Follow screenshots
were visually reviewed; the dog is centered and keycaps remain distinct.
Hub browser/server cleanup completed; postflight GPU 0%, 89 MiB.

Known limitations carried forward: variable loading (including misses of the
2-second desktop budget), isolated unexplained frame outliers, physical mobile
and gamepad acceptance, real WebGPU-device-loss and slow-score-service coverage.
The empty public 75 leaderboard still needs production read access; local
completion/worker paths pass. Keep existing Auto adaptation while its spec/08
boot-only mismatch awaits a product decision. No unsupported shader-extension
override ships. These are visible limitations, not claims of full spec acceptance.

Remaining release steps: coherent commits, push/CI, owner approval of the full
commit SHA, manual Pages deployment and live identity/play verification. No
worker/infrastructure changes or public synthetic score submissions are included.

## Targeted 75/200 completion and scoring — 2026-09-07

Owner-approved one-sheep-left fixtures pass on unchanged index-V7kFoDsD.js:
75 success, 75 submission-503 after successful registration, and 200 success.
Each starts with N-1 penned, completed=false, last sheep at (0,99.5) outside
the pen and synthetic tick 6000. Normal simulation crosses the final gate and
triggers completion in under one second. No completion state is injected.
Captured requests carry soloClassic, field-v3 and the correct sheepCount.
All cases replay at 0/N and preserve the 100400 ms local best through actual
browser reload. Builds are stable, page errors absent, and all API traffic is
mocked. Synthetic time/fixtures are explicitly not full-run or public-score proof.

Receipts: captures/stability/completion-75-targeted/,
completion-75-submit-failure/ and completion-200-targeted/. Sessions 38906 and
59377 completed and cleanup ran. No long herding probes remain active.

The same minimal client payload passes real SQLite worker persistence, anomaly
filtering and count-specific leaderboard readback for 25/75/200, with isolation
between boards (v3-completion-score.spec.ts; focused worker tests 6 passed).
No count-specific bug found in current client/worker code. These tests do not
establish the deployed worker's write-path behavior or deployment identity.

An aggregate-only SELECT against production D1 was attempted to distinguish
missing submissions from hidden anomaly records. Cloudflare rejected it with
authentication error 10000; no database query result is available. Production
75 remains responsive/empty on public reads, but why it is empty is unresolved
until authorized Cloudflare access is restored. No public test score was written.

## Stop long herding probes; target the 75-sheep score path — 2026-09-07

Owner requested less probe ceremony and approved a tools-only one-sheep-left
forcing fixture for completion checks. The 75-sheep run (session 9596) was
intentionally interrupted by closing its verified child Chrome process; its
terminal exit is test cancellation, not a game crash. Do not restart it. Replace
long 75/200 automated herding with targeted final-gate/completion/score checks.

Fresh read-only production queries returned HTTP 200 for all field-v3 boards:
25 has 12 entries, 75 has 0, 200 has 2. Source explicitly permits [25,75,200].
Thus the 75 read endpoint is responsive and empty, but write-path correctness
is not yet established. No synthetic public score was submitted. Investigate
the final-gate -> completion -> request payload -> worker validation/persistence
path using local/mocked infrastructure and keep the result distinct from live
production acceptance.

## Completed run with score service unavailable — 2026-09-07

The normal-input 25-sheep run on index-V7kFoDsD.js completed at tick 15569,
259.434 seconds (display 4:19.4), with all 25 penned. The completion panel showed
New personal best and the local-time-safe/unavailable-board message; Play Again
returned to playing with 0/25. Source/build receipt hashes stayed stable and no
page errors or probe exceptions occurred. Screenshot completed.png was reviewed.
Receipt: captures/stability/production-herding-25-unavailable/report.json,
completed.png and replayed.png. Exec session 92396 is terminal and cleanup ran.

Both intercepted requests were POST /api/register with mock status 503; no
public request was sent. This proves normal completion/replay while identity
registration is unavailable, not a separate failure after successful score
submission. It is desktop touch emulation and functional evidence only.

Added offline-result-persistence.spec.ts verifies the best is stored before
completion notification, remains after API failure and reloads into a fresh
game store. This complements the browser flow; it does not claim a browser
reload persistence check. Focused score tests pass (9); full suite now passes
100 files / 740 tests. New-test lint passes; runtime artifact is unchanged from
the prior build/typecheck/release checks. Quality-policy owner answer remains
pending; 75/200 full completion and physical mobile acceptance remain open.

## Boot-time loss and unavailable-score playthrough — 2026-09-07

Current index-V7kFoDsD.js also passes forced loss during pending WebGL2 scene
compilation. The probe triggers only on an actual false parallel-completion
query after the scene boot mark, before shader readiness. Its receipt records
loss at 904.6 ms, data-ready=false, no shader-ready mark and sim tick 0.
Recovery stays paused with unchanged sim, zero canvases and closed audio;
focus/Tab/Escape checks and Reload -> ready title pass with no page errors and
stable hashes. No further runtime edit was needed. Receipt:
captures/stability/context-loss-boot/report.json. This narrows the boot gate to
the tested WebGL2 pending-pipeline case; physical/GPU-device-loss gates remain.

A normal-input 25-sheep production playthrough with every API request mocked
503 is active (exec session 92396, 600-second cap). It must complete through real
herding, show the local-time-safe message and allow Play Again before acceptance.
Do not infer completion or restart from this note: poll the live handle or
inspect the process. Evidence writes to captures/stability/
production-herding-25-unavailable/. Main dist must stay unchanged during it.

The owner has been asked to resolve Auto quality policy (runtime downward
adaptation versus boot-only selection). Current Auto behavior is retained while
that answer is pending; manual quality remains fixed.

## Graphics-loss recovery — 2026-09-07

Forced WebGL2 context loss reproduced a frozen field with a continuing run:
phase stayed playing and stamina drained 79 -> 55 -> 31 percent. The renderer's
public onDeviceLost callback now retains Three's bookkeeping and marks terminal
graphics loss in the store. The game pauses synchronously, removes rendering,
input and audio, and presents a focused reload dialog. Ready/resume/start actions
cannot restart the lost run. This is recovery to the title, not restoration of
an in-progress run.

Production index-V7kFoDsD.js passes desktop play, portrait touch emulation,
pre-gesture title and open-Settings loss scenarios. Live sim tick/stamina remain
unchanged after loss; Canvas is removed, AudioContexts close and remain closed
after Tab, focus stays on Reload, Escape cannot resume, and Reload returns to a
ready title. Receipts: captures/stability/context-loss*/report.json and lost.png,
reloaded.png. The prior failure is retained in context-loss-before.log.

Separate review caught and resolved an audio unlock edge and missing panel
wrapper, then accepted the current desktop/portrait dialog. Lint, production
build/client typecheck, 99 test files / 739 tests and static release probe pass.
Gzip JS totals 624,385 bytes; estimated first transfer 6,705,256 bytes.

Same-artifact hub WebGPU High/200 render smoke completed with stable hashes,
nonblank field/camera/resize captures and no page errors. Receipt:
captures/stability/hub-receipts/first-use-1788836222346/. This verifies ordinary
WebGPU rendering, not forced WebGPU device-loss recovery. Session 57630 is
terminal; hub cleaned to 0% GPU / 89 MiB. Physical phone loss, actual WebGPU
device failure and loss during pending boot compilation remain open.

## Parallel-compile diagnostic comparison — 2026-09-07

Five alternating pairs on the quiet hub used the identical index-D7vhFZIt.js
artifact with normal WebGL2 High/200 versus a tools-only unavailable
KHR_parallel_shader_compile extension. Normal ready times were 4662.9, 3067.6,
2780.1, 2002.1 and 2015.4 ms. Extension-unavailable times were 1634, 1508.1,
1480.3, 1475.3 and 1428.4 ms. All ten rendered nonblank fields, retained stable
hashes and recorded no page errors. First-bark maxima were 16.7–33.3 ms normal
and 16.7–25.1 ms extension-unavailable. A raw movement 33.400000000000546 ms
sample crosses the strict 33.4 comparison through floating-point rounding.

The alternate path replaces asynchronous polling with blocking LINK_STATUS
queries: cumulative measured calls rose from 65.8–72.8 ms to 275–295.2 ms,
with individual calls at most 40.2 ms. Recorded boot Long Task maxima were
305–459 ms normal versus 105–247 ms alternate. These are diagnostic timings,
not proof across devices. The first normal 4662.9 ms result is retained.

This strongly links the loading variability to the optional async compile path
on this browser/GPU. It does not establish the underlying browser/driver fault.
Three's installed backend stores a `parallel` field, but its published backend
parameters/types offer no parallel-compile policy setting. The game has not
been changed to mutate that field or override browser prototypes. A supported
solution and cross-device evidence are still required before closing loading.

Receipt: captures/stability/hub-receipts/first-use-1788835536473/.
tools/summarize-shader-completion.mjs produces
captures/stability/parallel-comparison-summary.jsonl. Session 94792 completed;
hub postflight 0% GPU / 89 MiB, probe browsers/servers closed. No runtime build
or production infrastructure changed in this comparison.

## Shader-completion wait reproduced — 2026-09-07

Five quiet-hub WebGL2 High/200 trials of unchanged index-D7vhFZIt.js now include
normal WebGL2 compile/link/completion-query tracing. Two slow boots (2975.1 and
2958.7 ms) each contain one program whose completion stays false until about
820 ms after linking: 820.5/819.4 ms, 100 polls each, individual query calls at
most 0.1 ms. The slow program differs (IDs 22 and 19; attached source lengths
1422/1972 versus 2875/1885), so this does not identify one expensive material.
The other three boots take 1960.6, 1890.3 and 1982.8 ms, with maximum individual
link-to-observed-completion waits 38.1, 23.8 and 26.4 ms.

Installed Three processes async compile work items sequentially and awaits
each pipeline before advancing. This trace confirms browser-reported program
completion waits extend that loading path. It does not establish whether shader
compilation, driver scheduling, cache activity or another browser condition
causes the wait. No renderer fork, forced synchronous query or runtime change
was made. First-bark maxima remained 16.7–25 ms; the earlier hitch stays open.

All five fields were nonblank, with stable build hashes and no page errors.
Per-trial CPU/GPU idle checks passed; final hub 0% GPU / 89 MiB and no probe
Chrome processes. Session 92632 is terminal. Receipt:
captures/stability/hub-receipts/first-use-1788835317817/report.json.
tools/shader-completion-trace.mjs records existing calls without extra GPU
queries; --shader-trace enables it in hub-first-use-probe.mjs. Tool lint passes.
Tracing overhead and retained OS/driver caches make this diagnostic evidence.

## Current first-use and readiness timing — 2026-09-07

Quiet-hub index-D7vhFZIt.js completed five CPU-profiled and five unprofiled
WebGL2 High/200 trials. Both sets retain stable artifacts, five nonblank fields,
zero page errors and per-trial two-sample CPU/GPU idle checks. First-bark maxima
were 16.7–25.1 ms; early movement maxima 16.7–33.3 ms. This does not explain or
erase the prior 66.7 ms outlier and is not the full backend/quality matrix.

The first-use tool previously timestamped readiness after automation polling.
It now observes the data-ready DOM change inside the browser and separately
retains automationObservedReady. In the unprofiled set, that polling delay was
109–331.7 ms. Actual readiness was 2963.8, 2013.8, 2793.6, 1895.3 and 2781.2 ms:
four of five still miss the 2-second budget. Prior hub-presentation receipts
already used a MutationObserver and are unaffected by this correction.

CPU profiles isolate slower scene-to-shader stages: 1570.9/1586.8 ms versus
743–771.6 ms. Sampled idle rises from 365–391 ms to 1155–1162 ms; additional
JavaScript execution does not explain most of this difference. Installed Three
WebGLBackend polls COMPLETION_STATUS_KHR via requestAnimationFrame in async
compilation. That is a lead for browser/driver completion tracing, not proof
of a specific driver fault. Final postprocess compile still consumes sampled
_completeCompile time. No speculative runtime optimization was applied.

Receipts: captures/stability/hub-receipts/first-use-1788834970631/ (profiles) and
first-use-1788835114878/ (unprofiled readiness). tools/summarize-cpu-boot.mjs
reproduces stage attribution; captures/stability/sprint-boot-cpu-summary.jsonl
contains the results. Sessions 42861 and 31019 are terminal; browsers/servers
closed, hub postflight 0% GPU / 89 MiB. Physical-device gates remain open.

## Sprint keyboard and pointer ownership — 2026-09-07

Focused touch Sprint now supports holding Space or Enter, releasing on keyup
or focus loss. Keyboard keys and the captured pointer contribute independently;
releasing one does not cancel another hold. Pointer release checks ownership,
so lifting a second finger over Sprint cannot cancel the original finger.

The production keyboard probe failed on index-D9FFqgY3.js and passes on
index-D7vhFZIt.js. It covers repeats, overlapping keys, focus loss, mixed pointer
and keyboard release in both orders, and secondary-finger release. Trusted CDP
pointer traces confirm which finger ended; an initial probe mistake ended the
owner finger and was corrected from that evidence. The touch pause/resume
regression also passes: settled position remains fixed, stamina recovers and
artifact hashes remain stable, with no page errors. This is desktop emulation,
not physical-mobile or assistive click-only validation.

Lint, build/client typecheck, 98 test files / 737 tests and release probe pass.
Total gzip JavaScript is 623,965 bytes. Receipts: captures/stability/
sprint-keyboard-before.log, sprint-keyboard-after.log, sprint-keyboard-tests.log,
sprint-keyboard-release.log and touch-interruption/report.json. Separate review
accepted the keyboard lifecycle; pointer ownership was added in response to its
multi-touch finding. Runtime performance and physical-device gates remain open.

## Touch interruption recovery — 2026-09-07

Holding touch movement and sprint through pause reproduced stuck movement after
resume: the dog kept advancing and stamina drained. Removed captured elements
can lose their React pointer-release handlers. TouchControls now releases its
touch state in a layout effect when controls leave active play or touch presence.
Keyboard and gamepad state are unaffected.

The same trusted two-touch production probe passes on isolated index-D9FFqgY3.js.
Paused and immediate-resume positions match; after normal stopping inertia,
two samples 800 ms apart remain at z=-42.041667 and stamina recovers to 1.
Build hashes stayed stable, with no page errors. Evidence is in
captures/stability/touch-interruption/ (before.json, report.json, resumed.png).
This uses desktop touch emulation and Escape pause, not physical-device proof.
Separate critical review accepted the narrow lifecycle change. Lint, client
production build/typecheck and 98 test files / 737 tests pass. The isolated
build was subsequently reproduced in main dist after the active playthrough
ended. Typecheck and the static release probe also pass on index-D9FFqgY3.js.

The bounded 75-sheep production robot run ended at its 30-minute cap with 70/75
penned, stable index-C3zxvAzp.js hashes, no page errors and no exception.
Session 63070 is terminal; its browser/server cleanup ran. This is incomplete
automation coverage, not proof of a gameplay defect or accepted completion.
Receipt: captures/stability/production-herding-75-wide/report.json.

Desktop hints use outlined keycaps, muted labels and distinct group spacing;
the hint strip is hidden for coarse pointers. Running desktop, remapped and
touch screenshots are in captures/stability/desktop-controls/ and passed
separate interaction review. Physical mobile review remains open.

## Startup profile attribution — 2026-09-07

One quiet-hub WebGL2 High profile of index-C3zxvAzp.js includes CPU-clock metrics
for alignment with boot marks. Scene compile ended at 2,057.4 ms and presented
readiness at 2,202 ms. Within that window, CPU samples attribute 61.4 ms to
_completeCompile beneath BloomNode.updateBefore and another 3.2 ms beneath the
final render path. This establishes first-frame postprocess compilation as a
loading cost; it does not explain the separate intermittent first-bark outlier.
The installed RenderPipeline exposes render but no public compile/prepare API.
No private-renderer workaround or deferred readiness change was introduced.

Receipt: captures/stability/hub-receipts/first-use-1788833579136/, including
report.json and webgl2-high-0-candidate.cpuprofile. Exec session 7237 completed;
the profile's first-bark maximum was 25.1 ms, so it did not reproduce the 66.7 ms
outlier. Startup timings here are instrumented diagnostics. Production 75-sheep
session 63070 remains active; latest observed progress was 1/75 at 813 s.

## Current-build 1440p frame-budget receipts — 2026-09-07

index-C3zxvAzp.js completed separate quiet-hub 60-second High/200-sheep Classic
routes on genuine WebGPU and forced WebGL2. Both verified a 2560x1440 drawing
buffer (1707x960 CSS, DPR 1.5) and a 1715x1045 browser window fitting the physical
1920x1080 display. Two consecutive CPU/GPU idle samples passed before each run;
builds stayed stable, fields were nonblank and no page errors were recorded.

Both p95/p99 frame times were 8.4 ms; maxima were 33.4 ms WebGPU and 25 ms WebGL2.
Both sampled 40 draws in the final 250 ms submission window; that is not proof
of the maximum draw count throughout the route. Ready times were 1,978.5 ms
WebGPU and 2,128.3 ms WebGL2. The WebGL2 aggregate correctly fails its startup
budget. These pass the sampled steady frame-budget checks, not all first-use,
loading, device, audio or long-session requirements. OS/driver caches retained.

Receipts: captures/stability/hub-receipts/webgpu-hidpi-1788833133146/ and
webgl2-hidpi-1788833260182/. Exec sessions 96363 and 94732 are terminal; probe
browsers/servers closed, hub postflight 0% GPU / 89 MiB. Production 75-sheep run
63070 is still active on the PC and is functional evidence only.

## Thirty-minute hub soak completed — 2026-09-07

The isolated index-CZ45C4un.js run finished in 1,802.7 s: 30 movement/bark/sprint,
camera and Low/High/remount cycles, six restarts and 37 nonblank checkpoints.
Build hashes stayed stable; no page errors were recorded. All sampled states
were visible and playing, and final restart framing was inspected. Session
5494 is terminal, browsers/server closed; postflight GPU was 0% / 107 MiB.

Per-checkpoint p95 peaked at 8.4 ms and p99 at 8.5 ms. Five raw frame gaps were
above 33.4 ms: three floating-point-edge 33.4 ms values, plus 49.9 ms in cycle 14
and 41.7 ms in cycle 22. Retain those two clear outliers; no flawless-frame claim.
Equivalent post-menu checkpoints ended at 821 DOM nodes / 215 listeners, matching
cycle 1. Heap was 28.6 MB in cycle 1, 42.9 in cycle 10, 31.3 in cycle 20 and
32.5 in cycle 30, with no sustained growth established by these observations.
This is one WebGPU High 1440x900 soak, not GPU/audio leak proof, physical mobile,
1440p acceptance or validation of the later allocation cleanup.

Final report and captures: captures/stability/hub-receipts/first-use-1788831175580/.
The current index-C3zxvAzp.js is now isolated separately for a 60-second 1440p
drawing-buffer test. The probe requires a 2560x1440 canvas, a window inside the
physical display, and two consecutive quiet CPU/GPU samples before launch.

## Larger-flock robot limitation isolated — 2026-09-07

The original robot failed the 75-sheep deterministic diagnostic at all three
tested input cadences (1/2/6 ticks), with 0 penned after 72,000 ticks. The browser
attempt in session 1252 was deliberately stopped by closing only its verified
child Chrome process; it exited through cleanup. Its Target closed failure is
an intentional test interruption, not a game crash. The receipt remains at
captures/stability/production-herding-75/ and does not count as a playthrough.

A test-only radius sweep (24/32/48 m collection cap and approach arc) improved
75-sheep diagnostic penning to 0/19/72 respectively, still incomplete at 72,000
ticks. Adaptive approach radius for the remaining flock is under investigation.
No sim tuning, production behavior or deterministic fixture was changed.
Meanwhile the live hub soak reached 23 minutes; p95 remains 8.4 ms, with a
retained 41.7 ms cycle-22 maximum. Session 5494 remains the active soak handle.

Follow-up: continuously shrinking the arc failed (2/75 and 0/75). Keeping the
wider approach until 25 sheep remain, then restoring the proven small-flock
settings, completed 75 at tick 70,806 with six-tick control cadence. Switching
only at 10 sheep remained failed (72/75). The successful test-only policy is now
in the production probe, while the original fixture driver stays unchanged.
A fresh 75-sheep browser attempt has started under production-herding-75-wide,
capped at 1,800 seconds (exec session 63070); no production completion acceptance
is claimed yet. Session 1252 is terminal and must not be resumed or restarted.
The hub soak passed restart 25 and reached cycle 26.

## Real 25-sheep production completion — 2026-09-07

The production herding route completed all 25 sheep at tick 19,323, about 322 s,
and showed the normal 5:22.0 completion screen with a new personal best. No page
errors were recorded. The driver read live sim state and used touch movement /
keyboard sprint; no completion state or simulation tick was injected. Score
requests were local mocks, so the displayed online status is not service proof.
Receipt and screenshot: captures/stability/production-herding/{report.json,completed.png}.
Exec session 70078 completed and its browser/server closed. This first receipt
predates build-hash collection in the tool, so it is functional evidence rather
than an exact-artifact release gate. It does not certify physical touch or audio.

The follow-up 75-sheep route is active in exec session 1252, capped at 1,200 s,
with build hashes and a normal Play again/reset check added. Receipt directory:
captures/stability/production-herding-75/. The hub soak continues separately in
session 5494; its fifteen-minute checkpoint and third restart passed.

## Production herding route started — 2026-09-07

tools/production-herding-probe.mjs bundles the existing test herding driver into
tools-only browser code. It reads the live CpuDeterministicSim through committed
React hooks and sends trusted CDP touch-stick input plus keyboard sprint. It
does not mutate simulation state, advance ticks or inject completion. All score
requests are intercepted locally. The local run uses the current production
build, 25 sheep and forced WebGL2; timings on this busy PC are not performance
evidence and touch emulation is not physical-mobile validation.

Active exec session 70078, capped at 600 seconds; receipt directory
captures/stability/production-herding/. The initial 60 seconds confirm live dog
movement and normal simulation ticks, with no sheep completed yet. Do not claim
a completed playthrough or restart the probe without inspecting the live handle.
The separate hub soak, session 5494, reached cycle 11 and passed restart 10.

Automation cadence check (tools/herding-cadence-check.mjs) reuses the unchanged
sim and driver: control updates every 1/2/6 ticks complete 25 sheep at ticks
14,112 / 26,422 / 33,156 respectively. Browser CDP updates approximately every
100 ms are therefore not expected to match the per-tick fixture's finish time.
The browser attempt is still incomplete at its latest observed 211 s; this is
not evidence of a game completion defect. The hub soak separately reached
cycle 13 with its process still live.

## Quality-monitor allocation cleanup — 2026-09-07

RuntimeQualityGovernor claimed allocation-free monitoring but replaced its
counter object on every manual-quality/Low/paused frame. Reset now mutates the
same four counters in place. Thresholds, warmup and quality policy are unchanged;
this removes an observed allocation source, not an established cause of the
first-bark hitch. The spec/runtime-governor policy discrepancy remains open.

Current local index-C3zxvAzp.js passes lint, build/client typecheck, 98 files /
737 tests and release probe. Initial JS gzip 623,846 bytes; estimated transfer
6,704,718 bytes. The ongoing hub soak deliberately retains isolated
index-CZ45C4un.js; it does not validate this later cleanup. First three soak
cycles report 8.4 ms p95, maxima 33.3–33.4 ms and 821–822 DOM nodes / 215–216
listeners after menu cycles. Heap values fluctuate; no leak conclusion follows.

## Extended-session test underway — 2026-09-07

The new tools/session-soak.mjs drives normal keyboard movement/sprint/bark,
camera switching, pause, Settings Low/High remount and resume. A 60-second
WebGPU production cycle passed on the hub (first-use-1788831053894). Its initial
and post-remount field captures were nonblank. This is route validation only.

A 1,800-second run is now active on index-CZ45C4un.js, WebGPU High, 200 sheep,
with a restart every five cycles. It records per-cycle frame percentiles and
heap/DOM/listener observations. Screenshot sampling is excluded from frame
collection; pauses reset the frame clock. Counters are observations, not proof
of a leak or release. Physical mobile, audio voice accounting and actual herding
completion still require separate evidence.

Active receipt on hub: /home/matthewk/perf/sds-keycap-20260907/receipts/
first-use-1788831175580/; local exec session 5494. Initial checkpoint was observed
live. Do not restart from this status note: poll the handle or inspect the hub
process and receipt first. Completion and cleanup have not yet been verified.

Latest live check: cycle 7 at 420 s, including restart 5. Restart returned to a
visible playing field; DOM nodes dropped from 821 to 247, then later menu-cycle
counts returned to 822–823. Active-cycle p95 stays 8.4 ms. Heap fluctuated
27–48 MB and fell again; these partial observations do not establish acceptance.
No Android device was attached when queried with adb; the newly started adb
daemon was closed. Owner physical-device availability question is pending.

Coverage audit: tools/scores-ui-probe.mjs injects completion state in a dev build.
It validates score-screen behavior, not actual herding completion. The 25-sheep
deterministic fixture likewise does not prove production 25/75/200 playthroughs.
Those session-completion requirements remain explicitly open.

## Current-build hub validation and remaining bark outlier — 2026-09-07

Ten fresh headed High trials on the quiet hub validate index-CZ45C4un.js,
five each genuine WebGPU and forced WebGL2. All 50 post-input/camera/resize
captures pass the central-field nonblank check, with visible/focused sampled
states; sampled Follow and Classic screenshots show the dog framed correctly.
Every trial passed two consecutive CPU <=15% / GPU <=5% preflight samples.
Build hashes remained stable, requested backends matched, and no page errors or
failed requests were recorded. These are normal Playwright focus settings, not
native focus-recovery proof, and do not establish first-frame or physical-mobile
rendering acceptance. Receipt: captures/stability/hub-receipts/first-use-1788829329168/.

The first WebGL2 trial reproduced a 66.7 ms first-bark frame; its four later
trials were 16.7 ms. WebGPU first bark was 16.6–25.1 ms. Early movement reached
33.4 ms. Ready time was 2,128–2,161 ms WebGPU and 2,063–2,098 ms WebGL2, still
above the 2 s desktop requirement. The bark gate is open despite prior gains.

Five subsequent WebGL2 CPU-profiled trials produced 16.7–33.3 ms first-bark
maxima and no bark-window Long Task; the 66.7 ms outlier did not recur. Startup
Long Tasks ranged 56–315 ms. These instrumented runs are diagnostic, not timing
acceptance or proof of the outlier's cause. Profiles and report are retained in
captures/stability/hub-receipts/first-use-1788830792531/. Both runs completed;
test Chrome processes closed and the hub returned to 1% GPU / 89 MiB.

## Desktop keycap readability — 2026-09-07

Owner review found insufficient distinction between control keys and labels.
The bottom-left strip now uses outlined, subtly raised keycaps with a separate
tokened sans-serif face, quieter serif action labels, and wider spacing between
action groups. It retains live remapping, menu hiding and coarse-pointer hiding.
Production desktop/default/remapped and portrait touch checks pass; independent
critical review accepts the sampled layouts. Physical mobile acceptance remains
open. Screenshots: captures/stability/desktop-controls/{desktop,desktop-remapped,touch}.png.

Current index-CZ45C4un.js: lint, build/client typecheck, 98 files / 737 tests and
release probe pass. Initial JS gzip 623,819 bytes; estimated transfer 6,704,690
bytes. This is a presentation correction, not a new performance result.

Native Windows startup diagnosis also progressed: all six first-run images were
nonblank, but later samples were hidden and camera transitions therefore cannot
be accepted. The tightened second run rendered its initial WebGPU field, then
correctly failed on lost visibility. The blank-rendering gate remains open;
future native validation needs an uninterrupted foreground lane. The second
run's temp-profile cleanup returned EPERM and was recorded without masking the
primary visibility failure (sds-render-YB3hwb).

## Keyboard focus and native recovery — 2026-09-07

Gameplay shortcuts now respect text inputs, selects and native Space/Enter
button activation. Escape still closes menus, keyup still releases held inputs,
and movement/camera shortcuts work after a persistent touch button has focus.
Touch Bark and Camera accept keyboard/assistive clicks without duplicating
pointer actions. Independent code review supports this bounded change. Sprint's
touch button remains pointer-only; full keyboard activation of that button is
an open interaction item (the normal Shift binding remains available).

The production recovery probe passes typing, Play/Pause/Resume, camera handoff
and a real tab switch with lost movement/sprint keyup. Its receipt records actual
blur and visibility events. Standard Playwright focus emulation hid those events;
a separately launched visible Chrome attached with noDefaults provides the
native test. Hidden-window failures are not game recovery failures. This finding
does not yet resolve the separate intermittent blank-rendering gate.

Evidence: captures/stability/keyboard-recovery/report.json and
captures/stability/desktop-controls/touch-keyboard-{camera,return}.png.
The latter show Follow and Classic visually on touch emulation, not physical
mobile or exact action-count proof. Current index-Cvb_JT-9.js passes 98 files /
737 tests, lint, build/client typecheck and release probe. Initial JS gzip is
623,700 bytes; estimated first transfer is 6,704,572 bytes. These functional PC
checks do not replace quiet-hub performance measurements or close release gates.

Automatic approval review blocked cleanup of the closed test profile
C:/Users/Mattm/AppData/Local/Temp/sds-recovery-7G7iqt with reason "blocked by
policy". That directory was left untouched; subsequent probe cleanup succeeded.

## Desktop controls and High first-use path — 2026-09-07

The requested desktop HUD reminder now shows the current movement, bark, sprint,
camera and pause bindings in one small bottom-left row. It subscribes to settings,
does not update per frame, hides during menus and hides on coarse-pointer touch
layouts. Production UI checks cover default labels, pause, Q/F remapping and
touch controls. Independent visual review supports the sampled presentation.
Screenshots: captures/stability/desktop-controls/.

High now renders its scene explicitly into the owned target before the unchanged
TSL bloom/grade chain. Compilation and scene rendering use the same top-level
context. This removes the traced first-bark bird-program rebuild without an
extra warmup draw; local WebGPU synchronous pipeline creations fall from 27 to
12. Both backend five-cycle resource checks remain flat and all captures in
those latest runs render. Independent code/visual review found no blocker.

The owner reported another PC Chrome game and concurrent agents. PC timing
results are diagnostic only. The hub comparison used two consecutive CPU <=15%
and GPU <=5% samples before every trial, with no competing Chrome process at
preflight. Twenty alternating High trials compare index-BIRd17K_.js against
index-BTo1IfeC.js: WebGL2 first bark 25–41.7 -> 16.7–25.1 ms; WebGPU stays about
16.7 ms. Startup still fails: candidate WebGPU ready 2,116–2,201 ms; WebGL2
2,074–4,294 ms, including a worse first candidate trial. No loading regression
clearance or whole-game acceptance is claimed. Receipt:
captures/stability/hub-receipts/first-use-1788826866432/.

Current validation: 97 files / 731 tests, lint, build/client typecheck and release
probe pass. Initial JS gzip 623,591 bytes; estimated transfer 6,704,463 bytes.
All completed probe browsers and servers are closed; hub returned to 0% GPU.
Startup, intermittent rendering, physical mobile, full sessions and owner review
remain open. Nothing was deployed or published.

## Quality-switch GPU resource cleanup — 2026-09-07

Confirmed recurring resource growth when High unmounted: each WebGL2 cycle
retained 13 textures, 13 framebuffers and two renderbuffers; WebGPU retained 14
textures per later cycle. High now disposes its owned bloom and scene passes
in addition to RenderPipeline's final material. Five production Settings cycles
after the fix return to identical Low counts on each backend. Independent code
and sampled WebGL2/WebGPU remount visual review support the bounded fix.

WebGPU's initial Low capture is blank both before and after, then all ten captures
after quality switches render visibly. Its aggregate probe remains failed;
this resource fix does not resolve the startup rendering gate. Evidence and
counter tables: docs/performance-stabilization.md, captures/stability/
quality-lifecycle-{before,after}-{gl,gpu}/. All probe browsers/servers closed.

Latest candidate index-BIRd17K_.js: 96 files / 729 tests, lint, client/worker
typechecks, build and release probe pass. Full initial JS gzip 623,267 bytes;
estimated first transfer 6,704,140 bytes. No full stabilization gate is closed.

## Loading keyboard fix and rejected warmup experiments — 2026-09-07

Loading title controls are inert until ready, closing a keyboard-accessible
Settings/quality-change race during compilation. A production browser probe
holds the real heightfield request and confirms Tab/Enter cannot activate title
controls, then Settings opens/closes after readiness. Readiness publication
also ignores an unmounted component.

An additional High loading-time render improved first bark in 20 paired hub
trials but repeatedly produced a blank Windows WebGPU field. It was removed.
The earlier target-only artifact rendered in one comparison, but the rebuilt
candidate after removing extra warmup also rendered blank on Windows WebGPU
(`restored-high-gpu`, `index-AFArC80o.js`). Therefore extra warmup is not an
established cause, and rollback is not a verified rendering fix. Waiting for a
frame and using R3F.advance did not cure blank rendering. Direct sync
startup also produced a 2-second WebGL2 task and was rejected; the camera-layout
initialization experiment was removed as well. Existing Follow framing and
target-correct async compilation remain. None of these results closes startup,
movement, physical-mobile or long-session gates. Full evidence and next leads:
docs/performance-stabilization.md.

Latest source checks pass: 96 files / 729 tests, lint, typecheck, production
build and release probe. JS is 2,240.73 kB (622.83 kB gzip). The visible-rendering
gate remains unresolved despite these checks; this candidate is not accepted.
Four later sequential headed Chrome controls rendered visibly, including current
and reference artifacts, GPU wrappers off/on, and current with probe GPU flags.
This does not isolate the intermittent blank failure. Current normal Chrome
screenshots show the field and normally framed dog; startup still contains large
post-readiness gaps. Detailed labels and limits are in the investigation report.

## High first-use follow-up — 2026-09-07

The 60-run alternating hub comparison confirms Low/Auto WebGL2 bark improvement
but exposes a remaining High first-bark gap up to 58.3 ms. The target-correct
warmup candidate (`index-CgW7aIpk.js`) passes 729 tests, lint, typecheck, build and
release probe; it reduces local WebGPU synchronous pipeline creations 47 -> 27.
It is not accepted: startup still exceeds budget and the instanced-bird program
still compiles at the first High bark. See docs/performance-stabilization.md for
shader evidence and the next diagnostic. The 20-run High-only comparison with
confirmed idle intervals completed: WebGPU 16.7–25 ms overlaps the prior build;
WebGL2 first bark changed from 25–41.7 ms to 24.9–33.4 ms. All idle checks and
build-stability checks passed. Receipt: captures/stability/hub-receipts/
first-use-1788823188181. Both compared artifacts remain isolated on the hub.

## Stabilization execution — camera candidate, 2026-09-07

The quiet hub (GTX 1660 Ti, physical 1920x1080 at 120 Hz) now uses a
1440x900 test viewport that fits its actual browser window. The earlier
2560x1440 window exceeded the display. Production WebGPU uses no debug flag.
Native Follow routes also reproduced a separate camera defect: sustained
camera-relative turns collapse horizontal chase distance from 20 m to 3.43 m.
Both backends show the oversized dog near a fence; it recovers after releasing
input for two seconds. This is a gameplay framing issue, not a performance pass.

A local camera candidate smooths the tracking center separately from its polar
orbit, retaining the spec yaw/position/aim constants and terrain clearance.
Independent design review supports this approach. Explicit interpretation:
55 m/s limits Cartesian tracking/reset translation, not total orbital eye speed;
spec/06 specifies smoothing constants but no total eye-speed ceiling. Running
motion review is still required. The deterministic route and existing framing
tests pass. Follow reset and live viewport-change tests were added as well.
Current validation: 96 files / 727 tests; lint, typecheck, production build and
release probe pass. The new 60-second simulation test uses a 20-second timeout
because parallel suite contention exceeded the default 5 seconds; its framing
assertions remain unchanged.

Camera candidate index-KZQW9FUY.js: native hub WebGPU/WebGL2 routes both p95
8.4 ms, maximum 25 ms; ready 2,028 / 2,282.5 ms (startup still fails).
Build hashes remained stable and browser windows fit the physical display.
Candidate active screenshots retain normal dog size and readable field framing;
independent WebGPU screenshot review supports the sampled correction. Receipts:
captures/stability/hub-receipts/webgpu-native-1788822173632 and
webgl2-native-1788822283569. Full motion, portrait/physical-mobile acceptance,
alternating first-use comparisons and extended recovery sessions remain open.

Hub pre-camera-fix 60-second native High routes: WebGPU p95 8.4 ms,
max 16.7 ms, ready 2,150.7 ms; WebGL2 p95 8.4 ms, max 25 ms,
ready 3,425.4 ms. Both miss the 2-second desktop startup gate. Captures and
receipts are under captures/stability/hub-receipts/. Screenshot-related gaps
are timestamped separately; sampled runtime excludes startup and captures.
Windows mobile-emulation blank rendering is intermittent and reproduced on the
original build; a later identical-context candidate run and raw WebGPU control
rendered visibly. Cause and physical-mobile acceptance remain open.

Probe hardening now checks physical window bounds, build stability, browser and
network failures. Automated color variation only checks nonblank content; it
does not approve framing or scene animation. All performance and publication
gates in docs/stabilization-plan.md remain open until their evidence is complete.

## Stabilization plan — 2026-09-07

Owner requested a plan to stabilize and polish the current game before public
posts. See [stabilization and public playtest plan](docs/stabilization-plan.md).
It sequences reliable rendering evidence, first-use/movement fixes, loading and
steady performance, complete-session recovery, presentation review and a reviewed
public build. Plan recorded; gates are not newly accepted. Future modes, larger
flocks and multiplayer remain outside scope. No publication authorization added.

## Performance stabilization investigation — local candidate, 2026-09-07

First-Space investigation reproduced a hidden-effect compilation hitch. BarkRing
and BirdLift now opt into startup compilation while the render loop is paused;
visibility restores even if compilation fails. No simulation or audio change.
Three fresh-browser trials per backend at 200 sheep measured Auto first-bark
maxima falling from 35–42 ms to 7.0–7.1 ms. High retains 14 ms WebGPU / 28 ms
WebGL2 first-use cost. Low portrait touch emulation measured 7.1 ms first-bark
maxima on both backends; input was scripted Space, not physical touch.

Three 60-second production runs pass p95/draw/error checks but NOT overall
performance acceptance: High 1440p WebGPU/WebGL2 and throttled landscape Low
WebGL2 readiness was 2,509 / 4,967 / 6,744 ms. Frame p95 was 7 / 7 / 14 ms;
maximum gaps were 83.4 / 76.2 / 76.3 ms. Peak API draws 53 / 54 / 42. The older
100 ms freeze gate is insufficient to call these runs hitch-free. Timings are
local desktop comparisons, not isolated physical-device certification.

Validation: 95 files / 724 tests, lint, typecheck, build and release probe pass.
Candidate index-s2uqeSsi.js; gzip JS 622,906 bytes, estimated transfer 6,703,776
bytes. Independent code review found no blocker; high-target pipeline warmup
remains a measured limitation. Running build screenshots and receipts:
captures/profiling/first-bark-warmup-mobile/ and stability-warmup/.
See docs/performance-stabilization.md for reproduction, limitations and follow-up
priorities. Spec/08's boot-only quality policy still conflicts with the shipped
runtime governor; preserved pending a product decision. Startup, residual
outliers, long-session memory/lifecycle and physical mobile acceptance remain
open. No commit, push or deployment in this investigation.
Follow-up: the 10-second gap trace reproduces 83.2 / 76.5 ms outliers around
sample frames 106 / 113, without reported Long Tasks. All eleven audio lifecycle
checks pass (captures/audio/stability-audio/). Independent screenshot review
rejects the initial mobile WebGPU capture: HUD appears but the field is blank.
Mobile WebGL2 and desktop scenes render. Mobile WebGPU visual acceptance remains
open; the bark probe now records and rejects blank initial/follow-up captures.

## Footsteps - owner approved for release, 2026-09-07

Owner found the generated footsteps too high pitched and requested correction
and another local review before deployment. Owner subsequently approved the
revised mix and explicitly requested commit, push and deployment. Retained
the two original sources and baked softened mono FLAC files with 65 Hz highpass,
1800 Hz lowpass and rounded boundaries. Runtime pitch is 0.82-0.86 with lower
gain; cadence and movement triggers are unchanged. Recipe and source hashes are
in tools/prepare-footsteps.mjs and assets/audio/manifest.json. Combined footsteps
are 49,079 bytes; complete audio is 2,186,181 bytes.
Independent review caught excessive attenuation in the initial lowpass pass;
static +12/+8 dB compensation restores the paw impact and balances the takes.
Owner listening accepted this candidate. Release checks and exact-SHA deployment
are authorized. Possible tail overlap during sprinting remains a known property.
Validation: lint, typecheck, 95 files / 722 tests, build and release probe pass.
Final JS index-BnAI9eCO.js; gzip JS 622,816 bytes; transfer estimate 6,703,688 bytes.
Desktop and mobile-emulation running captures pass with no browser/network errors:
captures/audio/footsteps-reviewed-desktop/ and footsteps-reviewed-mobile/
under captures/audio/, including running-field.png screenshots. No new renderer
or performance claim; mobile capture uses scripted keys, not physical input.

## Approved recordings - owner accepted for release, 2026-09-07

Approved Mixkit 17 birds and 58 dog panting replace the rejected generated files.
Crowd murmur and farmhouse wind chimes are removed; the existing three baa variants
and other twelve short effects are preserved. Native-rate lossless FLAC avoids a
lossy re-encode; birds have twelve-second rests and panting follows fatigue.
Two streaming voices, natural 1x playback, 0.8-second gain time constants.
See docs/audio-approved-integration.md for recipe, provenance and release limits.

Validation: lint, typecheck, 95 files / 722 tests, production build and release
probe pass. JS gzip 622,811 bytes; estimated transfer 6,673,183 bytes; 14 audio
files totaling 2,155,682 bytes. Final JS asset index-BcYn3DdT.js. The preparation
recipe reproduces both manifest hashes and rejects unapproved source hashes.
Production desktop and mobile-emulation captures pass with stable build receipts,
no browser/network errors and active playback. Desktop mix -34.2 LUFS / -15.4 dBTP;
mobile mix -34.4 LUFS / -15.5 dBTP. Eleven lifecycle checks pass, including unlock,
pause/resume, mute, restart and tab visibility with no duplicate voices.
Evidence: captures/audio/approved-recordings-desktop-final/,
approved-recordings-mobile/ and approved-recordings-lifecycle/ (each under
captures/audio/); running-field.png in both capture directories. Mobile is browser
emulation with scripted keyboard movement, not physical-device listening.
No renderer change; performance percentiles were not measured in this audio pass.

Independent critic found no lifecycle blocker; source-hash checks, source sizes
and dead flock-position state were corrected. Objective boundaries are smooth.
Owner approved the running mix as "much better" and requested commit, push and
deploy. Remaining limitations: panting is very quiet, birds repeat every 20.33 seconds, and
10-minute auditory fatigue acceptance has not been established. Numeric signal
checks do not certify sound quality. Mixkit permits the game end product but
prohibits redistribution with source files. All licensed originals and prepared
files remain git-ignored. CI/preview/deploy now acquire hash-verified originals
and prepare the licensed audio before building; only the game artifact is
archived and deployed. Bitexact container metadata reduces total audio to
2,155,622 bytes without changing approved PCM. Release validation follows.

## Leaf-rustle removal - local candidate, 2026-09-07

Owner identified the isolated leaves loop as the mechanical, wispy sound and
approved removal or replacement. Removed it from media, manifest, runtime,
filters and proximity state; other audio sources and mix settings are unchanged.
The dated spec/07 override records this departure from the original ambient bed.

Validation: lint, TypeScript, 95 files / 723 tests, build and release probe pass.
16 audio assets; 623,467 gzip JS bytes; estimated transfer 5,548,615 bytes.
Independent static audio review found no actionable issues. Production-preview
lifecycle passes all 11 checks with four loops, including unlock, pause/resume,
restart, visibility, volume/mute, positional bark and no duplicate playback.
Desktop and 390x844 touch-emulated mobile running mixes pass with stable build
hashes and no runtime/network errors: captures/audio/leaves-removed-desktop/
and leaves-removed-mobile/. Both are approximately 20 seconds at -37.2 LUFS;
true peaks -15.6/-15.5 dBFS. Mobile uses scripted keyboard movement in a touch
viewport, not a physical-device input or listening receipt. Lifecycle evidence:
captures/audio/leaves-removed-lifecycle/. Probe browsers and servers closed.
Owner listening to the resulting mix and physical-device review remain open;
no new performance or renderer gate is claimed. Not committed or deployed.

## Search indexing investigation — 2026-09-06

Authenticated Search Console confirms the HTTPS homepage is indexed, fetched
successfully September 6, and selected as canonical by Google. The four reported
redirects are the HTTP homepage and retired scene URLs; preserve those redirects.
Resubmitted the existing sitemap successfully; Google's refreshed read remains
pending. See `docs/search-indexing-audit.md` for exact URLs and Analytics findings.
Local discovery-verifier guardrails now reject canonical redirects, HTTP noindex
headers and sitemap aliases. These tooling changes are not committed or deployed.
Validation: lint, typecheck, all 95 test files / 723 tests, production build,
release probe and source/built/live discovery pass. Unchanged runtime bundle:
623,633 gzip JS bytes; estimated transfer 5,773,849 bytes.

## Studio release authorization — 2026-09-05

Owner approved the responsive Studio, requested an updated README and authorized
commit, push and deployment. The release includes the local Studio correction
below and documentation corrected against current input and asset sources.
The exact-commit Pages workflow verifies the published identity and discovery.

## Mobile Studio correction — local review, 2026-09-05

Owner-reported Customize overflow is corrected in local build `index-Bq-a9SiU.js`.
Compact portrait bottom panel/landscape sidebar and shared camera composition
keep the animal in clear space. Toolbar selection, naming grids, registry scroll,
safe-area spacing, visual-viewport keyboard handling and focus behavior revised.
See `docs/studio-mobile-review.md`. Full suite94 files/719 tests passed; focused
checks after adjustments, lint, TypeScript/build and release probe pass.
623,633 gzip JS bytes;5,773,849 estimated transfer bytes. Not deployed.
Six-size renderer receipts: `captures/studio-mobile-accepted-webgpu/` and
`captures/studio-mobile-accepted-webgl2/`, all tabs/presets, names, orientation,
Escape/focus and overflow checks pass with no errors. Final naming-first reorder
and landscape visual-keyboard adjustment have a focused final probe. Physical
keyboard/notch behavior remains device-unverified. Probe browsers close; local
preview remains available for owner review at port5330.

## Release authorization — 2026-09-05

Owner requested "commit push and deploy" after the combined local playtest
handoff. This authorizes publication of this reviewed candidate through the
exact-commit Pages workflow. Known startup, physical-device and aesthetic review
limitations below remain disclosed; authorization does not turn them into passed
tests. Deployment status and live identity are verified by the workflow receipts.

## Current owner playtest candidate — 2026-09-05

Local production preview is running at http://127.0.0.1:5330/, bundle
`index-Ca8RQxz9.js`. See `docs/presentation-playtest.md` for the concise included
changes, evidence, playtest steps and release limitations. The entries below
this section are historical checkpoints, not competing current-build claims.

- Owner direction: implement the current trees and stop repeated tree design
  iterations. Trees, atmosphere/light, dense grass, gate cues, farmer, dog,
  camera/input, calmer audio and SEO are integrated for playtest.
- Latest dog tail/hock and front attachment passed narrow independent regression
  review on both backends. Exhausted sprint requires a real release/new hold.
- Found and fixed exact 180-degree heading lock in normal reversal. A small
  deterministic tangent starts the turn; no snap or trig, no regenerated trace.
  All five pinned traces still pass.
- 93 files / 713 tests, lint, TypeScript/build and release probe pass. Initial
  gzip JS 622,264 bytes; estimated transfer 5,772,481 bytes. Discovery verifies
  four built routes and local HTTP metadata, canonicals and social image.
- Final reversal gate probe `captures/guidance/final-reversal-gate/` passes both
  backends with settled behind-camera cue, visible opening, resume and viewport
  clearance. Prior `owner-opening-highlight-02` behind receipt was overstated:
  a transient offscreen condition did not survive until its screenshot.
- No production deployment. Owner art/feel/audio review, physical device tests
  and desktop cold-start budget remain release gates; do not call these passed.
- Final quiet-hub WebGPU run: 200 sheep at 1440p for 60 seconds, p95 8.4 ms,
  max 25 ms, zero >100 ms frames, 40 sampled draws, no errors. Startup 2,023.5 ms
  still misses 2,000 ms. Receipt: `captures/final-hub-receipts/`.
- Prior combined-renderer runs: WebGL2 desktop p95 8.4 ms/max25 ms, 40 draws,
  cold start3.95 s; phone-emulated low tier p95 8.4 ms/max33.3 ms, 28 draws,
  cold start3.39 s. No physical-mobile acceptance follows from laptop emulation.
- Final title-only CSS fixes clipped information links at844x390. Actual built
  title probes pass1440x900,390x844 and844x390, including Play/link reachability
  and no runtime errors. Evidence: `captures/discovery/`. Gameplay receipts
  precede only this title layout adjustment. Preview is intentionally left running
  for owner playtest; probe browsers/servers and hub browser processes closed.

## Presentation and feel plan — 2026-09-05

- Front-leg attachment candidate is now built as `index-DYxsVRVM.js` on port5330.
  Buried upper roots follow the adjacent torso's chest/neck skin weights, with a
  tapered transition to the upper leg; forward paws and bone chains are retained.
  Geometry is 1,696 triangles. Actual skinned containment verifies 34 attachment
  vertices against torso triangles across 20 poses. Full suite: 90 files / 701
  tests; lint, TypeScript/build and release probe pass (621,846 gzip JS bytes,
  5,770,876 transfer bytes). An indexed-array type error in the first build was
  corrected without changing arithmetic; stale `front-attachment-after-webgpu`
  capture is explicitly marked INVALID and must not be used as after evidence.
- Correct after evidence: `captures/actors/front-attachment-fixed-webgpu/` has
  stable build hashes, no page errors, Studio front/profile/hero and normal held
  W+A/W+D movement. Independent narrow standing-view PASS: exposed upper caps
  gone, roots sit beneath chest, profile connection continuous. Remaining shoulder
  shading is faceted but does not read detached in those views. This does not
  establish broad character acceptance or continuous gait smoothness. Matching
  `front-attachment-fixed-webgl2` capture also passes with stable hashes and no
  page errors. Broader art remains paused per owner priority.
- ACTIVE PRIORITY, owner correction: dog front legs are not properly attached.
  Broader art work is paused while attachment is corrected and reviewed in idle
  and held W+A/W+D movement. The narrower torso plus forward-shifted legs exposed
  an upper-leg/body skinning transition problem; a separate chest paint-mask
  correction does not establish anatomical attachment. Current before-fix build
  is `index-BQVeZX8g.js` (90 files / 700 tests, lint and TypeScript build pass).
- Current owner-review build: `index-CD0FvYH3.js`, served at local port 5330.
  Includes dense meadow, narrower dog chest, foreleg chains moved forward 14 cm,
  open level eyes, turning paw lift-off continuity, zero Studio body bob, farmer
  shoulder/contact refinements, corrected below-zero boundary-tuft paint, audio
  fixes and the redesigned gate. Lint, TypeScript build, 90 files / 699 tests,
  release probe pass: 621,669 gzip JS bytes / 5,770,699 transfer bytes. Genuine
  WebGPU actor capture includes sustained W+A/W+D sequences, stable hashes and no
  page errors (`captures/actors/owner-dog-diagonals-webgpu/`). Runtime/owner
  acceptance and current dense-field hardware performance remain open.
- First redesigned gate probe reached visible opening and behind-camera views,
  then failed an obsolete resume assertion requiring the now-hidden badge to
  appear. Its data showed on-screen/unobscured with hidden badge, consistent with
  the redesign. The probe now checks projection-consistent resume behavior and
  deliberately returns to offscreen framing for unchanged mobile bounds checks.
  Retained failed evidence: `captures/guidance/owner-opening-highlight/`.
- Owner review corrections now take priority: evenly dense grass (scattered
  treatment rejected), a redesigned gate cue with actual entrance highlighting,
  and a slimmer/less round dog torso below the neck. Source grass correction
  removes strong density/height correlation: field 81,752 / surround 16,595 tufts,
  1,180,164 bytes, height scales 0.75–1.25. Twenty-nine grass checks pass. Greater
  density requires fresh runtime/performance evidence. These revisions are now
  in the current preview described above.
- Integrated pre-owner-correction build passes lint, TypeScript build, 88 files /
  691 tests and release probe (621,146 gzip JS bytes; 5,408,664 transfer bytes).
  Dog5 actor captures on genuine WebGPU and forced WebGL2 have stable hashes and
  no page errors. Final independent Studio verdict remains unaccepted at cap 5;
  owner torso correction is a new explicit revision, not retroactive acceptance.
- Farmer contact correction: actual skinned-boot test reproduced 4.89 cm of
  sole lift at a flat-ground stride endpoint. Lowering posed hips from 1.10 to
  1.04 m leaves knee reach for the stride; all five sampled stance phases now
  stay within 5 mm on both feet. Seven farmer tests pass, source digests updated. This does not
  prove all slope contact or replace motion review. The centered normal-approach
  farmer capture is complete but predates this source correction.
- Historical dog model pass 5: narrower sloping bib, eased
  shoulder transition, restrained eye aperture and reduced coat-band contrast.
  Geometry is 1,664 triangles (+24); bones, solvers, soles and draw count remain
  unchanged. Forty-seven focused tests and scoped lint passed. Final independent
  review remained unaccepted; subsequent owner-directed corrections are above.
- Current source adds distance-dependent crowd filtering (1,300 Hz near to 650 Hz
  far, smoothed over 250 ms) through the existing node. Ten audio graph/fatigue
  tests pass, including listener/flock movement and bounded graph size. This is
  now rebuilt but not yet captured; earlier audio recordings precede this change.
- Dog iteration 4 independent still-image review: ITERATE. Raised head and tuck
  improve the profile; broad rigid bib, shoulder join, bead-like eyes and slab-like
  torso shading remain. Final bounded model pass 5 is underway. Animation and
  two-camera gameplay acceptance are separate from Studio anatomy review.
- After-build interaction review closes the reproduced nameplate overlap and
  verifies sampled portrait steer+sprint+camera, release, gamepad disconnect and
  neutral reconnect, and reduced-motion switching. No runtime errors; build
  hashes stable. Evidence: `captures/profiling/interaction-after-review/review.md`.
  Physical-device feel and measured camera jerk remain unverified. Full regression
  suite at the dog4/nameplate checkpoint passed 88 files / 686 tests.
- Current source/build adds dog iteration 4 (raised/retracted skull, 0.30 m
  muzzle, lifted rib/waist underside and softer wrists) and fixes the interaction
  critic's Classic nameplate overlap by anchoring above the dog with a 20 px
  minimum screen gap. Rig remains 22 bones / 1,640 triangles. Dog's 47 focused
  tests, lint and client typecheck pass; build/release probe pass at 620,835 gzip
  JS bytes and 5,408,352 transfer bytes. After-build visual/interaction checks
  completed with the interaction result and dog iteration 4 critique above.
- Independent input review of frozen dog3/meadow5 verified normal keyboard
  release/reverse, pause-held-input handling and camera switching. Gamepad and
  touch half input moved roughly half full input distance; deadzone held still.
  Evidence and precise limitations are in
  `captures/profiling/interaction-frozen-review/review.md`. This is browser
  emulation, not physical-controller or phone latency acceptance.
- Hub startup diagnostic on dog3/meadow5: resources completed by about 285 ms,
  renderer around 647 ms, mounted scene 1,051 ms, shaders 1,876 ms and presented
  2,061 ms. The corrected in-browser ready observer measured 2,062.7 ms, still
  above the desktop 2,000 ms requirement. Earlier readiness numbers included
  locator polling delay (one run was 2,704 ms versus presented 2,180.5 ms).
  `tools/hub-presentation-probe.mjs` now retains wall observation separately and
  uses a browser MutationObserver timestamp for readiness; `--boot-only` records
  a diagnostic without claiming frame-budget coverage. Before-run GPU was 0%,
  no competing game process observed; receipts in `captures/hub-dog03-startup/`.
- Dog iteration 3 is built: muzzle stop-to-nose length 0.260 to 0.360 m,
  narrower cheeks, fuller lower chest, articulated wrists and five-ring paws.
  Geometry is 1,640 triangles; rig remains 22 bones with two body draws and one
  contact shadow. Forty-seven focused dog tests and scoped lint pass, including
  actual skinned-sole contact checks. Production build/release probe pass at
  620,722 gzip JS bytes and 5,408,239 estimated transfer bytes. This supersedes
  earlier size receipts; actual front/profile and motion review is in progress.
- Scene iteration 5, `meadow-massing-05`, closes the five-iteration scene loop
  without acceptance. Independent verdict: ESCALATE for art-direction review.
  Grass now uses correlated 28 m groups, shorter 0.42–1.25 tuft scales and
  stronger density variation. Field tufts fall from 64,946 to 55,495;
  surround 13,350 to 12,726. Asset size falls 939,552 to 818,652 bytes.
  This is an intentional authored scatter change, not a simulation-fixture update.
  Twenty-four focused bake/interaction checks pass unchanged, including byte
  reproduction, height ranges, ground contact, keep-outs and low-tier coverage.
  Production build and release probe pass: gzip JS 620,679 bytes; estimated
  transfer 5,408,196 bytes. Classic WebGPU, Follow WebGPU/WebGL2 and phone low
  captures have stable pages and correct backends; local timing gates still fail.
  Full regression suite passes 88 files / 686 tests at this grass checkpoint.
- Critic accepts the direction of grass massing, not the finished scene. Visible
  sheep are distinguishable, but the full flock is not framed. Remaining scene
  issues: flat olive clearings; mismatched grass/tree/cloud edge detail;
  repetitive horizon arrangement; padded crowns and graphic clouds. Scores:
  silhouette 7, ramp 6, cohesion 7, painterly conviction 5, screenshot test 6;
  visible-animal readability 7. Establish an approved in-scene target for ground,
  foliage and sky together before opening another scene art loop. Do not call
  the five-iteration cap an acceptance. Other character/input/audio evidence work
  can continue independently.
- Historical built candidate `cohesion-04-dog-02`: 88 files / 686 tests, lint,
  client typecheck, production build and corrected release probe pass. Initial
  gzip JS 620,678 bytes; transfer 5,529,095 bytes. Release verification now checks
  23 dog/farmer source digests. The art wrapper retained an initial checker failure
  because the dog ledger legitimately includes its authoring tool; its path
  allow-list is corrected and a separate release probe passed on the same build.
  Source/build capture hashes are stable. Local timing failures remain provisional.
- Independent scene iteration 4 and dog model iteration 2 both remain ITERATE.
  Dog face/contour and chest are visibly improved. Next work: grass height and
  grouped masses judged against a full-flock Classic/Follow composition; clearer
  dog shoulder/wrist/paw forms; less padded tree lighting. Clouds remain graphic.
  Scene scores: silhouette 7, ramp 6, cohesion 7, painterly conviction 5,
  screenshot test 6. Continuous movement and farmer anatomy remain unaccepted.
- Gate iteration 2 runtime checks now pass both genuine WebGPU and WebGL2:
  visible/behind cues, pause/resume, portrait/landscape bounds and explicit HUD/
  button overlap checks in `captures/guidance/gate-02-settled/`. A preceding
  fixed-delay probe failed before camera settling; condition-based waiting
  verifies the intended state without assuming a fast host. Physical touch and
  terrain/object-occlusion coverage remain separate open review items.
- Ten-minute idle audio recording completed at `captures/audio/calm-audio-fatigue-200/`:
  599.984 seconds, stable production hashes, one running context, no page/network
  errors, -42.2 LUFS and -22.9 dBFS true peak. This is a capture, not completed
  fatigue listening. `tools/audio-capture.mjs --layer=leaves-loop` (or crowd/birds/
  pant/chime) now supports tools-only isolation through the normal downstream mix;
  isolated recordings still need to be captured and judged.
- Next visual candidate: dog model iteration 2 refines face, chest, wrists,
  paws and outline at 1,272 triangles (+24), preserving the 22-bone rig.
  Atmosphere iteration 4 replaces uniform cloud bases with offset connected
  lobes and shape-following shade. Grass reduces compounded dark roots and
  per-clump brightness contrast. Forty-three focused tests pass across grass,
  sky and actor rigs; client typecheck passes. New production visual review
  remains pending while the previous build's ten-minute audio capture finishes.
- Hub hardware baseline (before the above visual candidate): 60-second runs,
  200 sheep, 2560x1440 high, NVIDIA GTX 1660 Ti Max-Q, performance power profile.
  Genuine WebGPU and native-GL WebGL2 both measured 8.4 ms p95; readiness was
  3,725 / 5,995 ms and maxima 141.6 / 191.6 ms. Startup and hitch gates fail.
  Phone viewport 390x844 DPR3 at low WebGL2 measured 8.4 ms p95, 58.3 ms max
  and 2,689 ms readiness on the laptop GPU: emulation, not physical-mobile proof.
  Before-run GPU was 0%; five-second process samples show probe Chrome and normal
  desktop services, with no observed competing game. Reports include build hashes,
  driver/adapter identity and samples in `captures/hub-presentation-latest/`.
  Draw receipts (40 desktop / 28 phone) cover the final 250 ms only, not a
  whole-run maximum. The failed WebGL2 Vulkan launch is retained separately;
  native GL succeeds. No clean overall performance acceptance is claimed.
- Goal execution has started. Gate guidance now has an initial store-driven
  on/off-screen cue, behind-camera projection and painted gate-post collars;
  client typecheck and four projection tests pass. Iteration 1 production smoke
  rendered on genuine WebGPU and forced WebGL2. `captures/guidance/gate-01-turn/`
  verifies visible/behind-camera cues, pause/resume and viewport bounds on both
  backends. Critic found phone counter overlap; iteration 2 source now reserves
  full badge bounds and HUD/control margins, avoids redundant subscription writes,
  and adds reduced-motion-aware transitions. Rebuilt visual validation of those
  fixes is pending. Terrain-only occlusion is not complete object occlusion.
- Dog now has a 22-bone skinned rig with terrain-aware paws; farmer has a
  13-joint rig and bounded homestead route. Integrated production captures in
  `captures/actors/integrated-01-webgpu/` and `integrated-01-webgl2/` verify both
  backends with stable build hashes and no page errors. Continuous recordings
  exist, but have not received playback acceptance. Dog model iteration 2 is
  addressing the critic's blunt face, chest plate, peg feet and heavy contour.
  Farmer remains too distant/obscured in captures for anatomy or gait acceptance.
- Integration checkpoint: lint, client typecheck, 88 files / 686 tests,
  production build and release probe passed. Initial gzip JS is 620,533 bytes;
  first transfer is 5,528,951 bytes. These receipts precede dog model iteration 2.
- Camera now follows the same interpolated subject as dog rendering and clamps
  intermediate camera transitions above terrain; focused camera tests pass.
  Combined input/motion review remains open.
- Controller: partial analog intent now scales target walking speed, preserving
  the existing full/digital normalization path. This is an intentional gameplay
  improvement for precise positioning, not just animation polish. Thirty focused
  control/input/sim tests and twelve determinism/trace checks pass; all existing
  fixtures remain unchanged. Running touch/gamepad feel review is pending.
- Owner added lane 9 for calmer audio: wind-like whooshing and excessive sheep
  noise. The [audio audit](docs/audio-balance-audit.md) records current sources,
  scheduling and listening tasks. Dedicated wind is absent from runtime; the
  actual whoosh source remains unisolated. The baseline permitted a baa start
  every 0.467 s over continuous crowd ambience. Candidate source now adds longer,
  varied call spacing, crowd rests, quieter leaves and fixed spectral filtering.
  Layer isolation and listening acceptance remain pending; this extends rather
  than replaces the original eight-lane goal.
- Audio candidate production capture `captures/audio/calm-audio-candidate-200/`
  has stable build hashes, no page/network errors, -37.2 LUFS and -15.5 dBFS
  true peak. The baseline was -31.7 LUFS / -14.7 dBFS. These short captures do
  not establish subjective improvement; source isolation and fatigue listening
  are still required. A quieter result alone does not satisfy the calm pillar.
- The owner requested a documented eight-lane goal before starting the expanded
  work. See [presentation and feel plan](docs/presentation-and-feel-plan.md) for
  scope, file ownership, sequencing, review criteria and the copy-ready goal.
- It includes continued tree/atmosphere work, gate guidance, dog asset/rig/motion,
  controller/camera polish, an ambient farmer, scene cohesion and validation.
  The planning checkpoint originally had dog work at audit-only; implementation
  has since started as recorded above. No future mode implementation is included.
- All earlier local performance isolation claims are provisional: other agents
  may have been running games. The hub is reachable, but clean CPU/GPU conditions
  must be checked again before and during any replacement performance run.

## Art iteration reopened — 2026-09-05

- Owner authorized a local implementation for review after the concept sheets.
  Main was freshly checked against `origin/main` at `50757dae` before this work.
  The candidate now includes an owned sculpted-oak recipe plus coordinated sky,
  cloud, sun, haze and lighting changes. Nothing has been deployed.
- `tools/bake-sculpted-trees.mjs` deterministically generates the committed
  geometry with source/output digests and AGPL provenance. Seven unequal crown
  masses and connected tapered wood use 560 + 364 triangles per tree: 128,436
  triangles across the unchanged 139-tree placement, still three treeline draws.
  There are no alpha leaves, external models or new tree textures. Tree and bark
  colors now use the master palette. Whole-crown normals soften isolated lobe
  lighting; normalized shader coordinates use `positionGeometry`, avoiding the
  first iteration's instance-space crown/trunk separation.
- Atmosphere: six authored cloud masses in the existing opaque sky draw; warm
  highlights and restrained cool undersides; horizon-matched haze; defined sun
  disc with local glow. Fog now spans 210–580 m. High-tier bloom is 0.18 with
  threshold 1.05; vignette depth is 0.12. Low tier retains the sky/cloud shading
  without postprocessing. Sun direction remains the shared eight-degree light.
- Independent critique: iteration 1 required warmer, less evenly rounded crowns
  and less slab-like clouds; iteration 2 fixed the detached foliage but retained
  padded oval shading; iteration 3 improved connected masses and cloud volume.
  Iteration 3 is suitable for owner review, with verdict ITERATE, not AAA visual
  acceptance. Scores: silhouette 7, ramp 6, cohesion 7, painterly conviction 5,
  tree readability 7, screenshot test 6. Remaining issues are padded canopy
  patches, uniform Y-shaped forks, dense sharp grass versus smooth trees, and
  graphic cloud bases. Continuous motion and physical mobile remain unaccepted.
- Current validation: lint and client TypeScript passed; 83 files / 656 tests
  passed. Production build and release probe passed: 613,245 gzip initial JS
  bytes and estimated first transfer 5,521,662 bytes across 37 files. Current
  60-second renderer evidence is under
  `captures/profiling/sculpted-oak-03-final/`. All six views pass actual backend,
  nonblank screenshot, page stability and draw limits. P95 in matrix order is
  7.1 / 7 / 7 / 48.6 / 34.7 / 20.9 ms; peak draws 49 / 50 / 50 / 50 / 33 / 38.
  Every startup and maximum-gap check failed; portrait high and low also fail
  p95. Crucially, the owner then reported other agents running games on this
  machine: these timings are POTENTIALLY CONTAMINATED and cannot establish
  performance acceptance or a regression. Check hub availability and quietness
  before collecting replacement timing evidence. Art review awaits owner feedback,
  with three of the maximum five critique iterations documented.

### Earlier tooling baseline (before runtime art changes)

- The owner reopened trees, atmosphere, clouds, sun and lighting for a stronger
  art direction. Historical foliage acceptance below is not acceptance of this
  new review. This change adds offline production-build review tooling only;
  it does not change runtime art or deploy anything.
- `npm run review:art` rebuilds, checks the release surface and captures the
  normal game at desktop and emulated phone sizes on WebGPU and forced WebGL2.
  `docs/art-review.md` documents baseline/candidate comparisons, source hashes,
  comparable settings, explicit failed gates and separate human art acceptance.
- Validation: lint and client TypeScript passed; 83 test files / 655 tests
  passed. Production build and release probe passed: 627,957 gzip initial JS
  bytes; estimated first transfer 5,536,374 bytes over 37 files.
- Final isolated tools-only smoke receipt:
  `captures/profiling/art-baseline-tools-20260905/index.html` (four views plus
  three motion stills each). Genuine WebGPU Classic/Follow, forced WebGL2 Follow
  and emulated phone landscape low all pass backend, frame p95, maximum gap,
  stable-page, nonblank canvas and draw-count checks. Five-second p95 values:
  7 / 7 / 7 / 27.8 ms; peak API draw counts: 44 / 50 / 50 / 38. These instrumented
  API counts include browser-probe overhead and are not native renderer GPU
  timings. Camera labels describe scripted controls, not measured transforms.
- Boot remains FAILED on every view: 2,601 / 2,570 / 3,786 / 5,731 ms against
  2,000 ms desktop and 5,000 ms mobile limits. The wrapper correctly exits 1.
  Source and build hashes remained stable; release-surface probe passed with
  no runtime diagnostics added. Earlier exploratory receipts are superseded;
  overlapping browser activity makes their timings unsuitable as a baseline.
- Generated baseline HTML loaded all 16 images with no page errors; a local
  same-receipt comparison smoke loaded all 20 side-by-side/motion images.
  Beauty-camera and grounding acceptance remain unavailable in production;
  they are not silently treated as passed by this art tool.
- Open specification questions (pre-existing, no silent runtime correction):
  `spec/08-performance.md` forbids a per-frame quality governor, while
  `app/src/quality/RuntimeQualityGovernor.tsx` exists; `spec/05-art-direction.md`
  requires the master palette to own colors, while treeline `foliage.ts` and
  `farmhouse/palette.ts` contain authored colors; `spec/04-world-and-assets.md`
  requests an in-field hero tree, while the current treeline README describes
  139 trees outside the fence and no shrubs. Keep the current behavior for this
  tooling change; resolve intent before changing those systems.
- Art verdict remains UNREVIEWED. Physical mobile remains NOT_TESTED. Five-second
  iteration receipts do not satisfy the specified 60-second performance gate.

Updated 2026-08-24 with the approved loading, launch-media and audio-restoration
follow-up. The deployed `release.json` remains the authority for production
commit identity.

## Production state

- Version 3 client source, deterministic simulation, procedural assets, tests
  and public documentation have been curated into the SDS release branch.
- Version 2 remains recoverable from the annotated `v2.6.4` tag, the pushed
  `release/2.x` branch at `d5c38469`, and immutable Pages deployment
  `https://7cea2cd2.sds-frontend.pages.dev`.
- Multiplayer and the 5,000-sheep player path are absent from the version 3
  client. Solo-time boards use only the isolated `field-v3` partition.
- Solo times are reachable from the title screen and after a completed run.
  No name entry is required: the service assigns a random running name unless
  the player chooses Edit, and the board read path does not require identity.
- Version 3 is live at `https://sheepdogsim.com`. `release.json` is the
  authority for the exact deployed source commit and artifact digest.
- The production Worker was deployed first without a D1 migration. Health and
  all three `field-v3` leaderboard read paths returned HTTP 200 before Pages
  was cut over.
- Player-facing branding is `Sheepdog Sim`. The `3.0.0` number is retained only
  in package, migration and release records.
- The owner selected the CC0 Fox Trees Pack Round and Spreading hybrid for the
  shipped treeline. The final field contains 139 trees outside the fence, no
  understory shrubs and no exposed root runs.

## Passed evidence before public import

- 51 test files and 327 tests passed in the clean-room candidate.
- Lint, TypeScript, production build and release-surface probe passed.
- The 17 runtime audio files are pinned by size and SHA-256 in a source ledger.
- WebGPU and forced WebGL2 foliage captures matched with four foliage draws,
  276,110 submitted triangles, no textures and no external models.
- Standalone grass WebGL2 motion evidence found no sharp seam, rhythmic
  stationary annulus or snapping wake trail after the distance-sampled wake
  fix. The integrated game still needs the same running-build probe.

## Clean SDS candidate evidence

- Lint passed. Client and Worker TypeScript checks passed.
- 77 test files and 613 tests passed after the Fox hybrid import.
- Root and Worker dependency audits report zero vulnerabilities.
- Gitleaks 8.30.1 scanned 12.50 MB with no findings. Direct runtime and build
  dependencies report MIT, ISC, Apache-2.0 or dual MIT/Apache licensing.
- The production build contains 231 modules. Initial JavaScript is 612,634
  gzip bytes. Estimated first transfer is 5,768,165 bytes across 35 files,
  below the 8 MiB release limit.
- The procedural replacement passed deterministic bake checks but was not
  owner-accepted for sound character. Treat its inclusion in the public
  cutover as a release regression, not an approved audio decision.
- The deterministic simulation produced 23,563 identical bytes through the
  independent esbuild and Vite bundles.
- Actual WebGPU and forced WebGL2 running-game captures passed at 1,600 by
  1,000 with four foliage draws and no runtime errors.
- The selected Fox hybrid passed its final running-game capture with three
  foliage geometry draws, 94,798 submitted triangles before shadows and a
  WebGPU p95 frame time of about 7 ms.
- Desktop, tablet, phone portrait, phone landscape and reduced-motion UI probes
  passed with no clipped content or controls below 44 CSS pixels. This is
  Chromium touch emulation, not a physical-device receipt.
- The title-screen times dialog passed those same layouts with keyboard focus,
  Escape-to-close and focus restoration. The local probe data is mocked so
  repeated layout checks cannot create identities or write public scores.
- The isolated Pages and Worker preview passed a real mobile interaction: a
  random running name was assigned, renamed to `Preview Shepherd`, and the 25,
  75 and 200 boards each returned HTTP 200. No staging scores were submitted.
- The integrated grass motion critic passed native WebGPU and forced WebGL2 at
  automatic Low and player-forced High settings. It could not reproduce the
  rhythmic annulus, wake snapping or diagonal dark lane.
- The 1,200 by 630 site card and 1,280 by 640 GitHub social preview were
  regenerated from the production bundle on actual WebGPU without score writes.
  The GitHub JPEG is 273,355 bytes.
- Canonical pages, JSON-LD, Open Graph, Twitter cards, robots, sitemap, legacy
  redirects and social-image dimensions pass the discovery gate. Production
  verification also requires the existing Cloudflare Web Analytics beacon.
- Pull request 86 passed Client CI, the isolated score-service preview and the
  Pages preview before merge. The owner then requested the production cutover.

## Post-release follow-up evidence

### Approved follow-up release

- The 17 actual ElevenLabs-generated MP3 assets from commit `6380fe64` are
  restored without changing the audio graph, buses or scheduler. This
  is the earlier 1,255,526-byte set the owner preferred, with the rejected
  insects and wind loops still absent.

- The blank post-React paper wash is replaced by an immediate loading card.
  Its percentage is derived from observed terrain, grass, treeline and scatter
  bytes plus renderer initialization, capability measurement, mounted scene,
  shader compilation and the first presented frame. It cannot publish 100%
  before the field has drawn.
- `npm run probe:boot` now measures the public DOM contract and records named
  `herd:boot:*` performance marks without relying on the retired debug readout.
- Two final cold probes reached Play-ready in 2,299 to 2,371 ms on desktop and
  5,009 to 5,175 ms under 4x CPU plus 9 Mbps mobile emulation. The honest
  progress card reached `Field ready` without page, request or response errors,
  but both results miss the 2,000 ms desktop target and the mobile result is 9
  to 175 ms over its 5,000 ms target. This remains a measured post-release
  optimization risk rather than an unreported pass.
- The candidate passes lint, client and Worker TypeScript, dependency audits,
  production build and 78 test files with 627 tests. The build contains 234
  modules and 614,466 gzip bytes of initial JavaScript. Its estimated first
  transfer is 4,009,011 bytes after restoring the smaller MP3 source set.
- The Open Graph image and GitHub social preview now use a reproducible
  200-sheep Follow-camera gameplay capture. The GitHub JPEG is 221,312 bytes.
  The capture forces the real WebGL2 fallback because first-context headless
  WebGPU screenshots can return a clear canvas; gameplay uses the same TSL
  material path on both backends.
- React Three Fiber is now named in the README and package keywords. The
  repository topic remains a separate metadata follow-up.
- The loading card and title state share the same boot-grid cell, keeping the
  loading card vertically and horizontally centered. Desktop 1,440 by 900 and
  mobile 390 by 844 screenshots passed owner review.
- Portrait Follow uses a wider lens, higher seat and shorter look-ahead. The
  packaged 390 by 844, 200-sheep probe kept the dog framed, held the joystick
  and dedicated Sprint button together, drained stamina from 100 to 76 and fit
  `200 / 200` inside the progress circle. Desktop movement, bark, pause and
  resume also completed without console, page, request or response errors.
- Dog markings now remain attached through vertex deformation; farmhouse dirt
  remains only inside the pen; sheep cheek wool and upper-leg widths are
  balanced; and the asymmetric gait plants backward, recovers forward and
  folds the airborne leg rearward without the rejected body stomp. Matt
  approved the local candidate and authorized commit, push and deployment.
- The restored MP3 runtime passed the production-preview audio lifecycle probe:
  one graph, gesture unlock, five non-duplicated loops, pause/resume, restart,
  visibility, mute/volume and positional bark all passed with no media errors.

### Customizer Studio, Screen-Space Heritage Nameplates and Working Dog Naming

- Added Customizer Studio to personalize working collie coat presets, dog naming, and flock breed variety.
- Working collie can be named by the player, defaulting to "Pip" with 20 authentic British working sheepdog names in a roll ledger. Persisted to `localStorage` under `herd.customization.v1`.
- Implemented unified Screen-Space Heritage Nameplates with 100% native vector Retina typography (Alice serif font, walnut border `#282016`, gold rosettes `◆`, and downward chevron pin) anchored via 3D camera projection. Resolves mobile DPR downsampling blur without Three.js texture upload overhead.
- Features dual-envelope tracking hysteresis (0.055 NDC acquisition, 0.110 NDC retention, 250ms dropout grace window), harmonic spring arrival (\(k=260, c=18\)), organic pasture bobbing, and full mobile touch parity (tap-to-pin for 4s, tap-to-dismiss).
- Flock breeds supported: Suffolk, Cheviot, Herdwick, Kerry Hill, Badger Face, Moorit, and Balwen.
- 81 test files and 649 unit tests pass. Lint, client TypeScript, Worker TypeScript, and production build pass with zero errors and zero warnings. Initial JavaScript bundle is 627.54 kB gzip.


- Complete the desktop, mobile, offline-score and service-worker transition
  matrix in `docs/launch/v3-launch-pack.md`.
- Complete a physical iOS or Android playtest. Browser touch emulation already
  covers portrait and landscape layout, joystick, bark, camera and pause.
- Capture the remaining final launch screenshot set from the accepted commit.
- Update the stale GitHub description/topics,
  redirect `www.sheepdogsim.com` and `sds-frontend.pages.dev` to the apex, and
  submit the sitemap in Google Search Console and Bing Webmaster Tools.

## Open questions

- None for the production cutover. Physical-device and final launch-media
  receipts remain follow-up evidence.
