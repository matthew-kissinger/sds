# Cycle 106 - launch-docs-and-repo-hygiene

> Drafted 2026-06-26 after Cycle 105 closed and the launch-readiness audit found the code healthier than the documentation. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 106 makes the repo tell the truth again. Before this cycle, `README.md`, doc indexes, launch copy, native notes, and changelog material contain stale r184/r185, Cycle 83, Cycle 105, Newsheepdogland, itch, and native packaging claims. After this cycle, a cold human or agent should understand the current product, the current deployment posture, the launch program, and the remaining distribution work without reading old cycle archaeology.

## Autonomy contract

Matt explicitly wants the launch-readiness cycles scaffolded so agents can continue through Cycle 110 before human review. If every acceptance gate passes and no hard stop fires, close this cycle by updating `NEXT_SESSION.md` to Cycle 107 and continue. Do not ask for taste review in this cycle.

## Scope decisions

1. **D1: This is a documentation and repo-positioning cycle.** Do not change gameplay, rendering, shared sim, assets, or deployment code to make docs easier to write.
2. **D2: Current truth beats historical continuity.** Public and pickup docs should state the current launch posture plainly. Historical cycle detail belongs in `docs/BACKLOG.md` and archived cycle plans.
3. **D3: Version posture is prepared, not tagged.** Recommend and prepare the next release line, likely `v2.4.0`, but do not create a git tag or GitHub release in this cycle.
4. **D4: Closed-cycle history stays append-only.** `docs/BACKLOG.md` may receive an additive launch-roadmap section, but do not rewrite prior closed-cycle entries.
5. **D5: No platform publication.** Do not update itch, Steam, portals, or live store pages in this cycle. That belongs to cycles 109 and 110.

## Phase shape rules

A cycle has at most 8 phases. Each phase is autonomous and should fit in 4 hours or less. If a rewrite discovers implementation bugs, record them in the validation report and defer to Cycle 108 unless they block truthful docs.

## Acceptance criteria - EARS format

Each Acceptance line should be testable by grep, file existence, build output, or a documented validation note.

## Phase 1 - Stale-doc inventory (~2hr, autonomous)

**Independently testable.** This phase creates the map that prevents a partial rewrite.

1. Search the repo for stale public claims and launch-sensitive terms: `0.184`, `0.185`, `Cycle 83`, `Cycle 105`, `experimental`, `Newsheepdogland`, `itch`, `Steam`, `2.2.0`, `2.3.4`, `200 sheep`, `three biomes`, `preview Worker`, `CF_PREVIEW_D1_ID`.
2. Inspect current package/version/tag state with `package.json`, `CHANGELOG.md`, `git describe --tags --always --dirty`, and `git tag --sort=-creatordate`.
3. Inspect current deployment workflow state in `.github/workflows/deploy.yml`, `.github/workflows/preview.yml`, and `worker/wrangler.toml`.
4. Write `cycle106-validation/doc-inventory.md` with each stale surface, the proposed action, and the cycle that should own it if not Cycle 106.

**Acceptance (EARS):**

- When Phase 1 ships, then `cycle106-validation/doc-inventory.md` shall list every file containing launch-sensitive stale copy or shall state why the hit is intentionally historical.
- When Phase 1 ships, then `cycle106-validation/doc-inventory.md` shall record the current git describe output and whether HEAD has a release tag.
- If a stale claim affects site metadata or public SEO, then Phase 1 shall assign it to Cycle 107 rather than silently fixing only docs.

## Phase 2 - Public repo docs rewrite (~4hr, autonomous)

**Depends on:** Phase 1.

1. Rewrite `README.md` around the current product: browser-first game, solo modes, 2-4 player multiplayer, survival island, sandbox/editor affordances, mobile/gamepad support, current Three.js version, Cloudflare backend, AGPL/license split, and the real launch posture.
2. Refresh `PRESSKIT.md` so it can serve as the short source of truth for store copy, screenshots, links, licensing, and contact/support notes.
3. Update `docs/README.md` so the agent reading path points to the active Cycle 106-110 launch program, not an old archived cycle.
4. Update any stable how-to/reference doc surfaced by Phase 1 only when the current doc would mislead a launch agent.

**Acceptance (EARS):**

- When Phase 2 ships, then `README.md` shall no longer mention Three.js `0.184`, Cycle 83 as the latest active plan, or Newsheepdogland as experimental unless the statement is explicitly historical.
- When Phase 2 ships, then `PRESSKIT.md` shall include current version posture, current deployment targets, current feature summary, and current license summary.
- When Phase 2 ships, then `docs/README.md` shall name `docs/cycle-106-plan.md` through `docs/cycle-110-plan.md` as the launch-roadmap plans.

## Phase 3 - Agent handoff surfaces (~2hr, autonomous)

