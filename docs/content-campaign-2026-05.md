# Content Campaign — May 2026 Update

Goal: produce a small, honest content pack for the post-Cycle-35 state of Sheep Dog Sim: Three.js Discord update, devlog post, screenshots, short gameplay clips, and later social crops. This is not a version-release plan. It is a media and writing plan for showing the current game clearly in Matt's voice: candid, a little self-aware, technically specific, and not corporate. For the immediate Discord update, use the current image only; do not wait on MP4s.

## Positioning

The update should read as: "I posted this when it was basically 'can I make a sheepdog push a boid flock around in WebGL without it feeling terrible?' It has gotten a little out of hand since then."

Tone rules:

- Keep the direct first-person voice.
- Say what changed without sounding like a studio press release.
- Leave the caveats in the post; they make the update more credible.
- Prefer concrete phrases like "WebGL water on iPhones became its own little side quest" over generic polish language.
- Aim at the Three.js Discord culture: technical enough to be useful, honest enough to invite real criticism, not a marketing victory lap.
- Do not over-explain the capture failures in the Discord post. Save that detail for docs/devlog.

Do not overclaim multiplayer. The correct caveat is:

> Multiplayer was migrated to Cloudflare Workers + Durable Objects and the unit/integration harnesses are green, but I have not done a proper paired multiplayer playtest since the latest island-scene/objective migration. Treat MP as in active validation, not fully re-certified.

## Proof Points To Mention

- Three.js WebGL game, React UI layer without JSX, Vite build.
- GPU-instanced sheep and grass; large flocks remain the visual hook.
- Three scenes now matter: Sheep Dog Island/Rolling Hills, Open Country, and Field.
- Sheep Dog Island is the current hero scene.
- Open Country has a multi-stage round-up to portal objective.
- Real iOS Safari water regression canary exists and passed against production on 2026-05-12.
- Leaderboards are now scene-scoped; score errors and telemetry are observable through D1.
- Cloudflare Pages + Worker + Durable Objects + D1 replaced the older hosting stack.
- Code is MIT licensed and public.

## Asset Pack

Current Discord image:

```text
assets/marketing/og/og-rh-sunset.webp
C:\Users\Mattm\X\games-3d\sds\assets\marketing\og\og-rh-sunset.webp
```

Treat older screenshots under `assets/images/`, `cycle*-validation/`, and old capture folders as historical/reference material unless they are explicitly recaptured for the current visual state. The current screenshot-led Discord post should use the Sheep Dog Island sunset OG image above.

Generated assets live under:

```text
assets/marketing/content/2026-05-update/generated/
```

That folder is gitignored because it contains large videos and regenerable images. Durable capture scripts and writing drafts are committed.

Status on 2026-05-12: use the current image for the Discord update and do not attach generated MP4s. Do not treat the current generated video files as publishable. Validation found three capture failures:

- Playwright viewport video recorded setup/wait time; a 6.2s `sdi-dog-pass-low` shot produced a 116.4s MP4.
- `canvas.captureStream()` + `MediaRecorder` returned a zero-byte WebM in this Windows/headless Chromium setup.
- Per-frame canvas export from Playwright was far too slow for iteration: only 57 JPEG frames in roughly 15 minutes.
- The first successful headed Mediabunny encode proved the recorder path but failed the creative brief: the low dog-pass camera was below/at the waterline and did not show the intended land-based herding action. Treat it as rejected calibration evidence, not a usable clip.
- Follow-up dog-track and living-title experiments on 2026-05-13 improved the recorder path but still failed trailer/post quality: framing was too tree-occluded, too dark, or not clean enough for a first update. Treat all generated videos in this campaign folder as review-only until explicitly accepted.

The current runner remains useful as shot-list scaffolding, but capture execution is paused by default because still-image capture also timed out in validation. The video path needs the capture-lab redesign below before producing final assets. For now, the generated MP4s are review-only diagnostics, not campaign assets.

The capture technology spike is tracked in [`capture-pipeline-spike-2026-05.md`](capture-pipeline-spike-2026-05.md). Current recommendation: use an SDS shot director plus browser-side `canvas-record`/WebCodecs capture for master clips; keep Remotion for editorial assembly after gameplay clips exist.

List the current shot plan:

```bash
node tools/content-capture.mjs --list
```

Experimental variants while rebuilding the capture lab:

```bash
node tools/content-capture.mjs --experimental-run --shot=sdi-dog-pass-low
node tools/content-capture.mjs --experimental-run --headed
```

## Next Visual Prep Before New Captures

Before producing another screenshot or video batch, do a visual/performance prep pass instead of trying to tune around the current scene state.

