// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The gate itself, and spec/04 makes it the landmark the whole field is read
 * against. Two posts with a hole between them is storm damage; this is a built
 * thing, and it is now a PIER on each side rather than a single fat post:
 *
 *   - two braced shafts, 0.9 m apart down the fence line, under
 *   - one heavy cap beam spanning both, the lightest timber on the fence
 *   - one spacer low down and one diagonal brace across the slot, so the pier
 *     reads as one built assembly rather than as two posts with rungs
 *   - a steep strainer brace running from the outer shaft back down the run
 *   - one pair of matched leaves, hinged on the inner shafts by iron straps and
 *     hung open toward the field (gateLeaf.ts, which is where the boards are)
 *
 * WHY A PIER. A single post is a vertical dark stick, and the treeline ring is
 * made of vertical dark sticks: at the beauty camera the gate was one tick among
 * forty trunks. A pier is a shape no tree has - two verticals with a slot of sky
 * between them and a horizontal block laid across the top - so the eye finds it
 * by silhouette rather than by hoping its colour survives 140 m of haze. It also
 * puts 1.5 m of timber across the mouth instead of 0.8, which is what breaks the
 * canopy line from the far side of the field.
 *
 * AND THE CAP IS THE LIGHTEST THING ON THE FENCE. Both gameplay cameras look DOWN
 * at the gate, so the cap's top face is most of what they see of it, and it is the
 * one face on the perimeter that the low key lands on square. Measured at value 93
 * it is the brightest point anywhere in 800 m of timber, which is what puts the
 * eye on the gate first from any part of the field. It spent an earlier pass at
 * the BOTTOM of the ladder, where it drew a dark blob on a pale shaft and the
 * landmark read as two corks.
 *
 * NOTHING CROSSES THE MOUTH. No header, no rail at any height. What tells a
 * player the gate is open is the gap itself and the two leaves funnelling into
 * it.
 *
 * Everything here is plain arithmetic appended to the same two placement arrays
 * the line fence fills, so the gate costs no extra draw call: it is more
 * instances in the post mesh and the rail mesh.
 */

import type { FenceOpening } from '../fenceGeometry';
import { leafParts } from './gateLeaf';
import { TIMBER, postJitter } from './kit';
import type { GroundSampler, PostPlacement, RailPlacement } from './placement';
import { POST_TONE, TIMBER_TONE } from './timberTones';

export interface GateLeafAssembly {
  readonly hingeX: number;
  readonly hingeZ: number;
  /** Signed turn from the authored open pose back onto the fence line. */
  readonly closeTurn: number;
  readonly parts: readonly RailPlacement[];
}

/** How far apart the two shafts of one pier stand, down the fence line. */
const PIER_SPAN = 0.66;
/**
 * The head, and the mushroom is gone. It used to overhang 24 cm on a 0.82 m beam
 * over a 0.6 m shaft and take the DARKEST tone on the fence: a black disc on a
 * toothpick, which is what both gameplay cameras saw of the landmark, since both
 * look down. It now sits barely proud of the shafts it caps, it is chamfered by
 * the post profile it shares, and it carries the LIGHTEST timber anywhere on the
 * perimeter. The eye lands on it because it is the brightest point in the frame's
 * whole fence line, not because it is the only black one.
 */
const CAP_OVER = 0.14;
const CAP_BEAM = { thickness: 0.26, depth: 0.72 } as const;
/**
 * What ties the two shafts together: one bar low down and one diagonal rising
 * across the slot between them.
 *
 * ONE OF EACH, NOT TWO BARS. Two horizontals evenly spaced up a pair of
 * verticals is a LADDER, and at the Classic camera that is exactly what the
 * first pier read as. A diagonal is the thing no ladder has, it is what a real
 * braced assembly carries, and it fills the slot asymmetrically so the pier
 * reads as one built mass instead of two posts with rungs.
 */
