# Cycle 26 — media capture shot manifest (draft)

> Drafted 2026-05-07 ahead of `/cycle-start`. This is a menu — at
> `/cycle-start` we pick a subset, drop what's not worth the bandwidth,
> and add anything Matt has in mind. Then we pair the browser and Matt
> drives positioning while Claude captures.

## Working assumptions

- **URL pattern:** `https://sheepdogsim.com?cinematic=1&ui=off&scene=<id>&sun=<0..1>` (live deploy = always v2.0.3+ post-Mac-fix). Locally swap to `http://localhost:3000` if we want to test pre-deploy changes.
- **Capture host:** Matt's Windows PC (RTX 3070), 1920×1080 native + 2x DPR for hi-res stills. Claude-in-Chrome MCP for pairing.
- **`__sdsCinema` API used:** `freeFly()`, `lockFly()`, `setSun(t)`, `pauseSimulation()`, `resumeSimulation()`, `waitForFlockSize(n)`, `triggerLightning(pos)`, `swapScene(id)`, `mountDogShowcase(dogId)`, `snapshotPose()`.
- **Output paths:** stills → `assets/marketing/captures/cycle26/raw/<id>.png`; clips → `assets/marketing/captures/cycle26/clips/<id>.{webm,gif}`.
- **Aspect ratios:** 16:9 (1920×1080) for hero stills + trailer beats; 9:16 (1080×1920) for vertical; 1:1 (1080×1080) for square; 1200×630 for OG; 460×215 + 616×353 + 1920×620 for Steam capsule set.
- **Existing baseline to refresh, not duplicate:** `assets/marketing/og/og-{field,rh-sunset,open-country}.webp` (Cycle 19, pre-v2.0). The cycle-25 ScenePicker rewrite + Mac fix both change visuals enough to justify a re-shoot.

## Scenes — what each one is for

| Scene id | Display name | What sells it | Best ToD for shots |
|---|---|---|---|
| `field` | Home Field | Flat, manicured, "starter pasture" — clean composition, fence + farmhouse for landmarks | Noon (`sun=0.5`) for daytime hero; golden hour (`sun=0.18`) for warmth |
| `rolling-hills` | Sheep Dog Island | Hero scene — rolling heightfield + island corral + water + Mediterranean tree mix. Most cinematic | Dusk (`sun=0.06`) for hero; golden (`sun=0.20`) for daytime; noon for clarity |
| `open-country` | Open Country | Big island, Pacific-NW conifers + woods, north-shore portal vortex, 380m radius | Mid-afternoon (`sun=0.45-0.55`) for portal visibility; pre-sunset (`sun=0.30`) for woods drama |

## Modes — sheep counts and pacing

| Mode | Sheep | Reads as | Best for |
|---|---|---|---|
| `classic` | 200 | Calm, comprehensible | Onboarding clips, walkthrough, OG stills |
| `extreme` | 1000 | "Real challenge" | Hero shots — dense flock fills frame |
| `insane` | 3000 | Visually overwhelming | Wide establishing, orbital shots |
| `chaos` | 5000 | Showcase / meme | "Chaos 5000" social-media bait, GIFs |
| `timed` | 200 | Goal-driven variant | Skip for now — visually identical to classic |

## Dogs — character shots

5 portrait shots already exist at `assets/dogs/<id>.{webp,png}` from Cycle 11. Pre-Mac-fix and pre-v2.0 styling — worth a Cycle 26 refresh if dog selection picker is overhauled. Otherwise leave as-is.

| Dog | Stats (spd/sta/ctl) | Color | Personality angle |
|---|---|---|---|
| jep | 3 / 4 / 4 | blue | Balanced default; PWA icon dog |
| pip | 5 / 3 / 3 | amber | Speedster — sprint clips |
| sally | 2 / 4 / 5 | pink | Control-focused — precise corral arrival |
| shiloh | 3 / 5 / 3 | green | Endurance — long-haul herding |
| george_washington | 3 / 4 / 3 | violet | Joke pick — narrative/social-bait shot |

---

## Tier 1 — must-haves (~12 shots)

These cover the minimum to refresh the public-facing presence: 3 OG cards, 3 hero stills for the start screen, hero trailer beats (3), and 3 social-media GIFs. ~2-3 hour session.

### Static — OG card refresh

#### `og-field-v2`
- **Scene:** field · **Mode:** classic · **Sun:** 0.50 (noon)
- **Aspect:** 1200×630
- **Camera intent:** mid-distance behind-dog overlook, fence + farmhouse visible mid-frame, sheep cluster mid-distance. Pose target near `pos: { x: 30, y: 14, z: 40 }`, target `{ x: 0, y: 1, z: 0 }`.
- **Sim:** paused after waitForFlockSize(200) — clean static composition.
- **Purpose:** replaces `assets/marketing/og/og-field.webp`. Used in Open Graph + Twitter cards when Field is the deeplink.

