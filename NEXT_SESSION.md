# Next Session — Cycle 9 (playtest-and-polish) scaffolded

> Updated 2026-04-26. Active plan: [`docs/cycle-9-plan.md`](docs/cycle-9-plan.md) — scaffolded; needs Goal + Phases filled in by `/cycle-start`. Last closed: [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md) (`mode-matrix`: modes × sheep counts × scenes × leaderboards + follow-camera Phase 6 polish; deployed live). Cold-start agents: read this page top-to-bottom, then the cycle-9 plan, then [`docs/BACKLOG.md`](docs/BACKLOG.md) for what's deferred. Earlier cycles: [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md), [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md), [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md), [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md), [`docs/cycle-3-plan.md`](docs/cycle-3-plan.md).

## Where the project stands (2026-04-26)

- `sheepdogsim.com` is live on Cloudflare Pages + Worker + DO + D1.
- **Cycle 8 closed and deployed.** mode-matrix shipped: per-(mode × scene × sheepCount) leaderboard partitioning + new soloInsane/soloChaos modes + cluster-aware spawn that fixes the Insane/Chaos sheep-stacking bug + sandbox on RH/OC + MP sheep-count selector (cap 1000 pending Q4 bandwidth measurement) + follow-camera Phase 6 polish (interior-only ridge sampling, asymmetric floor smoothing, `_lastValidFacing` tracking). Detail in [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md) §Shipped status; headline summary in [`docs/BACKLOG.md`](docs/BACKLOG.md).
- 111/111 vitest pass. Production build clean. Sim-baseline byte-identical (preserved through cycles 5-8).
- Migration `0002_mode_matrix.sql` applied to remote D1 + verified.
- **Cycle 9 (`playtest-and-polish`) scaffolded** at [`docs/cycle-9-plan.md`](docs/cycle-9-plan.md). Stub Goal + Phases — needs filling in. Run `/cycle-start` after that.

### Cycle 9 starter scope

Most Cycle 8 acceptance items were code-complete but playtest-deferred. Cycle 9 is the verification + tuning pass:

1. **Phase 1 — Cycle 8 acceptance walkthrough** (~1hr). Walk every Cycle 8 carryover item end-to-end on the deployed build. Document green/yellow/red per item.
2. **Phase 2 — MP bandwidth measurement** (~2hr). Q4 — measure WS+MessagePack at 500/1000 sheep on a representative connection. Decide whether to lift the 1000 cap.
3. **Phase 3 — Tune from Phase 1 findings** (TBD).

## Running locally

First time on a fresh clone:

```
npm install
cp worker/.dev.vars.example worker/.dev.vars   # sets JWT_SECRET for local
npm run dev:setup                              # applies D1 migrations to local sqlite
```

Every session after that:

```
npm run dev    # starts Vite (:3000) + wrangler (:8787) together
```

Granular alternatives: `npm run dev:client` (just Vite), `npm run dev:worker` (just wrangler), `npm run dev:lan` (Vite with `--host` + wrangler).

Open `http://localhost:3000` (or `:3001` if :3000 is taken). `?scene=field`, `?scene=rolling-hills`, `?scene=open-country` to skip the picker.

### Cycle 8 carry-over (deferred to Cycle 9 verification)

All Cycle 8 phases shipped code. Most acceptance items are *playtest-confirmed*, deferred to Cycle 9 Phase 1:

