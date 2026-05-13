# Capture Pipeline Spike - May 2026

Purpose: choose a professional, repeatable way to create Sheep Dog Sim screenshots and gameplay clips for the May 2026 content campaign without misrepresenting the current game or building a separate visual truth.

## Current Finding

The first Playwright-driven capture runner is useful as a shot-list scaffold, but it is not a publishable recorder.

Validation on 2026-05-12 found:

- Playwright viewport video captured boot/setup time. A 6.2 second shot produced a 116.4 second MP4.
- `canvas.captureStream()` plus `MediaRecorder` returned a zero-byte WebM in this Windows/headless Chromium setup.
- Per-frame canvas export through Playwright was too slow for iteration: 57 JPEG frames in roughly 15 minutes.
- Still-image capture also timed out, and the one recovered image was not good enough to publish.
- Direct Mediabunny capture compiled and wrote a valid headed/hardware H.264 MP4, but the first shot framing was wrong: the camera was below/at the waterline. The recorder is viable; the shot director needs terrain-aware calibration before assets are publishable.

Conclusion: stop trying to screen-record the full page lifecycle. Build an in-game shot director and record from inside the page after the scene is ready.

## Requirements

- Record the real SDS runtime, not a rebuilt marketing-only scene.
- Keep camera, dog, and flock motion scriptable by shot id.
- Make dog movement readable: side-to-side camera-space pass, flank arc, or natural drive pattern.
- Produce 1280x720 masters at 30 fps for short clips, plus stills.
- Avoid React HUD and start-screen overlay in trailer masters. Use canvas-only shots; if borrowing the start-screen mood, capture the living world behind it, not the DOM overlay.
- Export a manifest per asset with method, fps, dimensions, duration, bytes, poster, and validation result.
- Fail closed if the first/last frame is setup/menu/blank or if the dog is not visible for the intended beat.

## Repos Cloned For Spike

Local clones live under `examples/capture-spike/repos/`. That folder is gitignored because these are research references, not vendored dependencies.

