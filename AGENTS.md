# AGENTS.md - Sheepdog Sim contributor operating guide

Read `spec/00-vision.md` through `spec/13-asset-lab.md` before changing code. The
specification is the product contract. When code and specification disagree,
surface the discrepancy instead of silently choosing one.

## Cold start

1. Read this file.
2. Read `spec/00-vision.md`.
3. Read the specification documents for the system you will change.
4. Read `STATUS.md` for current release evidence and open review gates.

`STATUS.md` is the current state. `CHANGELOG.md` is the chronology.
`docs/history/` holds closed investigations, kept for their reasoning and
measurements; nothing there is current direction.

## Repository boundary

The version 3 client is the TypeScript application under `app/`, `sim/`,
`assets/` and `tools/`. The asset lab under `lab/` is a development-only
consumer of that client. The retained `worker/`, `shared/`, `tests/worker/` and
`docs/operations/` trees support the public score service and version 2
rollback. Keep that service isolated from the client.

- Do not import `worker/` or `shared/` into the version 3 client.
- The shipped version 3 client calls only the documented identity and score
  REST endpoints. Multiplayer rooms and WebSockets are absent through 3.6.1.
  The owner opened local multiplayer foundations on 2026-10-20 under
  `docs/architecture/multiplayer-plan.md` and `spec/03-multiplayer.md`.
  `realtime/` is a separate, tested Worker on `/r/*`, deployed only to staging; its private
  identity adapter is not exported by the production score router. Keep this
  cycle isolated. The owner approved the simplified $20 staging deployment
  after setup/cost review; `staging/` owns its access gate and bounded pilot.
  Production deployment and new assets remain separate approvals. Follow `STATUS.md`.
  The 5,000-sheep experiment stays out.
- Preserve the `field-v3` score partition and exact 25, 75 and 200 flock-size
  allow-list.
- Production infrastructure - hosting, routes, bindings, secrets, analytics and
  deploy workflows - changes only in an owner-directed cycle named under the
  master plan in `STATUS.md`, never as a side effect of a feature or dependency
  change.
- A production deploy runs on the owner's explicit approval. Approval given in
  conversation is sufficient authorization and needs no separate sign-off.
  Deploying is pushing a `v*` tag: the tag names the commit, so what shipped is
  always a named commit that can be named again to roll back - which is the
  whole reason version 2 is still recoverable from its own immutable
  deployment. `Deploy` also keeps a `workflow_dispatch` path taking an
  exact 40-character SHA, which is how an older commit is redeployed. Both
  paths refuse a commit that is not already contained in `origin/main`.
- `docs/operations/deployment.md` is the one description of how a change reaches
  production: the single workflow, what each Cloudflare and GitHub name means,
  which deployment targets are stale, and the seven steps from merge to tag.
  Read it before deploying rather than inferring the procedure from workflows.

## Architecture tripwires

These rules name failure modes observed in the version 2 client.

1. Flock size is configuration, not a mode flag.
2. No application class grows beyond roughly 300 lines. Keep the frame loop a
   short ordered set of systems.
3. Use one TSL material implementation through `WebGPURenderer`. Do not add
   `ShaderMaterial`, `onBeforeCompile` or renderer-specific material forks.
4. Use store subscriptions. Do not add window globals, UI bridge singletons or
   custom-event glue.
5. `sim/` imports no Three.js, React, DOM, app, Worker, network or third-party
   math code. It uses required seeded random sources and no clocks or
   implementation-dependent math in tick paths.
6. Production accepts only the documented `seed` and `debug` query parameters.
   Probes live in `tools/` and drive the normal application.
7. Name files for what they own, not a migration phase or campaign.
8. Do not add compatibility aliases or re-export shims. Migrate consumers in
   the same change.
9. Never regenerate a deterministic fixture merely to make a test pass. Treat
   a trace diff as a gameplay decision.
10. A field, feature or flag exists only when shipped code reads it in the same
    change. The same holds for a dependency: it lands with its first real
    consumer or not at all.
11. Every runtime asset needs an editable source or deterministic in-repository
    recipe, provenance, license record and digest.
12. Player-facing prose uses no hype, emoji or exclamation marks. Prefer
    concrete numbers and short sentences.

## No editor code in the game

The asset lab is a separate Vite entry under `lab/` with its own config. The
production build keeps `app/` as its root and never references it, so lab code
cannot reach `dist/`. Imports run from `lab/` into `app/src/` and `sim/`, never
the reverse, and the lab adds no URL parameter to the player page.

