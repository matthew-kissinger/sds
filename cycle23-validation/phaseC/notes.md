# Phase C — OC HUD overlap fix

## Issue

Both [ObjectiveBanner](../../js/components/GameHUD/ObjectiveBanner.js) and
[CameraModeIndicator](../../js/components/GameHUD/CameraModeIndicator.js)
mount at `top-6 left-1/2 -translate-x-1/2` (top-center, ~24px from top edge)
on desktop. On Open Country, both render together — the banner shows
"Gather 80 sheep into the ring" while the camera chip sits at the same
y-coordinate. Overlap is visible at any desktop breakpoint.

## Fix — vertical stack on desktop

CameraModeIndicator now subscribes to `subscribeGameEvent('frame', ...)`
and reads `getGameState().objective`. When an objective is active, the
chip drops to `calc(env(safe-area-inset-top, 0px) + 88px)` — about 70px
of banner + 18px gap. When no objective (Field, RH), it stays at the
v1.3.0 position (`top-6` equivalent ≈ 24px).

Mobile is unchanged: the chip sits at `left-2` clear of the centered
MobileHUD; the ObjectiveBanner's narrow `whitespace-nowrap` text doesn't
reach the left edge on iPhone SE 375px width.

## Validation

- vitest: 188/188 (all green; no test added — this is a CSS-positioning
  change verifiable only in browser).
- build: clean, no measurable delta from Phase B.

## Files touched

- [js/components/GameHUD/CameraModeIndicator.js](../../js/components/GameHUD/CameraModeIndicator.js)
  - Imports `useEffect/useState` + `getGameState` + `subscribeGameEvent`.
  - `hasObjective` state, polled per frame; setState only flips on transition.
  - Desktop `top` derived from `hasObjective`: 24px → 88px when banner mounted.
  - MODE_LABEL doc-comment updated to reflect new cycle order (Follow → Free → Classic).
