# Cycle 110 - itch-portals-and-launch-review

> Drafted 2026-06-26 as the final pre-review launch-readiness cycle. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md), confirm Cycles 106-109 are closed or intentionally deferred, then read this doc top-to-bottom.

## Goal

Cycle 110 packages the remaining distribution decisions into one reviewable launch packet. Before this cycle, itch, portals, repo metadata, and final human-review decisions are scattered across docs and older drafts. After this cycle, Matt should have one final packet that says what is ready to publish, what should wait, which targets to prioritize, which assets/copy are final, and what exact buttons or commands remain for launch.

## Autonomy contract

This is the stop point Matt requested. Complete the cycle, prepare artifacts and recommendations, then stop for human review. Do not publish irreversible external updates unless Matt has explicitly authorized them during this cycle.

## Scope decisions

1. **D1: Itch is the first secondary channel.** The repo already has an itch build target, so make itch copy and artifact proof launch-ready before chasing curated portals.
2. **D2: Portals are evaluated, not blindly sprayed.** CrazyGames, Poki, Newgrounds, Kongregate, Y8, and similar targets need fit, policy, SDK, external-service, and support review.
3. **D3: GitHub metadata should match launch positioning.** Repo description/topics are low-risk to align if they drift, but record any remote metadata changes.
4. **D4: Final review packet is the deliverable.** The packet should let Matt approve, reject, or sequence publication without re-reading every cycle.
5. **D5: No public marketplace submission by default.** Preparation is autonomous; publication is a human decision unless explicitly delegated.

## Phase 1 - Itch package and page refresh (~4hr, autonomous)

**Independently testable, but should consume Cycle 108's green candidate.**

1. Refresh current itch docs before making page recommendations.
2. Update `docs/itchio-submission.md`, `docs/itch-description/sheep-dog-sim.md`, and `itchio-description.txt` with current launch copy.
3. Run `npm run build:itchio` and record output path, size, and local smoke status.
4. Create `docs/launch/itch-launch-brief.md` with title, short description, long description, tags, screenshots, upload path, devlog copy, and rollback/update notes.

**Acceptance (EARS):**

- When Phase 1 ships, then itch docs shall no longer contain old 200-sheep, three-biome, or outdated peaceful-only copy unless explicitly historical.
- When Phase 1 ships, then `npm run build:itchio` shall pass.
- When Phase 1 ships, then `docs/launch/itch-launch-brief.md` shall include page copy, tag recommendations, artifact path, screenshot needs, and publication status.

## Phase 2 - Portal target matrix (~4hr, autonomous)

**Depends on:** Phase 1 can run in parallel after itch copy is stable.

1. Check current official developer/submission docs for CrazyGames, Poki, Newgrounds, Kongregate, Y8, and any other obvious HTML5 game portals worth considering.
2. Write `docs/launch/portal-target-matrix.md` with each target's submission model, SDK/API expectations, monetization constraints, external multiplayer/service constraints, build packaging requirements, content-rating concerns, review friction, and recommendation.
3. Classify each target as `now`, `after-sdk-work`, `after-human-review`, or `skip`.
4. Do not add SDKs or portal-specific code in this cycle unless a target is classified `now` and the integration is trivial, reversible, and build-tested.

**Acceptance (EARS):**

- When Phase 2 ships, then `docs/launch/portal-target-matrix.md` shall list every evaluated portal and one recommendation per portal.
- When Phase 2 ships, then the matrix shall identify whether external multiplayer/backend calls are allowed or risky for each portal where docs mention it.
- If a portal requires an SDK, exclusivity, ad integration, revenue share, or manual review, then the recommendation shall not be `now` unless the required work is already implemented and validated.

## Phase 3 - Repo metadata and discoverability alignment (~2hr, autonomous)

**Depends on:** Cycle 106 public docs and Cycle 107 SEO matrix.

1. Inspect GitHub repo description, website URL, and topics with `gh repo view` if authenticated.
2. Compare repo metadata against `docs/launch/seo-content-matrix.md` and `README.md`.
3. If metadata is stale and `gh` auth is available, update low-risk description/topics only after recording the before/after in `cycle110-validation/repo-metadata.md`.
4. If auth is unavailable or the change is subjective, record the exact suggested metadata for Matt's review.

