// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Everything the fence's one material is tuned by. Split out of
 * `timberMaterial.ts` so both files stay small and so the numbers a critic
 * argues with sit in one place.
 *
 * EVERY COLOUR HERE IS A TARGET ON THE CAPTURE, not a base fed into a chain.
 * `timberBands.ts` solves backwards through the tone map and the grade, so what
 * is written below is what a pixel sampler finds. Four passes of this asset were
 * spent authoring bases and measuring something else; the table stopped moving
 * the moment it started describing the picture rather than the input.
 *
 * palette candidate: promote in cohesion pass
 */

import type { BandSet } from './timberBands';

/**
 * SUN-BLEACHED TIMBER: A WARM-NEUTRAL BODY WITH A GOLDEN LIT EDGE.
 *
 * The discipline is split across two axes and they are not the same axis. VALUE
 * carries the ladder - top faces highest, vertical faces one step down, undersides
 * lowest - and SATURATION carries the light. A body at 18 percent saturation is
 * weathered grey-brown; the same hue at 39 percent on the lit band is the sun
 * actually landing on it. Push saturation into the body and the fence is orange
 * plastic, which is where this asset started; drain it out of the key band and the
 * fence is driftwood from some other, colder afternoon.
 *
 * The hues stay inside a 31-40 degree band, so what tells a pier from a rail is
 * value and mass and never a different colour. The shadow bands leave that band
 * on purpose: a hue-shifted cool violet, because spec/05 forbids grey mud and a
 * warm brown darkened without a hue shift is exactly that.
 *
 *   line   body H31 S18 V53   key H37 S39 V77   shade H256 S16 V37
 *   leaf   body H35 S24 V74   key H38 S32 V90   shade H252 S13 V52
 *   gate   body H36 S26 V70   key H37 S36 V84   shade H265 S12 V52
 *   cap    body H36 S27 V77   key H40 S31 V93   shade H274 S10 V53
 */
export const BANDS: Record<string, BandSet> = {
  /** Line posts and rails, left to silver. The value the whole run is read by. */
  line: { shade: '#524e5d', body: '#877b6e', key: '#c4a677' },
  /**
   * Leaves, stiles, strainers and pier bracing: newer sawn stock, and the value
   * came UP thirteen points.
   *
   * MEASURED, ON THE FOLLOW CAPTURE, AT THE ONE PLACE IT MATTERS. A leaf hangs
   * directly in front of the pier it is hung on, so those two woods are read
   * against each other in the same square centimetre of frame. The pier's visible
   * faces land at value 84; the old leaf body landed at 59, and 25 points across a
   * hard outline is not one built gate but a grey panel bolted to a cream post.
   * At 74 the leaf is still plainly a step below the shaft that carries it - a
   * hung thing reads as hung by being slightly in its own shade - and the two
   * finally read as cut from the same tree.
   */
  leaf: { shade: '#7a7385', body: '#bdaa90', key: '#e6cb9c' },
  /**
   * The gate pier shafts. The warmest, lightest STOCK on the fence is the brief,
   * and the body band carries it now as well as the key band: a pier is read at
   * Classic by whichever of its five facets faces the camera, and leaving the
   * shaded facets at 61 put a dark edge down the one object the field is scanned
   * for. The key band did not move - at 84 it holds against the peach horizon at
   * Follow without blowing out and without taking the eye off its own head.
   */
  gate: { shade: '#7c7484', body: '#b3a084', key: '#d6b98a' },
  /**
   * The pier heads, and this is the inversion the landmark turns on. The head
   * used to be the DARKEST timber on the fence, which at both gameplay cameras -
   * both of which look down - drew a black blob on top of a thin shaft. It is now
   * the LIGHTEST: a chamfered head catching the low sun, the brightest point
   * anywhere on 800 m of perimeter, and the thing the eye lands on first.
   */
  cap: { shade: '#7e7581', body: '#c4ae90', key: '#eed5a3' },
  /**
   * Hinge straps. Not wood, and the only thing on the fence that is not.
   *
   * Held one step under the outline it sits beside rather than far under it. On a
   * leaf at value 74 a strap at value 28 is the only near-black on 800 m of
   * perimeter, and at both gameplay cameras it read as a hole punched in the
   * leaf rather than as a band of iron laid across it. Value 30 to 45, hue held
   * cool, and the strap is a drawn mark on timber.
   */
  iron: { shade: '#443f4c', body: '#55505c', key: '#6c6672' },
};

/**
 * Which stock a piece is cut from, written into the instance attribute. An index
 * rather than a blend factor because iron is not on the line between two woods.
 */
export const TIMBER_TONE = { line: 0, leaf: 1, iron: 2, cap: 3 } as const;
export const POST_TONE = { line: 0, gate: 1, cap: 2 } as const;

/**
 * The outline (spec/05: thin, and a darkened warm tone of the surface, NEVER
 * black). Authored as a target like everything else, and it landed at value 22
 * for four passes while being written as a plausible near-black: the tone map
 * takes most of the darkest channel out of a colour this dark. At value 33 it is
 * a drawn line on timber rather than a hole cut in it, and the sixteen points
 * between it and the body are what a line has to have to read as a line.
 */
