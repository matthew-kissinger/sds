# Stabilization and public playtest plan

Prepared 2026-09-07. Status: bounded stabilization release candidate; final verification underway.

## Release closeout agreed with the owner

Finish and release the current stabilization pass: review and polish the existing
fixes, resolve release-blocking regressions, validate one frozen build, then
commit, push and deploy the approved exact version. The broader acceptance
program below remains a backlog, not a requirement to repeat every probe before
shipping these improvements. No claim of flawless performance or full device
certification is made.

Carry forward variable WebGL2 shader-completion/loading delays, the isolated
unexplained frame spike, physical mobile/gamepad and actual WebGPU-loss coverage,
slow-service coverage, and production investigation of the empty 75 board when
Cloudflare access is restored. Retain existing Auto-only downward adaptation;
the boot-only spec mismatch remains an explicit open product decision. Do not
ship the diagnostic extension override or add speculative renderer internals.

Final actions: independent diff review, one full local validation, one short
quiet-hub smoke on each backend, coherent commits, push/CI, exact-SHA approval,
deployment and live identity/play verification. No further long herding runs.

## Owner-directed focus update

The owner requested shorter targeted checks instead of long automated herding
runs. For 75/200 completion and score routing, prepare a tools-only fixture with
all but one sheep penned, then drive the last sheep through the normal gate and
completion path. Do not write artificial results to public leaderboards. Keep
long soaks for a specific performance hypothesis; do not repeat full herding as
ceremony. Report concrete fixes and remaining player-visible issues.

## Outcome and scope

Make the current game reliable from first visit through a complete herding run,
pleasant for an extended session, and ready for people arriving from a public
post. Work with the existing field, dog, art direction and 25/75/200 sheep.
Multiplayer, larger flocks, campaign, survival and idler systems remain deferred.

The existing bark warmup is a local candidate, not an accepted release.
[The investigation](performance-stabilization.md) holds the starting evidence.
This plan does not authorize deployment or publishing posts.

## 1. Establish trustworthy reproduction

- Record the candidate source diff, built artifact hashes, browser, GPU, display
  cadence, viewport and quality settings. Run performance browsers sequentially;
  check competing CPU/GPU workloads without closing the owner's applications.
- Use a browser window that fits the hub's actual display. Compare normal play
  without debug UI against diagnostic runs, with launch flags and instrumentation
  recorded. A fast blank scene or incorrectly framed dog is a failed visual
  result, regardless of its frame timings.
- The owner confirmed another PC Chrome web game and concurrent agents during
  local testing. Use the quiet hub as the performance lane, with two consecutive
  CPU/GPU idle samples before each trial. Keep PC traces as diagnostic evidence;
  do not use them to certify timing or blame the application for contention.
- Recheck the first-bark baseline with alternating original/candidate builds so
  warmed driver caches and background activity cannot explain the improvement.
- Resolve blank mobile WebGPU captures first: compare headed and headless runs
  of the same build, before and after the warmup change, then physical hardware.
  Observe the actual field, not only HUD, frame callbacks or backend labels.
- Extend the normal-input route to cover idle, first movement, sprint, bark,
  camera switching, turning toward new scenery, pause and resume. Timestamp
  input events, frame gaps, long tasks and pipeline creation in tools only.

Exit: repeatable named scenarios; a conclusion about the blank canvas supported
by visible rendering evidence; reliable failure output and automatic cleanup.
If physical hardware is unavailable, leave its acceptance open explicitly.

## 2. Remove first-use and movement stalls

- Finish bark warmup verification on both renderer backends and Auto/High/Low,
  including an immediate bark after Play, repeated barks and bark after restart.
- Trace the reproduced 76–83 ms early-movement gaps. Separate CPU execution,
  garbage collection, shader/pipeline work, GPU work and probe overhead before
  choosing a fix. Do not infer a cause from the absence of Long Tasks.
- Investigate remaining High-quality first-use cost with its actual postprocess
  render target. Warm required work through the normal initialization lifecycle.
- Test first sprint, first camera switch, first penned sheep and completion for
  the same deferred-work pattern. Preserve animation, audio and herding behavior.

Exit: no repeatable application-caused first-use stall in five fresh runs per
affected desktop backend/quality combination. Proposed polish alarm: investigate
every active frame above 33.4 ms on 60 Hz targets and 66.7 ms on 30 Hz targets;
do not accept the old 100 ms ceiling as proof of smoothness. Report p95, p99,
maximum and over-budget counts separately. Unexplained outliers stay open.

## 3. Improve loading and sustained performance

- Profile the boot timeline by stage: fetch, parse, asset construction, capability
  measurement, material compilation and first presented frame. Optimize measured
  bottlenecks while retaining honest progress and complete first-use readiness.
- Profile simulation, instance updates, grass, shadows/post, UI and audio during
  representative herding. Address allocations only when their cost is established.
- Resolve the spec/08 mismatch around the runtime quality governor as an explicit
  recorded decision. Proposed default: retain current behavior during diagnosis;
  choose the final boot/runtime policy from device evidence before closing this step.
- Preserve all 200 sheep and deterministic fixtures; reduce presentation cost
  without weakening gameplay or quietly lowering owner-selected settings.

