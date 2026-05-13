# Capture Spike Examples

This folder holds local research material for the May 2026 SDS content-capture spike.

`repos/` is gitignored. The cloned projects are examples to inspect, not vendored dependencies.

## Cloned References

```text
repos/canvas-record
repos/mediabunny
repos/webav
repos/remotion-template-three
repos/canvas-capture
repos/ccapture-js
repos/mp4-muxer
repos/webcodecs-samples
repos/puppeteer-capture
repos/puppeteer-screen-recorder
```

## Current Recommendation

Use direct Mediabunny as the first implementation target for master gameplay clips. Its `CanvasSource` API can add fixed canvas frames to MP4/WebM output through WebCodecs, which matches the SDS need better than Playwright viewport video or per-frame screenshot export.

Use `canvas-record` as a wrapper/reference if the direct Mediabunny path needs a faster proof. It records from a real canvas and already wraps WebCodecs/Mediabunny, but its dependency surface is broader than SDS needs for this narrow capture tool.

Use Remotion later for editorial assembly, captions, trims, title cards, and social crops. The Remotion Three path expects React Three Fiber and frame-driven animation, while SDS gameplay is currently vanilla imperative Three.js.

Use CCapture.js and CanvasCapture as design references only. Their fixed-frame capture concept is useful, but their older timing monkeypatch and ffmpeg.wasm/cross-origin-isolation constraints are not the preferred production route here.

Test `puppeteer-capture` as the fallback before OBS. Unlike ordinary screencast wrappers, it drives Chrome frames deterministically through `HeadlessExperimental.beginFrame`, which may solve the duration/setup-time problems without adding browser-side encoding code. It still has headless-shell and WebGL parity risk, so it must prove itself on an actual SDS shot.

## Refresh

If the examples need to be refreshed, delete and reclone only inside `repos/`; do not vendor them into SDS without a separate dependency decision.
