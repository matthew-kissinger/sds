// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Every colour the dog is made of, and the arithmetic that produced it.
 *
 * ONE COAT, ONE HUE FAMILY, THREE VALUES. That is the whole scheme and it is a
 * correction. The pass before this split the terminator across 130 degrees of
 * hue - an indigo shadow band at hue 248 against a warm mid at hue 24 - on the
 * theory that a near-black coat cannot afford a value step. What it actually
 * bought was two animals: side and three-quarter framings, where the shaded
 * flank owns most of the visible surface, rendered a blue-black dog, while rear
 * and top framings, where the up-facing key band owns it, rendered a chocolate
 * one. The legs went further still - thin columns catch the mid band from every
 * direction, so they read as warm brown sticks socketed into a navy torso with a
 * visible seam at the shoulder.
 *
 * So the three bands now sit at hue 30, 33 and 32, and the terminator is carried
 * by VALUE: lightness 0.153, 0.229 and 0.331. A step of eight points and then
 * ten, which is a quantized ramp a scanline actually falls down rather than a
 * gradient with a colour change in it. The shadow band still leans cool RELATIVE
 * to the key - a shade less red, and the least chromatic of the three - which is
 * the hue shift spec/05 asks for, applied as a lean rather than as a species
 * change.
 *
 * THE DOG IS STILL THE DARK ONE, just not a hole. Sunlit pasture measures
 * lightness 0.51 and sunlit fleece 0.72. The coat's brightest band is 0.331 -
 * under two thirds of the grass it stands on - and its mass in both gameplay
 * framings, which look toward an 8 degree sun and therefore see the animal
 * backlit, is nearer 0.19. Against that, five white marks at 0.76 and 0.89 are
 * the brightest things in the pasture, and the pair of readings is what the
 * player finds in under a second (spec/05).
 *
 * EVERY HEX IS SOLVED BACKWARDS FROM THE SCREEN, never picked in a colour wheel.
 * The chain between `color('#...')` and a pixel is: the grade's luminance-blended
 * tint, a 1.03 saturation lift, then Khronos Neutral tone mapping, then the sRGB
 * transform. Neutral subtracts an offset of `x - 6.25x^2` (x being the smallest
 * linear channel) from all three channels, which on a dark colour removes most of
 * the smallest channel and therefore drives saturation up hard. Author a swatch
 * at face value and it lands far darker and far more saturated than intended. So
 * each constant below is the INVERSE: what to type to arrive at the tone named in
 * its comment.
 *
 * Every one of these is a palette candidate: promote in cohesion pass.
 */

// --- the coat ----------------------------------------------------------------

/**
 * Off-sun. Lands at sRGB(46,39,32): lightness 0.153, saturation 0.18, hue 30.
 *
 * A warm-neutral near-black, not an indigo. It is the darkest tone the coat
 * reaches and it is deliberately the least chromatic of the three, because the
 * band that covers the most surface is the one that has to behave like a
 * neutral: a tone gets to be chromatic in proportion to how little of the frame
 * it holds. Its cool lean is relative rather than absolute - half the key band's
 * saturation and a touch less red - which reads as sky in the shadows without
 * ever naming a second colour.
 *
 * IT IS 0.153 RATHER THAN 0.110 BECAUSE OF THE FACE. Any framing where the dog
 * looks away from the sun puts the whole front of the skull and muzzle in this
 * band, and at 0.110 the hero-front capture came back with a black plate across
 * the face that read as a mask rather than as an animal in its own shade. Four
 * points of lift is enough for the low-poly facets of the muzzle to separate
 * from each other, and the ladder still steps 0.076 and then 0.102.
 */
export const COAT_SHADOW = '#47423c';
/**
 * The middle band, at sRGB(72,60,45): lightness 0.229, saturation 0.23, hue 33.
 * Twelve points of lightness over the shadow band, which is a step a scanline
 * falls down. This is the band that covers the top of the back from both
 * gameplay cameras, so it is the dog's silhouette value.
 *
 * ITS CHROMA IS CAPPED FOR A REASON. At saturation 0.34 the hero captures came
 * back with a chocolate labrador: the value ladder was right but the coat had
 * enough colour in it to be a brown dog rather than a black one with warm light
 * on it. A quarter of saturation is the most a band this large can carry and
 * still read as black fur at golden hour.
 */
export const COAT_MID = '#5c5246';
/**
 * Full key, at sRGB(104,86,65): lightness 0.331, saturation 0.23, hue 32. Ten
 * points over the mid band and 0.18 under sunlit pasture, so the sun-facing
 * flank is the lightest the coat ever gets and is still clearly darker than the
 * grass behind it.
 */
export const COAT_LIT = '#766654';

// --- the white marks ---------------------------------------------------------

/**
 * The marks are WHITE, not cream, and that is what makes the badge work. Sunlit
 * fleece measures sRGB(238,190,131), lightness 0.72; this lands at sRGB
 * (242,234,214), lightness 0.894. The blaze is therefore the brightest thing in
 * the pasture while the body is the darkest.
 */
export const CREAM_LIT = '#fffcee';
/** sRGB(214,201,175): lightness 0.763, saturation 0.32, hue 40. The band the
 *  top of the skull actually lands in from the Classic camera, so this is the
 *  value the blaze has to carry at gameplay distance rather than CREAM_LIT. */
export const CREAM_MID = '#d5cdba';
/**
 * White fur in shadow, at sRGB(152,143,131): lightness 0.555, saturation 0.09,
 * hue 34. It stays in the coat's warm family now that the coat has one, because
 * the previous pass followed the shadow band into hue 240 and the three-quarter
 * capture came back with a lavender blob on the shoulder. Nine points of
 * saturation is enough to sit warm, not enough to name a colour.
 */
export const CREAM_SHADOW = '#9d978e';

// --- the face ----------------------------------------------------------------

/**
 * Eye rim and nose leather, at sRGB(19,16,14). The darkest tone on the animal by
 * a wide margin, and warm-neutral like everything else. Applied to all three
 * bands, because a nose does not brighten when the sun catches it.
 */
export const FACE_DARK = '#302e2b';
/**
 * The iris, at sRGB(96,62,34). A collie's eye is amber-brown, and giving the eye
 * an iris inside a dark rim is what makes it read as an eye at hero magnification
 * rather than as a drilled hole.
 */
export const EYE_IRIS = '#6e523e';
/**
 * The catch light, at sRGB(198,188,172). A warm grey, and mixed in at six tenths
 * rather than laid on opaque, so at hero magnification it is a soft light in a
 * wet eye and at gameplay distance it is nothing at all. The previous pass used
 * a near-white at full strength and the critic read the pair as render glitches.
 */
export const EYE_CATCH = '#c6c1b7';

// --- the line ----------------------------------------------------------------

/**
 * The inverted-hull outline, at sRGB(20,15,12): lightness 0.063, saturation
 * 0.25, hue 23. A darkened warm tone of the surface, never pure black (spec/05),
 * and one tone for the whole animal so the line reads as drawn rather than as
 * noise. It sits five points of lightness under the shadow band, which is the
 * point: against grass at 0.51 it is a firm dark edge, and against the coat it
 * does not announce itself as a second material.
 */
export const OUTLINE = '#2f2c29';
