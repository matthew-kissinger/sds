# Documentation

> One-page navigation index for the `docs/` tree. Two reading paths below depending on whether you're an agent picking up cold or a developer reading cold.

## Reading paths

### Path 1 — Agent picking up cold

You're a fresh agent (Claude / Codex / Cursor / etc.) on this repo with no session context. Read in this order:

1. **[`../NEXT_SESSION.md`](../NEXT_SESSION.md)** — current pickup state. Tells you which cycle is active, when the snapshot was taken, and where to start.
2. **The active cycle plan** — path is in NEXT_SESSION's "Cycle N plan:" line, typically [`cycle-N-plan.md`](.). Top-to-bottom. EARS-format Acceptance lines tell you what "done" means.
3. **[`../AGENTS.md`](../AGENTS.md)** — portable agent baseline (build/test/dev commands, code style, the `shared/` deterministic boundary).
4. **[`../CLAUDE.md`](../CLAUDE.md)** — Claude-specific overlay (slash commands, hooks, memory). Skip if you're a non-Claude agent.
5. **[`../.claude/rules/`](../.claude/rules/)** — durable project rules (deterministic-sim boundary, scene/render rules, cycle process, multiplayer contract).
6. **[`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)** — only if you need to touch one of the frozen files.

Don't write code until you've confirmed direction with the user (or, in autonomous mode, until the active cycle plan directs you).

### Path 2 — Developer reading cold

You're a human reading this codebase to learn from it, mod it, or ship a PR. Read in this order:

1. **[`../README.md`](../README.md)** — what the game is, why it exists, how to run it locally.
2. **[`../ARCHITECTURE.md`](../ARCHITECTURE.md)** — module map, render pipeline, network protocol, deterministic-sim boundary.
3. **[`../DECISIONS.md`](../DECISIONS.md)** — chronological "why we made the calls we did," cycle-by-cycle.
4. **[`BACKLOG.md`](BACKLOG.md)** — per-cycle "what shipped" headlines. Walk this to see what's been built.
5. **[`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)** — files where stability matters more than ergonomics.
6. **[`../DEVELOPMENT.md`](../DEVELOPMENT.md)** — local setup, dev servers, mobile testing, mp testing.

Cycle plans + research dossiers are archived under [`archive/`](archive/) — revisit when the topic comes up, not as required reading.

## Documents by Diátaxis quadrant

[Diátaxis](https://diataxis.fr/) splits docs into four quadrants by audience-need: *tutorials* (learning), *how-tos* (task-doing), *references* (lookup), *explanations* (understanding). Knowing which quadrant a doc lives in tells you when to reach for it.

| Doc | Quadrant | When to reach for it |
|---|---|---|
| [`../README.md`](../README.md) | Tutorial | First contact — what is this, how do I run it. |
| [`../DEVELOPMENT.md`](../DEVELOPMENT.md) | How-to | Setting up a dev environment, running mp tests, debugging mobile. |
| [`adding-a-biome.md`](adding-a-biome.md) | How-to | Extending the scene registry with a new biome. |
| [`tree-pipeline.md`](tree-pipeline.md) | How-to | Re-baking tree GLBs and impostor atlases. |
| [`cross-platform-testing.md`](cross-platform-testing.md) | How-to | Running the macOS/Safari smoke suite, debugging hardware-specific bugs. |
| [`multiplayer-ux.md`](multiplayer-ux.md) | How-to / Reference | Multiplayer UX flow + lobby state diagrams. |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Reference | Module map + render pipeline + network protocol. The "where does X live" doc. |
| [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) | Reference | Which files are frozen + how authorization works. |
| [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) | Reference | Cycle plan stub. New cycle plans inherit from this. |
| [`BACKLOG.md`](BACKLOG.md) | Reference | Closed-cycle headlines + deferred items. Append-only. |
| [`NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) | Reference | What `NEXT_SESSION.md` is for and how it's refreshed. |
| [`cycle-N-plan.md`](.) | Reference / Explanation | The active cycle's plan — scope, phases, Acceptance, frozen files. |
| [`../DECISIONS.md`](../DECISIONS.md) | Explanation | Why we made the calls we did. Chronological. |
| [`../.claude/rules/`](../.claude/rules/) | Explanation | Durable project rules — *why* the frozen-file categories exist. |
| [`archive/`](archive/) | Explanation | Closed cycle plans, archived research dossiers, wake-state reports. |

## What's at top level here

After Cycle 28 Stream A3's consolidation, the only files at `docs/` root are:

- The **active cycle plan** (`cycle-N-plan.md`).
- The **append-only [`BACKLOG.md`](BACKLOG.md)** — closed-cycle log + deferred items.
- The **fence + template + contract triad**: [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md), [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), [`NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md).
- A small set of **stable how-tos**: [`adding-a-biome.md`](adding-a-biome.md), [`tree-pipeline.md`](tree-pipeline.md), [`cross-platform-testing.md`](cross-platform-testing.md), [`multiplayer-ux.md`](multiplayer-ux.md).
- This index ([`README.md`](README.md)).

Everything else lives under [`archive/`](archive/):

- [`archive/cycles/`](archive/cycles/) — closed cycle plans (one per closed cycle).
- [`archive/research/`](archive/research/) — research dossiers compiled mid-cycle. Findings are summarized in [`../DECISIONS.md`](../DECISIONS.md); originals preserved here for revisit.
- [`archive/wake-states/`](archive/wake-states/) — wake-state reports from autonomous overnight runs.
- [`archive/c-retry/`](archive/c-retry/) — Cycle 1's CF-cutover-and-rollback artifacts (kept for the postmortem context).
- [`archive/polish-program.md`](archive/polish-program.md) — original 6-cycle polish-program umbrella, archived 2026-05-09. Durable thesis preserved in [`../DECISIONS.md`](../DECISIONS.md).
- [`archive/POSTMORTEM.md`](archive/POSTMORTEM.md), [`archive/AGENT_PLAN.md`](archive/AGENT_PLAN.md), [`archive/cycle-1-audit.md`](archive/cycle-1-audit.md), etc. — historical artifacts.

## Adding a new doc

- **Tutorials / how-tos** → top level here.
- **References** → top level here, but ask first whether it should be a section in an existing reference doc instead.
- **Cycle plans** → `docs/cycle-N-plan.md` while active; archived to `archive/cycles/` at cycle close by `/cycle-close`.
- **Cycle-specific research** → `docs/cycle-N-<topic>-research.md` while active. Archive to `archive/research/` and add a 2-3 line summary to [`../DECISIONS.md`](../DECISIONS.md) at cycle close.
- **Explanations / decisions** → append to [`../DECISIONS.md`](../DECISIONS.md), don't create a new doc unless the explanation is large enough to need its own page.
- **Durable rules** → [`../.claude/rules/`](../.claude/rules/), not here.

If a doc's audience-need doesn't fit one of the four Diátaxis quadrants, it's probably scratch work that belongs in the active cycle plan or a wake-state report instead.
