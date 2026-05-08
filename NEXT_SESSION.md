# Next Session — Cycle 27 (`engagement-loop-and-perf`)

> **Updated 2026-05-08** — Cycle 26 closed today after shipping `v2.0.3` →
> `v2.1.2` plus the scene-picker auto-load post-patch. The cycle was a
> deliberately soft-scoped "menu" pivoting toward the player-facing
> layer; ~30% of the menu landed autonomously, the rest deferred to
> Cycle 27 in an explicit autonomy-sequenced plan.
>
> Cycle 27 plan: [`docs/cycle-27-plan.md`](docs/cycle-27-plan.md).
>
> **Sequencing principle:** Phases A–I autonomous (Claude ships without
> check-ins), Phase I → J is the **Matt pickup point**, Phases J–N
> require Matt (paired session, real device, design taste, or strategic
> call). Run `/cycle-start` when ready to begin Phase A.

## Where to start

**Phase A — Cloudflare Web Analytics beacon (~10min).** Has to land
first so the rest of Cycle 27 can be A/B'd against analytics signal.
Generate beacon token from Cloudflare dashboard, add async `<script>`
to [`index.html`](index.html) `<head>`, verify pageview in dashboard
within 1hr.

After A lands: continue through Phases B–I in any order (most can run
in parallel after A). Surface a status summary after Phase I and
**wait for Matt** before continuing into J–N.

## Cycle 27 phase ladder (autonomy-sequenced)

| # | Phase | Hours | Depends on | Autonomous? |
|---|---|---|---|---|
| A | Cloudflare Web Analytics beacon | ~10min | nothing | ✓ |
| B | Cinema runner 30s font-wait timeout fix | ~2hr | nothing | ✓ |
| C | Lazy-load React overlay split | ~2-3hr | nothing | ✓ |
| D | Daily-seed micro-challenge | ~3-4hr | Q2 resolved | ✓ |
| E | 10s WebM replay capture + share-card | ~3-4hr | Q3 resolved | ✓ |
| F | First-30s onboarding pointer-tour | ~2hr | nothing | ✓ |
| G | itch.io heightfield diagnosis + fix | ~2hr | nothing | ✓ |
| H | Camera state-machine collapse | ~3hr | nothing | ✓ |
| I | Test coverage backfill (GameState / Sheepdog / NetworkManager / RoomDO) | ~4-5hr | A–H stable | ✓ |
| **— Matt pickup point —** | | | | |
| J | `og-open-country.webp` refresh | ~30min | Matt + ideally B | needs Matt |
| K | iPhone tone-mapping verification (v2.0.4) | ~30min | Matt's iPhone | needs Matt |
| L | Title-screen identity pass | ~1day | Matt's taste | needs Matt |
| M | Heightfield amplitude bug — fix or codify | Matt's call | strategic call | needs Matt |
| N | Devlog cadence + venue pick | ~1hr Matt + ~1hr Claude | Matt's choice | needs Matt |

Plan detail: [`docs/cycle-27-plan.md`](docs/cycle-27-plan.md).

## Open questions (resolve before code)

These are repeated from the cycle plan for cold-start orientation:

