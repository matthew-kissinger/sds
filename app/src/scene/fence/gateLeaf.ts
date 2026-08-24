// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * One hung gate leaf, cut as a kit. Split out of `gateKit.ts` so the pier and the
 * leaf each stay a file you can hold in your head.
 *
 * THE TWO LEAVES ARE ONE KIT AND THAT IS THE WHOLE POINT OF THIS MODULE. A gate
 * is a pair of boards a farmer sawed on the same morning; the last pass built
 * each leaf from its own hinge outward with its own seeds and the two came back
 * different widths, different grain, one of them with its top bar passing through
 * the post it hangs on. Everything below is expressed in the leaf's OWN frame -
 * distance along the leaf, height above its own hung line - and every seed is a
 * hash of those two numbers alone. Mirror the frame and you get the other leaf,
 * board for board.
 */

import { hash01 } from '../fenceGeometry';
import type { RailPlacement } from './placement';
import { TIMBER_TONE } from './timberTones';

/**
 * Four bars, and every one of them wide. At Follow the gate is 110 m away, where
 * a metre is 13 pixels: a 7 cm bar is half a pixel of aliased dash and five of
 * them stacked read as straw. These are sawn boards - flat-faced, straight,
 * 12 cm - and four of them leave real gaps between.
 */
const BAR_COUNT = 4;
/**
 * The bottom bar sits 11 cm over the ground the pair is hung off, so its lower
 * edge lands at five centimetres and the leaf reads as a gate standing in the
 * grass rather than as a panel floating over it. Top and bottom are both HEAVY -
 * a built panel has a frame, and four identical bars between two stiles is a
 * ladder.
 */
const BAR_LOW = 0.11;
const BAR_HIGH = 1.44;
const BAR_SECTION = { thickness: 0.12, depth: 0.075 } as const;
const FRAME_SECTION = { thickness: 0.17, depth: 0.1 } as const;
/** The hinge stile sits half its own width along the leaf, so its inner face is
 *  exactly on the post face the leaf hangs from and there is no gap to see. */
const STILE = { thickness: 0.15, depth: 0.1, low: 0.04, high: 1.5 } as const;
const BRACE = { low: 0.16, high: 1.46, thickness: 0.11, depth: 0.085 } as const;
/**
 * The hinge straps, in iron, and the one thing on the fence that is not wood.
 * They are held one step under the outline (timberTones.ts) so that at Follow they
 * land as two dark drawn marks across a pale leaf rather than as two more planks,
 * and they sit proud of the leaf's plane because ironwork is bolted onto the face
 * of a gate.
 *
 * `back` is a tenth of what it was. At 0.34 the strap started a third of a metre
 * behind the hinge, which put it INSIDE the pier shaft and, once the proud offset
 * pushed it sideways, straight out through the far face - the bar seen crossing
 * the right-hand post at Follow.
 */
const STRAP = {
  back: 0.04,
  reach: 0.98,
  thickness: 0.16,
  depth: 0.09,
  proud: 0.09,
} as const;
const STRAP_HEIGHTS = [0.4, 1.22] as const;

export interface Leaf {
  /** Hinge point, on the face of its post. */
  readonly hx: number;
  readonly hz: number;
  readonly y0: number;
  /** Unit direction the leaf runs, already swung open. */
  readonly dx: number;
  readonly dz: number;
  /** Unit normal of the leaf's own plane, pointing at the field. Both gameplay
   *  cameras stand in the field, so this is the face they see. */
  readonly px: number;
  readonly pz: number;
  readonly length: number;
}

function bar(
  leaf: Leaf,
  s0: number,
  y0: number,
  s1: number,
  y1: number,
  section: { readonly thickness: number; readonly depth: number },
  topness: number,
  tone: number,
  /** How far proud of the leaf's own plane the piece sits, metres. */
  lateral = 0,
): RailPlacement {
  const ox = leaf.px * lateral;
  const oz = leaf.pz * lateral;
  const ax = leaf.hx + leaf.dx * s0 + ox;
  const az = leaf.hz + leaf.dz * s0 + oz;
  const bx = leaf.hx + leaf.dx * s1 + ox;
  const bz = leaf.hz + leaf.dz * s1 + oz;
  return {
    ax,
    ay: leaf.y0 + y0,
    az,
    bx,
    by: leaf.y0 + y1,
    bz,
    thickness: section.thickness,
    depth: section.depth,
    topness,
    tone,
    // Keyed on the piece's own height in the leaf and nothing else, so the two
    // leaves are one kit down to the grain: same board count, same width, same
    // length, same tone, same strokes.
    seed: hash01(s0 * 100, y0 * 100, 211),
  };
}

/** One hung leaf: four bars, two stiles, a diagonal brace, two iron straps. */
export function leafParts(leaf: Leaf): RailPlacement[] {
  const rails: RailPlacement[] = [];
  const far = leaf.length;
  const near = STILE.thickness / 2;
  for (let i = 0; i < BAR_COUNT; i++) {
    const t = i / (BAR_COUNT - 1);
    const y = BAR_LOW + (BAR_HIGH - BAR_LOW) * t;
    const frame = i === 0 || i === BAR_COUNT - 1;
    // A hung gate droops a little at its far end; three centimetres over four
    // metres is under half a degree, and it is the difference between a gate and
    // a drawing of one.
    rails.push(
      bar(leaf, 0, y, far, y - 0.03, frame ? FRAME_SECTION : BAR_SECTION, t, TIMBER_TONE.leaf),
    );
  }
  rails.push(
    bar(leaf, near, STILE.low, near, STILE.high, STILE, 0.85, TIMBER_TONE.leaf),
    bar(leaf, far - near, STILE.low, far - near, STILE.high - 0.03, STILE, 0.85, TIMBER_TONE.leaf),
    bar(leaf, near, BRACE.low, far - near, BRACE.high - 0.03, BRACE, 0.5, TIMBER_TONE.leaf),
  );
  for (const y of STRAP_HEIGHTS) {
    rails.push(
      bar(leaf, -STRAP.back, y, STRAP.reach, y, STRAP, 0.3, TIMBER_TONE.iron, STRAP.proud),
    );
  }
  return rails;
}
