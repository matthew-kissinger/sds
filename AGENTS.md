# AGENTS.md - Sheepdog Sim contributor operating guide

Read `spec/00-vision.md` through `spec/10-roadmap.md` before changing code. The
specification is the product contract. When code and specification disagree,
surface the discrepancy instead of silently choosing one.

## Cold start

1. Read this file.
2. Read `spec/00-vision.md`.
3. Read the specification documents for the system you will change.
4. Read `STATUS.md` for current release evidence and open review gates.

## Repository boundary

The version 3 client is the TypeScript application under `app/`, `sim/`,
`assets/` and `tools/`. The retained `worker/`, `shared/`, `tests/worker/` and
`docs/operations/` trees support the public score service and version 2
rollback. Keep that service isolated from the client.

- Do not import `worker/` or `shared/` into the version 3 client.
- Version 3 may call only the documented identity and score REST endpoints.
- Multiplayer rooms, WebSockets and the 5,000-sheep experiment are not part of
  the version 3.0 client.
- Preserve the `field-v3` score partition and exact 25, 75 and 200 flock-size
  allow-list.
- Do not change production infrastructure or deploy from a contribution.
  Production workflows require an explicitly approved full commit SHA.

## Architecture tripwires

These rules name failure modes observed in the version 2 client.

1. Flock size is configuration, not a mode flag.
2. No application class grows beyond roughly 300 lines. Keep the frame loop a
   short ordered set of systems.
3. Use one TSL material implementation through `WebGPURenderer`. Do not add
   `ShaderMaterial`, `onBeforeCompile` or renderer-specific material forks.
4. Use store subscriptions. Do not add window globals, UI bridge singletons or
   custom-event glue.
5. `sim/` imports no Three.js, React, DOM, app, Worker or network code. It uses
   required seeded random sources and no clocks or implementation-dependent
   math in tick paths.
6. Production accepts only the documented `seed` and `debug` query parameters.
   Probes live in `tools/` and drive the normal application.
7. Name files for what they own, not a migration phase or campaign.
8. Do not add compatibility aliases or re-export shims. Migrate consumers in
   the same change.
9. Never regenerate a deterministic fixture merely to make a test pass. Treat
   a trace diff as a gameplay decision.
10. A field, feature or flag exists only when shipped code reads it in the same
    change.
11. Every runtime asset needs an editable source or deterministic in-repository
    recipe, provenance, license record and digest.
12. Player-facing prose uses no hype, emoji or exclamation marks. Prefer
    concrete numbers and short sentences.

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

## Workflow

- Keep one coherent system change in flight per commit.
- Use conventional commit subjects.
- Run the focused tests while iterating, then lint, typecheck, full tests,
  production build and release probe before handoff.
- Record test counts, bundle size, renderer receipts, performance percentiles
  and screenshots in `STATUS.md` when closing a release gate.
- Keep browser probes clean: close pages, contexts, listeners and local servers.
- Do not commit captures, browser profiles, environment files, generated build
  output or credentials.
- When the specification does not answer a decision, choose the most reversible
  interpretation, record it under `STATUS.md` open questions, and flag it in
  the change description.
