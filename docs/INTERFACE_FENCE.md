# Interface fence

> Files in this list are write-locked during normal cycle work. Modifying any of them requires explicit authorization in the active cycle plan or an explicit user OK. If you find yourself wanting to touch one of these without authorization, **stop and surface to the user**. Don't guess whether the change is OK.

The fence exists because these files are either:

- **Multi-consumer schemas** — changes propagate to every scene, every test, every consumer.
- **One-way ratchets** — regenerating a fixture without understanding the diff loses information.
- **Deterministic-sim cores** — a divergence here desynchronizes the Worker sim and the client mid-game, breaking multiplayer in subtle ways that only surface at scale.
- **Process / orchestration docs** — changes affect every future cycle's shape.

For the **rule rationale** behind each category, see [`.claude/rules/`](../.claude/rules/):

- [`shared-sim.md`](../.claude/rules/shared-sim.md) — deterministic-sim boundary, sim-baseline lockdown.
- [`scene-and-render.md`](../.claude/rules/scene-and-render.md) — scene loading, atmosphere, heightfield, foliage LOD, grass/camera discipline.
- [`cycle-process.md`](../.claude/rules/cycle-process.md) — cycle methodology guardrails.
- [`multiplayer.md`](../.claude/rules/multiplayer.md) — Worker / DO contract.

This file lists **which files are frozen**. The rule files explain **why**.

## Frozen files

### Schema / data contracts

- **[`shared/scenes/types.js`](../shared/scenes/types.js)** — scene schema (consumed by every scene def + the Worker sim + tests).
  - **Adding** an optional field with a default is the cheap case. Document in the active cycle plan.
  - **Renaming** or **removing** a field is a fence change. Migrate every scene + every consumer in the same PR, or stop and escalate.

- **[`worker/migrations/*.sql`](../worker/migrations/)** — append-only.
  - New migration = new file with the next sequence number.
  - **Never edit** an existing migration once it's been applied to remote D1. The history is the contract.

### Deterministic sim core

