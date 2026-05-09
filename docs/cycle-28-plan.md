# Cycle 28 — alignment

> Drafted 2026-05-09 after Cycle 27's autonomous run reached its pickup point. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 27 introduced three drift symptoms simultaneously: plan-to-ship drift (phases shipping primitives without integration), doc-to-reality drift ([`polish-program.md`](archive/polish-program.md) describing 5 cycles after collapsing into Cycle 25, ~50 docs at `docs/` root with no archive policy, accumulating guard text in [`NEXT_SESSION.md`](../NEXT_SESSION.md)), and code-mass drift ([`main.js`](../js/main.js) 3,529 LOC, [`TerrainBuilder.js`](../js/TerrainBuilder.js) 2,785 LOC).

Cycle 28 closes those drift sources and adopts a small set of 2025-2026 conventions ([AGENTS.md](https://agents.md/), EARS-format acceptance criteria, hook-enforced cycle-close reconciliation) that the public state of the art has converged on. **No new gameplay, perf, or visual scope.** This is a closeout cycle for the cycle methodology itself.

**User-visible difference between before and after:** none player-facing. Internal-only. CHANGELOG entry will read "Cycle 28 — alignment, no player-visible changes." Optional `v2.2.0-internal` tag if the refactor is shippable; not required.

**Sequencing principle:** four streams (A: docs, B: code, C: ergonomics, D: enforcement). Cycle 27 must close cleanly before Cycle 28 starts — alignment on a half-shipped cycle just produces another stale snapshot.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. Reference list at the bottom of this plan.
- **Run the validation suite** after each module extraction. Sim-baseline goldens are the safety net; if they drift even by one float ULP, revert.
- **Pick the simplest thing that meets the budget** rather than the most impressive.

## Open questions to resolve before writing code

1. **Q1: Does Cycle 27 close before Cycle 28 starts, or do we fold the closeout into Cycle 28's first phase?** Author lean: **separate**. Cycle 27 has 5 Matt-paired items (J/K/L/M/N) that don't fit Cycle 28's no-new-scope rule. Close 27 cleanly first, then start 28.
2. **Q2: Tag a `v2.2.0-internal` after Cycle 28?** Author lean: **no**. Internal refactor cycles don't need version surface. CHANGELOG gets a "Cycle 28 — alignment" entry.
3. **Q3: Defer [`GameState.js`](../js/GameState.js) decomposition (1,313 LOC) to Cycle 29?** Author lean: **yes**. Two god-module refactors in one cycle is enough risk; GameState is the third-largest and least urgent.
4. **Q4: Migrate [`DECISIONS.md`](../DECISIONS.md) to MADR/YADR format as part of Stream A?** Author lean: **no, defer**. MADR is a nice-to-have; the stream is overloaded enough. Park for Cycle 29.
5. **Q5: Adopt the [chained-handoff pattern](https://github.com/softaworks/agent-toolkit/blob/main/skills/session-handoff/README.md) over rolling [`NEXT_SESSION.md`](../NEXT_SESSION.md)?** Author lean: **no**. The current-only rewrite contract from Stream A4 achieves the same hygiene with less surface. Borrow the per-branch namespacing only if parallel-worktree cycles become routine.

Q1–Q2 must resolve before Stream A1. Q3–Q5 can resolve mid-cycle.

## Architecture / shared changes

No shared schema or primitive changes this cycle. Each stream touches a distinct surface:

- **Stream A** edits docs only.
- **Stream B** decomposes [`main.js`](../js/main.js) and [`TerrainBuilder.js`](../js/TerrainBuilder.js) under a characterization-test harness; sim-baseline goldens unchanged.
- **Stream C** adds rule files, a template update, and a navigation index.
- **Stream D** adds hooks and a script under `.claude/`.

---

# Stream A — doc alignment (~2 days, autonomous)

## Phase A1 — reconcile [`polish-program.md`](archive/polish-program.md)

The doc describes Cycles 25–30 as separate; reality collapsed them into mega-Cycle 25 + 26 + 27.

1. **Extract the durable thesis** (LOD1 silhouette mismatch, net-negative LOC tracking, per-tier divergence rationale, the "what gets deleted" tracking) into a new section in [`DECISIONS.md`](../DECISIONS.md) titled "Polish program — thesis and outcomes (2026-05)."
2. **Move the original** to `docs/archive/polish-program.md` with a single-line header pointing to the DECISIONS entry.

**Acceptance (EARS):**
- When A1 ships, then `docs/polish-program.md` shall not exist at its original path.
- When A1 ships, then [`DECISIONS.md`](../DECISIONS.md) shall contain a section titled "Polish program — thesis and outcomes."
- When `grep -r "polish-program.md" docs/ NEXT_SESSION.md README.md` runs, every hit shall point to the archive path or the DECISIONS section.

## Phase A2 — split durable rules from cycle-specific freezes

[`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) currently mixes durable rules (deterministic-sim core lockdown) with cycle-specific freezes ("SceneManager.js tone-mapping branch — just shipped v2.0.3"). The durable "Don't ___" list at the bottom of [`NEXT_SESSION.md`](../NEXT_SESSION.md) duplicates some of the same content.

1. **Audit** [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) and [`NEXT_SESSION.md`](../NEXT_SESSION.md). Tag each rule as durable or cycle-specific.
2. **Split into `.claude/rules/`** by domain. New files:
   - `.claude/rules/shared-sim.md` — deterministic boundary, sim-baseline lockdown.
   - `.claude/rules/scene-and-render.md` — atmosphere/grass/heightfield rules.
   - `.claude/rules/cycle-process.md` — cycle methodology (don't blow up main.js in one PR, etc.).
   - `.claude/rules/multiplayer.md` — Worker/DO contract rules.
3. **Slim [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)** to retain only the *file lockdown* concept + how authorization works + a pointer to `.claude/rules/` for the actual rules.
4. **Slim [`NEXT_SESSION.md`](../NEXT_SESSION.md)** durable section to a single line: "See [`.claude/rules/`](../.claude/rules/) for durable project rules."
5. **Move cycle-specific freezes** out of NEXT_SESSION into the active cycle plan's `## Frozen files` section.

**Acceptance (EARS):**
- When A2 ships, then `.claude/rules/` shall exist with at least 4 domain-scoped rule files.
- When A2 ships, then [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) shall contain no dated language (no "just shipped v2.0.3", no "Cycle N", no specific dates).
- When A2 ships, then [`NEXT_SESSION.md`](../NEXT_SESSION.md)'s durable section shall be one line linking to `.claude/rules/`.

## Phase A3 — consolidate research docs

Top-level `docs/` has ~10 cycle-specific research docs ([`research-grass-2026-05.md`](research-grass-2026-05.md), [`cycle-16-tree-research.md`](cycle-16-tree-research.md), [`cycle-22-batchedmesh-research.md`](cycle-22-batchedmesh-research.md), etc.). Each has a corresponding outcome already in DECISIONS.md or BACKLOG.md or both.

1. **For each research doc**, write a 2-3 line summary entry in [`DECISIONS.md`](../DECISIONS.md) ("we considered X, picked Y because Z") if not already present.
2. **Move originals** to `docs/archive/research/` (preserved, not deleted).
3. **Update cross-references** in cycle plans, README, etc.

**Acceptance (EARS):**
- When A3 ships, then `ls docs/*.md | wc -l` shall return ≤ 15.
- When A3 ships, then every closed-cycle research doc shall have a one-paragraph DECISIONS entry summarizing the durable finding.
- When `grep -r "research-grass-2026-05" docs/ NEXT_SESSION.md README.md` runs, every hit shall point to the archive path.
- While A3 runs, no original research doc shall be deleted (only moved).

## Phase A4 — write [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md)

Currently [`NEXT_SESSION.md`](../NEXT_SESSION.md) mixes pickup state, durable warnings, and partial logs. The contract names what NEXT_SESSION is for.

1. **Write the contract** as a one-page doc with the rules:
   - NEXT_SESSION is always **current-only**: a snapshot of the active cycle's pickup point.
   - On `/cycle-close`, NEXT_SESSION is fully rewritten for cycle N+1, not edited.
   - Historical pickup state worth preserving lives in `docs/archive/wake-states/`.
   - Required header: `Updated: <ISO date>` + `For: Cycle N` + `Pickup priority: <single sentence>`.
2. **Update existing [`NEXT_SESSION.md`](../NEXT_SESSION.md)** to conform to the new header.
3. **Reference from [`/cycle-start`](../.claude/commands/cycle-start.md) and [`/cycle-close`](../.claude/commands/cycle-close.md)** slash commands.

**Acceptance (EARS):**
- When A4 ships, then [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) shall exist and be ≤ 200 lines.
- When A4 ships, then [`NEXT_SESSION.md`](../NEXT_SESSION.md) shall start with `Updated: <ISO date>`, `For: Cycle N`, and `Pickup priority: <one line>`.
- When `/cycle-start` runs, it shall fetch NEXT_SESSION's `Updated:` date and warn if older than 7 days.

## Phase A5 — write [`docs/README.md`](README.md) navigation index

`docs/` has no entry point. A cold-start reader scanning `ls docs/` sees ~30 files with no map.

1. **One-page navigation README** with two paths: "agent picking up cold" → [`NEXT_SESSION.md`](../NEXT_SESSION.md); "developer reading cold" → [`ARCHITECTURE.md`](../ARCHITECTURE.md), then [`DECISIONS.md`](../DECISIONS.md).
2. **Quadrant-tag each top-level doc** by [Diátaxis](https://diataxis.fr/) category: tutorial / how-to / reference / explanation. Helps cold-start agents pick the right doc.
3. **Link from root [`README.md`](../README.md)** Contributing section.

**Acceptance (EARS):**
- When A5 ships, then [`docs/README.md`](README.md) shall exist with both reading paths and a Diátaxis-quadrant table.
- When A5 ships, then root [`README.md`](../README.md) Contributing section shall link to [`docs/README.md`](README.md).

---

# Stream B — god module decomposition (~3-4 days, autonomous with paired validation)

**Hard rule for this stream:** zero behavior change. Sim-baseline goldens unchanged. All 252 specs pass. Bundle size flat or smaller. No visual regressions across existing playwright golden captures. Apply the [Stillwater 9-phase god-object playbook](https://entropicdrift.com/blog/refactoring-god-object-detector-with-stillwater/) to each extraction:

1. Classify each function: pure / I/O / orchestration / mixed.
2. Extract types and thresholds (constants).
3. Extract pure scoring/sampling functions.
4. Extract predicates.
5. Extract classification logic.
6. Extract recommendations / decisions.
7. Build orchestrator that composes pure functions.
8. Update public API for back-compat.
9. Delete legacy paths.

## Phase B0 — characterization-test harness

Pre-step. Before touching any source, lock current behavior under additional goldens.

1. **Mesh-vertex-hash golden** — for each scene, hash the terrain mesh's positions/normals/uv arrays after construction with a fixed seed. Commit hashes under `tests/refactor-baseline/terrain-mesh-hash.json`.
2. **Scatter-position golden** — for each scene, hash the tree + rock positions/scales/rotations after Poisson placement with a fixed seed. Commit under `tests/refactor-baseline/scatter-positions.json`.
3. **Bundle-size golden** — record `main-*.js` and `three-*.js` byte sizes after `npm run build`. Commit under `tests/refactor-baseline/bundle-sizes.json`.
4. **One refactor-baseline spec** that loads each golden and asserts equality.

**Acceptance (EARS):**
- When B0 ships, then `tests/refactor-baseline/` shall exist with 3 golden files.
- When `npm test` runs after B0, all 252+3 specs shall pass.
- When the goldens are removed and re-generated, all 3 hashes shall match the committed values bit-for-bit.

## Phase B1 — [`main.js`](../js/main.js) boot extraction (3,529 → ≤ 2,200 LOC)

The orchestrator is doing too much. Extract the **boot sequence** (one-time module wiring) without touching the per-frame loop or mode dispatch. Reference: [Three.js Journey "Experience" pattern](https://threejs-journey.com/lessons/code-structuring-for-bigger-projects).

1. **New files under `js/boot/`:**
   - `js/boot/initSceneAndRenderer.js` — Three.js scene + renderer + camera + atmosphere wiring.
   - `js/boot/initWorld.js` — terrain, grass, structures, sheep, sheepdog construction.
   - `js/boot/initInput.js` — InputHandler, GamepadManager, MobileControls wiring.
   - `js/boot/initNetwork.js` — NetworkManager + multiplayer-only init.
   - `js/boot/loadScene.js` — scene-swap coordination (currently inline in main.js).
2. **`main.js` retains:** per-frame update loop, mode dispatch, pause propagation, fixed-timestep physics, Mediator entry points.
3. **Apply Stillwater phases** in order. One commit per phase. Run full test suite + refactor-baseline goldens after each commit.

**Acceptance (EARS):**
- When B1 ships, then `wc -l js/main.js` shall return ≤ 2,200.
- When `npm test` runs after B1, all specs shall pass and refactor-baseline goldens shall match.
- When `npm run build` runs after B1, the `main-*.js` chunk shall be no larger than the pre-B1 baseline.
- While B1 runs, no public symbol exported from `main.js` shall change name or signature.

## Phase B2 — [`TerrainBuilder.js`](../js/TerrainBuilder.js) decomposition (2,785 → ≤ 1,400 LOC)

Highest-value extraction. The class is doing terrain mesh + tree placement + rock placement + far-tree LOD impostors + structure surfacing + fog wiring. Reference: the [TerrainSource → TerrainMesh → Scatterers seam](https://github.com/hytopiagg/sdk) recurring across HYTOPIA, NotBlox, PlayCanvas.

1. **New files under `js/world/`:**
   - `js/world/groundY.js` — pure module: `_groundY(x, z)` + falloff math. Imported by [`TerrainBuilder`](../js/TerrainBuilder.js), [`TreePlacement`](../js/world/TreePlacement.js), [`RockPlacement`](../js/world/RockPlacement.js), [`StructureBuilder`](../js/StructureBuilder.js).
   - `js/world/TreePlacement.js` — Poisson placement, GLB bbox baking, per-tree `modelBaseYOffset` math. Consumes `groundY`, not `TerrainBuilder`.
   - `js/world/RockPlacement.js` — Poisson + scaling.
   - `js/world/FarTreeImpostor.js` — 3-quad offscreen-render LOD system.
2. **`TerrainBuilder.js` retains:** terrain mesh construction, heightfield displacement, fog binding, scene-defaulted zone reading, the public API the rest of the codebase calls.
3. **Apply Stillwater phases** in order. Tree placement is the largest extraction; do it first under the scatter-position golden.

**Acceptance (EARS):**
- When B2 ships, then `wc -l js/TerrainBuilder.js` shall return ≤ 1,400.
- When `npm test` runs after B2, all specs shall pass and the `tests/refactor-baseline/scatter-positions.json` golden shall match bit-for-bit.
- When the e2e Playwright suite runs after B2, all visual goldens shall match within existing SSIM tolerance.
- When `?debug=heightfield` and `?debug=lodmatch` URL flags are toggled after B2, both shall continue to work as before.
- While B2 runs, no public symbol exported from `TerrainBuilder.js` shall change name or signature.

## Phase B3 — codify "leave OptimizedSheep + GrassSystem alone"

Both are large ([`OptimizedSheep.js`](../js/OptimizedSheep.js) 2,107 LOC, [`GrassSystem.js`](../js/GrassSystem.js) 1,603 LOC) but **internally cohesive**: a single InstancedMesh + custom shader + per-instance attribute system. Decomposing them would scatter cohesion across files for no readability win.

1. **Add a section to [`DECISIONS.md`](../DECISIONS.md)** titled "OptimizedSheep + GrassSystem are large-and-cohesive by design": single shader/attribute coupling, per-instance state machine, splitting spreads coupling across files. Do not refactor without an explicit cohesion-vs-size tradeoff argument.

**Acceptance (EARS):**
- When B3 ships, then [`DECISIONS.md`](../DECISIONS.md) shall contain the codification entry.

## Phase B4 — defer [`GameState.js`](../js/GameState.js) (1,313 LOC) to Cycle 29

Lower priority than B1/B2. Mode dispatch is a switch chain that could become data-driven (mode → config object). Worth it eventually but Cycle 28 should not over-scope.

1. **Add to BACKLOG "Deferred" section:** GameState decomposition as a Cycle 29 candidate phase.

**Acceptance (EARS):**
- When B4 ships, then [`BACKLOG.md`](BACKLOG.md) "Deferred" shall list GameState decomposition.

## Phase B5 — `shared/` boundary ESLint rule

Make the deterministic-sim boundary enforceable rather than disciplinary. Reference: NotBlox's `shared/` workspace package + `NetworkComponent` inheritance, simplified.

1. **Add `eslint-plugin-import` `no-restricted-imports` rule** scoped to `shared/**`. Bans imports of `three`, `window`, DOM types, and any module under `js/` (which transitively pulls Three.js).
2. **Run lint suite.** Should pass clean — `shared/` already follows this contract; the rule is a regression guard.

**Acceptance (EARS):**
- When B5 ships, then `npx eslint shared/` shall pass with zero errors.
- When a developer adds `import * as THREE from 'three'` to a `shared/` file, then ESLint shall fail with a message naming the rule.

---

# Stream C — agent ergonomics (~1-2 days, autonomous)

## Phase C1 — write [`AGENTS.md`](../AGENTS.md) at repo root + slim [`CLAUDE.md`](../CLAUDE.md)

Adopt the [AGENTS.md convention](https://agents.md/) for portable agent context. Codex/Cursor/Aider/Jules/Windsurf all read it. Composition: README = humans, AGENTS.md = portable agent baseline, CLAUDE.md = Claude-specific overlay.

1. **Write [`AGENTS.md`](../AGENTS.md)** at repo root with the portable layer: project summary, build/test/dev commands, code style (vanilla JS, no JSX), the `shared/` deterministic boundary rule, sim-baseline lockdown, PR/commit conventions, where to read for more.
2. **Write [`CLAUDE.md`](../CLAUDE.md)** at repo root with the Claude-specific overlay: cycle methodology pointer, slash command map, [`NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) pointer, [`.claude/rules/`](../.claude/rules/) pointer. Should not duplicate AGENTS.md content.

**Acceptance (EARS):**
- When C1 ships, then [`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md) shall both exist at repo root.
- When C1 ships, then [`AGENTS.md`](../AGENTS.md) shall contain no Claude-specific content (no slash commands, no Anthropic-only references).
- When C1 ships, then [`CLAUDE.md`](../CLAUDE.md) shall reference [`AGENTS.md`](../AGENTS.md) and not duplicate its content.

## Phase C2 — update [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) to mandate EARS format

Currently the template's "Acceptance" example is prose ("FCP improves measurably on Slow 3G"). [EARS notation](https://kiro.dev/docs/specs/) ("While X, when Y, the system shall Z") is testable by construction.

1. **Update the template's Phase Acceptance example** to use EARS form. Add a one-paragraph EARS guide at the top of the Acceptance section.
2. **Update [`/cycle-close`](../.claude/commands/cycle-close.md)** step "walk Acceptance criteria" to grep for EARS keywords (`shall`, `when`, `while`).

**Acceptance (EARS):**
- When C2 ships, then [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) shall contain the phrase "EARS" at least once and an example using `shall`.
- When `/cycle-close` runs after C2, it shall grep for `shall`/`when`/`while` keywords in the active plan's Acceptance section.

## Phase C3 — phase shape rule

Cycle 27 had 14 phases (A-N), 9 autonomous + 5 needing Matt. That's not a cycle, it's a roadmap.

1. **Add to [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md):**
   - A cycle has **≤ 8 phases**.
   - Phases are either **fully autonomous** or **fully paired** — no mixed mode within a phase.
   - "Matt pickup" phases (taste, real-device, design, marketing voice) scope as a paired-track cycle, not appended to an autonomous cycle.

**Acceptance (EARS):**
- When C3 ships, then [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) shall contain the phase-shape rule.
- When `/cycle-start` opens a plan with > 8 phases after C3, it shall surface a warning to the user.

## Phase C4 — write [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)

Each cycle plan has a "Hard stops" section. Some are durable ("regenerating sim-baseline fixtures"), some are cycle-specific ("Phase A beacon shows zero pageviews after 1hr"). The split reduces noise.

1. **New [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)** for durable surface-to-Matt rules. Cycle plan's "Hard stops" retains only cycle-scoped stops.
2. **Migrate** durable stops out of past cycle plans (cycle-26, cycle-27) — these stay where they are for historical accuracy, but the new doc is the authoritative source going forward.
3. **Reference from [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md)** Hard stops section.

**Acceptance (EARS):**
- When C4 ships, then [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) shall exist with at least 5 durable rules.
- When [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) is read after C4, its "Hard stops" section shall reference [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md).

## Phase C5 — package doc consolidation as `/cycle-doc-dream` skill

The work in Stream A1-A4 is exactly the [Auto Dream](https://claudefa.st/blog/guide/mechanics/auto-dream) memory-consolidation pattern, applied to docs instead of memory. Worth packaging for reuse across other projects.

1. **New `.claude/skills/cycle-doc-dream/SKILL.md`** that runs the consolidation pass: identify duplicate or stale docs, propose folds into [`DECISIONS.md`](../DECISIONS.md), surface candidates for archival.
2. **Manual invocation only** (no automatic firing). User runs it on demand at cycle close or whenever drift becomes visible.

**Acceptance (EARS):**
- When C5 ships, then `.claude/skills/cycle-doc-dream/SKILL.md` shall exist.
- When the skill is invoked manually, it shall produce a list of candidate doc consolidations without making changes.

---

# Stream D — hook-enforced cycle-close reconciliation (~1 day, autonomous, novel)

**Public state of the art has no equivalent pattern.** GitHub Spec Kit's `/speckit.analyze` runs *before* implementation. Auto Dream runs *between* sessions for memory. Nothing automatically grep-verifies acceptance criteria against shipped commits at cycle close. Building this would put `sds` ahead of the public methodology curve.

## Phase D1 — Stop hook prototype

Fires at end of every agent turn. Reads [`NEXT_SESSION.md`](../NEXT_SESSION.md), finds active cycle plan, counts unchecked `- [ ]` items in the Acceptance section. If > 0, prints a one-liner. Always exits 0 — informational, never blocking.

1. **Write `.claude/hooks/check-acceptance.mjs`** as a Node.js script (cross-platform, no PowerShell weirdness). Reads NEXT_SESSION → finds cycle plan path → counts unchecked acceptance items → prints summary if > 0.
2. **Write `.claude/settings.json`** (committed, shared) with the Stop-hook config. (Existing `.claude/settings.local.json` retains user-local permissions.)
3. **Manual smoke test:** invoke the script directly; verify it exits silent on a fully-checked plan and prints "X/Y unchecked" on a plan with open items.

**Acceptance (EARS):**
- When D1 ships, then `.claude/hooks/check-acceptance.mjs` shall exist and run via `node` from the repo root.
- When the script runs against a plan with all items checked, it shall produce no output and exit 0.
- When the script runs against a plan with N unchecked items, it shall print one line containing `N` and exit 0.
- When `.claude/settings.json` is read after D1, it shall declare a Stop hook invoking the script.

## Phase D2 — extend [`/cycle-close`](../.claude/commands/cycle-close.md) to invoke deeper reconciliation

Building on D1: at cycle-close, walk each EARS acceptance line, attempt to grep its testable predicate against shipped commits + test output, surface unchecked items.

1. **New `.claude/hooks/cycle-close-reconcile.mjs`** — heavier reconciliation. For each `- [ ]` Acceptance line, parse the EARS form (`When X, then Y`), heuristically grep for `Y` in commit messages + test output. Print a structured table.
2. **Update [`/cycle-close`](../.claude/commands/cycle-close.md) Step 3** to run the script first, present the table, then ask "ship anyway?" per item.
3. **Cycle-specific freeze on [`/cycle-close.md`](../.claude/commands/cycle-close.md)** for this cycle (per Stream C is fence-authorized — see Frozen files below).

**Acceptance (EARS):**
- When D2 ships, then `.claude/hooks/cycle-close-reconcile.mjs` shall exist and produce structured output.
- When `/cycle-close` runs after D2, it shall invoke the reconciliation script and present its output before walking the Success criteria manually.

## Phase D3 — freshness check in [`/cycle-start`](../.claude/commands/cycle-start.md)

If [`NEXT_SESSION.md`](../NEXT_SESSION.md)'s `Updated:` date is older than 7 days, surface a warning at session open. Catches stale handoffs.

1. **Update [`/cycle-start`](../.claude/commands/cycle-start.md) Step 1** to fetch NEXT_SESSION's `Updated:` field, compute days-since, warn if > 7.

**Acceptance (EARS):**
- When D3 ships, then `/cycle-start` shall warn the user when NEXT_SESSION's Updated date is > 7 days old.
- When NEXT_SESSION's Updated date is within 7 days, then `/cycle-start` shall not produce the warning.

---

## Dependencies

```
Cycle 27 closeout (separate session, prerequisite)
  ↓
Stream A1, A2, A3 (parallel) → A4 → A5
                                ↓
B0 (characterization tests) ─→ B1 + B2 (parallel under goldens) → B3 + B4 + B5
                                ↓
C1 + C2 + C3 + C4 + C5 (parallel, after A complete)
                                ↓
D1 → D2 → D3
                                ↓
Cycle close
```

A1-A3 can run in any order. B0 must land before B1/B2. B1 and B2 can run in parallel under different worktrees if you want — they touch disjoint files. C streams can run any time after A is done. D depends on C2 (EARS format) being available so the hook script has structured input.

## Frozen files (cycle-specific additions)

Plus the durable [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) list. Cycle 28 explicitly **fence-authorizes** edits to:

- **[`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md)** — Phase C2 + C3 + C4 modify this. No other phase touches it.
- **[`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md)** — Phase A2 modifies this. No other phase touches it.
- **[`.claude/commands/cycle-start.md`](../.claude/commands/cycle-start.md)** — Phase D3 modifies this. No other phase.
- **[`.claude/commands/cycle-close.md`](../.claude/commands/cycle-close.md)** — Phase D2 + C2 modify this. No other phase.
- **[`docs/BACKLOG.md`](BACKLOG.md)** — Phase B4 appends a Deferred entry; otherwise standard `/cycle-close` write.

Migration story for each: see the corresponding phase's Steps section.

## Hard stops

Surface to the user, do not proceed:

1. **Sim-baseline goldens drift** during Stream B. Even one float ULP. Revert and re-think.
2. **Refactor-baseline goldens drift** during Stream B. Same posture.
3. **Visual e2e SSIM regression** > existing tolerance during Stream B. Revert.
4. **Bundle size regression** during Stream B. The refactor is supposed to be flat or smaller.
5. **Any new gameplay/perf/visual scope** proposed mid-cycle. This cycle is "no new features." Surface and defer to Cycle 29.
6. **Any frozen-file change beyond the explicitly authorized list above.** Standard fence rule.

## What NOT to do during this cycle

- **Don't** open new gameplay, perf, or visual scope. Phase L (title-screen identity), Phase M (heightfield decision), and Cycle 27 carryovers stay in their original cycle, not this one.
- **Don't** decompose [`OptimizedSheep.js`](../js/OptimizedSheep.js) or [`GrassSystem.js`](../js/GrassSystem.js) — codified in B3. Cohesive by design.
- **Don't** rewrite [`main.js`](../js/main.js)'s update loop or mode dispatch. Boot extraction only.
- **Don't** delete archived research docs. Move, don't delete.
- **Don't** ship a player-visible version bump from this cycle. Internal-only.
- **Don't** touch the `shared/` deterministic kernels. Sim-baseline lock holds. Stream B5 only adds an ESLint rule guarding the boundary.
- **Don't** adopt full ECS migration (bitECS / koota / miniplex). The [koota Three.js example author](https://dev.to/i_babkov/threejs-architecture-ecs-3fg2) explicitly enumerates the cost. Wrong project for paradigm shift.
- **Don't** adopt the full Kiro three-artifact spec split. The cycle plan is already a fused requirements+design+tasks artifact. Adopt EARS only.
- **Don't** import the full GitHub Spec Kit (`/speckit.constitution`, etc.). Steal `/speckit.analyze`'s cross-artifact-consistency idea as a hook (Stream D); don't import the pipeline.
- **Don't** package the cycle workflow as a Claude Code plugin yet. Premature until the workflow has stabilized post-Cycle-28. Revisit at Cycle 30.
- **Don't** adopt the chained-handoff pattern. The current-only NEXT_SESSION rewrite from A4 achieves the same hygiene with less surface.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. EARS form throughout — each line is testable.

- [ ] When Stream A ships, then `ls docs/*.md | wc -l` ≤ 15.
- [ ] When Stream A ships, then `docs/polish-program.md` does not exist at its original path.
- [ ] When Stream A ships, then [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) contains no dated language.
- [ ] When Stream A ships, then [`.claude/rules/`](../.claude/rules/) contains ≥ 4 domain-scoped rule files.
- [ ] When Stream A ships, then [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) and [`docs/README.md`](README.md) both exist.
- [ ] When Stream A ships, then [`NEXT_SESSION.md`](../NEXT_SESSION.md) starts with `Updated:`/`For:`/`Pickup priority:`.
- [ ] When Stream B ships, then `wc -l js/main.js` ≤ 2,200.
- [ ] When Stream B ships, then `wc -l js/TerrainBuilder.js` ≤ 1,400.
- [ ] When Stream B ships, then `npm test` passes all specs and `tests/refactor-baseline/` goldens match bit-for-bit.
- [ ] When Stream B ships, then Playwright e2e visual goldens match within existing SSIM tolerance.
- [ ] When Stream B ships, then `npm run build`'s `main-*.js` chunk is ≤ pre-cycle baseline.
- [ ] When Stream B ships, then `npx eslint shared/` passes with zero errors.
- [ ] When Stream C ships, then [`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md) exist at repo root.
- [ ] When Stream C ships, then [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) mandates EARS and the ≤ 8 phase rule.
- [ ] When Stream C ships, then [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) exists.
- [ ] When Stream C ships, then `.claude/skills/cycle-doc-dream/SKILL.md` exists.
- [ ] When Stream D ships, then `.claude/hooks/check-acceptance.mjs` runs via `node` and produces correct output on test cases.
- [ ] When Stream D ships, then `.claude/settings.json` declares the Stop hook.
- [ ] When Stream D ships, then `/cycle-close` invokes the reconciliation script as Step 2.5.
- [ ] When Stream D ships, then `/cycle-start` warns on stale NEXT_SESSION.
- [ ] When the cycle closes, no player-visible version is bumped.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template (will be EARS-mandating after C2)
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
- [AGENTS.md spec](https://agents.md/) — portable agent context (Stream C1)
- [Kiro spec model + EARS notation](https://kiro.dev/docs/specs/) — testable acceptance (Stream C2)
- [Three.js Journey "Experience" pattern](https://threejs-journey.com/lessons/code-structuring-for-bigger-projects) — orchestrator decomposition (Stream B1)
- [Soffritti SceneManager pattern](https://pierfrancesco-soffritti.medium.com/how-to-organize-the-structure-of-a-three-js-project-77649f58fa3f) — alt orchestrator pattern
- [HYTOPIA SDK](https://github.com/hytopiagg/sdk) — block/entity boundary discipline (Stream B2)
- [chungwu/combat-lander](https://github.com/chungwu/combat-lander) — closest public analog to our CF-DO + deterministic-sim split
- [Stillwater god-object 9-phase playbook](https://entropicdrift.com/blog/refactoring-god-object-detector-with-stillwater/) — refactor sequence (Stream B)
- [Cloudamite characterization testing](https://cloudamite.com/characterization-testing/) — golden-master pattern (Stream B0)
- [Diátaxis](https://diataxis.fr/) — doc quadrant tagging (Stream A5)
- [Auto Dream](https://claudefa.st/blog/guide/mechanics/auto-dream) — memory consolidation, basis for `/cycle-doc-dream` (Stream C5)
- [Claude Code Hooks reference](https://code.claude.com/docs/en/hooks) — Stop hook implementation (Stream D)
- [Anthropic 2026 Agentic Coding Trends Report](https://resources.anthropic.com/2026-agentic-coding-trends-report) — CLAUDE.md/AGENTS.md hygiene predicts developer satisfaction
