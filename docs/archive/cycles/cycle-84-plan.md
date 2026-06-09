# Cycle 84: Mobile WebGPU Primary Hotfix

## Summary

Newsheepdogland should stay on the WebGPU production path on WebGPU-capable mobile browsers. The current mobile-only scene pin reloads a WebGPU session to `?renderer=webgl`, which matches the reported first-click refresh and second-click WebGL session.

## Scope

- Remove the Newsheepdogland `renderer: 'webgl'` scene pin.
- Remove the mobile boot/swap guards that force the scene off WebGPU.
- Keep explicit `?renderer=webgl` as the fallback/escape hatch.
- Let the coastline WebGPU compute-cull path apply on mobile WebGPU too, so phones do not fall back to the old per-chunk flagship load.
- Size the mobile coastline terrain mesh to cover Newsheepdogland's off-origin homestead/play area instead of snapping the dog to the water/skirt edge.
- Align README/docs wording with WebGPU as the primary default on capable browsers.

## Acceptance

- Default or explicit WebGPU Newsheepdogland loads shall not rewrite the URL to `renderer=webgl` or set `fallbackReason=scene-pinned-webgl`.
- Explicit `?renderer=webgl` shall still force WebGL.
- The shared scene edit is render-only; sim-baselines must pass unchanged in `npm test`.
- Browser proof shall cover a mobile-emulated Newsheepdogland Play flow with WebGPU effective when the browser can create a WebGPU device.
- Browser proof shall show the dog stays on the terrain surface at the Newsheepdogland homestead spawn instead of y=-3 water/skirt height.

## Closeout Validation

- Targeted WebGPU scene, grass, terrain, and render-cost tests passed: `npm test -- tests/newsheepdogland-scene.spec.js tests/konveyor-grass-material-adapter.spec.js tests/konveyor-terrain-material-adapter.spec.js tests/render-cost-report.spec.js`.
- Full `npm test`, `npm run lint`, and `npm run build` passed locally. Production `main-*.js` stayed inside the committed 592 KB bundle-size ratchet at 606,683 bytes.
- Mobile-emulated browser proof passed from the normal entrance with one Play click: `webgpu-production`, no `renderer=webgl`, no `fallbackReason`, mobile terrain mesh `size=3200`, `splitSkirt=false`, grass compute-cull true, tree compute-cull controllers 4, and dog y `3.4006` matching terrain surface y `3.4006`.
- Chromium Playwright subset passed: `npx playwright test --project=chromium tests/e2e/smoke.spec.ts tests/e2e/mobile-asset-visibility.spec.ts` (5 passed).
- Full local `npm run test:e2e` was attempted but exceeded a 3-minute command timeout before producing useful output; the focused Chromium browser gate above was used for this hotfix.
- Release commit `8df0acc` is tagged `v2.2.5`; GitHub Deploy run `27209758357` passed Test, E2E Chromium, D1 migrate, Worker deploy, and Pages deploy.
- Live proof on `sheepdogsim.com` confirmed `assets/main-DA6jksvi.js` has the mobile WebGL pin markers absent, Worker `/healthz` is green, the Newsheepdogland entrance image is live, and Pixel 7 emulation reaches Newsheepdogland on `webgpu-production` with 3200 m mobile coastline terrain, grass compute-cull true, 4 tree compute-cull controllers, and dog y on the terrain surface.