const SPACER_HEIGHT = 0.85;
const SPACER = { thickness: 0.18, depth: 0.22 } as const;
const PIER_BRACE = { low: 1.05, high: 2.55, thickness: 0.17, depth: 0.2 } as const;

/**
 * The strainer, and it is STEEP now. At a 1.5 m foot and a 1.85 m head the brace
 * lay at 51 degrees and, seen from Follow with the post behind it, read as a
 * dropped plank lying in the grass beside the gate. Rising 2.5 m over 1.15 it is
 * plainly a brace holding a post up.
 */
const STRAINER = { foot: 1.05, head: 1.95, thickness: 0.16, depth: 0.13 } as const;

/** Fully open: each leaf folds all the way back against the adjoining fence
 *  run. A 90-degree pose still reads as half-open; this 180-degree rest makes
 *  the complete 8 m mouth clear and leaves no board projecting into the field. */
const OPEN_ANGLE = Math.PI;
/** Leaf length as a fraction of the half-opening. Just short of the middle, the
 *  way a hung pair clears its own catch. */
const LEAF_REACH = 0.96;

/**
 * Where the leaf hangs, as a fraction of the shaft's girth from its axis. The
 * shaft is a pentagon with a fixed yaw, so its face stands between 0.34 and 0.46
 * girth out; hinging at 0.37 puts the stile's inner face INSIDE the timber, which
 * is the only way to guarantee no gap opens between leaf and post.
 */
const HINGE_INSET = 0.37;

/** One pier: two shafts, a cap beam over both, two spacers, one strainer. */
function pier(
  x: number,
  z: number,
  ux: number,
  uz: number,
  /** Unit direction back down the fence run, away from the mouth. */
  sign: number,
  groundY: GroundSampler,
  posts: PostPlacement[],
  rails: RailPlacement[],
): void {
  const outX = x + ux * sign * PIER_SPAN;
  const outZ = z + uz * sign * PIER_SPAN;
  const ground = Math.max(groundY(x, z), groundY(outX, outZ));
  const jitter = postJitter(0, 0, true);

  // Both shafts identical in every number: the two sides of a gate are one
  // matched pair or they are two unrelated posts, and the last pass rendered
  // them thirty-five saturation points apart from nothing but a free yaw.
  for (const [sx, sz] of [
    [x, z],
    [outX, outZ],
  ] as const) {
    posts.push({
      x: sx,
      z: sz,
      baseY: ground - TIMBER.sink,
      height: jitter.height,
      girth: TIMBER.gatePostGirth,
      tilt: 0,
      tiltDir: 0,
      yaw: jitter.yaw,
      tone: POST_TONE.gate,
      seed: 0.5,
    });
  }

  const head = ground + TIMBER.gatePostHeight;
  const capY = head + CAP_BEAM.thickness / 2;
  rails.push({
    ax: x - ux * sign * CAP_OVER,
    ay: capY,
    az: z - uz * sign * CAP_OVER,
    bx: outX + ux * sign * CAP_OVER,
    by: capY,
    bz: outZ + uz * sign * CAP_OVER,
    thickness: CAP_BEAM.thickness,
    depth: CAP_BEAM.depth,
    topness: 1,
    tone: TIMBER_TONE.cap,
    seed: 0.5,
  });
  rails.push(
    {
      ax: x,
      ay: ground + SPACER_HEIGHT,
      az: z,
      bx: outX,
      by: ground + SPACER_HEIGHT,
      bz: outZ,
      thickness: SPACER.thickness,
      depth: SPACER.depth,
      topness: 0.4,
      tone: TIMBER_TONE.leaf,
      seed: 0.5,
    },
    {
      ax: outX,
      ay: ground + PIER_BRACE.low,
      az: outZ,
      bx: x,
      by: ground + PIER_BRACE.high,
      bz: z,
      thickness: PIER_BRACE.thickness,
      depth: PIER_BRACE.depth,
      topness: 0.75,
      tone: TIMBER_TONE.leaf,
      seed: 0.5,
    },
  );

  // The strainer leans back down the fence line away from the opening, so it
  // never crosses the mouth, and it is steep enough to read as a brace.
  const footX = outX + ux * sign * STRAINER.foot;
  const footZ = outZ + uz * sign * STRAINER.foot;
  rails.push({
    ax: footX,
    ay: groundY(footX, footZ) + 0.09,
    az: footZ,
    bx: outX,
    by: ground + STRAINER.head,
    bz: outZ,
    thickness: STRAINER.thickness,
    depth: STRAINER.depth,
    topness: 0.6,
    tone: TIMBER_TONE.line,
    seed: 0.5,
  });
}

