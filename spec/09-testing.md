# 09 - Testing and validation

## Layers

1. **Sim trace fixtures (the backbone).** Committed 60 Hz fixed-seed traces exercising the exported `step` directly (spec/02). Any diff is a behavior change; regeneration requires recorded intent in the same PR. These are the multiplayer-desync tripwire: if the trace differs between the Worker build and the client build of `sim/`, co-op will desync, and the fixture catches it offline.
2. **Unit tests (vitest)** for sim modules, protocol encode/decode, delta reconstruction (port `sds/tests/delta-client-reconstruction.spec.ts` as the acceptance harness), store logic, and worker handlers (workerd-compatible test env). Where a player-visible property is the composition of several separately capped stages, the assertion goes on the composed result and not on any one stage: `camera-framing` and `camera-rotation-cap` held the Follow rig to its yaw ceiling at every frame rate to twelve decimal places while the composed view flipped half a turn in a single frame, and both stayed green.
3. **Worker integration tests**: room lifecycle (join, rejoin-reclaims-slot, host migration, grace eviction), auth chain (register, TOFU re-prove, ticket expiry), rate limits and backpressure eviction against a local DO.
4. **Browser probes (tools/, Playwright)** driving the real app through its normal path: boot-to-interactive timing, a scripted herding run to completion, screenshot capture for the art critic loop, frame-time percentile capture, WebGPU and forced-WebGL2 backend both. Probes are never in-bundle modes and never add player URL params beyond `seed` and `debug` (sds failure mode: 23 load-bearing debug params).
5. **Determinism cross-check**: a CI job runs the same trace seed through `sim/` bundled by Vite and by esbuild (the wrangler path) and byte-compares, pinning the toolchain-difference risk that TypeScript-in-three-toolchains introduces.

## Gates

- No phase closes with failing tests or build.
- Visual work additionally passes the harsh-critic loop (spec/05); juice and audio pass their in-motion critic loops (spec/06, spec/07).
- Every phase report includes: test counts, perf probe percentiles, bundle size, and screenshots.

## Fixture hygiene

- 4-decimal rounding before writing traces.
- Placement manifests byte-compared (bake determinism).
- Goldens live with a manifest of the exact camera/time/seed that produced them.

## Multiplayer acceptance (planned)

