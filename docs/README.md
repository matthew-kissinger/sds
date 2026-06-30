# Documentation

> One-page navigation index for the `docs/` tree. Two reading paths below depending on whether you're an agent picking up cold or a developer reading cold.

## Reading paths

### Path 1 — Agent picking up cold

You're a fresh agent (Claude / Codex / Cursor / etc.) on this repo with no session context. Read in this order:

1. **[`../NEXT_SESSION.md`](../NEXT_SESSION.md)** — current pickup state. Tells you which cycle is active, when the snapshot was taken, and where to start.
2. **The active cycle plan** — path is in NEXT_SESSION when a cycle is open. At this snapshot Cycle 111 is the current completed release handoff: [`cycle-111-plan.md`](cycle-111-plan.md).
3. **[`../AGENTS.md`](../AGENTS.md)** — portable agent baseline (build/test/dev commands, code style, the `shared/` deterministic boundary).
4. **[`../CLAUDE.md`](../CLAUDE.md)** — Claude-specific overlay (slash commands, hooks, memory). Skip if you're a non-Claude agent.
5. **[`../.claude/rules/`](../.claude/rules/)** — durable project rules (deterministic-sim boundary, scene/render rules, cycle process, multiplayer contract).
6. **[`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)** — only if you need to touch one of the frozen files.
7. **[`archive/konveyor-campaign.md`](archive/konveyor-campaign.md)** — only if researching the WebGPU migration arc; the campaign already merged via PR #52.

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
| [`native-shell-proof-cycle-53.md`](native-shell-proof-cycle-53.md) | Reference | Cycle 53 native shell proof: green native preflight, packaged Windows Electron proof, Capacitor Android proof, and WebGL/WebGPU result matrix. |
| [`native-desktop-package-cycle-54.md`](native-desktop-package-cycle-54.md) | Reference | Cycle 54 desktop package path: electron-builder Windows installer/portable targets, signing posture, WebGL/WebGPU packaged proof, resize proof, and Steam handoff. |
| [`native-desktop-package-cycle-109.md`](native-desktop-package-cycle-109.md) | Reference | Historical v2.4.0 Windows desktop package proof: installer/portable artifacts, WebGL/WebGPU packaged proofs, signing posture, and Steam no-go items. |
| [`archive/cycles/cycle-54-plan.md`](archive/cycles/cycle-54-plan.md) | Reference / Explanation | Closed Cycle 54: Windows Electron distributor path, WebGL/WebGPU package proof, native resize proof, and Steam/store-prep handoff. |
| [`archive/cycles/cycle-53-plan.md`](archive/cycles/cycle-53-plan.md) | Reference / Explanation | Closed Cycle 53: native shell proof 1, WebGL/WebGPU shell evidence, and `v2.2.0` release close. |
| [`archive/cycles/cycle-42-plan.md`](archive/cycles/cycle-42-plan.md) | Reference / Explanation | Closed Cycle 42: WebGPU scene-material parity, darker water, sun/sky repaint, octahedral proof, and `v2.1.10` release approval state. |
| [`archive/cycles/cycle-41-plan.md`](archive/cycles/cycle-41-plan.md) | Reference / Explanation | Closed Cycle 41: WebGPU painterly sun/sky/water parity, art-lock matrix, and v2.1.9 release proof. |
| [`archive/cycles/cycle-40-plan.md`](archive/cycles/cycle-40-plan.md) | Reference / Explanation | Closed Cycle 40: sun/water/cloud coherence from the atmosphere sun color, plus the lab-only Pixel Forge v2 octahedral tree-impostor route. |
| [`archive/cycles/cycle-38-plan.md`](archive/cycles/cycle-38-plan.md) | Reference / Explanation | Closed Cycle 38: polished WebGPU production readiness (PC scope). Shipped water grid fix, quality-governor hysteresis, tree budget locks. Mobile work carried over. |
| [`archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md`](archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md) | Explanation | Cycle 38 grass/sheep/wool/sun spike: why grass darkening is not bend proof, why WebGPU sheep needs fixed-phase leg/wool captures, and why Open Country needs low-sun atmosphere proof. |
| [`archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md`](archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md) | Explanation | Cycle 38 WebGPU tree-impostor spike: why the fixed-tile Kiln node path is not production octahedral impostor readiness. |
| [`archive/cycles/cycle-37-plan.md`](archive/cycles/cycle-37-plan.md) | Reference / Explanation | Closed Cycle 37: isolated WebGPU perf, sun/sky atmosphere repair, Native Packaging Proof 0, and store/Steam checklist. |
| [`native-packaging-proof-0.md`](native-packaging-proof-0.md) | Reference | Cycle 37 native packaging proof matrix for Electron, Tauri, Capacitor, PWA/TWA, Steam, stores, and true-native paths. |
| [`native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md) | Reference | Docs-only readiness gates for Steam, App Store, Google Play, and optional PWA/TWA distribution. |
| [`archive/konveyor-campaign.md`](archive/konveyor-campaign.md) | Reference | Index for the archived Konveyor WebGPU/mobile campaign docs (post-PR-#52). |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Reference | Module map + render pipeline + network protocol. The "where does X live" doc. |
| [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) | Reference | Which files are frozen + how authorization works. |
| [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) | Reference | Cycle plan stub. New cycle plans inherit from this. |
| [`BACKLOG.md`](BACKLOG.md) | Reference | Closed-cycle headlines + deferred items. Append-only. |
| [`NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) | Reference | What `NEXT_SESSION.md` is for and how it's refreshed. |
| [`cycle-106-plan.md`](cycle-106-plan.md) | Reference / Explanation | Launch-readiness cycle 106: docs and repo hygiene. |
| [`cycle-107-plan.md`](cycle-107-plan.md) | Reference / Explanation | Launch-readiness cycle 107: SEO and site content refresh. |
| [`cycle-108-plan.md`](cycle-108-plan.md) | Reference / Explanation | Launch-readiness cycle 108: release-candidate proof. |
| [`cycle-109-plan.md`](cycle-109-plan.md) | Reference / Explanation | Launch-readiness cycle 109: native desktop and Steam readiness. |
| [`cycle-110-plan.md`](cycle-110-plan.md) | Reference / Explanation | Launch-readiness cycle 110: itch, portals, and final launch review. |
| [`cycle-111-plan.md`](cycle-111-plan.md) | Reference / Explanation | Core bark, first-session onboarding, leaderboard motivation, completion UX, and Newsheepdogland sandbox guard. |

## Launch Review Packet

| Doc | Type | Purpose |
|---|---|---|
| [`launch/final-launch-review.md`](launch/final-launch-review.md) | Reference | Single entry point for Matt review after Cycles 106-110. |
| [`launch/leaderboard-season-plan.md`](launch/leaderboard-season-plan.md) | Reference | Seasonal leaderboard model: preserve all-time records, add beta seasons intentionally, and avoid reset shortcuts. |
| [`launch/release-candidate.md`](launch/release-candidate.md) | Reference | Historical v2.4.0 release-candidate status, validation summary, deploy posture, and risks. |
| [`launch/release-checklist.md`](launch/release-checklist.md) | How-to | Exact commands and manual steps for approved tag, deploy, itch update, Steam continuation, and rollback. |
| [`launch/v2.6.1-hotfix-release-notes.md`](launch/v2.6.1-hotfix-release-notes.md) | Reference | Current WebGPU Counting Sheep hotfix release notes for the web beta. |
| [`launch/v2.6.0-beta-release-notes.md`](launch/v2.6.0-beta-release-notes.md) | Reference | Web beta release notes for the public support/privacy/copy/lobby alignment pass. |
| [`launch/v2.5.0-release-notes.md`](launch/v2.5.0-release-notes.md) | Reference | Cycle 111 player-facing release notes for the bark/onboarding/leaderboard release. |
| [`launch/itch-launch-brief.md`](launch/itch-launch-brief.md) | Reference | itch copy, build proof, upload path, screenshots, and rollback notes. |
| [`launch/steam-store-brief.md`](launch/steam-store-brief.md) | Reference | Steam page draft, asset requirements, feature claims, and blockers. |
| [`launch/portal-target-matrix.md`](launch/portal-target-matrix.md) | Reference | CrazyGames, Poki, Newgrounds, Kongregate, Y8, and itch recommendations. |
| [`../DECISIONS.md`](../DECISIONS.md) | Explanation | Why we made the calls we did. Chronological. |
| [`../.claude/rules/`](../.claude/rules/) | Explanation | Durable project rules — *why* the frozen-file categories exist. |
| [`archive/`](archive/) | Explanation | Closed cycle plans, archived research dossiers, wake-state reports. |

## What's at top level here

After Cycle 28 Stream A3's consolidation, the only files at `docs/` root are:

- The **active and recent cycle plans** while a release handoff is open (`cycle-106-plan.md` through `cycle-111-plan.md`). Archive each one to `archive/cycles/` only after that cycle closes.
- The **append-only [`BACKLOG.md`](BACKLOG.md)** — closed-cycle log + deferred items.
- The **fence + template + contract triad**: [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md), [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), [`NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md).
- A small set of **stable how-tos and references**: [`adding-a-biome.md`](adding-a-biome.md), [`tree-pipeline.md`](tree-pipeline.md), [`cross-platform-testing.md`](cross-platform-testing.md), [`native-shell-proof-cycle-53.md`](native-shell-proof-cycle-53.md), [`native-desktop-package-cycle-54.md`](native-desktop-package-cycle-54.md), [`native-packaging-proof-0.md`](native-packaging-proof-0.md), [`native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md), [`content-campaign-2026-05.md`](content-campaign-2026-05.md), [`capture-pipeline-spike-2026-05.md`](capture-pipeline-spike-2026-05.md), [`multiplayer-ux.md`](multiplayer-ux.md).
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
