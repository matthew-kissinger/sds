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

## After 3.5, the order set on 2026-10-19

Three slices, in this order. A later slice does not start early.

1. Score cards and weekly boards, specified in `spec/14-score-cards.md`.
   Live as 3.6.0 (`ee8086a9`, tag `v3.6.0`).
2. Multiplayer, phase 7, after the cards are live. Design/spec work was
   authorized 2026-10-20; implementation remains unopened.
3. Grow your flock, deferred phase 9. Recorded so it is not re-derived. It
   does not start while the first two are in progress.

## Phase 7 - Multiplayer design recorded, implementation unopened

The owner authorized the plan/spec update on 2026-10-20 and explicitly said not
to implement yet. [The multiplayer plan](../docs/architecture/multiplayer-plan.md)
is the execution sequence and evidence register; spec/03 owns the contract.
Spec/00 records the narrow two-mode scope amendment, not a general mode roster.

Scope: separate realtime Worker, one RoomDO per room and LobbyDO per region,
up to four people, regional public boards and private invite rooms, host wait
or start, readiness and rematches, one-pen co-op and shared-flock competitive
with one pen per player. Region advice is measured and overridable. A room
link uses `/r/<room-handle>`; score cards keep `/c/*`. No NPC fill, mid-round
backfill, spectators, chat, ranked ladder or 5,000-sheep work.

After later implementation authorization, proceed through local foundations,
private staged two-player co-op, four players/regional public boards,
competitive layouts/rules, and release qualification. Provisioning staging,
creating new assets and production deployment remain separate boundaries.
Plan D1-D7 records proposed defaults and decisions needed at each stage.

Acceptance is spec/09's matrix: real four-player 75-sheep completion in both
rulesets, additional two/three-player and 25/200 coverage, atomic admissions,
regional discovery/placement, auth, reconnection/handoff, documented restart
outcomes, deployment isolation, motion/audio and physical-device evidence.
Compare reconstruction with authoritative snapshots at the same tick; compare
deterministic traces separately from delayed render interpolation. Legacy
no-canvas tests and synthetic network load cannot close the gameplay gate.

## Deferred phase 8 - Scale toggle and hardening

GpuComputeSim (TSL compute boids) at 5,000 sheep unranked; performance tiering final pass; DoS constants verified; full validation sweep; preview deploy for owner playtest. This work is a separate product slice, not a hidden version 3.0 mode flag.

## Deferred phase 9 - Grow your flock

Roadmap only. Not designed beyond the outline below, and not started.

The owner wants a mode beside the timed runs: tend a flock, grow it, and
make a living selling wool. The outline, in the owner's words, is the
requirement this phase has to meet when it opens:

- The player tends the flock and the flock can grow.
- The farmer is involved.
- The day ends. Sheep are brought in before night.
- Shearing is a way to take wool off a sheep and sell it. The money buys
  food for the flock.
- Sheep die of old age. Older sheep are slower. Younger sheep are clumsier.
- The pasture can grow. The fence kit is modular, so a larger field is built
  out of the same timber.

Opening the phase amends `spec/00-vision.md` in the same change. The cut list
there currently forbids day and night, a mode roster, a fence editor, and any
verb beyond move, sprint and bark. The calm pillar forbids failure states and
punishment. Those lines are the reason this stayed a single timed field.
They come out only when the owner accepts the replacement text, not as a side
effect of a prototype.

What already ships, and what it is not:

- The farmer walks a yard route. That route is presentation. It does not
  read or affect sheep, scores or the dog (`assets/farmer/README.md`). Giving
  the farmer a role in this mode is a new decision.
- Sheep already have names and breed variety in the customize panel. That
  variety is visual. Age, speed and clumsiness would be the simulation, and
  a simulation change moves the trace fixtures. It is a gameplay decision
  recorded under `STATUS.md`, not an art pass.
- The fence is a modular kit on one fixed rectangle. A larger pasture changes
  the collision outline in `sim/`. It is not a longer run of the same rails.

Night and death have to be written against the calm pillar before any of
this is built. The working reading, reversible until the phase opens, is
that night is the reason the pen matters and age is a life coming to an end,
and that neither is a fail screen or a red timer. If that reading cannot be
held, the phase says so and waits.

## Phase 6 - Version 3.0 launch prep

Curated public source import, AGPL and asset-license review, production-only
artifact scan, Pages preview, desktop and real-device playtest, exact release
identity, service-worker transition, static rollback proof, domain cutover and
the version 2 retirement story. The launch candidate includes optional solo-time
identity, rename, submission and board reads on the isolated `field-v3`
partition, with fail-soft browser probes and Worker validation tests. Production
deployment requires Matt's explicit approval of the exact release candidate.