/**
 * Everything the opening adds: two piers into `posts` and `rails`, and both
 * leaves into `rails`. Called once per gap that carries a kit, after the line
 * fence has filled the same arrays.
 */
export function gateKitPlacements(
  opening: FenceOpening,
  groundY: GroundSampler,
  posts: PostPlacement[],
  rails: RailPlacement[],
): GateLeafAssembly[] {
  const { ax, az, bx, bz, ux, uz, nx, nz } = opening;
  pier(ax, az, ux, uz, -1, groundY, posts, rails);
  pier(bx, bz, ux, uz, 1, groundY, posts, rails);

  // The two leaves, and there are only ever two. Each hangs off the inward face
  // of its own inner shaft and swings toward the field, mirrored about the
  // centre line.
  const cos = Math.cos(OPEN_ANGLE);
  const sin = Math.sin(OPEN_ANGLE);
  // Inside the flat face of a five-sided post, never on its circumradius: the
  // hinge point has to land IN the timber or the leaf hangs in mid air beside it.
  const offset = TIMBER.gatePostGirth * HINGE_INSET;
  const length = (opening.width / 2) * LEAF_REACH;
  const hung: {
    hx: number;
    hz: number;
    dx: number;
    dz: number;
    closedX: number;
    closedZ: number;
  }[] = [];
  for (const [px, pz, sign] of [
    [ax, az, 1],
    [bx, bz, -1],
  ] as const) {
    hung.push({
      hx: px + nx * offset,
      hz: pz + nz * offset,
      dx: ux * sign * cos + nx * sin,
      dz: uz * sign * cos + nz * sin,
      closedX: ux * sign,
      closedZ: uz * sign,
    });
  }

  // ONE clearance for BOTH leaves. A gate is a matched pair a farmer hung on the
  // same morning: solving each leaf against the ground under its own arc is how
  // the two came back at different heights and read as storm damage. The pair is
  // hung off the highest ground either of them swings over, so neither ploughs
  // and both land at the same line.
  let clearance = -Infinity;
  for (const leaf of hung) {
    for (const t of [0, 0.35, 0.7, 1]) {
      clearance = Math.max(
        clearance,
        groundY(leaf.hx + leaf.dx * length * t, leaf.hz + leaf.dz * length * t),
      );
    }
  }

  const leaves: GateLeafAssembly[] = [];
  for (const { hx, hz, dx, dz, closedX, closedZ } of hung) {
    // The leaf's own plane normal, turned to face the field. Rotating the leaf
    // direction a quarter turn gives two candidates; the one that agrees with
    // the opening's inward normal is the face a player is standing in front of.
    const perpX = -dz;
    const perpZ = dx;
    const facing = perpX * nx + perpZ * nz >= 0 ? 1 : -1;
    const leaf = {
      hx,
      hz,
      y0: clearance,
      dx,
      dz,
      px: perpX * facing,
      pz: perpZ * facing,
      length,
    };
    const cross = dx * closedZ - dz * closedX;
    const dot = dx * closedX + dz * closedZ;
    leaves.push({
      hingeX: hx,
      hingeZ: hz,
      closeTurn: Math.atan2(cross, dot),
      parts: leafParts(leaf),
    });
  }
  return leaves;
}
