// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * THE master palette (spec/05). Every material in the game samples from here,
 * so a programmatic palette shift stays one edit and nothing hardcodes a colour
 * outside this module.
 *
 * The moment is fixed: the hour before sunset, permanently (spec/04). There is
 * no day/night cycle, so these are not "the golden-hour preset" - they are the
 * colours of the game. Sun-warmed greens and golds on the ground, cream wool,
 * weathered timber, a dusty blue zenith falling to warm haze at the horizon.
 *
 * Two kinds of value live here and they are not interchangeable:
 *
 *  - PALETTE entries are AUTHORED sRGB hex. Hand them to `color('#...')` (or a
 *    THREE.Color), which converts to the linear working space for you, so what
 *    you type is what you see.
 *  - RAMP / grade tints are LINEAR multipliers, written as plain numbers. They
 *    multiply an already-linear base colour inside a shader. Authoring them as
 *    hex would be a category error: a warm hex that looks right on screen is a
 *    violent yellow shift once it is linearised and used as a gain.
 *
 * The palette grows with its readers, never ahead of them (AGENTS.md rule 10:
 * the dusk lamp that could never turn on). An asset agent adding the barn or
 * the treeline adds its colours HERE, in the same change as the material that
 * reads them, rather than inventing a green in its own file.
 */

import * as THREE from 'three/webgpu';

// --- the light --------------------------------------------------------------

/**
 * The golden-hour key, as a unit vector pointing FROM the world TOWARD the sun.
 * 8 degrees above the horizon, 40 degrees west of up-field (the gate is at
 * world +z, so this rakes across the field rather than down it).
 *
 * 8 degrees is measured, not chosen by mood. It is the highest sun that still
 * sits inside the beauty camera's frame (9 m up, aimed at 2.2 m from 36 m out:
 * the top of a 45 degree fov lands at 11.8 degrees), and it is low enough that
 * a 10 degree rise in the terrain swings nDotL by 0.085 - which is more than a
 * band width, so gentle relief actually lights instead of reading as one flat
 * green. Raise it and the field goes uniform; drop it much further and every
 * vertical surface is shadow.
 *
 * One direction, everywhere: baked directional cues in textures are forbidden
 * (spec/05), so this vector is the only thing that decides where light is.
 */
export const SUN_DIRECTION = new THREE.Vector3(-0.637, 0.139, 0.759).normalize();

// --- surfaces ---------------------------------------------------------------

export const PALETTE = {
  // Sky. The horizon is the load-bearing one: scene.fog is driven from it every
  // frame (spec/04), so the ground melts into the sky at the same colour.
  /** Zenith. Dusty blue, desaturated by the haze below it. */
  skyZenith: '#4d7cb4',
  /** The band between. Pale, slightly warm, where blue gives up. */
  skyMid: '#93aecb',
  /** Horizon haze. Also the fog colour, always. */
  skyHorizon: '#eebd88',
  /** The sun's own disc. Driven above 1.0 in the sky shader so bloom finds it. */
  sunDisc: '#fff0cc',
  /** The warm halo around it. No god rays (spec/04): the glow is the effect. */
  sunGlow: '#ffc582',
  /** Cloud tops, catching the key. */
  cloudLit: '#ffe6c0',
  /** Cloud undersides. Violet-mauve, hue-shifted cool, never grey. */
  cloudShade: '#bfa1ae',

  // Ground.
  /** The pasture inside the fence, lit tone. Green pushed toward gold. */
  grassLight: '#a7b76c',
  /** The pasture inside the fence, shaded tone. Close in value on purpose and
   *  measured that way: at the Classic camera the ground is the whole frame, so
   *  a wide gap between the two greens stops reading as pasture and starts
   *  reading as camouflage. The difference is mostly hue, barely value. */
  grassDark: '#87995f',
  /** Everything beyond the fence. Duller, so the eye stays in the field. */
  surround: '#8b9468',
  /** The pen floor: trodden, warmer, calmer than pasture. */
  penGround: '#c0a074',

  // Structures.
  /** Fence posts and rails. Weathered timber, never black. */
  timber: '#8d6a43',
  /** Gate posts, marked out so the opening reads from across the field. */
  gatePost: '#b8834b',

  // Animals.
  /** Sheep wool in full key. Held under paper white so the rim retains room. */
  sheepWoolLit: '#f0dfc0',
  /** Sheep wool through the broad middle band. Cream, never neutral white. */
  sheepWoolMid: '#dec59a',
  /** Sheep wool in shade. Dusty blue-sage keeps a clearly cool saturated hue. */
  sheepWoolShade: '#94a9b2',
  /** One warm-violet ink around wool, head, ears and legs, never pure black. */
  sheepOutline: '#704a38',
  /** Skull and ears, one cool charcoal family with the outline. */
  sheepFace: '#514143',
  /** Legs, slightly cooler than the face so they stay distinct from timber. */
  sheepLeg: '#4d4146',
  /** Hooves, the planted darkest animal value. */
  sheepHoof: '#2c252c',
  /** The dog's coat. */
  dogCoat: '#54402f',
  /** The dog's blaze and chest, so the dog reads at distance. */
  dogMark: '#e9d8ba',
} as const;

