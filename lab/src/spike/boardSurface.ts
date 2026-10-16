// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The TSL twin of `barnBoards` (lab/src/spike/boardMath.ts).
 *
 * Read the two side by side: the lines correspond one to one and every
 * constant is imported from the math file, so the procedural panel in the lab
 * evaluates per pixel exactly what the bake evaluated per texel. Any visible
 * difference between the two panels is therefore the delivery mechanism's.
 */

import {
  float,
  floor,
  fract,
  max,
  min,
  mix,
  sin,
  smoothstep,
  step,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import {
  BATTEN_HALF,
  BATTEN_LIFT,
  BATTEN_SHADE,
  BATTEN_SHADOW,
  BOARD_PITCH,
  BOARD_TONE_SPREAD,
  BOARDS_PER_CELL,
  DAMP_COURSE,
  DAMP_EDGE,
  DAMP_GAIN,
  GRAIN_DARK,
  GRAIN_PERIOD,
  GRAIN_STEP,
  K,
  TAU,
  WEATHER_EDGE,
  WEATHER_LOW,
  WEATHER_THRESHOLD,
} from './boardMath';

export * from './boardMath';

function hash1Node(n: TSLNode): TSLNode {
  return fract(sin(n.mul(float(12.9898))).mul(float(43758.5453)));
}

/** `barnBoards` over the same (x, y) metres, as a node graph. */
export function barnBoardsNode(x: TSLNode, y: TSLNode): TSLNode {
  const across = x.div(float(BOARD_PITCH));
  const boardRaw = floor(across);
  // ((i % n) + n) % n, written with floor so negative x behaves as in JS.
  const n = float(BOARDS_PER_CELL);
  const boardIndex = boardRaw.sub(floor(boardRaw.div(n)).mul(n));
  const inBoard = fract(across).mul(float(BOARD_PITCH));

  const tone = hash1Node(boardIndex.add(float(1)));
  const centred = tone.sub(float(0.5));
  const toneGain = float(1).add(centred.mul(float(2 * BOARD_TONE_SPREAD)));
  let rgb = vec3(
    toneGain.mul(float(1).add(centred.mul(float(0.03)))),
    toneGain,
    toneGain.mul(float(1).sub(centred.mul(float(0.04)))),
  );

  const grainPhase = hash1Node(boardIndex.add(float(7))).mul(float(TAU));
  const grain = sin(inBoard.div(float(GRAIN_PERIOD)).mul(float(TAU)).add(grainPhase).add(y.mul(float(0.9))));
  rgb = rgb.mul(mix(float(1), float(GRAIN_DARK), step(float(GRAIN_STEP), grain)));

  const first = sin(x.mul(float(K)).add(y.mul(float(0.83 * 1.3))).add(float(0.37)));
  const second = sin(
    x.mul(float(K * -2)).add(y.mul(float(1.31 * 1.3))).add(first.mul(float(0.57))).add(float(1.05)),
  );
  const field = first.mul(float(0.64)).add(second.mul(float(0.36)));
  const weather = smoothstep(
    float(WEATHER_THRESHOLD - WEATHER_EDGE),
    float(WEATHER_THRESHOLD + WEATHER_EDGE),
    field,
  );
  rgb = rgb.mul(mix(float(WEATHER_LOW), float(1), weather));

  const damp = float(1).sub(smoothstep(float(DAMP_COURSE), float(DAMP_COURSE + DAMP_EDGE), y));
  rgb = rgb.mul(mix(float(1), float(DAMP_GAIN), damp));

  const joint = min(inBoard, float(BOARD_PITCH).sub(inBoard));
  const onBatten = step(joint, float(BATTEN_HALF));
  const pastBatten = step(float(BATTEN_HALF), inBoard).mul(step(inBoard, float(BATTEN_HALF + BATTEN_SHADOW)));
  const battenGain = mix(mix(float(1), float(BATTEN_SHADE), pastBatten), float(BATTEN_LIFT), onBatten);
  rgb = rgb.mul(battenGain);

  return max(rgb, vec3(0, 0, 0));
}
