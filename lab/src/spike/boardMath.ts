// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The atlas spike's surfaces as plain arithmetic, with no dependency on three.
 *
 * tools/bake-surface-atlas.mjs bundles THIS file and evaluates it per texel.
 * lab/src/spike/boardSurface.ts holds the TSL twin of `barnBoards`, written
 * line for line against it from the same constants, so the procedural panel
 * and the atlas panel in the lab carry the same authored content and differ
 * only in how it reaches the screen. That is the comparison the spike makes.
 *
 * Every function returns a MODULATION: an RGB multiplier near 1 applied to the
 * banded base colour before the shared toon ramp, as the farmhouse materials
 * apply their painted fields. Lighting and band placement stay the ramp's, so
 * a texture here cannot carry a baked lighting cue (spec/05 forbids them).
 *
 * The surfaces are periodic over CELL_METRES horizontally so one atlas cell
 * tiles along a wall, and span 0..CELL_METRES vertically: a cell is a 4 m by
 * 4 m piece of wall, the whole height of the spike's panel.
 */

/** One atlas cell covers this many metres of wall in each direction. */
export const CELL_METRES = 4;
/** A texel value of 1.0 encodes a multiplier of ATLAS_GAIN; nothing here exceeds it. */
export const ATLAS_GAIN = 1.25;
/** The atlas is a 2 by 2 grid of 1024-texel cells in a 2048 texture. */
export const ATLAS_TEXELS = 2048;
export const CELL_TEXELS = 1024;
export type AtlasCellId = 'barn' | 'barnPainted' | 'limewash' | 'slate';
/** Cell column and row, row 0 at the bottom of the texture (v = 0). */
export const ATLAS_CELLS: Readonly<Record<AtlasCellId, readonly [number, number]>> = {
  barn: [0, 0],
  barnPainted: [1, 0],
  limewash: [0, 1],
  slate: [1, 1],
};

// --- the boards, constants shared with the TSL twin ---------------------------

/** Fourteen boards to the cell, so the pitch divides 4 m exactly and tiles. */
export const BOARDS_PER_CELL = 14;
export const BOARD_PITCH = CELL_METRES / BOARDS_PER_CELL;
/** The batten over each joint, and the shadow line it throws on its +x side. */
export const BATTEN_HALF = 0.03;
export const BATTEN_SHADOW = 0.022;
export const BATTEN_LIFT = 1.04;
export const BATTEN_SHADE = 0.8;
/** Per-board tone spread: each board is cut from a different tree. */
export const BOARD_TONE_SPREAD = 0.06;
/** Grain streaks: fine, vertical, two tones, held just under the eye at 3 m. */
export const GRAIN_PERIOD = 0.09;
export const GRAIN_DARK = 0.965;
export const GRAIN_STEP = 0.35;
/** Weathering: two crossed strokes thresholded hard, the barn preset's shape. */
export const WEATHER_LOW = 0.9;
export const WEATHER_THRESHOLD = 0.28;
export const WEATHER_EDGE = 0.06;
/** The damp course: the first 0.66 m above the ground, a step darker. */
export const DAMP_COURSE = 0.66;
export const DAMP_EDGE = 0.07;
export const DAMP_GAIN = 0.93;

export const TAU = Math.PI * 2;
/** Horizontal frequencies are whole turns per cell so the fields tile. */
export const K = TAU / CELL_METRES;