/**
 * The fog colour, which is the horizon colour, which is one value.
 * Atmosphere copies from this every frame; nothing mutates it.
 */
export const SKY_HORIZON_COLOR = new THREE.Color(PALETTE.skyHorizon);

// --- the toon ramp ----------------------------------------------------------

/**
 * Linear multipliers over a base colour, one per band (spec/05: two-to-three
 * quantized bands, soft terminator, saturated shadows).
 *
 * `shadow` is a cool blue-violet gain, NOT a darken: the blue channel survives
 * at 0.80 while red drops to 0.46, so a shaded green stays green and shifts
 * hue toward the sky instead of sliding into mud. `lit` is the reverse: red and
 * green gain, blue is held back, which is what golden light does.
 *
 * Blue is held back only slightly, and that is measured. Khronos Neutral tone
 * mapping subtracts up to 0.04 from every channel, which costs a channel already
 * near 0.1 more than a third of its value, and the grade's saturation lift takes
 * another fifth. Suppress blue hard here as well and sunlit grass arrives on
 * screen as acid yellow-green rather than as a warm meadow.
 */
export const RAMP = {
  /** nDotL below this is shadow. A sheep's off-sun flank, a north-east slope. */
  shadowEdge: 0.42,
  /**
   * nDotL above this is full key. Placed so that flat ground (0.570 under an 8
   * degree sun) sits a third of the way into the terminator rather than below
   * it: the flats are sunlit, every slope that turns toward the sun crosses
   * into full key, and the hollows fall back to mid. That third is the whole
   * trick - put the edge above flat ground and the field goes olive, put it
   * below and the relief stops reading at all.
   */
  litEdge: 0.58,
  /** Full width of both smoothstep terminators. Soft, not blurry. */
  terminator: 0.07,
  shadow: [0.46, 0.55, 0.8] as const,
  mid: [1.02, 0.97, 0.93] as const,
  lit: [1.3, 1.17, 0.96] as const,
  /**
   * Additive sky bounce, linear. Small, and the reason a dark coat in shadow
   * reads as cool blue-grey rather than as a hole: a pure multiply cannot keep
   * hue in a colour that is already near black.
   */
  fill: [0.015, 0.021, 0.038] as const,
} as const;

/**
 * Rim light, for hero assets only (spec/05: silhouette pop against grass).
 * Opt-in per material - on a ground plane a fresnel rim is just noise.
 */
export const RIM = {
  /** Linear, additive. Sun-coloured, because that is what a rim is. */
  color: [0.95, 0.72, 0.42] as const,
  /** Fresnel below this contributes nothing. */
  start: 0.55,
  /** Peak strength at the silhouette edge. */
  strength: 0.34,
  /**
   * How much rim survives on the shadow side. Nearly half, and that is the
   * point rather than a compromise: the sun is 8 degrees up and up-field, so
   * both gameplay cameras look toward it and see the flock backlit. A rim that
   * faded with the key would vanish in exactly the frame that needs it.
   */
  shadowFloor: 0.45,
} as const;

// --- the grade --------------------------------------------------------------

/**
 * The one colour grade (spec/05: post is seasoning, not the dish). Linear
 * multipliers again, blended by luminance: shadows drift cool, highlights drift
 * warm, and the whole frame gains a little saturation. That is the entire look
 * adjustment; there is no second grade anywhere.
 */
export const GRADE = {
  shadowTint: [0.96, 0.99, 1.08] as const,
  highlightTint: [1.07, 1.02, 0.96] as const,
  /** Linear-luminance range the tint blend crosses. Low, because linear. */
  shadowLuminance: 0.03,
  highlightLuminance: 0.45,
  /** 1.0 is neutral. */
  saturation: 1.03,
} as const;
