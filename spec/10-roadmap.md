# 10 - Roadmap

Phases 0 through 5 plus launch prep are the version 3.0 release gates. Work
inside a phase fans out to parallel agents (see AGENTS.md). A phase closes only
when its acceptance lines pass and its critic loops are wowed. Phases 7 and 8
preserve post-launch research and do not enter the version 3.0 artifact. No
deploys to any public surface occur until Matt playtests and approves.

## Phase 0 - Spike the risky primitives

Prove the load-bearing bets in a throwaway scene before real architecture lands.

- WebGPURenderer via memoized async gl factory in R3F 9.7; verify the same build renders on the WebGL2 backend (forced) with no code fork.
- One TSL toon-ramp material with outline treatment on a placeholder sheep; verify on both backends.
- 200-instance InstancedMesh with per-instance attributes + vertex-anim driven from a Float32Array in useFrame.
- `sim/` TypeScript consumed by Vite, esbuild (wrangler), and vitest; the determinism cross-check passes.
- Audio graph hello-world (spatial baa panning with camera).

Acceptance: all five spikes screenshot/measure green on desktop Chrome (WebGPU), forced WebGL2, and one mobile viewport.

## Phase 1 - The sim, ported and pinned

Lift the sim per spec/02: modules, PenBarrier mechanism, lifecycle enum, tuning module, FlockSim interface (CPU backend only), trace fixtures recorded. Headless: tests are the deliverable. Acceptance: full 25-sheep completion trace committed; lint fence active; zero Math.random/trig violations.

## Phase 2 - Playable solo core

Boot-to-field, Classic + Follow cameras with the carried constants, keyboard/mouse/touch/gamepad input to one intent shape, dog moves, flock reacts, bark works, sheep pen and settle, completion moment (placeholder art everywhere). Acceptance: a scripted probe herds 25 sheep to completion; input feels right on desktop and one phone.

## Phase 3 - The world and the art passes

The big fan-out. Field terrain + heightfield, grass system with interaction, then per-asset AAA loops (sheep, dog, fence/gate, farmhouse, trees, rocks/flowers/dressing, sky/atmosphere) each through the harsh-critic gate, then the scene-cohesion pass. Acceptance: beauty shots pass the critic at wowed; perf budgets hold with full art.

## Phase 4 - UI, UX, and juice

Design tokens, boot flow, HUD, settings, completion sequence, the full juice list from spec/06, all through in-motion critic loops. Acceptance: five-second boot-to-herding on mid mobile; reduced-motion honored; juice critic wowed.

## Phase 5 - Audio

The full spec/07 soundscape and mix. Acceptance: eyes-closed field test and 10-minute fatigue test pass the audio critic.

## Deferred phase 7 - Multiplayer

A separate multiplayer Worker, RoomDO, LobbyDO, protocol v1, client netcode, prediction + interpolation, invite links and lobby UI. The version 3.0 solo-times REST client is not multiplayer infrastructure. Acceptance: 4-player LAN-and-remote session completes 75 sheep with no desync (trace-compare client vs server); reconnection and host migration probes pass; ported delta-reconstruction suite green.

## Deferred phase 8 - Scale toggle and hardening

GpuComputeSim (TSL compute boids) at 5,000 sheep unranked; performance tiering final pass; DoS constants verified; full validation sweep; preview deploy for owner playtest. This work is a separate product slice, not a hidden version 3.0 mode flag.

## Phase 6 - Version 3.0 launch prep

Curated public source import, AGPL and asset-license review, production-only
artifact scan, Pages preview, desktop and real-device playtest, exact release
identity, service-worker transition, static rollback proof, domain cutover and
the version 2 retirement story. The launch candidate includes optional solo-time
identity, rename, submission and board reads on the isolated `field-v3`
partition, with fail-soft browser probes and Worker validation tests. Production
deployment requires Matt's explicit approval of the exact release candidate.