1. **Insane / Chaos modes spawn correctly on each scene.** Cluster-aware spawn + density-driven radius scaling shipped in [`js/OptimizedSheep.js`](js/OptimizedSheep.js); needs the 12-cell repro matrix on (Field/RH/OC × Classic/Extreme/Insane/Chaos).
2. **Insane / Chaos leaderboards populate cleanly, no soloClassic pollution.** `SOLO_MODE_TO_LEADERBOARD` lookup shipped in [`js/GameState.js`](js/GameState.js); `soloInsane` / `soloChaos` added to [`worker/src/d1.ts`](worker/src/d1.ts) `GameMode` union.
3. **Per-(mode × scene × sheepCount) partition filters return the right rows.** `getLeaderboard` accepts `{sceneId, sheepCount}` filters; UI selectors in [`GlobalLeaderboard.js`](js/components/Multiplayer/GlobalLeaderboard.js) drive them.
4. **Sandbox launches cleanly on RH and OC.** Cross-scene reload via `?scene=X#s/<encoded>`; scene-deferred start path in [`js/main.js:startSandboxGame`](js/main.js) and [`js/GameState.startSandboxGame`](js/GameState.js).
5. **MP at non-200 sheep counts (cap 1000).** [`worker/src/RoomDO.ts`](worker/src/RoomDO.ts) `RoomMeta` extended; [`worker/src/GameSim.js`](worker/src/GameSim.js) reads `room.sheepCount`. Q4 bandwidth measurement is Cycle 9 Phase 2.
6. **Phase 6 follow-camera triangulation polish.** Interior-only ridge sampling (STEPS 6→12), asymmetric `smoothedFloorY` smoothing (snap up, ease down), `_lastValidFacing` tracking in [`js/CameraController.js`](js/CameraController.js).
7. **Cycle 6 + 7 playtest items 1-6** (originally Phase 1; never explicitly walked).
8. **No frametime regression on RTX 3070 / mobile target.**

### Standing risks (carried)

- **Y-sample regression surface is wide.** A bad heightfield change makes the dog float, sheep sink, grass clip — all simultaneously. After any change in this area, manually verify all three scenes in all three camera modes.
- **MP joiner renderer sync.** Joiners whose URL-param scene differs from the room's see correct sim but mismatched visuals. Carried over.
- **Sim-baseline fixtures are one-way.** Don't regenerate without understanding the diff. Cycles 5-8 left them bit-identical — the byte-preserved rect path in `BoundaryCollision`, the `obstacles.trees.length > 0` guard in OptimizedSheep, and the count-aware spawn radius gate (preserves Field-200) are the contracts that let this hold.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle (scaffolded) | [`docs/cycle-9-plan.md`](docs/cycle-9-plan.md) — needs Goal + Phases filled in |
| Latest closed cycle | [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md) — see §Shipped status |
| Prior closed cycle | [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md), summary in [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Older cycles | [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md) |
| Cycle stub template | [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) |
| Frozen files / fence rules | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred items | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Cycle 4 Hardening | [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md) |
| Cycle 4 Phase A plan | [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md) |
| Cycle 4 Phase B integration | [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| What Cycle 2 shipped | [`docs/cycle-2-report.md`](docs/cycle-2-report.md) |
| How to add a biome | [`docs/adding-a-biome.md`](docs/adding-a-biome.md) |
| Prior postmortem | [`docs/archive/POSTMORTEM.md`](docs/archive/POSTMORTEM.md) |

## What NOT to do

- Don't rearchitect multiplayer. It works.
- Don't reintroduce procedural mountains. If we want a horizon ring later, the right path is a height-displaced skirt that blends into the play-area heightfield, not the annulus shader.
- Don't add new scenes. Three is the right number.
- Don't touch `shared/MovementPhysics.js`'s `updateMovement` to insert obstacle logic — Cycle 6 deliberately put obstacle force composition at the **call site** (`OptimizedSheep`, `Sheepdog`, future Worker `GameSim`) so MovementPhysics stays a pure-functions library.
- Don't blow up `main.js` in one PR. Shrink it one responsibility at a time.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why. Cycle 5 + 6 + 7 preserved them bit-identical.
- **Cycle 7:** Don't hardcode grass-exclusion zones for non-Field scenes. The pasture/farmHouse rect was hardcoded for *every* scene before, which left bare patches on RH/OC. Now gated on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- **Cycle 7:** Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*. The state machine separates `canStartSprint` (≥10) from `canContinueSprint` (>0); merging them creates the oscillation-around-threshold bug that hides exhaustion entirely.
- **Cycle 7:** Don't set CSS `transition: all` on stamina/progress bars. Width must be instant; only color/glow should animate. Otherwise the bar lags the percentage text by the transition duration.
- **Cycle 7:** Don't assume the dome's integrated cloud math is the only cloud system. [`CloudLayer.js`](js/atmosphere/CloudLayer.js) is a separate planar mesh with its own shader. Both can produce horizontal-line artifacts at low elevation angles; verify the right one when debugging sky seams.