| Candidate | Local path | Fit | Notes |
|---|---|---|---|
| [Mediabunny](https://github.com/Vanilagy/mediabunny) | `examples/capture-spike/repos/mediabunny` | Best first implementation | Pure TypeScript media toolkit for MP4/WebM/etc. `CanvasSource.add(timestamp, duration)` is the cleanest match for SDS fixed-frame capture without depending on a broad recorder wrapper. |
| [canvas-record](https://github.com/dmnsgn/canvas-record) | `examples/capture-spike/repos/canvas-record` | Useful wrapper/reference | Browser-side canvas recorder with WebCodecs, Mediabunny, frame sequence, MediaCapture, and ffmpeg-style encoder options. Its API is close to what SDS needs, but it pulls more encoder dependencies than the direct Mediabunny path. |
| [WebAV](https://github.com/WebAV-Tech/WebAV) | `examples/capture-spike/repos/webav` | Possible fallback | WebCodecs SDK oriented around web video editing and MP4 output. Useful if its recorder path proves easier than direct Mediabunny integration. |
| [Remotion Three template](https://github.com/remotion-dev/template-three) | `examples/capture-spike/repos/remotion-template-three` | Editorial layer, not primary capture | Strong for deterministic React/R3F compositions, title cards, cuts, captions, and final assembly after gameplay clips exist. Not a natural primary recorder for the current vanilla Three.js runtime. |
| [CanvasCapture](https://github.com/amandaghassaei/canvas-capture) | `examples/capture-spike/repos/canvas-capture` | Reference only | Helpful API ideas, but depends on older CCapture/ffmpeg.wasm paths and has cross-origin isolation/SAB constraints for MP4. |
| [CCapture.js](https://github.com/spite/ccapture.js) | `examples/capture-spike/repos/ccapture-js` | Concept reference only | Its fixed-timestep capture model is still relevant, but it monkeypatches timing globals and is older WebM/GIF/frame-sequence technology. |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | `examples/capture-spike/repos/mp4-muxer` | Historical reference only | Deprecated by its author in favor of Mediabunny. Useful for understanding older WebCodecs muxing examples, not for new SDS code. |
| [W3C WebCodecs samples](https://github.com/w3c/webcodecs) | `examples/capture-spike/repos/webcodecs-samples` | API reference | Official-ish samples show the raw building blocks: `MediaStreamTrackProcessor`, `VideoEncoder`, worker-side encoding, and WebM writing. Useful for debugging but lower-level than SDS should own. |
| [puppeteer-capture](https://github.com/alexey-pelykh/puppeteer-capture) | `examples/capture-spike/repos/puppeteer-capture` | Deterministic fallback to test | Uses Chrome `HeadlessExperimental.beginFrame`, virtual time, and ffmpeg for frame-perfect page capture. More promising than realtime screencast if browser-side WebCodecs hits WebGL readback problems. |
| [puppeteer-screen-recorder](https://github.com/prasanaworld/puppeteer-screen-recorder) | `examples/capture-spike/repos/puppeteer-screen-recorder` | Proof/reference only | CDP screencast wrapper with ffmpeg output. Easier than raw recording APIs but still realtime screencast, so it belongs in proof capture, not master capture. |

Related official docs:

- [Playwright videos](https://playwright.dev/docs/videos) - useful for debugging and proof artifacts, not precise gameplay masters.
- [Puppeteer `page.screencast()`](https://pptr.dev/api/puppeteer.page.screencast) - possible fast proof recorder.
- [MDN `canvas.captureStream()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream) - useful API, but failed in this local headless run.
- [MDN WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), [MDN WebCodecs usage](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API), and [Chrome WebCodecs guide](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) - preferred browser-native encoding path.
- [Mediabunny CanvasSource](https://mediabunny.dev/api/CanvasSource), [Mediabunny media sources](https://mediabunny.dev/guide/media-sources), and [Mediabunny output formats](https://mediabunny.dev/guide/output-formats) - direct route for canvas frames to MP4/WebM with backpressure-aware frame adding.
- [Three.js screenshot tips](https://threejs.org/manual/en/tips.html) - useful for still capture and preserve-drawing-buffer tradeoffs.
- [OBS launch parameters](https://obsproject.com/kb/launch-parameters) and [obs-websocket](https://github.com/obsproject/obs-websocket) - fallback for hardware proof recording.
- [FFmpeg devices](https://www.ffmpeg.org/ffmpeg-devices.html) - fallback for desktop/window capture.

## Remotion Assessment

The installed `remotion-best-practices` skill and cloned Remotion Three template both point to the same rule: Remotion 3D content should be deterministic React Three Fiber inside `<ThreeCanvas>`, animated from `useCurrentFrame()`. Self-running animation loops and `useFrame()` are not appropriate for frame-accurate rendering.

That is good Remotion architecture, but it is not how SDS currently renders gameplay. SDS is an imperative Three.js game with stateful boot, scene loading, flock simulation, grass, water, and gameplay managers. Porting the hero scene into R3F just for marketing would create a second visual truth and a second bug surface.

Use Remotion after gameplay capture exists:

- Assemble clips into Discord/devlog cuts.
- Add title cards, captions, trims, and layout variants.
- Use `<Video>`, `<Img>`, `<Sequence>`, `staticFile()`, and frame-driven transitions.
- Use Remotion CLI/ffmpeg helpers for exact trims and final social crops.

Do not use Remotion as the first capture path for Sheep Dog Island gameplay unless the project deliberately creates a separate R3F marketing renderer later.

## Recommended SDS Architecture

### 1. Shot Director In Game

Create a capture-only director around the existing cinematic API:

- `loadShot(id)`: loads scene, starts solo mode, hides UI, prewarms assets/shaders, and waits for explicit readiness.
- `seekShot(tMs)`: owns camera pose, dog pose, sun/time, and any shot-specific flock setup for one timestamp.
- `renderShotFrame(tMs)`: advances capture simulation at fixed timestep, renders once, and returns frame metadata.
- Named rigs: orbit, low dog pass, flank arc, crane rise, follow-dog, portal drive.

The director should live near `js/cinematic.js` or under a small `js/capture/` module, but it should not touch `shared/` simulation contracts.

### 2. Browser-Side Master Recorder

Prototype with direct Mediabunny first:

- Load the actual SDS page in a headed Chromium instance.
- Wait for `window.__sdsCinema.loadShot(id)` readiness.
- Create a `Mediabunny.Output` with `Mp4OutputFormat({ fastStart: 'in-memory' })` and `BufferTarget`.
- Create a `CanvasSource` against the SDS WebGL canvas with an H.264/AVC config if supported.
- For each frame, call `seekShot(frameTimeMs)`, render once, then `await source.add(timestampSeconds, durationSeconds)`.
- Finalize the output, return one MP4 buffer to Node, and write it under `assets/marketing/content/2026-05-update/generated/`.

If direct Mediabunny integration stalls, use `canvas-record` as a wrapper prototype:

- It already wraps WebCodecs/Mediabunny and has `Recorder.step()`.
- It can prove whether the browser-side approach works before we polish the smaller direct integration.
- Do not ship its whole broad encoder surface into the production app bundle.

Do not use `MediaRecorder` as the master path. It is fine for live proof clips, but it already produced a zero-byte WebM in this environment and its browser/container/bitrate behavior is less controllable than WebCodecs plus a muxer.

Dependency check on 2026-05-12:

- `mediabunny@1.44.2`: zero runtime dependencies beyond type packages; package is larger on disk but the API is tree-shakable.
- `canvas-record@5.5.1`: smaller package itself, but pulls `@ffmpeg/ffmpeg`, `@ffmpeg/util`, `h264-mp4-encoder`, `gifenc`, `media-codecs`, `mediabunny`, and helpers.
- `puppeteer-capture@1.50.0`: small package, depends on `fluent-ffmpeg`, `which`, optional `ffmpeg-static`, and peer `puppeteer-core`.

### 3. Fast Proof Recorder

Keep a separate proof path for framing review:

- Headed browser with hardware acceleration.
- Puppeteer screencast for quick low-friction previews, or OBS controlled by launch args / obs-websocket.
- Proof videos can be ugly or compressed if they answer camera/dog/framing questions quickly.

Proof output is not a master asset.

### 3b. Deterministic Browser-Capture Fallback

Before falling all the way back to OBS, test `puppeteer-capture`.

This is different from Playwright video and ordinary CDP screencast:

- It drives `HeadlessExperimental.beginFrame` instead of recording realtime tab output.
- It advances virtual time through the capture API.
- It writes frames through ffmpeg with deterministic frame count and duration.

Risks:

- It depends on Chrome headless shell and an experimental CDP domain.
- Headless WebGL output may still differ from headed hardware Chrome.
- It may not solve GPU readback stalls if the page itself is too expensive to capture.

Acceptance for keeping it:

- Captures a 2 second SDS canvas clip at 1280x720 and 30 fps.
- Output duration is within 0.1 seconds of spec.
- First frame is gameplay after shot readiness, not menu/setup.
- Dog is visible in the low pass shot.
- No blank WebGL frames.

### 4. Editorial Pass

Once gameplay clips pass validation, add Remotion only as an editorial project if needed:

- Place generated clips/stills in a Remotion `public/` folder or point to them from a dedicated composition project.
- Define compositions for `discord-clip-720p`, `devlog-hero-16x9`, and `social-square`.
- Use frame-driven Remotion animation only; no CSS animation or self-running Three loops.

## Next Implementation Slice

1. Keep `tools/content-capture.mjs` paused behind `--experimental-run`.
2. Add Mediabunny only as a dev/capture dependency first, keeping it out of the ordinary production path.
3. Prove a 2 second, 30 fps browser-side MP4 capture from the real SDS canvas after the game is ready.
4. In parallel, test `puppeteer-capture` against the same 2 second shot as a fallback option.
5. Validate duration, nonzero bytes, first/last frame, and dog visibility for both paths.
6. Promote the winning recorder into `tools/content-capture.mjs`.
7. After one clean `sdi-dog-pass-low` capture, add the rest of the shot list.

## Decision

Use direct Mediabunny plus an SDS shot director as the primary path.

Keep `canvas-record` as a reference/prototype, not the default SDS dependency.

Keep Remotion for post-capture editing and social packaging, not for first-pass gameplay capture.

Test `puppeteer-capture` as the deterministic fallback before OBS.

Keep Playwright video, Puppeteer screencast, OBS, and ffmpeg window capture as proof/fallback tools, not as the first master path.