Target matrix, 2026-10-20. Local co-op evidence is recorded in
[the local service README](../realtime/README.md#playable-local-candidate-validation-2026-10-20);
no complete multiplayer release gate is claimed closed. Spec/03 owns the contract; the
[multiplayer plan](../docs/architecture/multiplayer-plan.md#staging-and-test-plan)
owns staging topology, sequence and research. Local receipts cover only their named cases, not entire matrix rows. Fix numerical budgets under plan D4 before qualification;
unreviewed layouts and unavailable multiplayer/device evidence remain explicit gaps.

| Area | Required evidence |
| --- | --- |
| Deterministic sim | Existing solo fixtures unchanged; co-op and competitive traces through real `sim/` in client and Worker builds; all 25/75/200 counts, two/three/four dogs, simultaneous bark and multi-gate crossings |
| Regional discovery | Each enabled board isolated; both modes listed/filterable; private rooms absent even from activity counts; bounded paging/expiry; old revisions ignored; directory restart and missed-update repair |
| Placement | First lookup uses intended region hint; CI/global allocator cannot pre-create in the wrong region; measured regional and actual-room RTT kept separate; cross-region invites and manual override work |
| Admission races | Independent verified identities; fourth/fifth concurrent join admits only one; duplicate create/retry and start/join races; expired reservations release slots; replayed tickets and spoofed identity fail |
| Invite route | Direct load/reload on `/r/<room-handle>` renders the correct shell; unknown/expired/full/in-progress room messages; link crawler GET does not join; asset URLs and `/api/*`, `/c/*`, `/play/*` remain correct |
| Lobby control | Host waits or starts eligible ready group; settings change clears readiness; synchronized ready/start handshake; host leave/reconnect, deterministic handoff, no automatic mode rotation; rematch keeps party and uses fresh round id |
| Real gameplay | Four independent rendered clients complete 75 sheep in both rulesets; also exercise two/three players and 25/200 sheep; normal input only, no teleport/completion hooks; each client agrees on authoritative counts and result |
| Competitive rules | Each sheep allocates once; eligible pens award one point, entries after owner forfeit become unclaimed; finish only when all sheep are penned except agreed forfeit outcomes; highest eligible count wins, shared ties at every party size; no early majority victory or ID tie-break; every gate orientation/retirement/collision agrees; three-player spawn/pen fairness reviewed |
| Forfeit and continue | Grace expiry or explicit leave forfeits; two or more eligible players continue, one wins by forfeit, none yields no winner; dog removed, pen/opening unchanged; banked sheep/counts retained; later entries unclaimed; completion counts every penned sheep; forfeited high scorer cannot win; late reconnect cannot restore eligibility; simultaneous departures/completion serialize deterministically and a completed result cannot be rewritten |
| Protocol | Full/delta reconstruction equals the server's quantized snapshot at the SAME tick/basis; bad basis waits for full snapshot; unicast keyframes cannot alter broadcast basis; mismatched versions fail cleanly; immutable reader snapshots and bounded queues |
| Responsiveness | Measure local correction distance, input acknowledgment delay, RTT/jitter, snapshot cadence and stale-view duration separately from rendered FPS; stale-input timeout neutralizes direction/sprint; bark is not lost or duplicated by coalescing/replay |
| Faults | Short interruption and interruption past grace, slow receiver, malformed/oversize/deep messages, message flood, tab suspension, mobile handoff; no unbounded input history, decode allocation or catch-up loop |
| Restart/release | Restart RoomDO and LobbyDO; site-only deploy preserves active room sockets; realtime drain/deploy and rollback yield documented outcome; preserve identity/party, no false completion or duplicate result |
| Recovery choice | D5 interruption policy is accepted: persist party/settings and mark a lost round interrupted, return to waiting with no result; fault-test actual room memory loss rather than treating client rejoin as recovery |
| Waiting-room removal | Only the current host in waiting may remove; removed identity cannot immediately rejoin the same room; metadata is bounded and expires with the room; start/remove races serialize; no starting/playing kick or forced competitive forfeit |
| Neutral gate guidance | Nearest qualifying opening only with a dog pushing from behind; identical motion after changing dog/pen ownership or forfeiture eligibility; at most one opening selected; mirrored/rotated, overlapping and equidistant cases, multiple dogs and all gate orientations; reviewed layouts avoid overlapping guidance zones where possible |
| Isolation/cleanup | Staging binds no production identity/database/room namespace; protocol/schema/revisions match receipts; abandoned rooms expire; teardown closes browsers/listeners/servers; load respects declared concurrency and spend limits |
| Presentation | Production-build desktop/mobile motion, genuine WebGPU and forced WebGL2, readable player/pen identity without colour alone, camera follows correct player, remote footsteps/barks and simultaneous events do not duplicate; separate critical review |
| Physical device | Real phone Wi-Fi and cellular, input, background/resume and invite handling; emulated viewport checks layout only |

Do not compare interpolated visual positions against the server's current tick:
the presentation is intentionally delayed. Compare snapshot reconstruction at
matching ticks, compare deterministic traces at matching inputs, and measure
visual correction separately. Synthetic protocol clients do not prove that
four renderers, touch controls or audio work.

Use the current Cloudflare Workers Vitest integration and its documented DO
WebSocket isolation constraints (plan R7). Existing v2 tests provide cases, not
an exemption from the real runtime. No `testNoCanvas`, `mpProbe`, injected game
globals or test-only production messages. External probes may observe normal
network traffic/UI and drive real input, keeping debug credentials out of logs.

Frame/startup certification stays on the quiet hub under AGENTS.md. Server
CPU/tick/room-capacity figures come from deployed staging telemetry, network
figures from named client/load locations, and device figures from physical
devices. Do not interchange those lanes. Record candidate revision pairs,
test counts, bandwidth, percentiles, screenshots/motion, errors and known gaps
in `docs/history/status-log.md` only when closing a gate; STATUS stays a pointer.
