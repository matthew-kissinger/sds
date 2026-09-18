// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The virtual stick, as a probe has to drive it.
 *
 * Three probes dispatch synthetic touch at the overlay in
 * `app/src/input/TouchControls.tsx`, and each carried its own pixel literal for
 * what full deflection is worth: 56, 56 and 65, against a radius of 48. Every
 * command they sent therefore saturated, so no scripted run could exercise
 * partial effort at all, which is the band the shaped stick exists to add.
 *
 * The overlay also RE-ANCHORS its origin: past the radius it drags the base
 * along behind the thumb until the offset is the radius again. A probe that
 * holds a fixed origin and pushes past the rim is measuring against an origin
 * the app has already abandoned, and every command after that carries the
 * drift. So the rule is mirrored here rather than assumed away.
 *
 * The constants are read out of the app's own module instead of being restated.
 * esbuild is already a probe dependency and the input modules are pure
 * arithmetic with no DOM, so bundling them costs a few milliseconds at startup
 * and removes the whole class of stale-copy defect above.
 */

import { buildSync } from 'esbuild';
import { join } from 'node:path';
import { repo } from './probe-lib.mjs';

const bundled = buildSync({
  stdin: {
    contents: "export { STICK_RADIUS, DEADZONE, SATURATION } from './touch';\n"
      + "export { shapeAxis } from './axis';\n",
    resolveDir: join(repo, 'app', 'src', 'input'),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
}).outputFiles[0].text;

const app = await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`
);

/** Pixels from the stick origin to full deflection. The app's own number. */
export const STICK_RADIUS = app.STICK_RADIUS;
/** Deflection below which the app reads thumb noise rather than a direction. */
export const DEADZONE = app.DEADZONE;
/** Deflection at and above which the app is already at full effort. */
export const SATURATION = app.SATURATION;

/**
 * The effort the app derives from a fraction of stick travel, through the app's
 * own shaper.
 *
 * Deflection is not effort. The dead zone, the saturation and the shared cubic
 * response sit between them, so half travel commands 0.32 of full effort rather
 * than half of it. A probe reporting what it asked for has to report both.
 */
export function stickEffort(deflection) {
  return app.shapeAxis({ right: 0, forward: deflection }, DEADZONE, SATURATION);
}

/**
 * One thumb on the stick half, mirrored, starting at `x`, `y` in client pixels.
 *
 * `push` takes the offset the probe wants from the stick's CURRENT origin and
 * returns the client point that produces it, moving the mirrored origin exactly
 * as the overlay moves its own. An offset at or inside the radius leaves the
 * origin alone, which is the reason to ask for one in radius units.
 */
export function createStick(x, y) {
  const origin = { x, y };
  return {
    origin,
    push(dxPx, dyPx) {
      const point = { x: origin.x + dxPx, y: origin.y + dyPx };
      const distance = Math.hypot(dxPx, dyPx);
      if (distance > STICK_RADIUS) {
        const keep = STICK_RADIUS / distance;
        origin.x += dxPx * (1 - keep);
        origin.y += dyPx * (1 - keep);
      }
      return point;
    },
  };
}
