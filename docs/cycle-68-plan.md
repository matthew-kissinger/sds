# Cycle 68 - survival-polish

> Drafted 2026-06-07 after Cycle 67 (`coop-survival`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> Authored from the Cycle 67 carryover at Matt's direction ("add all to cycle - author and align it - then autonomously complete it"). All four carryover candidates are in scope. The riskiest item (grass) is gated behind a measure-first spike so a frozen-by-cohesion system (`GrassSystem`) is never touched on a guess.

## Goal

Harden and polish the co-op survival mode that shipped in Cycle 67. Five things change. (1) The deploy learns to apply remote D1 migrations, closing the gap that 500'd the survival leaderboard in prod this cycle. (2) The scattered survival feel constants (wolf counts and speeds, kill radius, bark repel range, the +5 dawn growth, the 33% loss fail line, the maxFlock pool) move to one tuning source and get a taste-led pass. (3) Co-op gets a real two-client integration proof against a live local worker, not just unit coverage. (4) A multi-day run survives a worker redeploy or a full disconnect by persisting to Durable Object storage and rehydrating on wake. (5) The island grass gets a measured density/LOD spike (and, if the numbers justify it, a rearch), plus a Newsheepdogland entrance hero capture. Before: co-op survival works but the deploy cannot migrate remote D1, the tunables are spread across four modules, the live co-op path is only unit-proven, a run resets on disconnect, and the island grass and entrance shot are unpolished. After: deploys self-migrate remote D1, survival feel is tuned from one place, co-op is integration-proven with saved artifacts, runs persist across reconnects, and the island has measured grass plus a hero shot.

## How to read this plan

This doc fixes the shape of the changes (where code slots in, the data contracts, the acceptance lines), not the implementation choices. Each phase researches the specific sub-problem before writing code and measures on the real target before committing a technique. Pick the simplest thing that meets the budget.

## Open questions to resolve before writing code

1. **Q1: Remote migrations via a dedicated job or a step inside the worker deploy job?** Author lean: a dedicated `migrate` job that the `worker` and `pages` jobs both `needs:`, so a failed migration blocks the deploy rather than shipping code against an un-migrated DB. Use `wrangler d1 migrations apply sds-db --remote` (tracking-table idempotent), not raw per-file `execute`.
2. **Q2: Do the survival tunables move into a new `shared/survival/tuning.js` or get re-exported from the existing modules?** Author lean: a new `shared/survival/tuning.js` that the existing modules import, so there is one definition site and the deterministic modules stay free of scattered magic numbers. Pure data, no behavior of its own.
3. **Q3: Two-client proof via headless browsers or a Node WS harness?** Author lean: a Node two-client WS harness against a live local `wrangler dev` (real Worker plus DO plus wire), since browser render is already proven by the Cycle 67 solo smoke and the unit suite. This isolates the integration gap (two independent clients sharing one authoritative DO) without browser flake.
4. **Q4: Persist the run on every tick or on transitions plus a cadence?** Author lean: on phase transitions (nightfall, survived dawn, death) plus a coarse cadence (every few seconds of run time), never per-tick. DO storage writes are not free and the run state changes meaningfully only at transitions.
5. **Q5: Does the grass spike commit to a rearch this cycle?** Author lean: no commitment. Phase 5 produces numbers and a go/no-go. Phase 6 implements only if the spike clears the gate; otherwise it defers to BACKLOG with the numbers. The do-not-decompose rule on `GrassSystem` stands.

## Architecture / shared changes

- **`shared/survival/tuning.js`** (new, Phase 2): a fixed-shape object of survival constants imported by `run.js`, `wolves.js`, `wolfBehavior.js`, and read by the DO. Pure data. Survival-only, so it cannot affect the standard sheep tick or the 9 sim-baselines.
- **DO survival persistence** (Phase 4): `GameSim` gains a serialize/rehydrate path for the survival state object, backed by `RoomDO` storage. Internal to the DO. The broadcast snapshot shape is unchanged, so no `PROTOCOL_VERSION` bump and no wire migration story is required.

## Phase shape rules

Eight phases, each a single sharp goal under ~4 hours. P2 (feel) and P7 (hero) are normally Matt-paired taste work; this cycle runs them autonomously per Matt's directive, with the subjective confirmation flagged as a deferred follow-up rather than a mid-phase pause (so no phase mixes autonomous and paired modes).

## Acceptance criteria - EARS format

Every phase's Acceptance section uses EARS notation so the lines are grep-testable. The `/cycle-close` reconciliation hook walks each line.

## Phase 1 - Deploy applies remote D1 migrations (~1.5hr)

**Independently testable.** This is the confirmed root cause of the Cycle 67 prod break (the survival board 500'd until migration 0009 was applied to remote D1 by hand). It is small, fully autonomous, and de-risks every future migration, so it goes first.

1. **Add a `migrate` job to [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).** Runs `npx wrangler d1 migrations apply sds-db --remote` in `worker/`, gated to `push` on `main` (not `workflow_dispatch` perf runs), using `CF_API_TOKEN` plus `CF_ACCOUNT_ID`. Make `worker` and `pages` `needs:` it so a failed migration blocks the deploy.
2. **Confirm the migrations dir is wrangler-migrations-compatible.** Check `worker/wrangler.toml` has `migrations_dir`; if the existing files predate the framework, ensure `migrations apply` tracks them via the `d1_migrations` table (idempotent on already-applied files).
3. **Fix the stale local-migration list.** The perf jobs run only `0001` and `0002` via raw `execute`; switch them to `wrangler d1 migrations apply sds-db --local` so local and remote use the same path and pick up `0003`..`0009`.
4. **Correct [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md).** The "CI does this on deploy" line is currently inaccurate; make it accurate now that CI does.

**Acceptance (EARS):**

- When `grep -c "migrations apply" .github/workflows/deploy.yml` runs, then it shall return a count of at least 2 (one `--remote`, one `--local`).
- When `grep "d1 migrations apply sds-db --remote" .github/workflows/deploy.yml` runs, then it shall return at least one match.
- While the `migrate` job fails, the `worker` deploy job shall not run (enforced by `needs:`).
- When [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) is read, then its append-only-migrations section shall describe the automated remote-apply step accurately (no false "manual only" claim, no stale claim that is untrue). **DEFERRED** - blocked by the agent-config edit guardrail; needs explicit user OK (see Frozen files).

## Phase 2 - Survival feel-pass tunables (~2hr)

**Depends on:** nothing. Independent of Phase 1.

1. **Create [`shared/survival/tuning.js`](../shared/survival/tuning.js).** One exported object (or named consts) for the survival feel constants: per-day wolf spawn count curve, wolf move and hunt speed, kill radius, bark repel radius, dawn growth (+5), loss fail fraction (33%), maxFlock pool (200).
2. **Route the existing modules through it.** `run.js`, `wolves.js` (`DEFAULT_WOLF_TUNING`), `wolfBehavior.js` (`spawnCountForDay`), and the scene `survival` block read from `tuning.js` (or are documented as the canonical source the scene mirrors). No duplicate definition sites.
3. **Tune for feel, with rationale.** Adjust values toward a better night-survival curve and record the before/after plus the reasoning inline. Survival-only paths, so the standard sheep tick is untouched.
4. **Test the single-source property + sim-baseline safety.**

**Acceptance (EARS):**

- When the survival feel constants are grepped, then each shall have exactly one definition site (in [`shared/survival/tuning.js`](../shared/survival/tuning.js)).
- When `npm test` runs the sim-baseline suite, then the 9 sheep baselines shall remain byte-identical (survival changes are gated; any drift is an emergency stop).
- When a wolf's hunt speed or the dawn growth is read at runtime, then it shall resolve from [`shared/survival/tuning.js`](../shared/survival/tuning.js).
- When `npm test` runs, then a spec shall assert the tuning module is the source consumed by `run.js` and `wolves.js`.

## Phase 3 - Two-client live co-op integration proof (~2.5hr)

**Depends on:** nothing structural; benefits from Phase 1's local-migration fix.

1. **Build a two-client WS harness** (`tools/coop-survival-proof.mjs`) that boots a local `wrangler dev` plus local D1 (migrated), creates a survival room over REST, joins two independent WS clients, and reads the MessagePack snapshot stream.
2. **Assert the authoritative broadcast.** Both clients receive a snapshot carrying the survival block and the wolves array; a forced day-to-night transition spawns wolves both clients see; a party-size leaderboard submit lands and reads back.
3. **Save artifacts** to `cycle68-validation/coop/` (a JSON result plus the captured frames). Add the dir to `.gitignore` if not already covered.
4. **Browser-probe hygiene.** Tear down `wrangler dev`, vite, and any listener the harness started.

**Acceptance (EARS):**

- When two clients join one survival room, then both shall receive a snapshot containing the `survival` block and a `wolves` array.
- When the DO transitions to night during the proof, then both clients' snapshots shall report at least one wolf.
- When the proof completes, then it shall write a pass/fail result artifact to `cycle68-validation/coop/`.
- When the proof exits, then no `wrangler dev` or vite listener it started shall remain bound (hygiene).

## Phase 4 - Reconnect persistence of the run (~3hr)

**Depends on:** Phase 3 (the integration harness doubles as the persistence proof driver).

1. **Serialize the survival state.** `GameSim` gains `serializeSurvival()` / `rehydrateSurvival(state)` covering run economy, day clock (`elapsed`), wolves, pen, and flock activation. Pure structured data (no class instances written to storage).
2. **Persist on transitions plus a cadence.** `RoomDO` writes the serialized state to DO storage on nightfall, survived dawn, and death, plus a coarse time cadence. Never per-tick.
3. **Rehydrate on wake.** On DO construction / `_initSurvival`, if stored survival state exists, rehydrate from it instead of resetting; otherwise start fresh.
4. **No wire change.** The broadcast snapshot shape is unchanged, so no `PROTOCOL_VERSION` bump. Confirm `snapshot-shape` tests still pass unchanged.

**Acceptance (EARS):**

- When a worker test serializes a mid-run survival state and rehydrates a fresh `GameSim` from it, then the day, flock, and wolf count shall be continuous (not reset).
- When a survival phase transition occurs, then the run state shall be written to DO storage.
- While survival run persistence is active, the broadcast snapshot shape shall be unchanged (no `PROTOCOL_VERSION` bump; `snapshot-shape` specs pass as-is).
- When `npm test` runs, then a new worker spec shall cover the evict-then-wake continuity path.

## Phase 5 - Grass density/LOD spike (~2hr)

**Depends on:** nothing. Measure-first, throwaway. No `GrassSystem` edit in this phase.

1. **Build the spike** (`tools/grass-rearch-spike.mjs` or a `perf-harness`-driven measurement) that measures whole-island grass cost on Newsheepdogland at the desktop target (RTX 3070): instance count, draw cost, density-LOD dither behavior across distance bands.
2. **Sweep candidate density/LOD configs** and record per-config timings and triangle/instance counts.
3. **Write numbers plus a go/no-go** to `cycle68-validation/grass/` with a recommendation: is a rearch worth a `GrassSystem` change this cycle, or is it a future cycle.

**Acceptance (EARS):**

- When the grass spike runs, then it shall write per-config timings to `cycle68-validation/grass/`.
- When the spike completes, then it shall record a go/no-go recommendation backed by numbers.
- While Phase 5 runs, [`js/GrassSystem.js`](../js/GrassSystem.js) shall remain unmodified (`git diff --stat` shows no change to it).

## Phase 6 - Grass rearch implementation (gated on Phase 5) (~3hr)

**Depends on:** Phase 5. Conditional.

**OUTCOME (2026-06-07): DEFERRED with evidence (the spike did its job).** The Phase 5 spike returned NO-GO: whole-island grass is 2.71x the draw calls (829 -> 2,243 chunks) and 1.37x the blades of the shipped 760m play-area disc, for ground the dog never traverses, and coastline has no meadow-quad LOD so every far chunk would be full clump instancing. [`js/GrassSystem.js`](../js/GrassSystem.js) is left unmodified (do-not-decompose upheld). The evidence-backed follow-up (carried to BACKLOG at close): a targeted far-ring meadow-quad for coastline scenes - NOT a GrassSystem decomposition - as its own spike + cycle; it would also trim the current 829 draw calls. Numbers in `cycle68-validation/grass/grass-spike.json`.

1. **If the spike clears its gate,** apply the winning density/LOD approach to [`js/GrassSystem.js`](../js/GrassSystem.js), preserving the stochastic per-blade dither and the three-octave wind (do not decompose the system).
2. **Re-validate.** Perf delta against the spike numbers; visual parity by eye on a preview; if scatter or mesh output changes, re-validate refactor-baseline goldens (regenerate only with recorded acceptance).
3. **If the spike does not clear the gate,** defer the implementation to BACKLOG with the spike numbers and note the deferral. This still counts as the phase shipping (an evidence-backed deferral, not a skip).

**Acceptance (EARS):**

- When the spike clears its gate and Phase 6 implements, then `npm test` and `npm run build` shall stay green and the perf delta shall be recorded against the spike baseline.
- If the spike does not clear its gate, then Phase 6 shall record the deferral in [`BACKLOG.md`](BACKLOG.md) carryover with the numbers, and `GrassSystem` shall be left unmodified.
- When Phase 6 modifies grass output, then refactor-baseline goldens shall be re-validated (and regenerated only with acceptance recorded here).

## Phase 7 - Newsheepdogland entrance hero capture (~1.5hr)

**Depends on:** nothing. Best run after Phase 6 if grass changed (so the shot reflects final grass).

1. **Write a shot manifest first** (per the media-prep working preference): scene, time of day, sun angle, camera position and target, dog pose, aspect, filename, purpose.
2. **Capture via preview** (`SDS_SUPPRESS_BROWSER_OPEN=1`), the entrance hero framing on Newsheepdogland, to `cycle68-validation/hero/`.
3. **Browser-probe hygiene.** Close every tab and listener the capture started.
4. **Flag the final beauty pass** for Matt (this produces a strong candidate; the subjective final selection stays his call).

**Acceptance (EARS):**

- When the hero capture runs, then it shall write at least one PNG to `cycle68-validation/hero/`.
- When the capture runs, then it shall follow a written shot manifest (scene, time of day, sun, camera, aspect).
- When the capture finishes, then all preview tabs and listeners it started shall be closed (hygiene).

## Phase 8 - Validate + ship + close (~1.5hr)

**Depends on:** Phases 1-7.

1. **Full validation:** `npm test`, `npm run build`, `npx eslint` on `shared/`, worker `tsc`, sim-baselines byte-identical.
2. **Ship** the code phases (P1-P7) to `main`; confirm the deploy is green and the new `migrate` job applied cleanly to remote D1.
3. **Run `/cycle-close`:** verify acceptance, archive this plan, append BACKLOG, scaffold `docs/cycle-69-plan.md`, refresh NEXT_SESSION and memory.

**Acceptance (EARS):**

- When Phase 8 runs validation, then `npm test` and `npm run build` shall both pass.
- When the close commit lands on `main`, then the deploy on `main` shall be green and the `migrate` job shall have applied pending migrations to remote D1.
- When the cycle closes, then BACKLOG, NEXT_SESSION, and memory shall be refreshed for Cycle 69.

## Dependencies

```
Phase 1 (deploy)         independent
Phase 2 (tunables)       independent
Phase 3 (coop proof) --> Phase 4 (persistence)
Phase 5 (grass spike) -> Phase 6 (grass impl, conditional) -> Phase 7 (hero, after grass)
                                                              Phase 8 (validate + close, last)
```

Execution order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 (serial, one local commit per phase).

## Frozen files (cycle-specific additions)

One authorized frozen-file edit:

- **[`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md)** (Phase 1). Why: P1 changes the remote-migration deploy contract (CI now applies newly-added migrations on deploy), so the doc's "Apply to remote with the standard wrangler CLI; CI does this on deploy" and "dev:setup runs the wrangler migration apply" lines are now factually wrong and actively misled this project last cycle (the prod break). The rule itself is changing, which is the authorized case for a `.claude/rules/*.md` edit. Alternative considered: leave it stale (rejected - it is the doc that caused the confusion). Consumers: none (doc only); no code depends on it.
  - **DEFERRED.** The automated agent-config guardrail blocked this edit under the general autonomous directive (editing a `.claude/rules/*.md` file is treated as agent self-modification and needs explicit user approval, which a "complete the cycle" directive against an agent-authored plan does not grant). The functional P1 fix (the `migrate` job in `deploy.yml`) ships without it. The one-line doc correction is carried over for Matt's explicit OK - the exact replacement text is staged in the cycle report.

Notes:

- **[`js/GrassSystem.js`](../js/GrassSystem.js)** is cohesion-frozen (do-not-decompose, [`DECISIONS.md`](../DECISIONS.md)). Phase 6 may modify it in place only if the Phase 5 spike justifies it, and only without decomposing it.
- **No deterministic-sim core, no `shared/scenes/types.js`, no wire protocol, no existing migration `.sql` file** is touched. Phase 4 adds DO-internal persistence with an unchanged snapshot shape. No new migration is required. Phase 1 adds CI plumbing and `worker/wrangler.toml` is not fence-listed.

## Hard stops

Durable stops apply on every cycle (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific additions:

1. If the Phase 2 tuning change drifts any of the 9 sheep sim-baselines, then stop and surface (it means a survival constant leaked into the standard sheep tick).
2. If the Phase 4 persistence change alters the broadcast snapshot shape (a `snapshot-shape` spec fails), then stop: persistence must be DO-internal, and a wire change requires the full four-piece migration story plus a `PROTOCOL_VERSION` bump, which is out of this cycle's scope.
3. If the Phase 5 grass spike cannot produce a clear go/no-go, then do not start Phase 6 on a guess; defer with whatever numbers exist.

## What NOT to do during this cycle

- Do not decompose `GrassSystem` or `OptimizedSheep` for cleanliness.
- Do not bump the wire protocol version (no wire change is in scope).
- Do not add a new D1 migration unless a phase genuinely needs a schema change (none is planned); if one appears, it is append-only and the new Phase 1 deploy step applies it to remote.
- Do not bump the player-visible version. Releases are Matt's explicit call.
- Do not let the feel pass or the hero shot block on subjective confirmation mid-phase; ship the best autonomous result and flag the taste pass as a follow-up.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When a deploy runs after Phase 1, the `migrate` job shall apply pending D1 migrations to remote sds-db automatically.
- [ ] When the survival feel constants are read, they shall have a single definition site in `shared/survival/tuning.js`.
- [ ] When two clients join a survival room in the Phase 3 proof, both shall render the DO-authoritative wolves and survival state.
- [ ] When a survival run is interrupted by a worker restart, the run shall resume from DO storage rather than reset.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 67 carryover)
- [`docs/archive/cycles/cycle-67-plan.md`](archive/cycles/cycle-67-plan.md) - the co-op survival cycle just closed
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - deterministic-sim boundary
- [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) - Worker / DO contract (corrected in Phase 1)
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - grass / capture discipline
