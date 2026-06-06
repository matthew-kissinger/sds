# Next Session - Cycle 63 `wolf-predator-mode` (scaffold)

> **Updated:** 2026-06-06
> **For:** Cycle 63 `wolf-predator-mode`. Plan: [`docs/cycle-63-plan.md`](docs/cycle-63-plan.md) (SCAFFOLD - direction and open questions only).
> **Pickup priority:** Confirm whether Matt wants wolf predator mode next, or whether prod playtest feedback from Cycle 62 collision should become a small tuning follow-up first.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-63-plan.md`](docs/cycle-63-plan.md) -> the touched module's source once the plan names it.

## Where It Stands

**Cycle 62 `sheep-hard-body-collision` closed 2026-06-06 and ships as `v2.2.1`.** Plan archived at [`docs/archive/cycles/cycle-62-plan.md`](docs/archive/cycles/cycle-62-plan.md); closeout is in [`docs/BACKLOG.md`](docs/BACKLOG.md). Matt redirected the wolf scaffold to collision feel, then approved committing/deploying so he can test in prod.

What shipped:

- **Deterministic flock hard bodies:** [`shared/EntityCollision.js`](shared/EntityCollision.js) now resolves active sheep against nearby active sheep using a fixed-cell spatial hash, capped position correction, inward-velocity cleanup, and deterministic fallback normals for exact overlaps.
- **Better dog contact:** dog/sheep body radii and dog push cap were tuned to match the visible sheep mesh better, so heads/backs no longer read through the dog as easily.
- **Same resolver everywhere:** Worker authority, client prediction/solo, and sim-baseline harness all call the same shared resolver.
- **Client render sync:** [`js/OptimizedSheep.js`](js/OptimizedSheep.js) snaps collision-corrected render positions before rewriting instance matrices, so visual sheep contact follows the resolved physics instead of trailing through a body.
- **Intentional goldens:** only the collision-affected sim-baseline fixtures changed: `sheep-60hz-20s.json`, `island-boundary-rh-60hz.json`, `island-boundary-oc-60hz.json`, `corral-retirement-rh-60hz.json`, and `bark-impulse-60hz.json`.

Validation before close:

- `npm test -- tests/entity-collision.spec.js` passed.
- `npm test -- tests/sim-baseline/harness-parity.spec.ts` passed.
- `npm test -- tests/sim-baseline/baseline.spec.ts` passed after intentional fixture regeneration.
- `npm run lint`, full `npm test`, and `npm run build` passed.
- `npx playwright test --project=chromium --grep-invert='@local-only'` passed.
- Targeted `?cinematic=1` browser proof confirmed overlapping sheep/dog setups resolve outside physics and rendered collision thresholds with no console errors.

## What to pick up next

**Cycle 63 is a scaffold.** The seeded direction is the **wolf predator mode**: turn the Cycle 61 wolf asset into a playable antagonist, probably by adding deterministic `shared/WolfAI.js`, using bark as the counter, and carrying an additive wolf field through multiplayer snapshots. The open questions are in [`docs/cycle-63-plan.md`](docs/cycle-63-plan.md).

If Matt reports collision feel issues from prod, handle that first as a narrow Cycle 62 follow-up:

- Too wide: tune `DOG_BODY_RADIUS`, `SHEEP_BODY_RADIUS`, or `SHEEP_SHEEP_MIN_DISTANCE`.
- Too soft: tune `MAX_DOG_SHEEP_PUSH_PER_TICK` or `MAX_SHEEP_SHEEP_PUSH_PER_TICK`.
- Jitter: inspect the sim-baseline diff before changing caps; do not regenerate goldens casually.

## Open Carryover

- **Wolf predator mode** - teed up by the Cycle 61 wolf asset and bark event.
- **Bark feel finalize** (Matt's taste on the bark constants) + optional radial-startle.
- **The second mode edition** - still deferred.
- **Tablet draw-call perf** - the Tab S9 FE is draw-call-bound on Rolling Hills (~20k draws, 37 fps at 200 sheep).
- **Controller nav for deferred surfaces** (settings, leaderboard, editors, MP lobby/rooms) + a 2D row-aware entrance focus order - see [`docs/cycle-60-controller-parity.md`](docs/cycle-60-controller-parity.md).
- **Counting naming + curve-feel** (Cycle 59/60 strawman) - Matt's standing taste call.
- **Minor housekeeping:** `/api/rename` parses the JSON body before the auth check (no-body POST returns 500 not 400, cosmetic). CI `actions/upload-artifact@v5` runs on Node 20; GitHub forces Node 24 on 2026-06-16.

## Working Contract

- Deterministic-sim work must name shared files, update all consumers in the same commit, and regenerate sim-baselines only with recorded acceptance.
- Do not auto-bump the version outside an explicit player-visible release.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-63-plan.md`](docs/cycle-63-plan.md) (`wolf-predator-mode`, scaffold) |
| Latest closed cycle | [`docs/archive/cycles/cycle-62-plan.md`](docs/archive/cycles/cycle-62-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Collision core | [`shared/EntityCollision.js`](shared/EntityCollision.js) |
| Worker authority | [`worker/src/GameSim.js`](worker/src/GameSim.js) |
| Client prediction/render sync | [`js/OptimizedSheep.js`](js/OptimizedSheep.js) |
| Wolf asset + predator design intent | [`docs/wolf-asset.md`](docs/wolf-asset.md) |
| Deterministic-sim rules | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
