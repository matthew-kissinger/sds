# Cycle 26 — media capture shot manifest (v2 — post v2.1.0)

> Refresh of [`shot-list.md`](shot-list.md) computed 2026-05-08 after
> v2.0.4 (Apple tone-mapping iOS extension) + v2.0.5 (dead
> AtmosphericDesatPatch deletion) + v2.1.0 (Practice Paddock +
> per-scene SEO) all shipped on `main`. **What follows is just the
> deltas** — open the original manifest as the spine, then apply each
> diff below before pairing the browser. Tier 1/2 shot definitions
> below are unchanged unless explicitly listed here.

## What changed since the v1 draft

| Slice | Effect on shoot |
|---|---|
| **v2.0.4 — iOS tone mapping** | iPhone gets Neutral instead of ACES. iPhone water sheen should be gone. Confirms the `?tonemap=aces` URL override still works for the meta-diptych. |
| **v2.0.5 — desat plumbing deleted** | No visible change on desktop / mobile-high. Slight cleanup for mobile-low LOD1 + kiln impostor (saturation no longer being multiplied-by-zero through dead pipeline). Saves ~0.5KB gzip. |
| **v2.1.0 — Practice Paddock + per-scene SEO** | New tile in mode picker. Pulsing glow on first visit (`localStorage.removeItem('sds.has-played')` to re-trigger). New PracticeHint overlay during play. Deep-link OG/Twitter cards now distinct per scene. |

## Tier 1 — diffs

### `og-{field,rh-sunset,open-country}-v2`
**Unchanged.** Still need the same captures. Frame remains as drafted.

### `hero-scenepicker`
**Unchanged.** Still capture the ScenePicker layout.

### `hero-mode-select` — **REPLACE WITH TWO SHOTS**

Original called for one screenshot of the Mode picker. Practice Paddock changes the canonical capture.

- **`hero-mode-select-first-visit`** — clear localStorage (`localStorage.removeItem('sds.has-played')`), reload, click into Mode picker. Practice tile pulses cyan. Capture mid-pulse (the keyframe is 2.4s ease-in-out — wait until the glow is at peak ~50% through cycle).
  - **Aspect:** 1920×1080
  - **Purpose:** PRESSKIT hero + onboarding-flow articles. Best frame to use in the trailer's "anyone can play" beat.
- **`hero-mode-select-persisted`** — same view but with `sds.has-played` set (just play any mode once). No pulse. Practice tile sits in normal position-0 row.
  - **Aspect:** 1920×1080
  - **Purpose:** SEO-meta + reference-state shot for the docs.

### `hero-dog-grid`
**Unchanged.**

### Trailer beats
**Unchanged.** Trailer-1/2/3 are scene-and-mode shots; Practice mode isn't a trailer beat candidate (the appeal is "low pressure," not "visual spectacle" — better suited to the onboarding clip in Tier 2).

### GIFs
**Unchanged.**

## Tier 2 — diffs

### Vertical clips
**Unchanged.**

### Steam capsule
**Unchanged.**

### MP gameplay / Mobile portrait / ToD timelapse
**Unchanged.**

### **NEW** — `vert-4-just-play-onboarding`
- **Scene:** field · **Mode:** practice · **Sun:** 0.45 (warm afternoon) · **Duration:** 8s · **Aspect:** 9:16 (1080×1920)
- **URL:** clear localStorage first, reload, click "Just Play" tile (capture the pulse-then-click motion). Continue into game.
- **Camera intent:** Follow camera, default zoom. Capture the PracticeHint overlay (visible bottom-center for 8s OR until first input). Player WASDs gently to dismiss the hint, then walks toward the small flock.
- **Sim:** liveAction
- **Purpose:** The "anyone can play this in 30 seconds" social clip. Tighter than the existing herd-the-1000 trailer. Onboarding visual that pairs with launch-post copy.

## Tier 3 — diffs (now-unblocked)

### `practice-paddock-hero` — **UNBLOCKED**
Practice mode now exists. Promote to a Tier 1 candidate if Matt has the budget.