- Check the current `@dgreenheck/ez-tree` release and deliberately adopt the latest acceptable EZ-Tree update.
- Re-run the tree pipeline from [`tree-pipeline.md`](tree-pipeline.md): clear `assets/_originals/models/trees/*.glb`, run `npm run bake-trees`, then run `npm run compress-glbs`.
- If the tree shape or canopy silhouette changes, re-run `npm run bake-tree-impostors` and `npm test -- tests/imposter-sidecar.spec.js`.
- Add a spacing acceptance check for tree placement before recapturing: no two trees should read as stacked, merged, or too close together from the main Sheep Dog Island and Open Country camera angles.
- Validate tree spacing through `tests/tree-placement.spec.js` plus at least one browser screenshot review. If spacing needs code changes, update the deterministic placement contract intentionally and record the acceptance in the active cycle plan.
- Run an optimization pass before capture so the visuals shown in the post are not hiding obvious perf debt.

## Capture-Lab Redesign

Professional footage should come from an in-game shot director plus a thin recorder, not from trying to screen-record the whole boot flow.

Phase 1: add a capture director inside the cinematic API.

- `loadShot(id)` loads the scene, starts the solo mode, hides UI, prewarms shaders/assets, waits for the flock target, and returns explicit readiness.
- `seekShot(tMs)` owns camera pose, dog pose, sun, and any shot-specific flock setup for exactly one timestamp.
- `renderShotFrame(tMs)` advances the capture simulation on a fixed timestep, renders once, and reports a frame checksum or pixel sample for validation.
- Camera paths should use named rigs: orbit, low dog pass, flank arc, crane rise, follow-dog, and portal drive.

Phase 2: add a fast proof recorder.

- Use a headed, hardware-accelerated browser for proof captures. Avoid SwiftShader for media.
- Prefer Puppeteer `page.screencast()` or OBS WebSocket-controlled recording for quick preview clips.
- Proof clips are for framing, Discord drafts, and camera-path review; they are not final masters.

Phase 3: add a master recorder.

- Avoid per-frame `toDataURL()` round trips through Playwright.
- Preferred browser-native path: WebCodecs encodes `VideoFrame(canvas, { timestamp })` inside the page, then Node receives one completed WebM/MP4 blob.
- Preferred offline fallback: write image frames from inside the browser or a local capture endpoint, then encode with ffmpeg at fixed fps.
- Final encode target: H.264 MP4, `yuv420p`, CRF 18-21, `+faststart`, plus a lighter WebM or 720p derivative if needed.

Phase 4: validate every produced clip before posting.

- Duration must match the shot spec within 0.25s.
- First and last frame must be gameplay, not menu/setup.
- Dog must be visible and moving naturally for the intended beat.
- Water/terrain/grass must render without blank frames or WebGL fallback warnings.
- Manifest records capture method, fps, duration, resolution, bytes, and poster path.

## Shot List

Primary clips:

- `sdi-living-title.mp4` - clean canvas-only living-title shot: calm menu-camera mood, dog herding sheep, no overlay.
- `sdi-orbit-flock.mp4` — angled overhead orbit around Sheep Dog Island, with Jep moving in a flank arc behind the flock.
- `sdi-herding-arc.mp4` — wide herding-pattern read: dog sweeps from left flank to right flank behind sheep.
- `sdi-dog-pass-low.mp4` — foreground screen-space pass: dog runs left-to-right across camera.
- `oc-wide-portal-drive.mp4` — Open Country scale and portal-facing drive line.

Still images:

- `sdi-hero-overlook.webp/png` — devlog hero image.
- `sdi-dog-action.webp/png` — dog and sheep action shot.
- `oc-portal-poster.webp/png` — Open Country portal scene.
- `field-grass-scale.webp/png` — classic field fallback context.

## Iteration Notes

When judging captures, prioritize:

- Dog readable in frame for at least 2 seconds.
- Dog movement crosses screen space or makes a flank/drive arc.
- Sheep movement is visible, not just a static flock.
- Water/shoreline visible in at least one Sheep Dog Island shot.
- No React HUD or start-screen overlay in trailer clips. A "living title" shot can use the start-screen world mood, but the export remains clean canvas footage.
- 720p Discord-friendly exports are fine, but keep the 1280x720 masters.

If a clip feels flat, adjust `dogPath` before camera path. The user ask is specifically for the dog to move naturally in the shot; scenery-only clips are secondary.

## Publish Order

1. Three.js Discord update with the current Sheep Dog Island sunset image only.
2. Devlog draft stays image-led until the optimization, EZ-Tree, spacing, and capture-lab work above produces clean new media.
3. Later devlog post with 3-4 images, optional embedded clips, and a transparent "what is still being validated" section.
4. Update README or public devlog only after the devlog copy feels accurate.

Do not post a generated clip until it passes the capture-lab validation above. The current Discord update is intentionally screenshot-led.

## Hard Caveats

- Do not claim MP is fully re-tested until the paired Open Country MP playtest is done.
- Do not claim the game is "finished"; say "current production build" or "latest public build."
- Do not imply WebGPU migration. This project is currently WebGL/Three.js and that is fine for this scope.
- Do not hide the mobile feedback history; say mobile controls have been rebuilt and real iOS Safari is now part of validation.
