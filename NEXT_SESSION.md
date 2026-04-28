# Next Session — Cycle 10 (`release-polish`) ready to start

> Updated 2026-04-27. Active plan: [`docs/cycle-10-plan.md`](docs/cycle-10-plan.md) — fully drafted, seven phases, ready to pick up. Last closed: [`docs/archive/cycles/cycle-9-plan.md`](docs/archive/cycles/cycle-9-plan.md). Cold-start agents: read this page top-to-bottom, then [`docs/cycle-10-plan.md`](docs/cycle-10-plan.md), then [`docs/BACKLOG.md`](docs/BACKLOG.md). Earlier cycles: [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md), [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md).

## Where the project stands (2026-04-27)

- `sheepdogsim.com` is live on Cloudflare Pages + Worker + DO + D1.
- **Cycle 9 (`playtest-triage + cross-platform`) closed 2026-04-27.** All five phases (9.1-9.5) shipped. 111/111 vitest pass; production build clean; sim-baseline byte-identical (preserved through cycles 5-9). Headlines: solo sheep count owned by mode (Classic=200/Extreme=1000/Insane=3000/Chaos=5000), MP scene-sync helper for guest joiners, Playwright + macOS Safari nightly cross-platform test infra, GL diagnostic probe behind `?debug=gl`, defensive `Heightfield.surfaceY` lift. Full headline + commit list in [`docs/BACKLOG.md`](docs/BACKLOG.md).
- **Cycle 10 (`release-polish`) plan drafted and ready.** Seven phases — in-process scene swap (centerpiece), UI/UX polish, cinematic capture infrastructure, marketing asset production, SEO + release prep (PWA, analytics, v1.0.0 tag, CHANGELOG), score integrity (server-side plausibility), Electron-readiness research doc.

## What to pick up next

Run `/cycle-start` to orient on Cycle 10. The plan has Goal + Phases + Acceptance written; no scaffolding gaps. Phase 1 (in-process scene swap) is the long pole — start there. Phases 3 + 5 + 6 + 7 can run in parallel branches.

Key pre-code decisions captured in cycle-10-plan §Open questions (Q1-Q4): MP guest WS strategy on swap (lean: keep WS open), in-game cinematic UI (lean: no — Playwright-only), analytics provider (lean: Cloudflare Web Analytics), score-integrity approach (lean: bounds tightening + telemetry heuristics).

## Cycle 9 carryover (deferred per user direction)

Per user direction at Cycle 9 close ("I will playtest after cycle 10"), all playtest verification is deferred to post-Cycle-10. Items to walk after Cycle 10 ships:

1. **Mac rendering bug root cause.** Bug does NOT reproduce on GH Actions Safari (verified across two macos-latest runs). Environmental to Matt's specific Mac. Debug recipe:
   - Open https://sheepdogsim.com/?scene=rolling-hills&debug=gl → Solo Play → Confirm → Classic Mode
   - Wait for the white-ground manifestation
   - In Safari devtools console: `window.__sdsCaptureSample('inGame')` then `copy(JSON.stringify(window.__sdsDiag, null, 2))`
   - Compare against working baseline at GH run [25028575425](https://github.com/matthew-kissinger/sds/actions/runs/25028575425).
   - Things to look for in diff: `glErrorsSeen` non-empty? `water.failed` event? `terrain.created` with `sceneFog: false`? `framebuffer.sampled` with `flag: near-white` and ground samples actually white (RGB > 230)?

2. **Cycle 9 changed-flow playtest.** Solo Classic on RH/OC shows `0/200`; MP host's chosen sheepCount sticks; guest joining via invite renders the room's scene; leaderboard solo tab hides the sheep-count dropdown; sheep + dog no longer sink in bare patches (Phase 9.5 +0.05m lift).

3. **Cycle 8 carryover (twice-deferred).** Phase 1 acceptance walkthrough (Insane/Chaos sheep counts, leaderboard partition filters, sandbox cross-scene reload UX, MP at non-200 sheep counts) + Phase 2 MP bandwidth measurement (Q2) + Phase 6 follow-camera triangulation polish reads smooth on RH Follow under stamina-out + tree contact + frametime regression check on RTX 3070 / mobile target.

## Diagnostic surface

- `?debug=gl` — installs the diagnostic probe; `window.__sdsDiag` populated.
- `window.__sdsCaptureSample(label)` — synchronous on-demand framebuffer sample; returns `{label, samples, avg, flag}`.
- Diag stream events: `atmosphere.fog.attached`, `atmosphere.preset.applied`, `terrain.created` (sceneFog bool), `sunBillboard.created`, `renderTarget.depthPrePass`, `water.created` / `water.failed`, `gl.error`, `framebuffer.sampled`.
- Probe code: [`js/diagnostics/glProbe.js`](js/diagnostics/glProbe.js).
- Safari smoke runner: [`tests/safari-smoke/run.mjs`](tests/safari-smoke/run.mjs). Trigger with `gh workflow run macos-safari.yml`.

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

### Standing risks (carried into Cycle 10)

- **Y-sample regression surface is wide.** A bad heightfield change makes the dog float, sheep sink, grass clip — all simultaneously. After any change in this area, manually verify all three scenes in all three camera modes.
- **Sim-baseline fixtures are one-way.** Don't regenerate without understanding the diff. Cycles 5-9 left them bit-identical — the byte-preserved rect path in `BoundaryCollision`, the `obstacles.trees.length > 0` guard in OptimizedSheep, and the count-aware spawn radius gate (preserves Field-200) are the contracts that let this hold. Cycle 10 Phase 1 (in-process scene swap) must preserve this.
- **Scene-coupled GPU resources currently leak on reload.** Cycle 10 Phase 1 addresses this directly; the disposal audit in cycle-10-plan §Phase 1 enumerates the families.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-10-plan.md`](docs/cycle-10-plan.md) — full plan, Goal + 7 Phases written |
| Latest closed cycle | [`docs/archive/cycles/cycle-9-plan.md`](docs/archive/cycles/cycle-9-plan.md) — see §Shipped status |
| Prior closed cycle | [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md), summary in [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Older cycles | [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md), [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md) |
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
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why. Cycle 5-9 preserved them bit-identical.
- Don't hardcode grass-exclusion zones for non-Field scenes. Gate on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*. The state machine separates `canStartSprint` (≥10) from `canContinueSprint` (>0); merging them creates the oscillation-around-threshold bug.
- Don't set CSS `transition: all` on stamina/progress bars. Width must be instant; only color/glow should animate.
- Don't assume the dome's integrated cloud math is the only cloud system. [`CloudLayer.js`](js/atmosphere/CloudLayer.js) is a separate planar mesh with its own shader. Both can produce horizontal-line artifacts at low elevation angles.
- **Cycle 10:** Don't ship an in-game cinematic record UI (Q2 — Playwright-driven only). Don't implement Electron packaging (Phase 7 is research only). Don't do a from-scratch UI redesign — Phase 2 is unification + Cycle 3 carry-over close-out, not a new aesthetic. Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-play codepath.
