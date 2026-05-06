# Wake-state report — 2026-05-06

> Autonomous overnight run on branch `meta-cycle-overnight-2026-05-06`.
> Read this first when reviewing morning-of-the-6th.

## TL;DR

- **Cycle 24 closed cleanly as `v1.5.0`** — all four remaining phases
  (2 / 3 / 4 / 6) shipped with green specs, vitest 188/188, build
  clean. v1.4.0 → v1.5.0 is purely additive: MP regression specs +
  15s reconnect grace + dog-wiring docs + 9 new e2e specs.
- **Cycle 25 partial — `v2.0.0-rc.1`.** Three phases shipped (A, B,
  E-minimal), four phases parked with HARDSTOP.md each. Tag is a
  release candidate to flag that the full polish program is still
  ahead.
- **No origin push, no tag push, no production deploy.** Per
  meta-cycle-execution.md hard rules. Your call this morning whether
  to merge to main + push tag (triggers deploy) or cherry-pick the
  parts you like.

## Status

- **Branch:** `meta-cycle-overnight-2026-05-06`
- **Final commit:** to be set after this file is committed
- **Tags created (branch-local, not pushed):**
  - `v1.5.0` — Cycle 24 close
  - `cycle-25-phaseA-complete`
  - `cycle-25-phaseB-complete`
  - `cycle-25-phaseE-complete`
  - `v2.0.0-rc.1` — wake-state commit (this file)

## What shipped

### Cycle 24 close → `v1.5.0`

| Phase | Commit | Delta |
|---|---|---|
| 2 — In-game state propagation | `1a5e976` | 3 e2e specs (host-start propagation, sheepCount agreement, gameMode) |
| 3 — Reconnect grace 15s | `81569a1` | RoomDO.handlePlayerDisconnect schedules 15s timeout, bindSocket cancels it; lobby-state evicts immediately. `__sdsMpDrop` + `__sdsMpReconnect` test globals. 2 e2e specs. |
| 4 — MP dog selection wiring | `b65ea83` | `docs/multiplayer-dog-selection.md` traces the 11-hop path. 3 e2e specs (host=pip+guest=sally, default-jep, three-player permutation). `pickDog` arg on the helper. |
| 6 — Ship | `cdb661e` | CHANGELOG `[1.5.0]`, version bumps, tag. |

### Cycle 25 partial → `v2.0.0-rc.1`

| Phase | Commit | Delta |
|---|---|---|
| A — Validation infra | `0253214` | `tools/validation/` 4 tools + npm scripts + README. Phase A baseline `cycle25-validation/phaseA/lod-baseline-field.json`. Goldens NOT auto-committed (review-gated). |
| B — LOD truth (partial) | `90c52c8` | HardwareTier `usesLod1ForFoliage` + `lod0CrossfadeBand`. TerrainBuilder gates LOD1 on tier (med/high drop, low keeps). `AtmosphericDesatPatch` neutralised (uDesatStrength=0); file kept for kiln impostor + mobile-low back-compat. Per-scene fog retuned (near 220→350, far 700-800→900). |
| E — Camera per-mode zoom (minimal) | `dd0a782` | Per-mode zoom ranges (Follow 12-40, Free 15-60, Classic 20-150), localStorage persistence. Full state-machine collapse parked. |

## What's parked (review needed)

| Phase | HARDSTOP | Reason |
|---|---|---|
| C — atmospheric truth | [`cycle25-validation/phaseC/HARDSTOP.md`](../cycle25-validation/phaseC/HARDSTOP.md) | aerial-perspective LUT + height-fog density + THREE.Fog replacement is multi-day work; not honest scope for autonomous overnight |
| D — impostor parity | [`cycle25-validation/phaseD/HARDSTOP.md`](../cycle25-validation/phaseD/HARDSTOP.md) | 8×4 Pixel Forge atlas re-bake + visual review = multi-hour binary asset work; sky-LUT relighting depends on Phase C |
| F — start screen UX | [`cycle25-validation/phaseF/HARDSTOP.md`](../cycle25-validation/phaseF/HARDSTOP.md) | full Mode→Scene→Dog flow restructure + hero-art ScenePicker + live WebGL DogSelection + cinematic orbits = 12-20hr React refactor |
| G — tree art direction | [`cycle25-validation/phaseG/HARDSTOP.md`](../cycle25-validation/phaseG/HARDSTOP.md) | 6 tree variants + per-scene profiles + landmark trees + animated impostors; depends on Phase D atlas pipeline |

Each HARDSTOP.md has a recommended-morning-actions section.

## What I scoped wrong

The cycle plan said ~25hr autonomous total. In practice:

