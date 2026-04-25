# Interface fence

> Files in this list are write-locked during normal cycle work. Modifying any of them requires an explicit "fence change" authorization in the active task brief or an explicit user OK. If you find yourself wanting to touch one of these without that authorization, **stop and surface to the user**. Don't guess whether the change is OK.

The fence exists because these files are either:

- **Multi-consumer schemas** — changes propagate to every scene, every test, every consumer.
- **One-way ratchets** — regenerating a fixture without understanding the diff loses information.
- **Deterministic-sim cores** — a divergence here desynchronizes the Worker sim and the client mid-game, breaking multiplayer in subtle ways that only surface at scale.

## Frozen files

### Schema / data contracts

- **[`shared/scenes/types.js`](../shared/scenes/types.js)** — scene schema (consumed by every scene def + the Worker sim + tests).
  - **Adding** an optional field with a default is the cheap case. Document in the active cycle plan.
  - **Renaming** or **removing** a field is a fence change. Migrate every scene + every consumer in the same PR, or stop and escalate.

- **[`worker/migrations/*.sql`](../worker/migrations/)** — append-only.
  - New migration = new file with the next sequence number (`0003_*.sql`, `0004_*.sql`).
  - **Never edit** an existing migration once it's been applied to remote D1. The history is the contract.

### Deterministic sim core

These files run identically on the Worker (Cloudflare Durable Object) and on the client. Any divergence (a rounding change, a default-param tweak, a different iteration order) breaks multiplayer mid-game in ways that only surface after several seconds of state divergence.

- **[`shared/MovementPhysics.js`](../shared/MovementPhysics.js)** — sheep + dog movement, boundary forces, slope-modulated speed.
- **[`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js)** — boundary avoidance (rect today; island in Cycle 5).
- **[`shared/FlockingAlgorithms.js`](../shared/FlockingAlgorithms.js)** — boid separation/cohesion/alignment.
- **[`shared/GameStateValidation.js`](../shared/GameStateValidation.js)** — win-condition logic.
- **[`shared/Vector2D.js`](../shared/Vector2D.js)** — primitive math, depended on by everything above.

Changes to any of these require sim-baseline regeneration with **explicit acceptance recorded in the cycle plan**. Do not regenerate `tests/sim-baseline/` fixtures and merge in the same PR as the sim change without that explicit acceptance — the regeneration is what acknowledges "yes, this is the new intended behaviour."

### Test ratchets

- **[`tests/sim-baseline/*.json`](../tests/sim-baseline/)** — captured 60Hz traces from the deterministic sim. Regenerating without understanding the diff loses regression information.
  - On baseline failure: read the diff. Decide whether the new behaviour is intentional. If yes, regenerate with the decision recorded in the cycle plan's Acceptance section. If no, fix the sim change first.
  - **Don't regenerate as a shortcut to make tests pass.**

### Orchestration / process docs

- **[`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md)** — this file.
- **[`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md)** — cycle-plan stub. Editing this changes every future cycle's shape.
- **[`docs/BACKLOG.md`](BACKLOG.md)** — closed-cycle log. Only `/cycle-close` writes to "Recently Completed"; "Deferred" + "Distant ideas" are edited by hand. Append-only — don't rewrite or compress prior entries.
- **[`DECISIONS.md`](../DECISIONS.md)** — durable decisions log. New decisions append; prior decisions don't get rewritten (they get superseded with a date-stamped new entry).
- **[`.claude/commands/*.md`](../.claude/commands/)** — slash command definitions. Changes here change every future invocation; treat as carefully as schema changes.

## Soft fence (read-mostly, change with care)

Not strictly frozen, but rewriting these without thought drifts the project's self-description.

- **[`NEXT_SESSION.md`](../NEXT_SESSION.md)** — only `/cycle-start` reads it; only `/cycle-close` rewrites the header + active-plan link. Content updates as cycles progress, but the *shape* (cold-start link → cycle goal → phase summary → reference table) should stay stable.
- **[`ARCHITECTURE.md`](../ARCHITECTURE.md)** — high-level repo layout. Update when modules move. Don't drift to mention defunct modules (the droplet/server cleanup pass on 2026-04-25 was a long-overdue example).
- **[`README.md`](../README.md)** — public-facing. Update when the user-visible feature set changes.

## Hard stops

If you propose a change to any frozen file in a non-fence-authorized task:

1. **Stop the change.**
2. **Report to the user:** which file, why the change is needed, what the alternative is.
3. **Wait** for explicit "fence change OK" or "find another way."

Don't push fence-file changes through review hoping they'll get noticed and reverted. They won't.

## How fence changes get authorized

When a cycle plan's phase legitimately needs a frozen-file change:

1. Name the file explicitly in the phase description ("Phase 1 modifies `shared/scenes/types.js` to add `boundary` field").
2. Describe the migration story for existing consumers ("backwards-compat: synthesise `boundary: { kind: 'rect', ...bounds }` when only `bounds` is present, until all scenes migrate in Phase 2").
3. List the consumers that need updating in the same phase (every scene def, plus `BoundaryCollision`, plus tests).
4. Add a sim-baseline regeneration step + acceptance line if the change touches the deterministic core.

A phase that lists a frozen file in its `Files touched` scope **with these four pieces** is fence-authorized for that file, for that cycle, for that phase only. Other phases in the same cycle don't inherit the authorization.