1. **Q1: Per-phase ship cadence vs single end-of-cycle ship?** Lean: per-phase v2.2.x bumps (matches Cycle 26's pattern), single v2.3.0 at end of Matt-pickup tail.
2. **Q2: Daily-seed leaderboard — separate partition or tag?** Lean: separate partition. Worker `RoomDO` already supports mode-partition; add `daily-{YYYY-MM-DD}` mode key. Resolve before Phase D's leaderboard write.
3. **Q3: Replay capture — `MediaRecorder` over `canvas.captureStream()` or deterministic state-log replay?** Lean: MediaRecorder. WebM out, ~3-5 MB, 10× simpler than deterministic replay. Resolve before Phase E.
4. **Q4: Devlog venue (Phase N)?** Lean: `DEVLOG.md` route on the site. Lowest overhead, no CMS.
5. **Q5: Heightfield amplitude — fix at root or codify as design (Phase M)?** Lean: codify as design in [`DECISIONS.md`](DECISIONS.md). Visual character has shipped on the doubled state for 16+ cycles; fix risk vs. benefit unfavorable. Needs Matt's explicit call.

Q1 doesn't block Phase A. Q2 must resolve before Phase D. Q3 must resolve before Phase E. Q4–Q5 resolve in their own phases.

## What just shipped (Cycle 26 — closed today)

Per-version bumps from `v2.0.3` through `v2.1.2` plus a scene-picker auto-load post-patch:

- **`v2.0.3`** — Mac white-hue fix. ACES → Neutral on Mac platforms.
- **`v2.0.4`** — extend Apple tone-mapping branch to iPhone/iPad. Verification pending Matt's device test (Cycle 27 Phase K).
- **`v2.0.5`** — delete dead AtmosphericDesatPatch (127 LOC). Polish-program cleanup queue closed.
- **`v2.1.0`** — Practice Paddock + per-scene SEO. Lighthouse SEO 100 confirmed post-deploy.
- **`v2.1.1`** — OG card refresh (RH dusk + Field farmhouse). 2-of-3 cards updated; OC card carryover (Cycle 27 Phase J).
- **`v2.1.2`** — itch.io heightfield `.r32f` → `.bin` rename. **NOT RESOLVED** — Cycle 27 Phase G.
- **Scene-picker auto-load** — flip card → 300ms idle → auto-load. Latest-wins coalescing if swap is in flight. Removes the click-to-load button + "Tap to load" hint pill.

201 vitest pass. Production build 837.26 KB / 250.46 KB gzip — flat with v2.1.0. Sim-baseline byte-identical.

Full closed-cycle entry in [`docs/BACKLOG.md`](docs/BACKLOG.md) under "Cycle 26."

## What's parked (NOT Cycle 27 scope)

These are real "Cycle of their own" deliverables. They are not abandoned — they are waiting for a cycle that's about world-rendering, not the player-facing layer.

- **Aerial-perspective LUT** (Hillaire 2020 precomputed scattering). Foundation wired in [`js/shaders/HeightFogPatch.js`](js/shaders/HeightFogPatch.js); no-op until activated across patched materials.
- **8×4 impostor atlas re-bake** + padded mips (Halen 2022) + hybrid trunk-mesh + impostor canopy (Cycle 20 Q2 escalation).
- **6 fresh tree variants + landmark trees per scene** (recipe authoring + 6 fresh bakes + 6 impostor re-bakes).
- **Start-screen full restructure** — Mode → Scene → Dog reorder + live WebGL DogSelection inset + cinematic background orbits. Cycle 25 F shipped a thinner tutorial; full restructure stays parked.
- **WebGPU/TSL spike** under `?renderer=webgpu` feature flag.

## Frozen files (cycle-specific)

Plus the durable [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) list:

- **`js/SceneManager.js` tone-mapping branch** — just shipped (v2.0.3 + v2.0.4); Phase K may escalate but no other phase touches it.
- **`shared/MovementPhysics.js`** — sim-baseline lock; Phase I writes test specs that read from it but doesn't modify.
- **`tests/sim-baseline/*.json`** — Phase M (heightfield amplitude) is the only phase allowed to regenerate these, and only on Matt's go-ahead.

## Hard stops (Cycle 27)

Surface to the user, do not proceed:

1. Phase A's Cloudflare beacon shows zero pageviews after 1hr live.
2. Phase C's lazy-load split causes a visible flash-of-blank-canvas on broadband.
3. Phase E's `MediaRecorder` regresses frame time > 5%.
4. Phase G's itch heightfield diagnosis surfaces a CDN config change requiring itch support.
5. Phase I uncovers an actual bug in `GameState` / `Sheepdog` / `NetworkManager` / `RoomDO` (separate hotfix, not in-line scope creep).
6. Phase M's "fix at root" path produces a visibly worse-looking game per Matt's playtest.

## Where the project stands

Cycle 26 closed today. 201 vitest pass. Production build 837.26 KB / 250.46 KB gzip. `sheepdogsim.com` live with auto-load scene-picker; itch.io deploy still has the heightfield bug (Cycle 27 Phase G is the diagnosis).

Standing risks (carried forward, prioritized for Cycle 27):

- **itch.io heightfield bug** (Cycle 27 Phase G) — distribution channel partially broken.
- **iPhone tone-mapping verification** (Cycle 27 Phase K) — silent failure possible for ~30% of mobile traffic.
- **Heightfield amplitude bug** (Cycle 27 Phase M) — 16+ cycles of accumulated workarounds; needs Matt's strategic call to fix or codify.
- **No analytics signal** (Cycle 27 Phase A) — every feature ship is uninstrumented; Cycle 27 Phase A fixes first.
- **Test coverage gaps in load-bearing classes** (Cycle 27 Phase I) — `GameState`, `Sheepdog`, `NetworkManager`, `RoomDO` effectively untested.

## CI quirks worth knowing

- **macOS Safari Smoke** is the standing mac-white-ground bug, environmental (not on CI Safari, only Matt's Mac). Documented in BACKLOG standing risks.
- **Cinema runner timeout** — `page.screenshot: Timeout 30000ms exceeded - waiting for fonts to load... fonts loaded` then hang. Cycle 27 Phase B fixes.
- **perf-check noise on swiftshader extreme** — ~4-second-per-frame baseline with ~2 sample frames per measure window. Single-run failures may be noise.
- **scene-swap-stability spec is `@local-only`.** Run locally after touching scene-swap or flock-recreation code: `npm run test:e2e -- scene-swap-stability`.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-27-plan.md`](docs/cycle-27-plan.md) — `engagement-loop-and-perf` |
| Latest closed cycle | [`docs/archive/cycles/cycle-26-plan.md`](docs/archive/cycles/cycle-26-plan.md) — closed as `v2.1.2` series 2026-05-08 |
| Older closed | [`docs/archive/cycles/`](docs/archive/cycles/) |
| Cycle stub template | [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) |
| Frozen files / fence rules | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred items | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Tree pipeline contract | [`docs/tree-pipeline.md`](docs/tree-pipeline.md) |
| Asset pipeline (gallery + integrate) | [`tools/asset-gallery/README.md`](tools/asset-gallery/README.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player CHANGELOG | [`CHANGELOG.md`](CHANGELOG.md) |
| Press kit | [`PRESSKIT.md`](PRESSKIT.md) |

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

URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl` (probe), `?cinematic=1` (filming infra), `?ui=off` (hide React overlay), `?sun=0.5` (sun position), `?perfMode=1` (`__perfHarness` global for perf harness driver), `?tier=low|med|high` (HardwareTier override), `?tonemap=aces|neutral|linear|none` (tone-mapping A/B).

## What NOT to do during Cycle 27

- **Don't pick up parked world-rendering work.** Aerial-perspective LUT, 8×4 impostor re-bake, tree variants — all stay in BACKLOG.
- **Don't expand analytics beyond Cloudflare's privacy-respecting beacon.** No GA, no fingerprinting, no per-user tracking.
- **Don't pre-deploy Phase L's title-screen change.** Design taste is Matt-gated.
- **Don't auto-post Phase N's first devlog.** Marketing/community pushes are Matt-sent.
- **Don't bloat the bundle.** Cycle 27 should *shrink* `main` (Phase C). Every phase has a bundle-delta validation criterion.
- **Don't regenerate sim-baseline fixtures.** Phase M is the only entry point and only with Matt's call.
- **Don't replace `MediaRecorder` with deterministic-replay state-log architecture.** Q3 settled; that's Cycle 30+ scope if it ever comes up.

## What NOT to do (durable)

- Don't rearchitect multiplayer. It works.
- Don't reintroduce procedural mountains. The right path is a height-displaced skirt.
- Don't add new scenes. Three is the right number.
- Don't touch `shared/MovementPhysics.js`'s `updateMovement` for obstacle composition.
- Don't blow up `main.js` in one PR. Shrink one responsibility at a time.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why.
- Don't hardcode grass-exclusion zones for non-Field scenes. Gate on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*.
- Don't traverse-and-dispose materials on GLB clones (SkeletonUtils.clone, .clone()) — they share materials with the cache.
- Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-play codepath.
- Don't pass capital-case `'Single'` / `'Double'` strings to EZ-Tree's `leaves.billboard` — silently ignored.
- Don't replace EZ-Tree with the Procedural Instanced Forest unless `InstancedMesh2.addLOD` demonstrably misses the perf budget.
- Don't add new clamp logic to `js/GrassSystem.js` to mask future regressions — fix at the heightfield root (or codify per Cycle 27 Phase M).
