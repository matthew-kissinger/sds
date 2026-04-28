# Cycle 12 — `post-v1-polish`

> Drafted 2026-04-28 after Cycle 11 closed (`release-finish`, v1.0.0 shipped). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Stabilize and polish v1.0 after the initial release: close the strict-numeric A8 stress drift on scene swap, finish the UI unification carryover, fill in the cinematic video shots, run the deferred Mac rendering bug investigation, and walk the still-deferred Cycle 8/9 manual playtest backlog. User-visible delta: smoother repeat-swap session ergonomics, a properly unified Settings UI, real demo videos for marketing, and a documented Mac rendering fix.

## How to read this plan

This doc fixes the shape of the changes, not the implementation choices. Each phase author should research current Three.js disposal best practices and confirm assumptions on Matt's specific hardware before committing.

## Open questions to resolve before writing code

1. **Q1: A8 stress drift root cause.** Where is the remaining ~41% texture leak? Author lean: investigate per-swap subsystems with `renderer.info.programs` snapshots between each disposeScene step (atmosphere, sun billboard, terrain, water) to isolate the source. Suspect ShaderMaterial program cache or Atmosphere recreation.
2. **Q2: Mac rendering bug — environmental or shader?** Author lean: still environmental (GH Actions Safari renders correctly). Capture `window.__sdsDiag` from Matt's Mac per the cycle-9 recipe before deciding remediation path.
3. **Q3: Video filming pipeline — keep Playwright or switch to in-game capture?** Author lean: keep Playwright + headed mode. Headless Chromium WebGL is too flaky on Win for batch captures.

## Phase 1 — A8 stress drift fix (~3-5hr)

**Independently testable.** Cycle 11 Phase 1 left the texture drift at ~41% over 5×3 swap loop. The architecture works (no crashes, no visual regressions), but the slow accumulator is a v1.1 polish item.

1. Instrument `disposeScene()` to snapshot `renderer.info.memory.textures + .programs` between each subsystem dispose. Capture before/after and log deltas.
2. Identify which subsystem is the dominant remaining leaker (Atmosphere recreation? Per-swap ShaderMaterial compilation? Sky-dome shader programs?).
3. Pick the simplest fix that brings drift under 5%. Likely candidates: cache HosekWilkieSky/CloudLayer materials across swaps (instead of recreating Atmosphere), or compile programs once and reuse.

**Acceptance:** `await window.__sdsStressTestSwaps(5)` reports `< 5%` drift on geometries, textures, and programs.

## Phase 2 — UI unification carryover (~6-10hr)

**Depends on:** nothing.

1. **Mode-shaped HUD subcomponents** ([`js/components/GameHUD/`](../js/components/GameHUD/)): extract `<SoloClassicHUD>`, `<TimedHUD>`, `<CompetitiveHUD>`, `<ChaosHUD>`/`<InsaneHUD>` from the inline branching in `App.js`. Preserve existing prop shapes — these are visual-shape variants, not new logic.
2. **Button component unification.** Audit raw `<button>` and `createElement('button', ...)` in [`js/components/`](../js/components/) (~40-50 callsites, primarily in [`SettingsPanel.js`](../js/components/StartScreen/SettingsPanel.js)). Extend [`Button.js`](../js/components/ui/Button.js) with `variant: 'primary' | 'secondary' | 'ghost' | 'icon'` + `size: 'sm' | 'md' | 'lg'`. Migrate raw buttons preserving exact visual style. Don't touch keybind input UI (special-case).

**Acceptance:** Visual sweep all surfaces; no regressions; `npm test` green; `npm run build` clean.

## Phase 3 — Cinematic video shots (~4-6hr)

**Depends on:** nothing.

1. Run `npm run cinema --headed` to render the 4 video shots (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`).
2. Iterate on shot framing in [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs) until each looks right.
3. Mux 1080p master + 720p downscale per shot.
4. Marketing page (TBD location): embed the 4 demos.

**Acceptance:** 4 MP4s in `assets/marketing/videos/` (gitignored), each <10MB, ready for CDN upload.

## Phase 4 — Mac rendering bug investigation (~2-4hr matt + AI)

**Depends on:** Matt running the diagnostic recipe.

1. Matt opens `https://sheepdogsim.com/?scene=rolling-hills&debug=gl` on his Mac, plays Solo Classic until white-ground manifests, captures `window.__sdsDiag` via Safari DevTools.
2. AI compares against working baseline at GH run [25028575425](https://github.com/matthew-kissinger/sds/actions/runs/25028575425).
3. Pick remediation: shader fix, fallback path, or document as known issue.

**Acceptance:** Either the bug is fixed or it's documented in `BACKLOG.md` as a known-issue with a workaround.

## Phase 5 — Cloudflare Web Analytics + manual playtest (~2-3hr)

1. Matt copies the CF Web Analytics beacon `<script>` from CF Pages console → Analytics tab. Add to [`index.html`](../index.html) head.
2. Manual Solo + MP playtest across Field/RH/OC, all modes (Classic/Extreme/Insane/Chaos/Timed/Competitive).
3. Verify: leaderboard partition filters, sandbox cross-scene reload, MP at non-200 sheep counts, follow-camera under stamina-out + tree contact, frametime regression on RTX 3070.

**Acceptance:** Beacon visible in CF dashboard; playtest items walked + documented.

## Dependencies

```
Phase 1 (A8 fix) — independent
Phase 2 (UI) — independent
Phase 3 (video) — independent
Phase 4 (Mac) — Matt-gated
Phase 5 (analytics + playtest) — Matt-gated
```

All phases parallelizable.

## Frozen files

- [`tests/sim-baseline/`](../tests/sim-baseline/) — DO NOT regenerate (cycles 5-11 byte-identical).
- [`worker/migrations/`](../worker/migrations/) — append-only.

## Hard stops

1. Frozen-file change without scope authorization.
2. Sim-baseline test failure — escalate, do not regenerate.
3. Visual regression on a previously-passing scene.
4. Phase 2 button migration breaking any existing onClick handler.

## What NOT to do during this cycle

- Don't introduce a new scene (three is the right number).
- Don't redesign UI from scratch — Phase 2 is unification only.
- Don't ship Electron packaging (still research-doc only).
- Don't regenerate `tests/sim-baseline/` fixtures.
- Don't tag `v1.1.0` until Phase 1 + Phase 2 land cleanly.

## Success criteria (cycle close)

- [ ] Phase 1 — A8 stress drift < 5% on geometries, textures, programs.
- [ ] Phase 2 — Mode-shaped HUDs + Button unification across all React surfaces.
- [ ] Phase 3 — 4 cinematic video shots rendered + uploaded.
- [ ] Phase 4 — Mac rendering bug fixed or known-issue-documented.
- [ ] Phase 5 — CF Web Analytics beacon live + manual playtest walked.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] `v1.1.0` tag pushed (or Cycle 13 scoped if scope grew).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-11-plan.md`](archive/cycles/cycle-11-plan.md) — prior cycle plan
