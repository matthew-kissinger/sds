# Cycle 35 - completion-visibility-and-foam

> Drafted 2026-05-11 after a deep analysis pass on Cycle 34 outcomes. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md), then this plan top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Make completion visible end-to-end and fix the shoreline foam regression from Cycle 32. Three threads:

1. **Score-submission observability.** Telemetry currently POSTs to `sheepdogsim.com/api/event` which returns 405 (Pages has no `/api/*` proxy), so `events` has never recorded a real `game_completed`. Worker `submitScore` failures only `console.error` and disappear. Client `submitGameScore` failures only `console.error` and disappear. Net result: post-Cloudflare-cutover (2026-04-24) there are 39 registered players, zero score submissions, and zero telemetry. We cannot tell whether nobody completes, the client never posts, or the worker rejects. Fix all three surfaces so the next regression shows up as data instead of silence.
2. **Leaderboard as `(scene × mode)` identity.** The current `/api/leaderboard` fast path queries scene-blind materialized columns on `players`, so Field's 56-second soloClassic record sits on the same board as a 600-second island soloClassic run. Field, Sheep Dog Island, and Open Country have different geometry, navigation, and objective rules, so their time distributions do not compose. Require `scene` on the leaderboard API, drop the `isNaturalPartition` fallback, and rebuild the leaderboard UI scene-first (scene picker → mode dropdown filtered by `scene.allowedModes`).
3. **Shoreline foam tracks the visible waterline.** Cycle 32 deleted the depth pre-pass that fixed iOS Safari water rendering. Foam currently sits at `boundary.radius` (the outermost terrain edge, partially submerged), which is ~37m offshore on Sheep Dog Island and ~64m offshore on Open Country. Bind the heightfield as a texture in `AnimeWater` and compute foam from `|terrain_y - waterY|` per fragment so foam traces the actual terrain-water interface.

Also closes Cycle 34's outstanding manual playtest (OC multiplayer round-up → drive flip).

## How to read this plan

This plan fixes the *shape* of the changes (data contracts, where new code slots in, EARS acceptance). Implementation choices stay deferable: pick the simplest thing that meets the budget, measure on actual hardware before escalating.

Three of the seven phases are mutually independent (1, 2, 4, 6) and can run in parallel. Phase 3 depends on Phase 1; Phase 5 depends on Phase 4; Phase 7 (paired playtest) runs last after the deploy lands.

## Open questions - resolved

1. **Q1: Drop materialized `solo_*_best` columns?** Author lean: **no, keep them as personal-best storage; just stop using them for the global leaderboard query**. Demoting the query surface is non-breaking. Dropping the columns is a destructive migration with no payoff at current data sizes (~15 submission rows).
2. **Q2: Should `/api/leaderboards` (bulk) also require scene?** Author lean: **yes**. The home-screen "all leaderboards" surface returns `[mode -> top 5]` per-scene; without scene it returns 400. Same semantics as `/api/leaderboard`, just a fanout.
3. **Q3: Heightfield as `R32F` or normalized `RG8` for AnimeWater?** Author lean: **R32F (`THREE.FloatType + THREE.RedFormat`)**. WebGL2 is the default in Three.js 0.184, R32F sampling is the same on iOS Safari per Cycle 32 BrowserStack data. Avoid normalized formats so we keep one source of truth with the existing `Heightfield.data`.
4. **Q4: Drop the worker leaderboard fast path entirely?** Author lean: **no, just drop the cross-scene case**. Keep `score_submissions` GROUP BY behind `idx_submissions_partition` for both single-scene queries and the multi-scene bulk endpoint. The fast path was a 2024-era pre-partition shortcut; current data sizes do not need it.
5. **Q5: Should Phase 5's scene picker remember the last selection?** Author lean: **yes, localStorage key `sds:leaderboardLastScene` defaulting to the URL `?scene=` or `field`**. Match the lobby's "pick last-used" pattern so the leaderboard tab is not jarring to reopen.
6. **Q6: New migration `0006_score_errors.sql` or extend `events` table?** Author lean: **dedicated `score_errors` table**. Score-validation rejections have a fixed shape we want to query (mode, score, reason). Mixing them into the open-ended `events` JSON-props blob makes the "what got rejected last week" query awkward. New migration is the right primitive.