- **[`shared/MovementPhysics.js`](../shared/MovementPhysics.js)**
- **[`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js)**
- **[`shared/FlockingAlgorithms.js`](../shared/FlockingAlgorithms.js)**
- **[`shared/GameStateValidation.js`](../shared/GameStateValidation.js)** *(since 2d34a2b a compatibility shim re-exporting the four modules below; all five carry the same fence)*
- **[`shared/SpawnLogic.js`](../shared/SpawnLogic.js)** *(P3-GSV-SPLIT, 2026-06-09)* — seeded sheep spawn generation, competitive balanced spawns.
- **[`shared/GameProgress.js`](../shared/GameProgress.js)** *(P3-GSV-SPLIT)* — game progress, state reset, herding effectiveness.
- **[`shared/CompetitiveLayout.js`](../shared/CompetitiveLayout.js)** *(P3-GSV-SPLIT)* — competitive gate layout + player assignment.
- **[`shared/CompetitiveMode.js`](../shared/CompetitiveMode.js)** *(P3-GSV-SPLIT)* — competitive retirements + completion; carries the P0-DETBUG sorted winner tie-break.
- **[`shared/Vector2D.js`](../shared/Vector2D.js)**
- **[`shared/ObjectiveLogic.js`](../shared/ObjectiveLogic.js)** — `getRequiredSheep` formula (per-mode count scaling).
- **[`shared/objective.js`](../shared/objective.js)** *(Cycle 34 Phase 2)* — multi-stage objective state machine (`createObjective` / `refreshObjective` / `tickObjective` / `isCorralOpen`). Worker + client run byte-identical transitions; the `js/gamestate/objective.js` file is now a thin re-export shim and stays in sync only by depending on this module.
- **[`shared/terrain/Heightfield.js`](../shared/terrain/Heightfield.js)** — heightfield single source of truth (`sample`, `meshSampleY`).
- **[`shared/PenBarrier.js`](../shared/PenBarrier.js)** *(Cycle 117)* — fenced-enclosure barrier and enclosure-entry retirement. Was `shared/survival/pen.js`, deliberately unfenced while it ran only in survival; Cycle 117 made it the authoritative retirement predicate for Sheep Dog Island, a scene with ranked solo rungs, running byte-identically on the Worker and the client. `shared/survival/pen.js` is its re-export shim and carries the same fence.

Changes to any of these require sim-baseline regeneration with **explicit acceptance recorded in the cycle plan**. See [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) for the full discipline.

### Test ratchets

- **[`tests/sim-baseline/__fixtures__/*.json`](../tests/sim-baseline/__fixtures__/)** - captured 60Hz traces from the deterministic sim.
- **[`tests/refactor-baseline/__fixtures__/*.json`](../tests/refactor-baseline/__fixtures__/)** - characterization-test goldens for god-module refactors.

Don't regenerate as a shortcut to make tests pass. Read the diff, decide, regenerate with the decision recorded in the cycle plan's Acceptance section.

### Orchestration / process docs

- **[`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md)** — this file.
- **[`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md)** — cycle-plan stub. Editing changes every future cycle's shape.
- **[`docs/BACKLOG.md`](BACKLOG.md)** — closed-cycle log. Only `/cycle-close` writes "Recently Completed"; "Deferred" + "Distant ideas" are edited by hand. Append-only — don't rewrite or compress prior entries.
- **[`DECISIONS.md`](../DECISIONS.md)** — durable decisions log. New decisions append; prior decisions don't get rewritten (they get superseded with a date-stamped new entry).
- **[`.claude/commands/*.md`](../.claude/commands/)** — slash command definitions. Changes here change every future invocation; treat as carefully as schema changes.
- **[`.claude/rules/*.md`](../.claude/rules/)** — durable project rules. Edit when the rule itself changes, not for cycle-specific guidance (that goes in the active cycle plan).

## Soft fence (read-mostly, change with care)

Not strictly frozen, but rewriting these without thought drifts the project's self-description.

- **[`NEXT_SESSION.md`](../NEXT_SESSION.md)** — only `/cycle-start` reads it; only `/cycle-close` rewrites the header + active-plan link. Content updates as cycles progress, but the *shape* (cold-start link → cycle goal → phase summary → reference table) should stay stable. See [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) for the full contract.
- **[`ARCHITECTURE.md`](../ARCHITECTURE.md)** — high-level repo layout. Update when modules move. Don't drift to mention defunct modules.
- **[`README.md`](../README.md)** — public-facing. Update when the user-visible feature set changes.
- **[`AGENTS.md`](../AGENTS.md)** — portable agent baseline.
- **[`CLAUDE.md`](../CLAUDE.md)** — Claude-specific overlay.

## Hard stops

If you propose a change to any frozen file in a non-fence-authorized task:

1. **Stop the change.**
2. **Report to the user:** which file, why the change is needed, what the alternative is.
3. **Wait** for explicit "fence change OK" or "find another way."

Don't push fence-file changes through review hoping they'll get noticed and reverted. They won't.

## How fence changes get authorized

When a cycle plan's phase legitimately needs a frozen-file change:

1. **Name the file explicitly** in the phase description ("Phase 1 modifies `shared/scenes/types.js` to add `boundary` field").
2. **Describe the migration story** for existing consumers ("backwards-compat: synthesise `boundary: { kind: 'rect', ...bounds }` when only `bounds` is present, until all scenes migrate in Phase 2").
3. **List the consumers** that need updating in the same phase (every scene def, plus `BoundaryCollision`, plus tests).
4. **Add a regeneration step** + acceptance line if the change touches the deterministic core.

A phase that lists a frozen file in its `Files touched` scope **with these four pieces** is fence-authorized for that file, for that cycle, for that phase only. Other phases in the same cycle don't inherit the authorization.
