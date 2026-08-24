// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The homestead's colours, held here rather than in tsl/palette.ts only because
 * other builders are editing that module in parallel this phase.
 *
 * Every entry below is a palette candidate: promote in cohesion pass.
 *
 * THESE ARE TARGETS, NOT BASES. Every value here is the sRGB a screenshot of that
 * band should contain. farmhouse/bands.ts solves backwards through the tone map,
 * the grade and the band tint for whatever base the shared ramp has to be handed
 * to land on it, so reading this file tells you what the building looks like
 * instead of what it was multiplied by.
 *
 * THE ROOF IS A MATERIAL, NOT A COLOUR CHOICE, and that is the correction this
 * pass is built around. The previous slate was a grey-violet at a fifth
 * saturation in EVERY band, which meant the sunlit pitch was as violet as the
 * shaded one and the whole cluster read as "the purple-roofed house". A real
 * slate in golden-hour light is a warm-leaning grey where the sun reaches it and
 * shifts cool only where it does not, which is the same rule spec/05 states for
 * every other surface in the game: shadows hue-shift toward the sky, lit faces
 * hue-shift toward the key. So the lit slate below is a warm grey near a tenth
 * saturation - the same family as the fence timber and the chimney stone - and
 * the violet lives only in the shade band.
 *
 * ONE PAINT PER BUILDING, THREE VALUES OF IT. The ladders are near thirty-five
 * luminance points a step and every step in a set holds one hue, so what
 * separates two walls is which way they face, not what they were painted.
 *
 * ONE ACCENT. The barn is the single rust-red in the cluster (spec/05's rust-red
 * barn accents); the house is limewash and the lean-to is bare board.
 *
 * WHERE THE CEILING IS. In the shadow band the ramp can pass at most 0.46 of red,
 * which lands near sRGB 185: a shadow here can be a warm bone-taupe but it can
 * never be a cream, so nothing below asks for one.
 */

/**
 * One surface, three bands. `shade` is what the surface looks like where nDotL is
 * below RAMP.shadowEdge, `key` where it is above RAMP.litEdge, `body` between.
 */
export interface BandSet {
  readonly shade: string;
  readonly body: string;
  readonly key: string;
}

/**
 * Limewash, and the colour the whole cluster is judged on: it is most of what the
 * approach sees. One warm bone from key to shadow - hue 33 to 38 across the whole
 * ladder - so the sunlit flank and the shadowed gable are plainly the same wall
 * under different light.
 *
 * The key came down eight points off the previous pass. A limewash that renders
 * over 215 is the brightest object in a golden-hour frame, and the brightest
 * object in this frame has to be the sky.
 * palette candidate: promote in cohesion pass
 */
export const WALL: BandSet = { shade: '#ac9781', body: '#d1bf9f', key: '#e6d6b5' };
/**
 * The same limewash where a century of rain has run down it. Seven luminance
 * points under the clean render and no more: the difference between a plaster
 * repair and a damp stain.
 */
export const WALL_PATCH: BandSet = { shade: '#a5907c', body: '#c9b799', key: '#ddceae' };

/**
 * Slate, and the surface this asset lives or dies by: it is most of what a
 * hundred-metre silhouette is made of.
 *
 * A warm grey at eleven per cent saturation where the key reaches it, the same
 * grey a step down in the body band, and a cool violet only in shade. Read the
 * three values as a material and they are one slate under three lights; read the
 * old three and they were one paint at three brightnesses.
 *
 * THE SHADE BAND CAME UP TWELVE POINTS AND LOST HALF ITS BLUE LEAD after the
 * hipped end went in. With a real terminator in the roof the cool band no longer
 * has to carry the whole value break on its own, and at the old depth the shaded
 * pitch arrived as a saturated indigo panel - a shadow loud enough to be read as
 * paint. Here the blue leads the red by nine points rather than sixteen: enough
 * for the shadow to be plainly cool against a warm-grey key, not enough for it to
 * become the colour anybody names the building by.
 * palette candidate: promote in cohesion pass
 */
export const ROOF: BandSet = { shade: '#635b68', body: '#7d7167', key: '#a2968a' };
/**
 * The barn's slate: the same material, weathered browner and held a step down in
 * every band. At Follow the two roofs stand shoulder to shoulder, and a value
 * break on the lower ridge is what parses the silhouette back into a house and an
 * outbuilding without inventing a second roofing material. The lean-to takes this
 * set as well. palette candidate: promote in cohesion pass
 */
export const BARN_ROOF: BandSet = { shade: '#564e5c', body: '#6a6058', key: '#8b7e70' };

/**
 * Barn boards, and the one rust-red the palette allows. Warm, clearly a red, and
 * held a step below the house in value so the barn stays the outbuilding.
 * palette candidate: promote in cohesion pass
 */
export const BARN: BandSet = { shade: '#6f4238', body: '#9c5e44', key: '#c07d52' };

/**
 * Bare weathered board: the lean-to, its posts, and the log stack.
 *
 * The lean-to used to be limewashed like the house, and its end wall - the one
 * plane in the cluster that takes the key almost square on - arrived as the
 * brightest object in the frame at sRGB 183. A shed tacked onto a farmhouse is
 * not limewashed; it is boards. Timber is a full band under the render and it
 * puts a warm mid-value mass between the cream range and the trodden yard.
 * palette candidate: promote in cohesion pass
 */