Exit: meet the existing 2 s desktop / 5 s mid-mobile boot budgets, desktop 60 fps
at 1440p with 200 sheep, and the mobile tier budgets (60 fps high / 30 fps low).
Measure a 60-second route in each declared performance profile. Keep whole-frame
draw calls below 100, gzip JS below 1.5 MB and first transfer below 8 MB. Any
unmet requirement remains a visible release gate, not a rewritten threshold.

## 4. Verify complete sessions and recovery

- Retain the completed 25-sheep real-herding receipt. Check 75/200 completion
  with the owner-approved one-sheep-left fixture and normal final gate crossing.
  Treat that as completion/score-path coverage, not whole-run gameplay proof. Cover both
  cameras, keyboard/mouse, supported gamepad controls and physical touch.
- Run a 30-minute mixed session on desktop and each available physical mobile
  target, with repeat runs, Studio visits, quality changes and audio enabled.
  Compare equivalent post-restart checkpoints for growing memory, renderer
  resources, event listeners and audio voices; distinguish caches from leaks.
- Test pause/resume, tab backgrounding, phone lock/unlock, resize/orientation,
  lost pointer focus, held controls, mute, reload and saved preferences.
- For native focus recovery, require observed blur/visibility events in a
  visible browser without forced focus emulation. The desktop typing and lost
  keyup route passes. Touch Sprint keyboard holds, mixed pointer/keyboard release,
  secondary-finger ownership and emulated touch pause/resume now pass production
  probes. Physical mobile interruption and assistive click-only use remain open.
- Exercise unavailable/slow score service, offline play, completion submission
  failure and supported renderer/context-loss recovery. Use isolated mocks or
  preview services so automation never writes public scores.
  Current-build normal 25-sheep completion and Play Again pass with registration
  returning 503; local-best persistence through failure/fresh store also passes.
  Targeted 75/200 final-gate completion, correct request payload, replay and actual
  reload persistence now pass; 75 post-registration submission failure also passes.
  Matching worker SQLite write/filter/read checks pass for all three counts.
  Production rejected-submission inspection needs restored Cloudflare access;
  slow-service browser coverage remains.
  Forced WebGL2 loss now stops simulation/audio and offers reload, verified on
  desktop and portrait emulation, title and Settings. Physical phone loss,
  actual WebGPU device failure remain open. Loss during a pending WebGL2 shader
  compile now passes the same stopped-simulation, closed-audio and reload checks.

Exit: no crashes, stuck controls, duplicate audio, lost local completion result,
unexplained persistent resource growth or progressively worsening performance.
Recoverable failures have a clear usable path. Mobile thermal slowdown is
measured on physical devices rather than inferred from desktop emulation.

## 5. Polish the player experience

- Play the whole first-visit flow without debug UI. Check that loading, Play,
  movement, sprint feedback, bark response, gate guidance and completion are clear.
- Desktop controls should be discoverable without a menu visit. A compact,
  binding-aware edge hint now covers movement, bark, sprint, camera and pause;
  keep touch controls separate and hide the hint during menus.
- Review camera framing, terrain contact, clipping, visual transitions and HUD
  placement at desktop, portrait and landscape sizes. Fix concrete distractions
  within the accepted art direction; avoid starting a new art campaign.
- Listen through an extended session for harsh transients, obvious repetition,
  missing sounds and pause/resume discontinuities. Preserve the approved mix
  unless a specific issue justifies an owner-reviewed adjustment.
- Check keyboard focus, readable text, touch targets, remapping, reduced motion,
  customization persistence and the title/solo-times flows.

Exit: independent visual/interaction/audio review against specs 05–07, with
running-build evidence and owner playtest. Follow the repository's maximum five
documented review iterations; record remaining issues instead of claiming acceptance.

## 6. Prepare the public build and sharing material

- Freeze one candidate. Run focused tests, lint, both applicable typechecks,
  full tests, production build and release probe; repeat affected renderer and
  device scenarios on that exact artifact. Record receipts in STATUS.md.
- Prepare a brief change summary, a clean first-visit link, several representative
  screenshots and a short continuous gameplay clip from the accepted build.
  Show movement, the flock responding to bark and herding progress. Do not hide
  known stalls with editing or claim unverified device support.
- Draft posts and a short feedback request only after the footage matches the
  candidate. Review the footage and game with the owner before publication.
- After explicit approval of the full commit SHA, deploy through the existing
  workflow and verify live release identity, cold load, play and score-service
  behavior. Publish posts only with separate explicit authorization.

Exit: the linked live game matches the reviewed footage and source, the owner
accepts the playtest, and every remaining limitation is understood.

## Priority and tracking

Order: trustworthy rendering evidence → first-use/movement stalls → loading and
steady performance → session recovery → presentation review → public release.
Keep one coherent system change per commit. Each issue records reproduction,
cause or unresolved hypothesis, fix, before/after evidence and acceptance status.
Estimate remaining effort after steps 1–2 isolate the unknown rendering and
movement failures; do not promise a posting date from the current partial evidence.

The bar for sharing a playable link is completion of these acceptance gates,
not merely a green unit-test suite or an attractive screenshot. Progress posts
can describe work in progress earlier, but must accurately label the build.