Live tuning works by exported tuning objects that the shipped code reads and the
lab copies and mutates. The lab emits a TypeScript patch so a session ends as a
committed constant. See `spec/13-asset-lab.md`.

## Presentation and simulation are separate decisions

Animation, inverse kinematics, shading, juice and camera presentation are
presentation. They can be changed and reviewed freely under the visual gates.

The dog's controller and the sheep simulation are not presentation. A change to
`sim/`, `app/src/input/` or `sim/tuning.ts` moves the trace fixtures in
`tests/fixtures/` and makes existing `field-v3` times incomparable with new
ones. That is a gameplay decision for the owner, recorded under `STATUS.md` open
questions, never a side effect of a polish pass.

Where the shipped simulation deliberately overrides an earlier specification
line, the override and its reasoning live in the code that owns the constant.
`sim/tuning.ts` carries the bark redesign table that way.

## Measurement lanes

Which machine produced a number decides whether the number counts.

- **The hub is the timing lane.** Frame times, percentiles and startup timing
  come from the hub over the `hub` SSH alias, running
  `tools/hub-presentation-probe.mjs` against a copy of the production build
  (`app/.cloudflare/output/v0/workers/default/assets`, copied to the hub as
  `dist`).
  Preflight requires two consecutive samples at or under 5% GPU and 15%
  aggregate CPU. Runs are 60 to 600 seconds. Receipts land under
  `captures/stability/hub-receipts/`. Use isolated working directories there and
  do not disturb another job or checkout.
- **This PC is the functional lane.** It runs other work concurrently, so its
  timings cannot certify performance or establish a regression. Functional,
  visual and interaction testing are fine here.
- **Browser phone emulation is neither.** It shares the host GPU. It checks
  composition and layout, and is never reported as phone performance.
- Physical-device receipts cannot be substituted by either lane. Record the gap
  rather than claiming universal phone support.

## Visual and audio review

The game has one field, so grass, sheep, dog, fences, farm, foliage, light and
sound are all hero systems. Presentation changes require evidence from the
running production build on desktop and mobile. Renderer changes require both
genuine WebGPU and forced WebGL2 receipts.

Use a separate critical review for visual, interaction and audio work. Compare
the running build against `spec/05-art-direction.md` and the acceptance lines
for that system. A review loop ends at acceptance or after five documented
iterations. Record unresolved risks in `STATUS.md` instead of weakening the
standard or hiding the result.

Stills cannot pass motion work, and the asset lab cannot close a gate. Both are
for iteration; acceptance comes from the production build.

## Screen-anchored interface elements

These rules were paid for by a measured defect and are easy to reintroduce.
Full reasoning is in `spec/11-typography.md` and `spec/06-ux-ui-juice.md`.

- Text stays in the DOM. `app/src/quality/autoTier.ts` caps the canvas device
  pixel ratio between 0.8 and 1.5 while the DOM composites at the device's own
  ratio, so moving labels into the canvas renders them at a fraction of their
  current resolution.
- Anything that tracks a moving camera samples every frame, not on a timer.
- Do not round a screen-space transform to whole device pixels.
- Do not put a CSS transition on a transform that is rewritten every frame. It
  trails the camera and rubber-bands instead of landing.
- Read a direction in the camera's own basis, not from the ground bearing. The
  rigs look down 22.5 and 44.9 degrees, which foreshortens the forward axis.

## Workflow

- Keep one coherent system change in flight per commit.
- Use conventional commit subjects.
- Run the focused tests for what you changed. `Client CI` is the gate: it runs
  lint, typecheck, the worker typecheck, the build, discovery and the full suite
  on every push and pull request, and `Deploy` runs them again against the
  exact commit it ships. Running that same list by hand before a push is
  duplicated work, not diligence. Run it locally when you need the answer sooner
  than CI will give it, or when you are changing something CI cannot see.
- Record test counts, bundle size, renderer receipts, performance percentiles
  and screenshots in `docs/history/status-log.md` when closing a release gate,
  and leave `STATUS.md` a short pointer to that entry. Recording the full
  evidence in `STATUS.md` is what grew it to 1,060 lines.
- Keep browser probes clean: close pages, contexts, listeners and local servers.
- Do not commit captures, browser profiles, environment files, generated build
  output or credentials.
- When the specification does not answer a decision, choose the most reversible
  interpretation, record it under `STATUS.md` open questions, and flag it in
  the change description.
