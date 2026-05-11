# Next Session - Cycle 36 (TBD)

> **Updated:** 2026-05-11 at Cycle 35 close.
> **For:** Cycle 36 (slug TBD).
> **Pickup priority:** Cycle 36 has not been scoped yet. Two post-deploy verification tasks from Cycle 35 are blocking inputs (paired OC MP playtest + iOS Safari foam canary against the deployed build). Resolve those first, then scope Cycle 36 against the carryover list below. Run `/cycle-start` to orient on whatever scope you land on.

Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then this file, then [`docs/cycle-36-plan.md`](docs/cycle-36-plan.md). Cycle 35's closed plan is archived at [`docs/archive/cycles/cycle-35-plan.md`](docs/archive/cycles/cycle-35-plan.md).

## Cycle 35 Outcome

Closed 2026-05-11, no version bump. Eight autonomous phases shipped. The original plan had seven phases; two more (HudLayout slot orchestrator + meadow shader compile fix) absorbed mid-cycle during a Matt review pass. Tests 304 pass / 7 skipped, build clean, lint clean, mainKB 590.33 (+0.27 vs Cycle 34's 590.06). Full per-phase summary in [`docs/BACKLOG.md`](docs/BACKLOG.md) Recently Completed → Cycle 35.

The cycle delivered:

1. **Completion observability** end-to-end. Telemetry route fix in [`js/telemetry.js`](js/telemetry.js) (Pages → Worker URL), a new append-only `score_errors` D1 table that captures every `submitScore` throw before propagating, and a client-side `score_submission_failed` emit when `nm.submitScore` rejects. The next regression shows up as data instead of silence.
2. **Leaderboard as `(scene × mode)` identity.** `/api/leaderboard` and `/api/leaderboards` now require a scene; missing returns 400 `{error: 'scene_required'}`. Dropped the cross-scene fast path on `players.*` and the `isNaturalPartition` fallback. Leaderboard UI restructured scene-first; persists last-scene in `localStorage`.
3. **Shoreline foam tracks the visible waterline.** `AnimeWater` accepts a heightfield, samples it as an R32F DataTexture, and computes foam from `|terrain_y - waterY|`. Falls back to the boundary band when no heightfield (Field has no water anyway).
4. **HudLayout (mid-cycle Phase 8).** Slot-based orchestrator deletes the prior pattern of per-component `position: fixed` with hand-tuned offsets. CameraModeIndicator alone lost ~40 lines of compensating positioning code.
5. **Meadow shader compile fix (mid-cycle Phase 9).** Long-standing `vUv` undeclared error on every island scene boot. Fix: `defines: { USE_UV: '' }` on the MeshLambertMaterial.

## Pickup Priority

Cycle 36 has **no agreed scope yet**. Three blocking inputs before scoping:

1. **Phase 7 carryover from Cycle 35: paired OC MP playtest.** Matt at the keyboard, two browser tabs, host an OC cooperative room, drive sheep into the round-up zone at (0, 50), confirm `roundup → drive` flips server-side at hold=2.0s and the portal at z=295 opens. Cannot run autonomously.
2. **iOS Safari foam canary post-deploy.** `npm run test:ios-water` against `https://sheepdogsim.com/` after the Cycle 35 deploy lands. Hard-stop gate from Cycle 32. If `nearFoamWhite: true`, revert Phase 6 and re-open as a paired investigation.
3. **D1 verification post-deploy.** Confirm the first real `game_completed` lands in the `events` table after Cycle 35 telemetry deploys. Query `SELECT name, COUNT(*) FROM events GROUP BY name;` on remote D1. Flag inconclusive after 7 days if no completion event arrives.

## Cycle 36 Candidates

Once the post-deploy verifications clear, candidates remaining in [`docs/BACKLOG.md`](docs/BACKLOG.md):

1. **OC objective HUD polish.** MP-specific copy or per-player progress indicators on the ObjectiveBanner. Decide after the Phase 7 playtest.
2. **Promote `worker-objective-snapshot.spec.js` into the WS two-client harness.** Requires unskipping `tests/integration/flow.spec.ts`.
3. **Mountains: real horizon ring** as height-displaced skirt that the play-area heightfield blends into.
4. **Bespoke pixel-forge rocks**, **octahedral impostors v2**, **cross-module polygon-spawn dedup**, **build-time `displacedHeights` bake**, **inline `_groundY`** — long-tail polish.
5. **Drop `players.solo_*_best` materialized columns** if a future cycle wants the destructive migration (deferred Q1 in Cycle 35).
6. **Delete legacy `updateGrassLOD` + `updateTreeLOD`** in [`TerrainBuilder.js`](js/TerrainBuilder.js).
7. **Cycle 33 carryovers** still open: local-tunnel BrowserStack canary on Ubuntu (manual `gh workflow run browserstack-ios-water.yml` with empty `base_url`); Node 20 GHA deprecation annotation re-check on next Deploy run.

## Frozen Files (durable fence)

Durable fence applies in full ([`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md)). No cycle-36-specific freezes yet.

## Operational Notes

- **Cloudflare creds**: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `~/.config/mk-agent/env` (loaded via `set -a && source ~/.config/mk-agent/env && set +a` before any `wrangler d1` command).
- **D1 queries**: use `npx wrangler d1 execute sds-db --remote --command "..." --json` for read-only inspection. Database id `513aa937-e60a-4fb6-b499-9f3814149e88`.
- **D1 schema snapshot**: 6 applied migrations (0001-0006). `score_errors` table is the newest, added in Cycle 35 Phase 2.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-36-plan.md`](docs/cycle-36-plan.md) (scaffold only) |
| Latest closed cycle | [`docs/archive/cycles/cycle-35-plan.md`](docs/archive/cycles/cycle-35-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Security advisory acceptance log | [`docs/security-acceptance.md`](docs/security-acceptance.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |

## Running Locally

```bash
npm run dev
npm test
npm run lint
npm run build
npm run test:e2e -- --project=chromium --grep-invert @local-only
npm run test:ios-water
npm run test:integration
```

Useful URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.

D1 inspection:

```bash
set -a && source ~/.config/mk-agent/env && set +a
npx wrangler d1 execute sds-db --remote --command "SELECT COUNT(*) FROM score_submissions;" --json
npx wrangler d1 execute sds-db --remote --command "SELECT * FROM score_errors ORDER BY submitted_at DESC LIMIT 10;" --json
npx wrangler d1 execute sds-db --remote --command "SELECT name, COUNT(*) FROM events GROUP BY name;" --json
```