export const OUTLINE = '#554b46';

/**
 * Haze the far runs are pulled toward, and how much of it they take.
 *
 * SMALL, AND SMALLER THAN IT WAS. The perimeter has to hold ONE value from the
 * beauty camera at 140 m to the near camera at 12, or the same fence renders pale
 * on one side of the frame and dark on the other and reads as fog on a
 * placeholder. A sixth of the pixel was enough to do that; a tenth is not.
 */
export const AERIAL = '#9a8f80';
export const AERIAL_NEAR = 110;
export const AERIAL_FAR = 340;
export const AERIAL_MAX = 0.1;
/** Most of the haze taken back off the pier: it is the thing a player scans the
 *  field for, and haze is the one term that grows with exactly that distance. */
export const AERIAL_GATE_DAMP = 0.85;

/**
 * THE LOCAL LIGHT TERMS, measured in a piece's own local height.
 *
 * `ARRIS` is the strip along the top edge of a vertical face where a low sun
 * grazes the corner of a sawn board. It is what makes 800 m of fence read as one
 * continuous drawn line instead of as dashes: whichever way a rail faces, its top
 * few centimetres join the key band, so the line along the top of the run never
 * breaks where the run turns a corner. On a 22 cm cap rail the band is about 3 cm
 * of timber, which is a readable terminator at the near camera and a solid lit
 * edge at Classic.
 *
 * `UNDER` is the same idea inverted: the bottom arris falls toward the cool
 * shadow band, so a rail has a light top, a mid face and a cool underside and a
 * player can point at where the light stops.
 *
 * `HEAD` is the post's own chamfer, and it is driven by local height rather than
 * by the normal on purpose. Three transforms an instanced normal by the instance
 * matrix, so a 45 degree chamfer normal on a post scaled (0.33, 1.9, 0.33)
 * arrives at 10 degrees and shades as a side face. Local height survives any
 * instance scale exactly.
 */
export const ARRIS = [0.3, 0.42] as const;
export const ARRIS_LIFT = 0.3;
export const UNDER = [0.3, 0.44] as const;
export const UNDER_DROP = 0.16;
export const HEAD = [0.435, 0.475] as const;
export const HEAD_LIFT = 0.34;

/**
 * A warm collar of light directly under a pier head, on the gate only. A light
 * mark on a dark vertical is the most findable thing on a field, and it stays a
 * MARK by living in the last tenth of the shaft.
 */
export const COLLAR = [0.86, 0.99] as const;
export const COLLAR_LIFT = 0.16;

/**
 * BRUSHWORK, NOT AIRBRUSH, AND THE FREQUENCY WAS THE WHOLE BUG. The grain ran at
 * 58 units across a 33 cm post, which is nineteen noise cycles over the width of
 * one stick: at any camera in this game that is sub-pixel noise, and sub-pixel
 * noise on timber reads as rot. The strokes now run at roughly two per visible
 * face and slowly along the piece, quantised into three values whose spread is
 * seven percent - enough that a rail face is readably banded, small enough that
 * no stroke ever reads as a stain.
 */
export const GRAIN = {
  /** Cycles per metre across the piece, and along it. */
  postAcross: 7.5,
  railAcross: 9,
  along: 0.55,
  /** A second, finer octave, weighted low. */
  octave: [1.9, 0.6, 1.9] as const,
  coarse: 0.9,
  fine: 0.22,
  /** The two thresholds the noise is cut at, and how hard the cut is. */
  cutLow: -0.24,
  cutHigh: 0.22,
  edge: 0.04,
  /** Grain as a gain either side of the piece's own tone. A gain rather than a
   *  mix toward two fixed colours: a mix lifts a dark shade band further than a
   *  pale key band and closes exactly the ladder the asset is built on. */
  low: 0.93,
  high: 1.07,
} as const;

/** Nominal rail cross-section, metres, used to put rail grain at the same
 *  physical density as post grain. */
export const RAIL_SECTION = 0.11;
/** How far a well-silvered line piece may have drifted from its neighbours, as a
 *  gain. Small: this is one board weathering faster, not a second material. */
export const BLEACH_SPREAD = 0.07;

/**
 * Damp earth at a post foot, as a soft upward fade with a noisy boundary. Cool
 * and darkening rather than black, so the post plants itself in the grass instead
 * of ending at it. The cast-shadow pass lays a real contact pool on the ground
 * under it, so this only has to darken the timber.
 */
export const SOIL = [0.82, 0.83, 0.87] as const;
/**
 * MEASURED IN METRES ABOVE THE FOOT, not as a fraction of the piece. A fraction
 * puts a 30 cm collar on a 1.9 m line post and a 50 cm one on a 3.1 m pier, and
 * the pier's - a hard grey line straight across a cream shaft at the exact height
 * the eye is drawn to - was the one mark on the gate that read as a rendering
 * fault rather than as weather.
 */
export const SOIL_HEIGHT = 0.2;
export const SOIL_WOBBLE = 0.07;
export const SOIL_NOISE = 3.1;
export const SOIL_STRENGTH = 0.5;