export const TIMBER: BandSet = { shade: '#6d5745', body: '#8f7154', key: '#ab8b66' };

/**
 * Dressings: the plinth course under each building. Warm stone, deliberately
 * between the roof and the wall in value. palette candidate: promote in cohesion pass
 */
export const DRESS: BandSet = { shade: '#8f6d5c', body: '#b8916a', key: '#cda578' };
/**
 * The chimney. A warm grey-brown stone, close enough to the lit slate to read as
 * the same family of material and far enough off the timber not to read as trim.
 * palette candidate: promote in cohesion pass
 */
export const MASONRY: BandSet = { shade: '#645a58', body: '#8b7a6e', key: '#ad9a86' };

/**
 * Every opening in the cluster, and there is now ONE treatment for all of them.
 *
 * At a hundred metres a window is a dark value note in a wall and nothing else.
 * The previous pass modelled jambs, a lintel, a projecting sill and a mullion per
 * opening and tinted the glass separately from the doors; the surrounds rendered
 * at sRGB 194, which made the joinery the brightest and busiest thing on a
 * building that is meant to be read as a silhouette. All of it is gone. What is
 * left is a warm-shifted dark - a plum-brown, not a navy - so the holes belong to
 * a sunset frame rather than to a different painting.
 * palette candidate: promote in cohesion pass
 */
export const OPENING: BandSet = { shade: '#3b3236', body: '#463c3e', key: '#514547' };

/** Trodden earth in the yard and along the drive, lit. palette candidate: promote in cohesion pass */
export const YARD: BandSet = { shade: '#8a6c55', body: '#a9825a', key: '#c39d70' };
/**
 * The second earth value: the beaten core of the yard and the wheel ruts, which
 * are older, greyer and packed harder than the loose dirt around them. Two values
 * in the earth is what gives a worn surface structure instead of a wash.
 * palette candidate: promote in cohesion pass
 */
export const YARD_PACKED: BandSet = { shade: '#6f584a', body: '#8a6b4e', key: '#a2825f' };

/**
 * Lamplit glass. Deeper amber than a lamp looks by eye, on purpose: it is driven
 * above 1.0 in the shader, and a colour whose green and blue are already high
 * arrives as a white sliver rather than as lamplight.
 * palette candidate: promote in cohesion pass
 */
export const WINDOW_GLOW = '#ffb04a';

/**
 * How far above 1.0 the glass is driven. The post chain's bloom threshold is 0.92
 * linear (scene/PostProcessing.tsx) and this amber linearises to a luminance near
 * 0.50, so 1.7 puts a pane clear of the line: the bloom spilling onto the render
 * around it is the window light on the wall, which is cheaper and steadier than
 * painting a halo into the wall material.
 */
export const WINDOW_GAIN = 1.7;

/**
 * The outline tone (spec/05: a darkened warm tone of the surface, never pure
 * black). Authored lighter than it looks like it should be, and measured: the
 * tone map subtracts up to 0.04 from every channel before the sRGB transform,
 * which on a colour this dark is most of the darkest channel.
 * palette candidate: promote in cohesion pass
 */
export const OUTLINE = '#6b5a55';

/**
 * Woodsmoke, banded like everything else in the cluster.
 *
 * THE CEILING IS THE SKY IT STANDS ON. The previous plume peaked at sRGB
 * (216, 201, 180) against a sky measured at (171, 169, 175): a column of white
 * over a cottage that is trying to be the quiet part of the picture. Woodsmoke is
 * not steam and it is not cloud. The key band here renders at luminance 158,
 * which is under the sky at every point the plume crosses it, so the drift reads
 * as smoke thinning into the light rather than as a hole cut in it.
 * palette candidate: promote in cohesion pass
 */
export const SMOKE: BandSet = { shade: '#7f7681', body: '#948b8e', key: '#a69d97' };

/**
 * How deep the contact shadow at a footing goes, as a colour rather than a
 * multiply. A gain cannot cool a warm earth without also greying it, so the yard
 * mixes toward this instead: a warm plum, hue-shifted off the earth rather than
 * darker than it, so the buildings are bedded into the pad and not stood on it.
 * palette candidate: promote in cohesion pass
 */
export const CONTACT = '#7d5a5e';

/**
 * The long shadow the buildings throw.
 *
 * IT IS THE FENCE'S OWN SHADE TONE, and that is cohesion rather than laziness:
 * scene/fence/shadowCast.ts lays this exact colour under 800 m of timber in the
 * same frame, and two shadow tones in one photograph is how a painterly scene
 * comes apart. A deep pasture green pulled toward the sky reads as shade on the
 * sunlit grass and as cool shade over the warm yard, which is what shade does.
 * palette candidate: promote in cohesion pass
 */
export const CAST_SHADOW = '#5b6252';
/** How much of it lands where the shadow is at full strength. The fence uses
 *  0.6 under a post; a building slab is a broader area, so it sits under that. */
export const CAST_SHADOW_OPACITY = 0.5;