**Acceptance (EARS):**

- When Phase 3 ships, then `cycle110-validation/repo-metadata.md` shall record current repo description, URL, topics, and recommended changes.
- When Phase 3 changes GitHub metadata, then the report shall record the exact before and after values.
- If metadata cannot be changed automatically, then the report shall provide copy-paste-ready final values.

## Phase 4 - Final launch review packet (~4hr, autonomous)

**Depends on:** Phases 1-3 and Cycle 109's Steam recommendation.

1. Create `docs/launch/final-launch-review.md` as the single end-of-program packet.
2. Include:
   - candidate version and commit
   - validation summary from Cycles 106-109
   - web production status
   - itch readiness
   - Steam/native readiness and recommendation
   - portal recommendations
   - SEO status
   - screenshots/social assets status
   - required human decisions
   - exact publish commands/UI actions
   - rollback notes
3. Use green/yellow/red status for each target, but keep the reasoning concrete.

**Acceptance (EARS):**

- When Phase 4 ships, then `docs/launch/final-launch-review.md` shall contain web, itch, Steam/native, portal, SEO, assets, human-decisions, publish-steps, and rollback sections.
- When Phase 4 ships, then every human-required item from Cycles 106-109 shall appear in the final review packet.
- If any target is marked green, then the packet shall name the proof artifact or command that supports that status.

## Phase 5 - Stop for Matt review (~1hr, autonomous)

**Depends on:** Phase 4.

1. Update `NEXT_SESSION.md` to a post-Cycle-110 human-review snapshot.
2. Write `cycle110-validation/close-report.md` with all commands run, artifacts produced, external changes made, and remaining decisions.
3. Stop. Do not continue into unscaffolded launch execution without Matt's review.

**Acceptance (EARS):**

- When Phase 5 ships, then `NEXT_SESSION.md` shall say the next action is Matt's launch review.
- When Phase 5 ships, then `cycle110-validation/close-report.md` shall list all validation commands and any external metadata changes.
- When Phase 5 ships, then no public marketplace submission shall have occurred unless Matt explicitly authorized it during Cycle 110.

## Dependencies

```
Phase 1 + Phase 2 + Phase 3 -> Phase 4 -> Phase 5
```

## Frozen files (cycle-specific additions)

No `shared/`, sim-baseline, migration, or refactor-baseline edits are authorized. Low-risk GitHub repo metadata changes are allowed only in Phase 3 with before/after evidence.

## Hard stops

Durable hard stops apply on every cycle; see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific stops:

1. If an action would publish an itch update, submit to a portal, submit to Steam, or make a paid/account-level change, then stop unless Matt explicitly authorizes that exact action.
2. If `npm run build:itchio` fails, then do not mark itch green.
3. If a portal's current docs require SDK work, exclusivity, or monetization integration, then do not classify it as `now` without implementing and validating that work.
4. If final review packet evidence conflicts with current validation results, then resolve the conflict before stopping for review.

## What NOT to do during this cycle

- Do not publish to stores or portals by default.
- Do not add advertising, analytics, or portal SDK dependencies without an explicit phase amendment.
- Do not treat Steam, Poki, or CrazyGames as equivalent to itch; their review and integration gates differ.
- Do not leave `NEXT_SESSION.md` pointing at another autonomous cycle after Phase 5.

## Success criteria (cycle close)

- [ ] When Cycle 110 closes, `docs/launch/final-launch-review.md` shall be the single review entry point.
- [ ] When Cycle 110 closes, itch, Steam/native, portals, web, SEO, and repo metadata shall each have a green/yellow/red status with evidence.
- [ ] When Cycle 110 closes, `NEXT_SESSION.md` shall stop the autonomous sequence and ask for Matt's review.

## References

- [`docs/cycle-106-plan.md`](cycle-106-plan.md)
- [`docs/cycle-107-plan.md`](cycle-107-plan.md)
- [`docs/cycle-108-plan.md`](cycle-108-plan.md)
- [`docs/cycle-109-plan.md`](cycle-109-plan.md)
- [`docs/launch/`](launch/)
- [`docs/itchio-submission.md`](itchio-submission.md)
- [`docs/native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md)