- **Phases A, B, E (minimal) really did fit overnight scope** — A took
  ~2 hr, B took ~1 hr, E-minimal ~30 min including vitest+build runs.
- **Phases C, D, F, G are each a cycle of their own.** The cycle
  plan compressed 6 originally-separate cycles into one with
  optimistic time estimates. They're not 4hr each; they're 8-24hr
  each. Bundling them into a single autonomous overnight was the
  scope error, not my pacing.
- **Phase B was deliberately conservative.** I neutralised the desat
  patch instead of deleting it (kiln impostor still references the
  uniforms; safer to leave the file on disk and force strength=0).
  The plan called for ~180 LOC removal; I shipped ~50 LOC of changes.
  The 130 LOC delta lives in a follow-up that depends on Phase C
  landing the kiln impostor's relighting rewrite.

## Validation summary

- **vitest** 188/188 pass (was 188/188 at v1.5.0; no specs lost).
- **build** clean — 835.92 KB main / 250 KB gzip. Up ~10 KB vs
  v1.4.0 (834.65 KB), all from new test plumbing + Phase E camera
  additions.
- **sim-baseline** byte-identical (no `shared/` core touched).
- **`tools/validation/lod-compare.mjs`** — green on field at near/mid/far;
  baseline at `cycle25-validation/phaseA/lod-baseline-field.json`.
- **`tools/validation/frame-time-histogram.mjs`** — runnable but
  swiftshader-headless skews p99 high; informational only until a real
  GPU run captures a baseline.
- **`tools/validation/screenshot-golden.mjs`** — runnable; no goldens
  committed (review-gated).
- **`tools/validation/input-latency.mjs`** — runnable.
- **MP e2e specs** — 19 total, all green on chromium-mp (10 from
  Cycle 24 Phase 1 + 3 in-game-state + 2 reconnect-grace + 3
  dog-selection + 1 lobby-invite + 1 cinematic-strip).

## Recommended morning actions

1. **Review CHANGELOG `[2.0.0-rc.1]`** — does the parked-phase
   accounting match what you want public?
2. **Decide on `v1.5.0` push** — Cycle 24 close is clean. Push
   `v1.5.0` (triggers GH Actions deploy) gives the MP regression
   suite + reconnect grace to production immediately.
3. **Decide on `v2.0.0-rc.1`.** Three options:
   a. Push the rc tag for testing (pre-release, no auto-deploy).
   b. Cherry-pick A + B + E commits onto main, ship as `v1.6.0`
      (reframes the rc as "polish-program-step-1" rather than
      "polish-program-rc"). My lean.
   c. Hold the branch entirely; Cycle 26 picks up Phase C and the
      branch becomes the new mainline once C+D land.
4. **Schedule Cycle 26.** Either as Phase C standalone (4-day cycle)
   or Phases C+D bundled (8-day cycle). The polish-program doc
   needs a refresh either way.
5. **Optional:** Run `npm run validation:screenshots -- --baseline`
   on a real GPU to capture goldens; commit
   `tools/validation/golden/` once you've reviewed them visually.

## What's NOT done that I think you'd ask about

- **Phase B "delete ~180 LOC."** Shipped ~50 LOC of changes (HardwareTier
  presets + tier gate in TerrainBuilder + scene fog retunes + desat
  strength forced to 0). The full delete is gated on Phase C kiln-impostor
  relighting rewrite; safer to leave for a follow-up.
- **Phase E full state-machine collapse.** Shipped per-mode zoom +
  persistence. The 170-LOC consolidation of `_updateClassic /
  _updateFollow / _updateFree` parked — game-feel risk vs. autonomous
  pacing.
- **`docs/cycle-26-plan.md`** — empty stub not yet scaffolded;
  `/cycle-close` would normally do this. I'll leave it for your
  morning so you can shape Cycle 26 based on the parked-phase
  decisions above.
- **Production deploy.** Per policy. Your call.

## Branch structure for review

```
main (c817397)
 └── meta-cycle-overnight-2026-05-06
       ├── 1a5e976 feat(cycle-24-2)
       ├── 81569a1 feat(cycle-24-3)
       ├── b65ea83 feat(cycle-24-4)
       ├── cdb661e release: v1.5.0   <- tag v1.5.0
       ├── 0253214 feat(cycle-25-A)  <- tag cycle-25-phaseA-complete
       ├── 90c52c8 feat(cycle-25-B)  <- tag cycle-25-phaseB-complete
       ├── dd0a782 feat(cycle-25-E)  <- tag cycle-25-phaseE-complete
       └── (this commit)             <- tag v2.0.0-rc.1
```

`git log --first-parent meta-cycle-overnight-2026-05-06 ^main` shows
every shipped phase as its own commit.