## Architecture / shared changes

**New worker table** via [`worker/migrations/0006_score_errors.sql`](../worker/migrations/0006_score_errors.sql) (Phase 2):

```sql
CREATE TABLE score_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persistent_id TEXT,
  claimed_mode TEXT NOT NULL,
  claimed_score REAL,
  claimed_sheep_count INTEGER,
  claimed_scene_id TEXT,
  reason TEXT NOT NULL,
  submitted_at INTEGER NOT NULL
);
CREATE INDEX idx_score_errors_at ON score_errors(submitted_at);
CREATE INDEX idx_score_errors_reason ON score_errors(reason);
```

Append-only, idempotent on re-apply per [`shared-sim.md`](../.claude/rules/shared-sim.md) (the rule is sim-baselines, but the migrations append-only discipline mirrors it - see [`multiplayer.md`](../.claude/rules/multiplayer.md)).

**No `shared/scenes/types.js` edits.** No `shared/*.js` deterministic-sim file touched. No sim-baseline regeneration.

**Wire format** is unchanged. `/api/score` request/response shape stays the same. `/api/leaderboard` adds a required `scene` query param; mode-only callers receive 400 with `{error: 'scene_required'}`.

**`AnimeWater` material gets one new optional uniform** (`uHeightTex`, a `THREE.DataTexture` over the heightfield's normalized R32F data) plus three scalars (`uHeightWorldSize`, `uHeightPeak`, `uWaterY`). When `uHeightTex` is absent the shader falls back to the existing `boundary.radius` band so Field (no heightfield) continues to render correctly with no water.

## Phase shape rules

7 phases. 6 fully autonomous (Phases 1-6), 1 fully paired (Phase 7 OC MP playtest). No mixed-mode phases.

## Acceptance criteria - EARS format

Each phase's Acceptance lines use [EARS notation](https://kiro.dev/docs/specs/) and are grep-testable. The Stop hook ([`.claude/hooks/check-acceptance.mjs`](../.claude/hooks/check-acceptance.mjs)) counts unchecked items; `/cycle-close` walks each line.

## Phase 1 - Telemetry route fix (~30min)

**Independently testable.** Smallest phase; gates Phase 3. The bug: [`js/telemetry.js:30`](../js/telemetry.js:30) returns `''` from `getApiBase()`, so `emitEvent('game_completed', ...)` POSTs to `https://sheepdogsim.com/api/event`. Pages has no `/api/*` proxy and returns 405. Verified live on 2026-05-11.

1. **Mirror `NetworkManager`'s base-URL logic** in [`js/telemetry.js`](../js/telemetry.js): localhost in dev (skipped per existing `isLocalDev` guard), `https://sds-worker.matt-m-kissinger.workers.dev` in prod. Don't import NetworkManager (circular risk); duplicate the small `isLocal` check or thread the base URL through `GameBridge`.
2. **Smoke test** a manual fetch in the deployed environment: open prod, run `await fetch('https://sds-worker.matt-m-kissinger.workers.dev/api/event', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'cycle35_phase1_probe'})}).then(r=>r.json())`. Expect `{ok: true}`. (Verified at plan-write time; this confirms the route hasn't regressed.)

**Acceptance (EARS):**

- [x] When Phase 1 ships, `grep -n "return ''" js/telemetry.js` shall return nothing.
- [x] When Phase 1 ships, `js/telemetry.js getApiBase()` shall return `https://sds-worker.matt-m-kissinger.workers.dev` in production builds (verified by `grep -n 'sds-worker' js/telemetry.js`).
- [ ] When the first real `game_completed` fires after deploy, the worker shall accept the POST and insert a row into `events` with `name='game_completed'` (verified by D1 query at post-deploy verification).

## Phase 2 - Worker score-error log (~1.5hr)

**Independently testable.** New `score_errors` table + write path in `submitScore`. Catches three failure modes that are currently silent: validation rejections, D1 batch failures, "player not found" throws.

1. **Add migration** [`worker/migrations/0006_score_errors.sql`](../worker/migrations/0006_score_errors.sql) with the schema in "Architecture / shared changes" above. Idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
2. **Wrap `submitScore` in [`worker/src/d1.ts`](../worker/src/d1.ts)** with a try/catch that inserts into `score_errors` before re-throwing. Capture `{persistent_id, claimed_mode, claimed_score, claimed_sheep_count, claimed_scene_id, reason: error.message}`. Don't swallow the throw - the route handler still returns 4xx/5xx as today; the table is observability, not flow control.
3. **Add `/api/score-errors` read endpoint** (admin-only, gated on a `SCORE_ADMIN_SECRET` Workers secret) so we can grep recent rejections without dropping into wrangler d1 sessions. Optional - if the secret isn't bound, the route 404s.
4. **Unit test** in [`tests/worker-score-errors.spec.ts`](../tests/worker-score-errors.spec.ts) (new file): three cases - bounds reject, sheep-count mismatch, player-not-found - each leaves one row in `score_errors`.

**Acceptance (EARS):**

- [x] When `submitScore` throws inside the worker, the worker shall INSERT one row into `score_errors` before propagating the error.
- [x] When `worker/migrations/0006_score_errors.sql` is applied to remote D1, `score_errors` shall exist with the schema above (verified by `wrangler d1 execute sds-db --remote --command "PRAGMA table_info(score_errors);"`).
- [x] When `npm test` runs, `tests/worker-score-errors.spec.ts` shall pass with at least 3 specs (4 passing: bounds-reject, sheep-count mismatch, player-not-found, insert-itself-fails).
- [ ] When the cycle closes, the count of D1 rows in `score_errors` shall be queryable (sanity check it stays at 0 in normal operation).

## Phase 3 - Client-side score-failure telemetry (~30min)

**Depends on Phase 1.** Currently [`js/components/shared/playerIdentity.js:86`](../js/components/shared/playerIdentity.js:86) catches submission failures with a `console.error` and silent return. Add a telemetry emit in the same catch so client-side rejections also leave a footprint.

1. **In the `catch (error)` block** at [`playerIdentity.js:86`](../js/components/shared/playerIdentity.js:86), `import('../telemetry.js').then(({emitEvent}) => emitEvent('score_submission_failed', {reason, gameMode, score: typeof score === 'number' ? Math.round(score * 100) / 100 : 0, sceneId: additionalData?.sceneId || null}))`. Reason is `error.message?.slice(0, 200) || 'unknown'`. Fire-and-forget pattern matches the existing telemetry in [`completion.js:114-123`](../js/gamestate/completion.js:114).
2. **Don't change the user-visible flow.** The `console.error` log and silent-fail return both stay - this is observability, not UX.

**Acceptance (EARS):**

- [x] When `nm.submitScore` throws on the client, `emitEvent('score_submission_failed', {...})` shall fire (verified by `grep -n score_submission_failed js/components/shared/playerIdentity.js`).
- [x] When the cycle closes, the schema of the telemetry payload shall be `{reason, gameMode, score, sceneId}` and shall be ≤ 16 keys deep per worker `/api/event` truncation rules.

## Phase 4 - Leaderboard API requires `scene` (~1.5hr)

**Independently testable.** Drop the cross-scene mash-up. `/api/leaderboard` and `/api/leaderboards` both require a `scene` query param; missing it returns 400. Drop `isNaturalPartition` fallback at [`d1.ts:654-656`](../worker/src/d1.ts:654) - it papered over pre-Cycle-8 backfill that's now irrelevant.

1. **In [`worker/src/index.ts`](../worker/src/index.ts) `/api/leaderboard` handler** (line 387): require `scene`, return 400 `{error: 'scene_required'}` if missing. Validate against `getSceneById(scene)` from `shared/scenes/`; unknown scenes return 400 `{error: 'unknown_scene'}`.
2. **Same for `/api/leaderboards` handler** (line 406): require `scene`, validate, 400 on missing/unknown.
3. **In [`worker/src/d1.ts`](../worker/src/d1.ts) `getLeaderboard`**: remove the no-filter fast path (lines 562-602). Always go through `score_submissions` GROUP BY. Remove the `isNaturalPartition` fallback (lines 654-656).
4. **Extend [`tests/worker-leaderboard.spec.ts`](../tests/worker-leaderboard.spec.ts)** with cases: (a) missing scene → 400, (b) unknown scene → 400, (c) `mode=soloClassic&scene=open-country` → `{entries: []}` (empty island board, no fallback), (d) `mode=soloClassic&scene=field` → returns Field-only rows.
5. **Client-side update** in [`js/NetworkManager.js getLeaderboard / getAllLeaderboards`](../js/NetworkManager.js:304): `sceneId` becomes required. Pass through to the worker; throw if missing rather than defaulting to `'any'`.

**Acceptance (EARS):**

- [x] When `/api/leaderboard?mode=soloClassic` is requested without a `scene` param, the worker shall return HTTP 400 with `{error: 'scene_required'}`.
- [x] When `/api/leaderboard?mode=soloClassic&scene=open-country` is requested, the worker shall return `{entries: []}` (no fallback to Field).
- [x] When `getLeaderboard` is called in [`worker/src/d1.ts`](../worker/src/d1.ts), `grep -n "isNaturalPartition" worker/src/d1.ts` shall return nothing.
- [x] When `npm test` runs, `tests/worker-leaderboard.spec.ts` shall have at least 4 new scene-required specs and all pass (now 7 partitioned-path + 1 export-guard, all green).

## Phase 5 - Leaderboard UI scene-first (~2hr)

**Depends on Phase 4.** Rebuild [`js/components/Multiplayer/GlobalLeaderboard.js`](../js/components/Multiplayer/GlobalLeaderboard.js) so the scene picker comes first, then the mode tabs filter by `scene.allowedModes`. Persist the scene selection in `localStorage`.

1. **Move the scene picker out of "Filters" disclosure** into the top-level component layout, above the mode tabs. Use the same `<select>` pattern as Cycle 34's [`RoomCreation.js`](../js/components/Multiplayer/RoomCreation.js).
2. **Filter mode tabs by `getSceneById(sceneFilter).allowedModes`** (similar to the RoomCreation mode dropdown filter). When `activeTab` becomes invalid after a scene change, snap to the scene's `defaultMode`. Tabs hidden for the active scene render as disabled or are dropped from the tab list.
3. **Drop `'any'` scene option** from `SCENE_FILTER_OPTIONS` at [`GlobalLeaderboard.js:18-23`](../js/components/Multiplayer/GlobalLeaderboard.js:18). Three concrete scenes only (Home Field, Sheep Dog Island, Open Country).
4. **localStorage key `sds:leaderboardLastScene`** initialised from URL `?scene=` or `'field'`; updated on every scene change. Read on mount.
5. **Update [`NetworkManager.getAllLeaderboards`](../js/NetworkManager.js:312)** caller to always pass a concrete `sceneId` (Phase 4 dropped the `'any'` fallback).

**Acceptance (EARS):**

- [x] When the leaderboard tab opens, the UI shall render a scene picker before the mode tabs (verified by component layout review: scene-picker JSX block precedes the tabs JSX block in `GlobalLeaderboard.js`).
- [x] When the user selects `Open Country` in the scene picker, the mode tabs shall hide modes not in `open-country.allowedModes` (cooperative + timed; hides soloClassic/Extreme/Insane/Chaos/competitive). Field's leaderboard surfaces solo modes via the `leaderboardModesForScene` helper (Field-only).
- [x] When the user re-opens the leaderboard tab in a later session, the previously selected scene shall be re-applied from `localStorage.getItem('sds:leaderboardLastScene')`.
- [x] When `GlobalLeaderboard` mounts without a saved scene, the default scene shall be the URL `?scene=` param or `'field'` (verified by `initialSceneId()` precedence).

## Phase 6 - Shoreline foam: heightfield-driven waterline (~2.5hr)

**Independently testable.** Replace the boundary-radius foam band in [`js/water/AnimeWater.js`](../js/water/AnimeWater.js) with a heightfield-driven approach. Foam = where `|terrain_y - waterY|` is small. Falls back to the current band when no heightfield is supplied (Field, sandbox).

1. **Extend `createAnimeWaterMaterial({boundary, heightfield})`** to accept an optional heightfield. When present, build a `THREE.DataTexture` from `heightfield.getRawArray()` with `RedFormat + FloatType + LinearFilter + ClampToEdgeWrapping` and attach it as `uHeightTex`. Add scalars: `uHeightWorldSize = heightfield.worldSize`, `uHeightPeak = heightfield.peakHeight`, `uWaterY = -0.05`, `uHasHeight = 1`. When heightfield is absent, `uHasHeight = 0` and the shader keeps the existing band path.
2. **Update `createAnimeWater({boundary, heightfield, ...})`** to thread the heightfield in.
3. **Update [`js/boot/initWorld.js:253`](../js/boot/initWorld.js:253)** to pass `game.heightfield` into `createAnimeWater({boundary, heightfield: game.heightfield, ...})`.
4. **In the fragment shader** at [`AnimeWater.js:83-172`](../js/water/AnimeWater.js:83): when `uHasHeight > 0`, compute world-space `terrain_y` by sampling `uHeightTex` at `((vWorldPos.xz / uHeightWorldSize) + 0.5)`. Clamp to texture edge. `terrain_y = sampled * uHeightPeak`. Foam threshold becomes `abs(terrain_y - uWaterY) < uFoamThickness * (1.0 + foamNoise * 0.25)`. Past the heightfield extent (clamp returned seaLevel), terrain_y ≪ waterY, no foam, fully wet (correct for open ocean).
5. **Cycle 32 iOS Safari canary** still passes. Add an explicit hard-stop check on this in the BrowserStack workflow (existing `npm run test:ios-water` against `https://sheepdogsim.com/`).

**Acceptance (EARS):**

- [x] When Phase 6 ships, `grep -n "uHeightTex" js/water/AnimeWater.js` shall return at least one match (5 matches).
- [x] When the user loads `?scene=rolling-hills` and looks at the shore from the dog's perspective, foam shall sit at the visible water-terrain interface (not ~37m offshore at the geometric boundary). Verified by visual gallery capture saved to [`cycle35-validation/foam-rh-after.jpg`](../cycle35-validation/foam-rh-after.jpg).
- [x] When the user loads `?scene=open-country`, foam shall sit at the visible water-terrain interface (not ~64m offshore). Verified by [`cycle35-validation/foam-oc-after.jpg`](../cycle35-validation/foam-oc-after.jpg).
- [ ] When `npm run test:ios-water` runs against `https://sheepdogsim.com/` post-deploy, the sampled water RGB shall not be near-foam-white (regression gate from Cycle 32).
- [x] When the user loads `?scene=field`, no water shall render (heightfield is null, scene boundary is rect, the water-init guard at `initWorld.js:247` short-circuits unchanged). Verified live: Field scene has no waterBundle in sceneManager.

## Phase 7 - OC MP playtest + Cycle 34 carryover close (~30min paired)

**Paired-mode phase.** Matt drives the browser; the agent does not pair the keyboard. Closes Cycle 34's outstanding manual playtest of OC multiplayer round-up → drive flip.

1. **Boot `npm run dev`.** Open two browser tabs.
2. **Tab 1: host an OC room.** Scene = open-country, mode = cooperative. Confirm the host scene picker (Cycle 34 Phase 5) defaults sanely.
3. **Tab 2: join.** Confirm the join surfaces "Open Country" as the scene name (Cycle 34 lobby UI chip).
4. **Drive sheep into the round-up zone** (radius 30 at x=0, z=50). Watch the network tab for the `objective` block in `gameStateUpdate` snapshots; confirm `stage: 'roundup' → 'drive'` transition fires server-side at ~2.0s hold.
5. **Confirm the portal at z=295 opens** (visual ring effect + `isCorralOpen` allows sheep retirement at portal).
6. **Update [`docs/BACKLOG.md`](BACKLOG.md) Cycle 34 carryover entry** with "verified 2026-05-XX, server-authoritative stage flip confirmed at hold=2.0s, portal opens, sheep retire."

**Acceptance (EARS):**

- [ ] When Phase 7 runs, two browser tabs shall host + join an OC room without lobby errors.
- [ ] When sheep are driven into the round-up zone for ≥ 2.0 seconds, the server snapshot `objective.stage` shall transition from `'roundup'` to `'drive'`.
- [ ] When the portal at OC's (0, 295) corral becomes active, sheep shall retire into it (verified visually).
- [ ] When Phase 7 closes, [`docs/BACKLOG.md`](BACKLOG.md) shall be updated with the verification date and observed result.

## Dependencies

```
Phase 1 ──► Phase 3
Phase 2 (independent)
Phase 4 ──► Phase 5
Phase 6 (independent)
Phase 7 (paired, last)
```

Phases 1, 2, 4, 6 can run in parallel. Phase 3 needs Phase 1's telemetry-route fix to actually reach the worker. Phase 5 needs Phase 4's `scene`-required API to consume.

## Frozen files (cycle-specific additions)

No cycle-specific additions beyond the durable list in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). Specifically:

- `shared/objective.js`, `shared/MovementPhysics.js`, all other `shared/*.js` deterministic-sim files: **not touched**.
- `shared/scenes/types.js`: **not touched**. No `SceneDef` schema changes.
- `worker/migrations/0001-0005`: **not touched**. Migration 0006 is append-only addition.
- `tests/sim-baseline/__fixtures__/*.json`: **not touched**. No sim-baseline regeneration.
- `.claude/rules/*.md`, `.claude/commands/*.md`, `docs/CYCLE_TEMPLATE.md`: **not touched**.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-35-specific additions:

1. **iOS Safari water regression**. Phase 6 must not reintroduce the Cycle 32 foam-white bug. If `npm run test:ios-water` against `https://sheepdogsim.com/` post-deploy returns `nearFoamWhite: true`, **revert Phase 6 and re-open as a paired investigation**. The foam fix is not worth re-breaking iPhone water.
2. **Score-error log writing in a hot path**. Phase 2's `score_errors` INSERT runs inside `submitScore`'s exception path. If that INSERT itself fails (D1 unavailable), don't double-throw and don't loop. Log to `console.error` and propagate the original error.
3. **Scene picker default selection corrupts saved state**. Phase 5's `localStorage` write must guard against unknown scene IDs. If `getSceneById(stored) === undefined`, fall back to `'field'`, don't render an empty board.
4. **`/api/leaderboard` mode-only requests in production**. After Phase 4 deploys, any external consumer hitting `/api/leaderboard?mode=X` without scene will start receiving 400. NetworkManager is the only known consumer, and Phase 4 updates it in the same commit; **verify no `?mode=` callers exist in the codebase** (`grep -rn "mode=soloClassic" --include='*.js' --include='*.ts'`) before merging.

## What NOT to do during this cycle

- **Don't regenerate sim-baseline fixtures.** No changes to deterministic sim files (`shared/MovementPhysics.js`, `shared/BoundaryCollision.js`, etc.) means no fixture regen is justified.
- **Don't drop the materialized `solo_*_best` columns from `players`** even though the leaderboard query no longer uses them. They're still used by personal-best display and would require a destructive migration to remove. Defer to a future cycle if motivated.
- **Don't add a worker `/api/admin/...` namespace beyond Phase 2's optional `/api/score-errors`**. Build that infrastructure when there are three admin needs, not one.
- **Don't refactor `GlobalLeaderboard.js` beyond the scene-first restructure.** The component has cycle-spanning accreted complexity; isolated touch is the goal.
- **Don't extend telemetry beyond `score_submission_failed`.** New telemetry events (per-stage MP timings, etc.) are out of scope.
- **Don't replace the depth pre-pass.** Cycle 32 deleted it intentionally. Phase 6's heightfield-driven approach is the correct replacement, not a revival.
- **Don't auto-bump `package.json` version.** Foam is player-visible but small; bundle with leaderboard UX into a single v2.2.0 only after Matt confirms the bundle reads as a "release."
- **Don't auto-post a devlog entry.** Leave that for Matt's voice post-cycle-close.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all 7 phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass (current baseline 315 + new specs from Phases 2 and 4).
- [ ] When `npm run lint` runs at cycle close, `eslint shared/` shall be clean.
- [ ] When `npm run build` runs at cycle close, production build shall be clean and `mainKB` shall not regress by more than 5KB vs Cycle 34's 590.06.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions (Test ✓ / Deploy Worker ✓ / Deploy Pages ✓ / E2E Chromium ✓ / Perf check ✓).
- [ ] When `npm run test:ios-water` runs against `https://sheepdogsim.com/` post-deploy, foam shall not be near-foam-white (Phase 6 hard-stop gate).
- [ ] When the first real player completes a game after deploy, the worker shall accept the POST, insert one row into `score_submissions`, and `events` shall record a `game_completed` row (Phase 1 + 4 end-to-end gate). If no completion occurs within 7 days, treat as inconclusive and revisit.
- [ ] When the leaderboard tab is opened post-deploy, the scene picker shall be the first visible control and the mode tabs shall filter by the selected scene's `allowedModes`.

## Operational followups (not phases - track separately)

These are small operational items that don't justify their own phase but should not be forgotten:

- **Cycle 33 carryover**: Local-tunnel BrowserStack canary on Ubuntu (manual `gh workflow run browserstack-ios-water.yml` with empty `base_url`). Fold into Phase 6's iOS-water acceptance pass if convenient.
- **Cycle 33 carryover**: Node 20 GHA deprecation annotation re-check on the next Deploy run.
- **Dead code candidate**: [`TerrainBuilder.js:950-1080`](../js/TerrainBuilder.js:950) `updateGrassLOD` + `updateTreeLOD` (legacy LOD path; real LOD now lives in `GrassSystem` + `InstancedMesh2.addLOD`). Delete when a future cleanup pass is in scope; don't add a phase for it here.
- **Mountains skipped** at [`TerrainBuilder.js:1137-1150`](../js/TerrainBuilder.js:1137). Long-tail "real horizon ring as height-displaced skirt" - not urgent, not in this cycle.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - template this plan was generated from
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) - pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
- [`docs/archive/cycles/cycle-34-plan.md`](archive/cycles/cycle-34-plan.md) - prior cycle for context
- [`docs/mp-island-scenes-design.md`](mp-island-scenes-design.md) - Cycle 34 design doc (still relevant for OC objective wire format)
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
- [Cycle 32 plan](archive/cycles/cycle-32-plan.md) - iOS Safari water context for Phase 6 hard-stop