**Depends on:** Phase 1. Can run in parallel with Phase 2 after the inventory is written.

1. Keep `NEXT_SESSION.md` current-only and pointed at the next unfinished cycle.
2. Add or refresh a launch-roadmap section in `docs/BACKLOG.md` without rewriting closed-cycle history.
3. Ensure the cycle sequence is discoverable from `NEXT_SESSION.md`, `docs/README.md`, and `docs/BACKLOG.md`.

**Acceptance (EARS):**

- When Phase 3 ships, then `NEXT_SESSION.md` shall use the required header shape from `docs/NEXT_SESSION_CONTRACT.md`.
- When Phase 3 ships, then `docs/BACKLOG.md` shall contain an additive roadmap entry for cycles 106-110.
- If an agent starts cold from `NEXT_SESSION.md`, then the linked docs shall identify Cycle 107 as the next cycle after this one.

## Phase 4 - Release ledger and launch copy source files (~3hr, autonomous)

**Depends on:** Phase 2.

1. Update `CHANGELOG.md` with an unreleased or planned `v2.4.0` section that summarizes the r185, Kiln asset, grass/default, foliage LOD, preview backend, and launch-doc work without claiming a tag exists.
2. Create or rewrite launch source drafts under `docs/launch/` for release notes, short description, long description, social posts, and devlog copy.
3. Archive or supersede old `v2.3.0` launch drafts by adding a clear supersession note at the top of each old file or moving their useful material into the new launch copy.

**Acceptance (EARS):**

- When Phase 4 ships, then `CHANGELOG.md` shall contain a current planned release section and shall not claim `v2.4.0` has been tagged unless the tag exists.
- When Phase 4 ships, then `docs/launch/` shall contain current launch copy files for release notes, long description, short description, and social copy.
- If old launch drafts remain, then each old draft shall point readers to the current launch copy source.

## Phase 5 - Documentation validation (~2hr, autonomous)

**Depends on:** Phases 2-4.

1. Run stale-term greps from Phase 1 and update `cycle106-validation/doc-inventory.md` with resolved, intentionally historical, or deferred status.
2. Run `npm test` only if docs changes touched test-read fixtures or package metadata. Otherwise record why no test was needed.
3. Run `npm run build` if public HTML, package metadata, or README-linked asset paths changed in a way that could affect bundling or generated docs.
4. Record the final validation in `cycle106-validation/close-report.md`.

**Acceptance (EARS):**

- When Phase 5 ships, then `cycle106-validation/close-report.md` shall list every validation command run and its result.
- When Phase 5 ships, then every stale term from Phase 1 shall be marked `fixed`, `historical`, or `deferred-to-cycle-107+`.
- If no code or bundle-affecting file changed, then `cycle106-validation/close-report.md` shall explicitly say docs-only validation was sufficient.

## Dependencies

```
Phase 1 -> Phase 2 + Phase 3 -> Phase 4 -> Phase 5
```

## Frozen files (cycle-specific additions)

This cycle authorizes additive edits to these process docs only:

- `NEXT_SESSION.md` - current pickup surface for the launch-roadmap sequence.
- `docs/BACKLOG.md` - additive planned-roadmap entry only.

The durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) still applies. No `shared/`, sim-baseline, migration, or refactor-baseline edits are authorized.

## Hard stops

Durable hard stops apply on every cycle; see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific stops:

1. If a doc rewrite requires changing gameplay, rendering, asset, or Worker behavior to make the claim true, then stop and defer the behavior change to Cycle 108 or a new scoped cycle.
2. If current live deployment health contradicts the docs, then stop and verify the deploy target before writing around it.
3. If a release tag, GitHub release, itch page, Steam page, or other external publication would be needed to make a claim true, then do not create it in this cycle.

## What NOT to do during this cycle

- Do not edit SEO metadata in `index.html`, `about.html`, `public/scenes/`, `public/manifest.webmanifest`, or `js/utils/seo.js` except to record them for Cycle 107.
- Do not bump `package.json` version unless Cycle 108 is opened.
- Do not create tags, GitHub releases, or platform uploads.
- Do not touch `shared/` or regenerate sim-baseline goldens.

## Success criteria (cycle close)

- [ ] When Cycle 106 closes, the public repo docs shall describe the current game and current launch posture without stale r184/Cycle 83/old itch/native claims.
- [ ] When Cycle 106 closes, `NEXT_SESSION.md` shall point to Cycle 107 unless a hard stop is active.
- [ ] When Cycle 106 closes, `cycle106-validation/close-report.md` shall record validation and deferred items.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md)
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md)
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md)
- [`docs/BACKLOG.md`](BACKLOG.md)
- [`docs/cycle-107-plan.md`](cycle-107-plan.md)
