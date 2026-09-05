# Combined presentation playtest — 2026-09-05

Local production preview: http://127.0.0.1:5330/
Candidate bundle: `index-Ca8RQxz9.js`. Not deployed or approved for production.
The final change after the reversal build is title-only responsive CSS: compact
spacing and a scroll fallback keep information links reachable on short screens.
Earlier gameplay and hub receipts therefore precede this title layout change.

## Included implementation

- Current authored trees are integrated as the owner requested. Further tree
  design iterations are stopped; historical critic scores are not acceptance.
- Coordinated sky, clouds, sun, haze, palette and lighting, with restrained
  high-tier postprocessing and one material path for both renderer backends.
- Evenly dense meadow: 81,752 field tufts and 16,595 surrounding tufts, without
  the rejected correlated short/sparse patches. Paths and structure keep-outs remain.
- Gate opening highlighted in the world; offscreen direction/distance cue replaces
  the fence pictogram. Visible opening suppresses the floating badge.
- Dog chest narrowed, forelegs moved forward, shoulder roots skinned into the
  torso, eyes reopened, tail trimmed and rear hock outline softened. Studio body
  bob removed; turning paw lift-off retains its planted position through recovery.
- Exhausted Sprint requires release and a fresh hold. Keyboard/touch release
  edges survive between rendered frames; lifting steering alone does not rearm it.
- Exact backward movement now initiates a smooth deterministic turn instead of
  indefinitely retaining the opposite heading. Pinned sim traces are unchanged.
- Proportional stick effort and smoothed camera subject/terrain-safe camera
  transitions. Existing pause, reduced-motion and disconnect behavior retained.
- Ambient farmer follows the house/barn route with a skinned gait and idle actions.
  No story, campaign or survival systems were added.
- Calmer audio: spaced individual calls, quiet intervals in crowd ambience,
  softened leaves and distance filtering through existing audio nodes.
- Crawlable game information and controls, useful initial HTML, consistent
  metadata/canonicals/social cards, truthful structured data and sitemap checks.

## Verification

- 93 test files / 713 tests pass; lint and TypeScript/production build pass.
  After the title-only CSS adjustment, 27 focused checks, scoped lint and the
  production build/release/discovery checks pass again.
- Release probe: 622,264 gzip JS bytes; 5,772,481 estimated first-load transfer
  bytes. Four recipe manifests, 23 character source digests and 17 audio assets
  verified. Public discovery check passes all four routes over local HTTP.
- Title links and Play are reachable at1440x900,390x844 and844x390 in the final
  build. Layout captures and receipt: `captures/discovery/`.
- Dog review: `captures/actors/combined-final-webgpu/` and matching WebGL2 folder.
  Independent review found no blocking regression in tail, hocks, eyes or front
  attachment. These captures precede only the isolated reversal correction.
- Sprint exhaustion runtime check: `captures/input/final-playtest-sprint/`.
  Recovery while held and successful release/repress verified through actual HUD.
- Farmer: `captures/actors/combined-final-farmer/`, normal route and motion video.
- Gate: `captures/guidance/final-reversal-gate/` verifies a settled offscreen cue,
  resume behavior, viewport bounds and opening highlight on both backends.
  Earlier `owner-opening-highlight-02` reports overclaimed behind-camera evidence:
  their screenshots caught the gate ahead after a transient projection change.
  Use the combined/final settled checks instead.
- Portrait and landscape touch layouts captured in
  `captures/profiling/combined-mobile-review/`. Local performance results there
  failed and are not substituted for the isolated hub measurements.
- Final-bundle quiet hub WebGPU repeat: startup 2,023.5 ms, p95 8.4 ms,
  max 25 ms, zero >100 ms frames and 40 sampled draws with 200 sheep at 1440p.
  Evidence: `captures/final-hub-receipts/webgpu-desktop-1788642648665/`.
  Startup still narrowly misses the target; this is not rounded into a pass.
- Latest audio mix capture: `captures/audio/combined-final-mix/`, 200 sheep,
  19.979 seconds, stable build and no runtime/network errors. It includes the
  distance filter and precedes only the unrelated heading fix. The earlier
  ten-minute recording remains historical; final aesthetic listening is open.

## Owner playtest

1. Refresh, enter Studio and inspect front/profile views. Confirm the dog reads
   as a lovable sheepdog and the front legs stay attached.
2. Play in both cameras. Hold W+A and W+D, reverse direction, stop/start, bark,
   and inspect gait/camera comfort in motion.
3. Hold Sprint through exhaustion and recovery. It must stay off until you
   release and press again. On touch, also release only the steering thumb.
4. Approach the gate, turn away and pause/resume. Check that the opening is easy
   to find without a fence icon or an intrusive badge over the entrance.
5. Review grass density, current trees, sky/light and farmer as one field.
6. Listen near the flock and treeline, then leave it idle. Judge the whoosh and
   sheep-call balance at your normal saved volume settings.

## Remaining release limitations

This is a playtest candidate, not a claim that every quality target has passed.
Physical phone/controller ergonomics and broad mobile performance require real
devices. Browser emulation uses a laptop GPU. Audio capture/meter checks do not
establish aesthetic listening acceptance, and the original whoosh has not been
conclusively identified by listening. Strict whole-scene/character art acceptance
remains with the owner; no further automatic tree iterations are planned.

The first quiet-hub combined run measured desktop cold startup at 2.20 seconds
WebGPU and 3.95 seconds WebGL2, above the 2-second target. Phone-sized low-tier
WebGL2 measured 3.39 seconds on that laptop. All three 60-second, 200-sheep runs
had p95 8.4 ms; desktop max 25 ms, phone emulation max 33.3 ms, zero >100 ms
frames and sampled draw counts 40/40/28. These are the pre-reversal bundle
receipts in `captures/combined-hub-final/`, not physical phone measurements.

Production remains unchanged. Deployment and live SEO/indexability verification
follow owner playtest and explicit approval of the final full commit SHA.
