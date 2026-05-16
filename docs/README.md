# Documentation

> One-page navigation index for the `docs/` tree. Two reading paths below depending on whether you're an agent picking up cold or a developer reading cold.

## Reading paths

### Path 1 — Agent picking up cold

You're a fresh agent (Claude / Codex / Cursor / etc.) on this repo with no session context. Read in this order:

1. **[`../NEXT_SESSION.md`](../NEXT_SESSION.md)** — current pickup state. Tells you which cycle is active, when the snapshot was taken, and where to start.
2. **The active cycle plan** — path is in NEXT_SESSION when a cycle is open, typically [`cycle-N-plan.md`](.). If NEXT_SESSION says the next cycle is not drafted yet, pick the goal with Matt before creating it. Top-to-bottom. EARS-format Acceptance lines tell you what "done" means.
3. **[`konveyor-autonomous-run.md`](konveyor-autonomous-run.md)** — active brief for the Konveyor WebGPU/mobile campaign.
4. **[`konveyor-sds.md`](konveyor-sds.md)** — required when the active scope is the WebGPU / native-shipping campaign.
5. **[`../AGENTS.md`](../AGENTS.md)** — portable agent baseline (build/test/dev commands, code style, the `shared/` deterministic boundary).
6. **[`../CLAUDE.md`](../CLAUDE.md)** — Claude-specific overlay (slash commands, hooks, memory). Skip if you're a non-Claude agent.
7. **[`../.claude/rules/`](../.claude/rules/)** — durable project rules (deterministic-sim boundary, scene/render rules, cycle process, multiplayer contract).
8. **[`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)** — only if you need to touch one of the frozen files.

Don't write code until you've confirmed direction with the user or until the
active cycle plan / autonomous handoff directs you.

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
| [`content-campaign-2026-05.md`](content-campaign-2026-05.md) | How-to / Reference | May 2026 content pack, capture pipeline, publish caveats, and media validation gates. |
| [`capture-pipeline-spike-2026-05.md`](capture-pipeline-spike-2026-05.md) | How-to / Reference | Browser recording research, cloned OSS examples, Remotion assessment, and chosen capture architecture. |
| [`multiplayer-ux.md`](multiplayer-ux.md) | How-to / Reference | Multiplayer UX flow + lobby state diagrams. |
| [`konveyor-autonomous-run.md`](konveyor-autonomous-run.md) | Reference / Explanation | Active experimental-branch handoff for the full autonomous Konveyor campaign. |
| [`konveyor-sds.md`](konveyor-sds.md) | Reference / Explanation | WebGPU, optimization, and native-shipping campaign doctrine. Read before any Konveyor cycle. |
| [`cycle-38-plan.md`](cycle-38-plan.md) | Reference / Explanation | Active Cycle 38: WebGPU mobile scene/camera/system matrix, visual gates, asset budgets, quality-governor closeout, and current connected-phone blockers. |
| [`archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md`](archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md) | Explanation | Current WebGPU tree-impostor spike: why the fixed-tile Kiln node path is not production octahedral impostor readiness. |
| [`cycle-37-plan.md`](cycle-37-plan.md) | Reference / Explanation | Completed Cycle 37: isolated WebGPU perf, sun/sky atmosphere repair, Native Packaging Proof 0, and store/Steam checklist. |
| [`native-packaging-proof-0.md`](native-packaging-proof-0.md) | Reference | Cycle 37 native packaging proof matrix for Electron, Tauri, Capacitor, PWA/TWA, Steam, stores, and true-native paths. |
| [`native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md) | Reference | Docs-only readiness gates for Steam, App Store, Google Play, and optional PWA/TWA distribution. |
| [`konveyor-completion-audit-2026-05-16.md`](konveyor-completion-audit-2026-05-16.md) | Reference | Current prompt-to-artifact audit for the Konveyor WebGPU branch packet and remaining hard stops. |
| [`konveyor-release-decision-checklist.md`](konveyor-release-decision-checklist.md) | Reference | Human-approved merge/deploy/default-renderer checklist after the Konveyor review packet is accepted. |
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

- The **active cycle plan** (`cycle-N-plan.md`) and any active campaign handoff
  such as [`konveyor-autonomous-run.md`](konveyor-autonomous-run.md).
- The **append-only [`BACKLOG.md`](BACKLOG.md)** — closed-cycle log + deferred items.
- The **fence + template + contract triad**: [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md), [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), [`NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md).
- A small set of **stable how-tos and campaign references**: [`adding-a-biome.md`](adding-a-biome.md), [`tree-pipeline.md`](tree-pipeline.md), [`cross-platform-testing.md`](cross-platform-testing.md), [`content-campaign-2026-05.md`](content-campaign-2026-05.md), [`capture-pipeline-spike-2026-05.md`](capture-pipeline-spike-2026-05.md), [`multiplayer-ux.md`](multiplayer-ux.md), [`konveyor-autonomous-run.md`](konveyor-autonomous-run.md), [`konveyor-sds.md`](konveyor-sds.md).
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

If a doc's audience-need doesn't fit one of the four Diátaxis quadrants, it's
probably scratch work that belongs in the active cycle plan, active autonomous
handoff, or a wake-state report instead.
