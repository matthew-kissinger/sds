# Polish Program — collapsed into mega-Cycle 25

> Drafted 2026-05-06 mid-Cycle-24. **Originally scoped as 5 cycles + 1 hardening (Cycles 25-30, ~38 dev-days). Collapsed 2026-05-06 into a single autonomous overnight mega-cycle (Cycle 25, Phases A-H)** per Matt's "definitely do it all in one cycle" directive. Active plan: [`cycle-25-plan.md`](cycle-25-plan.md). Execution policy: [`meta-cycle-execution.md`](meta-cycle-execution.md). User-visible target: ship `v2.0.0` at mega-Cycle 25 close.

This doc remains the durable umbrella explaining the **thesis** (why this work is ordered the way it is). The mega-cycle plan is the **execution doc**. Cold-start agents read this for context, then the mega-cycle plan for current scope.

| Original cycle | Now Phase | Scope |
|---|---|---|
| Cycle 25 | A + B | LOD truth + validation infra |
| Cycle 26 | C | Atmospheric truth (aerial LUT) |
| Cycle 27 | D | Impostor parity (8×4 re-bake) |
| Cycle 28 | E | Camera + game-feel |
| Cycle 29 | F | Start screen + scene selection UX |
| Cycle 30 | G + H | Tree art direction + ship `v2.0.0` |

## The thesis

Cycles 16–23 added one compensating layer per cycle to mask a foundational mismatch: **LOD1 (the 80–200m mid-distance tree mesh) does not match LOD0's silhouette**. Each layer makes the seam less visible at one camera angle and reveals new mismatches at others.

Concretely:

| Cycle | Patch | What it actually masks |
|---|---|---|
| 16 | First LOD1 with halved leaves | (failed — Cycle 17 rejected as "less leaves does not look good") |
| 18 | AlphaHash on LOD0 + impostor | LOD seam alpha-edge pop |
| 20 | uMatchBoost calibration LUT | LOD0↔impostor color drift |
| 21 | Schlick fresnel on impostor | LOD0↔impostor warm-bias hue gap |
| 22A | Meshopt-baked LOD1 | (current — silhouette warps at leaf-card UV edges) |
| 22B | AlphaHash on LOD1 leaves | LOD1↔LOD0 transition pop (masking 22A's silhouette warp) |
| 22C | Atmospheric desaturation | Overall LOD0↔LOD1↔impostor color contrast at the seam distance |
| 23A1 | Pitch-aware desat ramp | Desat over-applies when overhead camera shows the masking |
| 23A2 | Camera-to-dog occluder fade | Adjacent problem domain, similar layer-on-layer pattern |

Each row is "make the prior row's tell less visible." The pattern stops only when **the seam itself stops existing**, which is what the polish program does in Cycle 25 by removing LOD1 from the desktop pipeline entirely. Once the seam is gone, the masking patches lose their primary justification and **delete cleanly** in Cycles 25–27 (~120 LOC removed across `AtmosphericDesatPatch.js`, `_desatHighPitchFloor`, `setKilnImpostorDesat`, `uMatchBoost`, plus impostor calibration LUT generator).

## Why "no LOD1" is the right answer for foliage

LOD1 is a hard problem specifically for *alpha-tested foliage cards* because:

1. **The silhouette IS the alpha edge.** Cards are 2 triangles each; "simplifying" them means deleting cards or warping their UVs, both of which mutate silhouette directly.
2. **Halving the card count was tried (Cycle 16) and rejected (Cycle 17)** — the silhouette read as sparse, individual missing leaves stood out.
3. **Meshopt-simplifying the card mesh (Cycle 22)** preserves card count but warps card edges, producing the current "looks weird at 80m" tell.

Both approaches fail because LOD1 is being asked to do something foliage geometry can't do gracefully: lose detail without losing silhouette. The clean answer is to skip LOD1 on platforms with the perf headroom and keep LOD0 active until the impostor takes over with a long alphaHash crossfade band.

**Desktop (RTX 3070-class):** LOD0 (0–200m) → kiln impostor (180m+) with 20m alphaHash crossfade. ~250K–500K extra tris when the 80–200m band has 50–100 trees. RTX 3070 handles this with frame-time headroom to spare per `cycle22-validation/phaseD/` perf data.

**Mobile (Adreno 730-class):** keep meshopt LOD1 at 80m as a `HardwareTier === 'low'` branch. The seam exists but mobile pixel density (~400 PPI on a phone vs ~100 PPI on a desktop monitor) absorbs ~40% of the silhouette warp — the seam is roughly invisible at phone viewing distance even without desat.

This per-tier divergence is supported by the existing `HardwareTier` service ([js/HardwareTier.js](../js/HardwareTier.js)) shipped Cycle 23 Phase D for grass.

## The cycles

### Cycle 25 — LOD truth + validation infra (~6 days, ships `v1.6.0`)

**[`docs/cycle-25-plan.md`](cycle-25-plan.md)** — leads off the program.

- Phase A: validation infra (silhouette IoU, dE2000, screenshot golden suite, game-feel telemetry)
- Phase B: drop LOD1 desktop / preserve mobile-tier; extend LOD0 alphaHash crossfade band
- Phase C: drop desat strength to stylistic-only or zero; delete `AtmosphericDesatPatch.js` if seam is gone
- Phase D: re-tune fog from "structural mask" to "horizon haze only"
- Phase E: `?debug=lodmatch` overlay for durable regression
- Phase F: ship `v1.6.0`

What it earns: trees at 80m no longer pop. Distant trees fade naturally. ~80 LOC of patch code deletes cleanly.

### Cycle 26 — Atmospheric truth (~7 days, ships `v1.7.0`)

**`docs/cycle-26-plan.md`** — drafts at Cycle 25 close.

- Aerial-perspective LUT (32×32×32 R11G11B10F, ~196 KB) sampled from existing sky shader, regenerated when sun moves > 2°
- Height-fog `density(y) = ρ₀ * exp(-(y - y₀) / H)` replacing linear `THREE.Fog`
- All world materials sample LUT in `onBeforeCompile` — replaces `<fog_fragment>` chunk
- Per-scene authoring drops to ground albedo + horizon hue; 3 × `{near, far, color}` triples collapse to 6 shared tunables

What it earns: sun moves through atmosphere correctly. Ground reads green-tinted at high pitch, sky-tinted at horizon, automatically. Foundation for weather, day/night-in-game, rain.

### Cycle 27 — Impostor parity (~6 days, ships `v1.8.0`)

**`docs/cycle-27-plan.md`** — drafts at Cycle 26 close.

- Re-bake atlases at 8×4 lat-lon (azimuth doubled). Closes Cycle 20's deferred Q2 escalation.
- Padded-atlas mipmaps (Halen 2022 / HPG) — re-enables `generateMipmaps = true`. Kills distant-tree shimmer.
- Hybrid trunk-mesh + impostor canopy at the 100–200m band (Cycle 21 Phase 4 deferred).
- Sky-LUT-coupled impostor relighting — impostor reads same LUT as terrain.
- **Delete** `uMatchBoost` calibration LUT entirely (~40 LOC).

What it earns: impostor reads as same tree as LOD0, all camera angles, all times of day. Per-scene calibration LUT becomes unnecessary.

### Cycle 28 — Camera + game-feel (~6 days, ships `v1.9.0`)

**`docs/cycle-28-plan.md`** — drafts at Cycle 27 close.

- One state machine for all 3 modes; eliminate `_updateClassic / _updateFollow / _updateFree` divergence
- Per-mode zoom (Follow 12–40, Free 15–60, Classic 20–150)
- FOV-driven zoom (50° → 38° on pull-back) — cinematic compression
- Sprint dolly-zoom (+2° FOV, 0.4s ease)
- Velocity-quadratic touch sensitivity for Free cam (was constant 0.005)
- Optional gyro on mobile (DeviceOrientationEvent)
- Mode UI: segmented control with sliding indicator + live preview thumbnails (in-game chip + settings)
- Author-controlled cinematic camera (4th mode, scripted orbit per scene)
- Game-feel telemetry: input-to-onscreen-response latency probe shipped to validation harness

What it earns: every camera angle reads as intentional. Free-cam touch is responsive on mobile. Mode UI matches ScenePicker's visual language.

### Cycle 29 — Start screen + scene selection UX (~5 days, ships `v1.10.0`)

**`docs/cycle-29-plan.md`** — drafts at Cycle 28 close.

- Restructure `js/components/StartScreen/` flow: Mode → Scene → Dog → Settings (current order is Scene → Mode → Dog which gates dog selection on scene which doesn't make sense for solo).
- ScenePicker becomes the visual reference for the whole start screen — large hero-art card per scene, ToD preview cycler, descriptive subtitle.
- DogSelection: live preview of selected dog rendered in WebGL inset, pannable.
- ModeSelection: cooperative/competitive/timed shown as outcome-art ("3 dogs working together" / "race to corral" / "beat the clock") not text labels.
- Loading states: skeleton screens during scene swap + asset load. Currently `null` paints during the swap.
- Background scene: replace cinematic-camera-on-Field with a scripted orbit path that showcases the *selected* scene at golden-hour. Scene preview becomes part of selection feedback.
- Onboarding: first-time-visit tutorial overlay (5-step pointer tour). Skip-able. localStorage gates re-show.
- Polish: subtle transitions between screens, audio-cue on select, haptic feedback on mobile.

What it earns: start screen reads as a real game's main menu. New players don't need a tutorial to figure out the flow.

### Cycle 30 — Tree art direction + scene differentiation + ship `v2.0.0` (~8 days)

**`docs/cycle-30-plan.md`** — drafts at Cycle 29 close.

- 8-10 tree variants baked from EZ-Tree: 3 deciduous size grades, 2 birch, 2 conifer (re-introduced — Cycle 25's removal of LOD1 means conifers no longer carry the LOD1 silhouette risk), 1 dead/leafless, 1 fall-color.
- Per-scene tree distribution profiles. Field = English pasture (deciduous + landmark ancients). Rolling Hills = Mediterranean (mixed mid-scale). Open Country = Pacific Northwest (conifer + birch clumps).
- Embedded wind in impostor bake (Pixel Forge animated frames, modulate by sin(time) at runtime).
- Authored landmark trees per scene — 4–6 hand-placed at hero positions, marked in `sceneDef.landmarks`, skip Poisson placement around them.
- Final QA pass + `v2.0.0` tag.

What it earns: scenes feel like distinct places. Players remember the "ancient oak by the farmhouse" landmark. Trees animate at all distances.

## Validation infrastructure (cross-cycle)

Built in Cycle 25 Phase A, reused across 26-30. Lives at [`tools/validation/`](../tools/validation/) (new directory).

**Programmatic — silhouette + look match:**
- `tools/validation/lod-compare.mjs` — render LOD0/LOD1/LOD2 of same tree at same camera offset to off-screen render targets. Compute alpha-channel IoU (silhouette match), per-pixel dE2000 mean (color match), luminance-difference mean (look match). Output JSON to `cycleN-validation/phaseN/lod-match.json`.
- `tools/validation/screenshot-golden.mjs` — Playwright MCP-driven matrix capture: 3 scenes × 3 ToDs × 4 camera modes × 3 zoom levels = 108 captures. SSIM diff vs `tools/validation/golden/<scene>-<tod>-<mode>-<zoom>.png`. Fails CI on > 0.05 SSIM regression.

**Programmatic — game feel:**
- `tools/validation/input-latency.mjs` — synthetic key-press → frame-paint round-trip via Playwright. Targets: < 33ms (2 frames at 60fps) on RTX 3070, < 50ms on mid-tier phone.
- `tools/validation/frame-time-histogram.mjs` — record 600-frame frame-time distribution. p99 / p99.9 surfaced. Frame-pacing regression detector.
- `tools/validation/audio-visual-sync.mjs` — verify dog footsteps audio plays within 1 frame of foot-plant animation event.

**Manual — playtest cards:**
- Each cycle ships a `cycleN-validation/playtest-card.md` template with 8-12 specific scenarios for Matt to walk through. Goes beyond automated metrics to capture qualitative "does it feel right?" judgments.

## What gets deleted

Tracked here so future agents understand the program is **net-negative LOC** despite adding sophisticated systems:

- **Cycle 25:** `js/shaders/AtmosphericDesatPatch.js` (~130 LOC), `_desat*` fields in `TerrainBuilder` (~30 LOC), `setKilnImpostorDesat` plumbing (~20 LOC). **~180 LOC out.**
- **Cycle 26:** `THREE.Fog` integration (~40 LOC), per-scene `sceneDef.fog` triples (3 × 1 LOC × 3 fields = ~10 LOC). **~50 LOC out.**
- **Cycle 27:** `tools/generate-impostor-lut.mjs` (~120 LOC), `uMatchBoost` uniform plumbing (~40 LOC), `setImpostorMatchBoost` (~30 LOC). **~190 LOC out.**
- **Cycle 28:** `_updateClassic` vs `_updateFollow` vs `_updateFree` divergence — replaced by single state machine (~80 LOC condensed from ~250 LOC). **~170 LOC condensed.**

Net: **~590 LOC removed**, ~250 LOC added in `tools/validation/` + height-fog patch + per-mode zoom state. **~340 LOC net-negative**.

## What does NOT change

- Multiplayer architecture (Cycle 24's MP probe + reconnect grace stays)
- Sim-baseline fixtures (untouched)
- The `?cinematic=1` flag (deferred bug carryover)
- Heightfield amplitude bug (still a long-standing carryover; doesn't gate polish)
- Worker / D1 / Cloudflare deployment

## Risk register

1. **Phase B (Cycle 25) drops LOD1 on desktop — perf budget regression.** Hardware: RTX 3070 confirmed clear in cycle22 perf data. Risk: mid-tier desktop GPUs (GTX 1660 / Radeon 5600) might dip into 50fps. **Mitigation:** `HardwareTier === 'medium'` keeps meshopt LOD1 alongside `'low'`. Validate in Cycle 25 Phase A perf baseline before Phase B commits.
2. **Cycle 26 aerial LUT performance.** 3D texture sample per fragment on every patched material. Three.js does this for IBL routinely; risk is that our material count is high. **Mitigation:** profile LUT-sampling cost in Phase A of Cycle 26; if > 0.5ms per frame, fall back to per-vertex sampling.
3. **Cycle 27 8×4 atlas re-bake doubles atlas size** (4 MB per tree → 8 MB). Page weight regression. **Mitigation:** Pixel Forge supports KTX2/BC7 compression; bake in compressed format instead of PNG. ~2 MB per tree compressed.
4. **Cycle 28-29 UX redesign breaks existing user expectations.** Players who've internalized the current 3-button picker get whiplash. **Mitigation:** ship UX changes behind `?ui=v2` flag for one cycle; collect playtest feedback; flip default in Cycle 30.
5. **Cycle 30 conifer reintroduction surfaces art-direction debate.** Per Cycle 22's pine removal, deciduous-only was a deliberate choice. Re-introducing requires Matt's sign-off. **Mitigation:** ship Cycle 30 Phase 1 as deciduous-only variants first; conifer joins Phase 2 only with explicit go-ahead.

## Cycle 24 unchanged

Cycle 24's MP testing scope ships as planned for `v1.5.0`. Polish program kicks off at Cycle 25 only after Cycle 24 closes. The two optional Cycle 24 spikes (grass-trample, WebGPU) are **deferred into the polish program** as Cycle 26+ candidates rather than Cycle 24 phases — they no longer fit the cycle's MP-coverage scope.

## References

- [`docs/cycle-25-plan.md`](cycle-25-plan.md) — Cycle 25, the lead-off
- [`docs/cycle-24-plan.md`](cycle-24-plan.md) — Cycle 24 (in-flight, MP scope)
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`tools/validation/`](../tools/validation/) — programmatic harnesses (created Cycle 25 Phase A)
- Halen et al., HPG 2022 — padded-atlas mipmap technique (Cycle 27 Phase A reference)
- Bruneton & Hillaire — aerial-perspective precomputed LUT (Cycle 26 reference)