- **Scene:** rolling-hills · **Mode:** practice · **Sun:** 0.20 (golden) · **Aspect:** 1920×1080
- **Camera intent:** elevated wide showing the dog mid-meadow with the 30 sheep dispersed across the rolling terrain. Generous negative space. Pose around `pos: { x: 30, y: 30, z: 60 }, target: { x: 0, y: 4, z: 0 }`.
- **Sim:** liveAction; waitForFlockSize(30)
- **Purpose:** "Just Play" landing-page hero. Sells the no-pressure mode in one frame.

### `tutorial-overlay` — **STILL BLOCKED** (full first-run tutorial overlay was deferred by cycle plan)
The lightweight PracticeHint counts as a partial — captured in `vert-4-just-play-onboarding`.

### `mac-fix-before-after-meta` — **UPDATED context**
v2.0.4 extended the Apple branch to iPhone. The "after" frame should now be on iPhone, not Mac (more dramatic — the water sheen was bigger on iPhone than the Mac fog wash). Pre-fix capture: force `?tonemap=aces` on iPhone Safari to reproduce. Post-fix: default load.

### `scene-swap-shimmer` / `free-cam-cinematic` / `hud-walkthrough`
**Unchanged.** Still speculative.

## NEW — Per-scene OG validation captures (post-deploy)

Now that v2.1.0 wires distinct OG metadata per scene, validate the rendered cards via the social platforms' debuggers. These are NOT raw screenshots — they're proof-of-render captures via:

- **OG Twitter:** [Twitter Card Validator](https://cards-dev.twitter.com/validator) — paste `https://sheepdogsim.com/?scene=field`, `?scene=rolling-hills`, `?scene=open-country`. Capture the preview card it renders.
- **OG Facebook:** [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) — same three URLs. Capture preview.
- **OG generic:** [opengraph.xyz](https://opengraph.xyz) — same three URLs.

**Output:** save validator screenshots to `cycle26-validation/og-validations/` so we have evidence each scene previews correctly across platforms. These aren't part of the 22-shot manifest but are part of v2.1.0 ship validation.

## Working-agreement reminders

Unchanged from `shot-list.md`. Repeating the load-bearing points:

- **Claude pre-decides** scene, ToD, sun position, camera mode + suggested distance/yaw, dog pose intent, sheep state, aspect, filename, purpose. **All of that is in this v2 manifest + the v1 spine.**
- **Matt drives** the browser: free-flies camera, positions dog, says "snap" or "record" / "stop." No creative decisions during the session — they're already settled.
- **Output paths** stay `assets/marketing/captures/cycle26/raw/<id>.png` for stills, `clips/<id>.{webm,gif}` for video.
- **End-of-session review:** walk the manifest together, mark `kept` / `redo` / `skip`.

## Recommended session order (refreshed)

1. **Pre-shoot — clear browser state.** `localStorage.clear()` so Practice tile pulses on the first capture.
2. **Field block:**
   - `hero-mode-select-first-visit` (FIRST — captures the pulse)
   - `hero-mode-select-persisted` (after any mode launched once)
   - `og-field-v2`, `hero-dog-grid`, `trailer-2-sprint-dollyzoom`, `trailer-3-chaos5000-orbit`, `gif-chaos-5000-loop`
   - `vert-4-just-play-onboarding` (NEW — Tier 2 promotion candidate)
3. **RH block:**
   - `practice-paddock-hero` (NEW — Tier 1 promotion candidate)
   - `og-rh-sunset-v2`, `trailer-1-establishing`, `gif-lightning-zap`
4. **OC block:** `og-open-country-v2`, `gif-portal-ascend`
5. **Vertical block (Tier 2):** re-frame Tier 1 setups
6. **Steam capsule block (Tier 2):** derive from RH/OC stills
7. **OG validations (post-deploy):** Twitter / Facebook / opengraph.xyz

## Open questions for the live session

Inherited from `shot-list.md` §"Open questions" — refreshed:

1. **Tier scope** — same question. Recommend Tier 1 + the two newly-unblocked v2.1.0 shots (`practice-paddock-hero`, `vert-4-just-play-onboarding`) → ~3.5 hours.
2. **Trailer NLE** — same.
3. **Music / VO** — same.
4. **Cinema runner fix** — still parked.
5. **Pre-fix iOS capture** — Matt's iPhone already shipped to v2.0.4, but `?tonemap=aces` URL override forces the old behavior back. Worth one diptych shot if Matt's phone is handy.
6. **localStorage state** between captures — start every session with `localStorage.clear()` so first-visit captures are repeatable.