#### `og-rh-sunset-v2`
- **Scene:** rolling-hills · **Mode:** extreme (1000) · **Sun:** 0.06 (dusk)
- **Aspect:** 1200×630
- **Camera intent:** behind-dog low overlook with horizon at the rule-of-thirds upper line. Existing pose `pos: { x: -102.7, y: 38, z: -21.4 }, target: { x: -110.5, y: 34.6, z: -40.3 }` worked for v1 — try again with fresh ToD.
- **Sim:** liveAction (don't pause) — the dispersed flock IS the composition.
- **Purpose:** hero OG. Replaces existing `og-rh-sunset.webp`.

#### `og-open-country-v2`
- **Scene:** open-country · **Mode:** classic · **Sun:** 0.45 (mid-afternoon, portal lit)
- **Aspect:** 1200×630
- **Camera intent:** elevated wide showing portal at z=295 + south-spawn cluster + woods middle band. Pose around `pos: { x: 0, y: 60, z: -20 }, target: { x: 0, y: 5, z: 100 }`.
- **Sim:** paused.
- **Purpose:** replaces `og-open-country.webp`.

### Static — start-screen heroes (1920×1080)

#### `hero-scenepicker`
- **URL:** `?ui=on&cinematic=1` (start-screen visible) · **Scene:** N/A (start screen) · **Sun:** N/A
- **Aspect:** 1920×1080
- **Camera intent:** native start-screen render. We're capturing the new ScenePicker single-card flippable layout (v2.0.2+), not the gameplay scene.
- **Sim:** N/A.
- **Purpose:** PRESSKIT.md refresh + above-the-fold landing-page asset + Reddit launch post hero image.

#### `hero-mode-select`
- **URL:** start screen, click into Mode picker
- **Aspect:** 1920×1080
- **Camera intent:** mode picker UI panel showing Classic/Extreme/Insane/Chaos.
- **Purpose:** SEO meta + how-to articles + the future Practice Paddock tile when added.

#### `hero-dog-grid`
- **URL:** start screen, click into Dog picker
- **Aspect:** 1920×1080
- **Camera intent:** all 5 dogs visible in grid with one selected.
- **Purpose:** PRESSKIT + dog showcase social posts.

### Trailer beats (video, 4-8s each, MP4-ready via OBS)

#### `trailer-1-establishing`
- **Scene:** rolling-hills · **Mode:** extreme · **Sun:** 0.20 (golden) · **Duration:** 6s
- **Camera path:** slow drone descent — start `pos: { x: 0, y: 80, z: 120 }, target: { x: 0, y: 0, z: 0 }` → end `pos: { x: 0, y: 30, z: 60 }, target: { x: 0, y: 0, z: 0 }`
- **Sim:** liveAction; waitForFlockSize(1000)
- **Purpose:** opening establishing beat for 30s hero trailer

#### `trailer-2-sprint-dollyzoom`
- **Scene:** field · **Mode:** classic · **Sun:** 0.40 · **Duration:** 4s
- **Camera intent:** behind-dog Follow camera; Matt holds Shift to sprint, the new dolly-zoom kicks in (FOV +2°, 0.4s ease)
- **Sim:** liveAction; player-driven dog
- **Purpose:** showcases the sprint dolly-zoom feature shipped Cycle 25 Phase E

#### `trailer-3-chaos5000-orbit`
- **Scene:** field · **Mode:** chaos (5000) · **Sun:** 0.50 · **Duration:** 8s
- **Camera path:** orbital, radius 80m, height 25m, ~40% sweep (existing helper: `orbital({ radius: 80, height: 25, target: {0,0,0}, fullCircle: false, sweep: 0.4 })`)
- **Sim:** liveAction; waitForFlockSize(5000) (~15s spawn time)
- **Purpose:** "5000 sheep" — the social-media headline beat

### GIFs (Reddit / Discord / dev-Twitter, ≤5MB)

#### `gif-chaos-5000-loop`
- **Scene:** field · **Mode:** chaos · **Sun:** 0.50 · **Duration:** 3-5s loop
- **Camera intent:** static elevated wide; let the boid swarm dynamics carry the visual interest
- **Sim:** liveAction
- **Purpose:** r/threejs + r/IndieDev + Twitter teaser — "5000 sheep in your browser"

#### `gif-portal-ascend`
- **Scene:** open-country · **Mode:** classic · **Sun:** 0.45 · **Duration:** 5s
- **Camera intent:** static medium shot framing the portal at z=295 from ~60m away. Wait for first sheep to enter the portal trigger zone.
- **Sim:** liveAction; player herds 1-2 sheep into the portal
- **Purpose:** "wait, where do the sheep GO?" social hook

#### `gif-lightning-zap`
- **Scene:** rolling-hills · **Mode:** classic · **Sun:** 0.40 · **Duration:** 3s
- **Camera intent:** static wide, `pos: { x: 0, y: 35, z: 80 }, target: { x: 0, y: 0, z: 0 }`. Trigger `__sdsCinema.triggerLightning({ x: 0, y: 0, z: 10 })` mid-clip.
- **Sim:** liveAction
- **Purpose:** "lightning strike on the flock" — short bait clip

---

## Tier 2 — nice-to-have (~10 shots)

If Tier 1 went smoothly, layer these in. ~1-2 additional hours.

#### Vertical clips (9:16, for TikTok / Reels / Shorts)

- **`vert-1-dog-into-flock`** — field, classic, sun 0.45, 6s. Dog runs into the heart of the flock (player driven). Vertical framing centered on dog.
- **`vert-2-portal-rush`** — open-country, classic, sun 0.45, 8s. Player corrals 5-10 sheep into the portal. Vertical framing on the portal.
- **`vert-3-sunset-pasture`** — rolling-hills, extreme, sun 0.06, 8s. Static-ish high-angle of the dispersed flock at dusk.

#### Steam-style capsule

- **`steam-capsule-main`** — 616×353, RH dusk hero (re-frame `og-rh-sunset-v2`)
- **`steam-capsule-small`** — 460×215, same scene, tighter crop
- **`steam-capsule-header`** — 1920×620, OC portal wide

#### MP gameplay

- **`mp-coop-2dogs`** — 2-tab MP session with both dogs visible. Static elevated shot. Useful for "real-time co-op" press-kit claim.

#### Mobile portrait

- **`mobile-portrait-classic`** — 412×915 viewport simulated via DevTools. Field classic, mobile HUD visible. Sells the "mobile-ready" claim.

#### ToD timelapse

- **`timelapse-tod-rh`** — rolling-hills, classic, paused sim, sun sweeps 0.0→1.0→0.0 over 8s. Showcases the Hosek-Wilkie sky.

---

## Tier 3 — speculative / nice-when-time-permits (~6 shots)

Don't pursue unless cycle has runway. Skip if cinema runner stays broken.

- **`mac-fix-before-after-meta`** — diptych still showing pre-Mac-fix wash next to post-fix corrected scene. Tech-Twitter post angle. Requires capturing pre-fix on a Mac (`?tonemap=aces` to force the bug back on a Mac browser). Meta-content; only if a Mac is paired.
- **`scene-swap-shimmer`** — captures the shimmer-skeleton scene-swap overlay (Cycle 25 Phase F) mid-transition. UX showcase.
- **`free-cam-cinematic`** — 12s scripted free-cam orbit at golden hour, RH. Stand-in until cinema runner is fixed.
- **`hud-walkthrough`** — annotated screenshot showing stamina bar, sheep counter, objective banner, camera mode chip. For a "controls explained" devlog post.
- **`practice-paddock-hero`** — hero shot of the new no-pressure mode. **BLOCKED:** mode doesn't exist yet; ships in this cycle.
- **`tutorial-overlay`** — first-run tutorial overlay screenshot. **BLOCKED:** doesn't exist yet.

---

## Session script — recommended order

To minimize scene-loads + ToD changes per session:

1. **Field block** (Tier 1: og-field-v2, hero-scenepicker, hero-mode-select, hero-dog-grid, trailer-2-sprint-dollyzoom, trailer-3-chaos5000-orbit, gif-chaos-5000-loop). Stay on Field, vary sun/mode.
2. **RH block** (og-rh-sunset-v2, trailer-1-establishing, gif-lightning-zap). Stay on RH, vary sun/mode.
3. **OC block** (og-open-country-v2, gif-portal-ascend). Stay on OC.
4. **Vertical block** (Tier 2 verticals if pursued) — re-frame Tier 1 setups in 9:16 if possible to skip recapture.
5. **Steam capsule block** (Tier 2) — derived from RH/OC stills.
6. **Misc** — mobile portrait, MP coop, mac-fix diptych, etc.

End-of-session review: walk the manifest, mark each `kept` / `redo` / `skip`. Schedule a follow-up session for redos.

---

## Open questions for `/cycle-start`

1. **Tier scope.** Tier 1 only, or Tier 1+2? Tier 1 is ~3 hours; Tier 1+2 is ~5.
2. **Trailer NLE.** Matt edits the 30s trailer in DaVinci/CapCut after the session. Do we want a rough storyboard now or just hand off raw clips?
3. **Music / VO.** Trailer needs audio. Out of scope for the capture session, but should we plan a music brief now?
4. **Cinema runner fix.** Worth bundling into this cycle? Would let us batch-recapture on demand without manual sessions.
5. **Pre-fix Mac capture.** Worth chasing the meta-content angle (`mac-fix-before-after-meta`) or skip?
6. **Practice Paddock dependency.** Some Tier 3 shots depend on the new mode existing. Order: build mode first, then capture? Or capture-first with the existing modes and re-shoot when Practice Paddock lands?

---

## Reference — existing assets to compare against

- `assets/marketing/og/og-field.webp` — pre-v2.0 baseline
- `assets/marketing/og/og-rh-sunset.webp` — Cycle 12, hero shot pre-Mac-fix
- `assets/marketing/og/og-open-country.webp` — pre-v2.0
- `assets/dogs/{jep,pip,sally,shiloh,george_washington}.webp` — Cycle 11 portraits
- `assets/images/sds-{zoomedout,zoomedin-play,menu,dog-selection}.png` — pre-v1.1 baseline (PRESSKIT.md)
- `tools/cinematic/shot-list.mjs` — original shot definitions (cinema runner blocked by font-wait timeout)