/** The classic one-liner, chosen because it evaluates the same in JS and WGSL. */
export function hash1(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * The barn boards at (x, y) metres: x along the wall, y up from the ground.
 * Returns the RGB multiplier.
 */
export function barnBoards(x: number, y: number): [number, number, number] {
  // Which board, and where across it. The index is taken modulo the cell so
  // the tone sequence repeats with the geometry.
  const across = x / BOARD_PITCH;
  const boardIndex = ((Math.floor(across) % BOARDS_PER_CELL) + BOARDS_PER_CELL) % BOARDS_PER_CELL;
  const inBoard = (across - Math.floor(across)) * BOARD_PITCH;

  // Per-board tone, warm boards a touch redder, pale boards a touch bluer.
  const tone = hash1(boardIndex + 1);
  const centred = tone - 0.5;
  const toneGain = 1 + centred * 2 * BOARD_TONE_SPREAD;
  let r = toneGain * (1 + centred * 0.03);
  let g = toneGain;
  let b = toneGain * (1 - centred * 0.04);

  // Grain: vertical streaks whose phase differs per board, thresholded to two tones.
  const grainPhase = hash1(boardIndex + 7) * TAU;
  const grain = Math.sin((inBoard / GRAIN_PERIOD) * TAU + grainPhase + y * 0.9);
  const grainStep = grain > GRAIN_STEP ? GRAIN_DARK : 1;
  r *= grainStep; g *= grainStep; b *= grainStep;

  // Weathering: two crossed strokes (paintedField's shape in surfaceMaterial.ts), tiling.
  const first = Math.sin(x * K + y * 0.83 * 1.3 + 0.37);
  const second = Math.sin(x * K * -2 + y * 1.31 * 1.3 + first * 0.57 + 1.05);
  const field = first * 0.64 + second * 0.36;
  const weather = smooth(WEATHER_THRESHOLD - WEATHER_EDGE, WEATHER_THRESHOLD + WEATHER_EDGE, field);
  const weatherGain = WEATHER_LOW + (1 - WEATHER_LOW) * weather;
  r *= weatherGain; g *= weatherGain; b *= weatherGain;

  // Damp course.
  const damp = 1 - smooth(DAMP_COURSE, DAMP_COURSE + DAMP_EDGE, y);
  const dampGain = 1 + (DAMP_GAIN - 1) * damp;
  r *= dampGain; g *= dampGain; b *= dampGain;

  // Batten over the joint, lifted, with its shadow line on the +x side (the
  // sun stands to -x, tsl/palette SUN_DIRECTION).
  const joint = Math.min(inBoard, BOARD_PITCH - inBoard);
  const onBatten = joint < BATTEN_HALF;
  const pastBatten = inBoard > BATTEN_HALF && inBoard < BATTEN_HALF + BATTEN_SHADOW;
  const battenGain = onBatten ? BATTEN_LIFT : pastBatten ? BATTEN_SHADE : 1;
  r *= battenGain; g *= battenGain; b *= battenGain;

  return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
}

/**
 * B+: the same boards with the detail a texture carries for free and a shader
 * would pay for per pixel: a knot or two per board and nail heads at the
 * fixing rows. Kept out of the procedural panel on purpose.
 */
export function barnBoardsPainted(x: number, y: number): [number, number, number] {
  const [r0, g0, b0] = barnBoards(x, y);
  let gain = 1;
  const across = x / BOARD_PITCH;
  const boardIndex = ((Math.floor(across) % BOARDS_PER_CELL) + BOARDS_PER_CELL) % BOARDS_PER_CELL;
  const inBoard = (across - Math.floor(across)) * BOARD_PITCH;
  // Knots: up to two per board, ellipses with a darker ring.
  for (let k = 0; k < 2; k++) {
    const seed = boardIndex * 3 + k * 17 + 3;
    if (hash1(seed) < 0.4) continue;
    const kx = BOARD_PITCH * (0.3 + 0.4 * hash1(seed + 1));
    const ky = CELL_METRES * (0.1 + 0.8 * hash1(seed + 2));
    const dx = (inBoard - kx) / 0.022;
    const dy = (y - ky) / 0.034;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) gain *= 0.78;
    else if (d < 1.4) gain *= 0.9;
  }
  // Nail heads at three fixing rows: a dark dot with a lit upper edge.
  for (const row of [0.3, 2.1, 3.8]) {
    const dx = (inBoard - BOARD_PITCH * 0.5) / 0.009;
    const dy = (y - row) / 0.009;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) gain *= 0.7;
    else if (d < 1.6 && dy > 0) gain *= 1.06;
  }
  return [r0 * gain, g0 * gain, b0 * gain];
}

/** Limewash: the house's wall-run patch field and damp course, for the atlas cell. */
export function limewash(x: number, y: number): [number, number, number] {
  const first = Math.sin(x * K + y * 0.07 * 5.4 * 0.83 + 0.37);
  const second = Math.sin(x * K * -1 + y * 0.07 * 5.4 * 1.31 + first * 0.57 + 1.05);
  const field = first * 0.64 + second * 0.36;
  const patch = smooth(0.3 - 0.065, 0.3 + 0.065, field);
  // The patch is seven luminance points under the clean render (palette WALL_PATCH).
  const g = 1 - 0.04 * patch;
  const damp = 1 - smooth(DAMP_COURSE, DAMP_COURSE + DAMP_EDGE, y);
  const dampGain = 1 + (DAMP_GAIN - 1) * damp;
  return [g * dampGain, g * dampGain, g * dampGain * 0.995];
}

/** Slate: courses up the slope with a wandering joint, for the atlas cell. */
export function slate(x: number, y: number): [number, number, number] {
  const wander = Math.sin(x * K + y * 0.7 + 6.19) * 0.16;
  const raw = y / 0.95 + wander;
  const line = raw - Math.floor(raw);
  const joint = smooth(0.5 - 0.075 - 0.03, 0.5 - 0.075, Math.abs(line - 0.5));
  const courses = 1 + (0.79 - 1) * joint;
  const sky = 0.86 + 0.14 * smooth(0.9, 3.2, y);
  const perSlate = hash1(Math.floor(x / 0.5) + Math.floor(y / 0.95) * 31) * 0.05 - 0.025;
  const g = courses * sky * (1 + perSlate);
  return [g, g * 1.005, g * 1.03];
}

export const ATLAS_CELL_SURFACES: Readonly<Record<AtlasCellId, (x: number, y: number) => [number, number, number]>> = {
  barn: barnBoards,
  barnPainted: barnBoardsPainted,
  limewash,
  slate,
};
