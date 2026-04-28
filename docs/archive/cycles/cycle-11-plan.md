# Cycle 11 — `release-finish`

> Drafted 2026-04-27 after Cycle 10 closed (`release-polish`). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"? If you can't write this paragraph clearly, the cycle isn't ready to start.

Working hypothesis (revise on `/cycle-start`): close the open Cycle 10 carryover so v1.0 actually ships — finish the in-process scene swap (Phase 1 flip + overlay), produce real marketing assets, deploy the score-integrity migration, push v1.0.0, and walk the deferred playtest backlog (Mac bug, Cycle 9 changed-flow, twice-deferred Cycle 8 items).

## How to read this plan

This doc fixes the *shape* of the changes, **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer. Each agent picking up a phase should research current best practice, measure on the actual hardware target, and pick the simplest thing that meets the budget.

## Open questions to resolve before writing code

1. **Q1: MP guest scene-swap WS strategy.** Carried from Cycle 10. Keep WS open across swap (lean: yes, contingent on RoomDO sending nothing scene-specific post-join) vs drop+rejoin.
2. **Q2: PWA icon source.** Re-render dog or terrain, or commission art? Lean: render via cinematic pipeline once Phase 1 ships.
3. **Q3: v1.0.0 push criteria.** Does Phase 1 in-process flip block tag, or can we tag at any green-build snapshot? Lean: tag after Phase 1 lands.

## Phase 1 — In-process scene swap flip (~8-12hr)

Pick up Cycle 10's Phase 1 carryover. Step 1 plumbing + AbortController + effects disposal already shipped; this phase finishes the job.

1. **Terrain + water + atmosphere disposal.** Wire each family into `disposeScene()` calling existing dispose methods. Verify via stress test (5×A→B→C→A) — `renderer.info.memory.geometries` within 5% of post-1-swap.
2. **`OptimizedSheepSystem.dispose()`.** New method; mirrors the `recreateSheepFlock` removal pattern. Gated on sim-baseline byte-identity.
3. **`rebuildScene(sceneDef)`.** Extract `init()` body 444-753 to a reusable form; preserve heightfield-load → terrain → grass → trees → rocks → mountains → farmHouse → structures → effects → water → sheepdog → sheep ordering exactly.
4. **`<SceneSwapOverlay>` React component.** Mounted at App root; listens for `scene-swap-start` / `scene-swap-end` events. 200ms fade in / 200ms minimum display / 200ms fade out.
5. **Defensive null-checks in `animate()`.** rAF must not crash on `terrainBuilder.terrainMesh`, `gameState.sheep`, `_animeWater`, `_sunBillboard`, `_corralZapPool`, `_portalEffect` while disposeScene/rebuildScene is mid-flight.
6. **`history.replaceState`.** Update URL bar without reload after a successful in-process swap. Falls back to full reload on rebuild error (catch path already in place from Cycle 10 Step 1).
7. **MP guest WS strategy (Q1).** Decide; verify in `worker/src/RoomDO.ts` that nothing scene-specific is sent post-join.

**Acceptance:** all 11 of Cycle 10 Phase 1's A1-A11 acceptance criteria, with sim-baseline byte-identical.

## Phase 2 — UI/UX polish completion (~6-10hr)

Carryover from Cycle 10 Phase 2 partial. Mode-shaped HUD profile, onboarding overlay re-trigger from Settings, real dog PNG thumbnails (rendered via cinematic pipeline), Button component unification across all React surfaces.

## Phase 3 — Marketing assets + Cinematic filming (~6-10hr)

Carryover from Cycle 10 Phase 4 partial. Install ffmpeg, fill in Playwright drive + ffmpeg mux in `tools/cinematic/run.mjs`, iterate on shot framing per `shot-list.mjs`, replace existing OG images with sub-300 KB WebP. Also generates the dog PNG thumbnails for Phase 2.

## Phase 4 — Score-integrity production deploy (~1-2hr)

Apply migration `0003_score_anomalies.sql` to production D1 via `wrangler d1 migrations apply sds-prod --remote`. Monitor `/api/leaderboard` for regressions. Verify anomaly column populates on next 24h of submissions.

## Phase 5 — Release tail (~3-5hr)

PWA icons (proper 192/512/maskable from cinematic-rendered dog). Cloudflare Web Analytics dashboard hookup. New `/api/event` worker route + custom events from client (`game_completed`, `mode_selected`, `scene_swapped`, `mp_room_created`). `git tag v1.0.0` push (gated on Q3).

## Phase 6 — Deferred playtest walkthrough (~3-5hr)

Walk the carryover items from Cycles 8-10 that have been thrice deferred. Mac rendering bug root-cause via `?debug=gl` recipe. Cycle 9 changed-flow verification (Solo Classic 0/200, MP host sheepCount stickiness, guest invite scene rendering, leaderboard solo dropdown hidden, sheep+dog patch fix). Cycle 8 acceptance walkthrough (Insane/Chaos counts, leaderboard partition filters, sandbox cross-scene reload UX, MP at non-200). Phase 6 follow-camera triangulation polish (RH Follow under stamina-out + tree contact + frametime regression on RTX 3070 / mobile).

## Dependencies

```
Phase 1 → Phase 2 + Phase 3 (parallel)
Phase 4 (parallel — independent of code phases)
Phase 5 (depends on Phase 1 for analytics scene-swap event; otherwise parallel)
Phase 6 (parallel — playtest walkthrough)
```

## Frozen files (cycle-specific additions)

- [`tests/sim-baseline/`](../tests/sim-baseline/) — DO NOT regenerate (cycles 5-10 byte-identical; Phase 1 must too).
- [`worker/migrations/`](../worker/migrations/) — append-only.

## Hard stops

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure — escalate, do not regenerate fixtures.
3. Visual regression on a previously-passing scene — fix or revert before adding new scope.
4. Phase 1 stress test showing > 5% geometry growth per swap loop — diagnose before adding scope.
5. Score-integrity migration failing on production D1 — roll back, do not force.

## What NOT to do during this cycle

- Don't add new scenes. Three is the right number.
- Don't reopen multiplayer architecture.
- Don't touch `shared/MovementPhysics.js` `updateMovement` for obstacle composition.
- Don't regenerate `tests/sim-baseline/` fixtures.
- Don't ship Electron packaging (research-doc only as of Cycle 10).
- Don't redesign UI from scratch — Phase 2 is unification + carryover close-out.
- Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-play codepath.

## Success criteria (cycle close)

`/cycle-close` reads this section. Don't pre-check.

- [ ] Phase 1 — In-process scene swap shipped, all Cycle 10 Phase 1 A1-A11 acceptance green, sim-baseline byte-identical.
- [ ] Phase 2 — UI/UX polish completion, Button unified across React surfaces, mode-shaped HUD, onboarding re-triggerable, real dog thumbnails.
- [ ] Phase 3 — Cinematic filming run produced all shots; new OG images shipped; `assets/marketing/` populated.
- [ ] Phase 4 — Score-integrity migration applied to prod D1; anomaly column populated for last 24h.
- [ ] Phase 5 — PWA icons + analytics + custom-event route + `v1.0.0` git tag.
- [ ] Phase 6 — Mac bug root-caused or filed as known issue; Cycle 8/9 carryover walked.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-10-plan.md`](archive/cycles/cycle-10-plan.md) — prior cycle plan
- [`docs/electron-readiness.md`](electron-readiness.md) — packaging research (Cycle 10 Phase 7)
