// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Owned collie anatomy in metres. +z is forward; leg lofts are rotated downward. */
import type { LoftRing } from './loft';

export const SPINE: readonly LoftRing[] = [
  { z: -0.960000, y: 1.000000, halfWidth: 0.19, halfHeight: 0.17 }, // point of buttock
  { z: -0.820000, y: 1.050000, halfWidth: 0.33, halfHeight: 0.26 }, // croup, sloping
  { z: -0.560000, y: 1.090000, halfWidth: 0.44, halfHeight: 0.34 }, // haunch, the rear mass
  { z: -0.240000, y: 1.140000, halfWidth: 0.32, halfHeight: 0.27 }, // loin, the waist
  { z: 0.100000, y: 1.100000, halfWidth: 0.45, halfHeight: 0.36, lowerRoundness: 0.65 }, // ribs, deepest
  { z: 0.350000, y: 1.145000, halfWidth: 0.405, halfHeight: 0.325, lowerRoundness: 0.95 }, // withers
  { z: 0.445, y: 1.160, halfWidth: 0.355, halfHeight: 0.310, lowerRoundness: 0.95 }, // shoulder-to-neck transition
  { z: 0.540000, y: 1.160000, halfWidth: 0.305, halfHeight: 0.285, lowerRoundness: 0.95 }, // neck base
  { z: 0.629744, y: 1.253814, halfWidth: 0.29, halfHeight: 0.290, lowerRoundness: 0.95 }, // neck, cresting
  { z: 0.719487, y: 1.401243, halfWidth: 0.27, halfHeight: 0.255 }, // nape
  { z: 0.790000, y: 1.482000, halfWidth: 0.27, halfHeight: 0.225 }, // occiput
  { z: 0.890000, y: 1.490000, halfWidth: 0.275, halfHeight: 0.225 }, // the dome, broadest
  { z: 0.990000, y: 1.478000, halfWidth: 0.235, halfHeight: 0.195 }, // brow
  { z: 1.035000, y: 1.462000, halfWidth: 0.182, halfHeight: 0.164 }, // cheek, in the skull
  { z: 1.085000, y: 1.444000, halfWidth: 0.123, halfHeight: 0.115 }, // the stop
  { z: 1.160000, y: 1.440000, halfWidth: 0.105, halfHeight: 0.095 }, // muzzle root
  { z: 1.268333, y: 1.435000, halfWidth: 0.086, halfHeight: 0.078 }, // muzzle taper
  { z: 1.355833, y: 1.430000, halfWidth: 0.068, halfHeight: 0.06 }, // narrowing toward leather
  { z: 1.385000, y: 1.427000, halfWidth: 0.054, halfHeight: 0.044 }, // nose plane
];

export const FORE_LEG: readonly LoftRing[] = [
  { z: -0.17, y: -0.10, halfWidth: 0.05, halfHeight: 0.07 }, // chest-anchored buried seed
  { z: -0.07, y: -0.055, halfWidth: 0.075, halfHeight: 0.105 }, // gradual shoulder emergence
  { z: 0.0, y: -0.055, halfWidth: 0.115, halfHeight: 0.13 },
  { z: 0.18, y: -0.033, halfWidth: 0.126, halfHeight: 0.154 }, // upper arm
  { z: 0.32, y: -0.038, halfWidth: 0.115, halfHeight: 0.142 }, // elbow
  { z: 0.46, y: -0.014, halfWidth: 0.085, halfHeight: 0.098 }, // forearm
  { z: 0.65, y: 0.018, halfWidth: 0.069, halfHeight: 0.073 }, // cannon
  { z: 0.72, y: 0.014, halfWidth: 0.072, halfHeight: 0.077 }, // carpal pad behind wrist
  { z: 0.80, y: 0.023, halfWidth: 0.062, halfHeight: 0.064 }, // sloped pastern
  { z: 0.85, y: 0.036, halfWidth: 0.062, halfHeight: 0.065 }, // unchanged paw joint
];

export const THIGH: readonly LoftRing[] = [
  { z: -0.07, y: 0.008, halfWidth: 0.045, halfHeight: 0.06 }, // seed, inside the pelvis
  { z: 0.0, y: 0.0, halfWidth: 0.155, halfHeight: 0.21 }, // buried in the pelvis
  { z: 0.11, y: -0.012, halfWidth: 0.212, halfHeight: 0.255 }, // the swell of the hip
  { z: 0.27, y: -0.035, halfWidth: 0.198, halfHeight: 0.232 },
  { z: 0.41, y: -0.058, halfWidth: 0.14, halfHeight: 0.162 }, // above the stifle
  { z: 0.5, y: -0.07, halfWidth: 0.11, halfHeight: 0.128 }, // stifle
];

export const GASKIN: readonly LoftRing[] = [
  { z: 0.0, y: 0.0, halfWidth: 0.108, halfHeight: 0.128 }, // under the stifle
  { z: 0.105, y: -0.068, halfWidth: 0.092, halfHeight: 0.112 }, // gaskin, sweeping back
  { z: 0.205, y: -0.118, halfWidth: 0.07, halfHeight: 0.088 }, // the point of hock
  { z: 0.265, y: -0.100, halfWidth: 0.055, halfHeight: 0.06 },
  { z: 0.355, y: -0.044, halfWidth: 0.047, halfHeight: 0.051 }, // cannon, tapered
  { z: 0.43, y: -0.01, halfWidth: 0.054, halfHeight: 0.056 }, // pastern
];

export const PAW: readonly LoftRing[] = [
  { z: 0.0, y: 0.0, halfWidth: 0.060, halfHeight: 0.057 }, // ankle connection
  { z: 0.045, y: 0.015, halfWidth: 0.070, halfHeight: 0.065 }, // instep
  { z: 0.09, y: 0.041, halfWidth: 0.087, halfHeight: 0.083 }, // raised knuckles
  { z: 0.145, y: 0.059, halfWidth: 0.084, halfHeight: 0.097 }, // toe volume rolls downward
  { z: 0.18, y: 0.068, halfWidth: 0.065, halfHeight: 0.055 }, // level contact pad
];

export const EAR: readonly LoftRing[] = [
  { z: 0, y: 0, halfWidth: 0.083, halfHeight: 0.055 },
  { z: 0.065, y: -0.009, halfWidth: 0.076, halfHeight: 0.046 },
  { z: 0.13, y: -0.05, halfWidth: 0.056, halfHeight: 0.033 },
  { z: 0.155, y: -0.115, halfWidth: 0.033, halfHeight: 0.023 },
  { z: 0.16, y: -0.18, halfWidth: 0.013, halfHeight: 0.012 },
];
export function dogEarProfile(side: number): readonly LoftRing[] {
  if (side > 0) return EAR;
  return EAR.map((ring, index) => ({
    ...ring,
    z: ring.z + Math.max(0, index - 1) * 0.009,
    y: ring.y * 0.8,
  }));
}

export const TAIL: readonly LoftRing[] = [
  { z: 0.0, y: 0.0, x: 0.0, halfWidth: 0.1, halfHeight: 0.112 }, // root at the croup
  { z: 0.105, y: -0.075, x: -0.02, halfWidth: 0.093, halfHeight: 0.119 }, // falls at once
  { z: 0.215, y: -0.172, x: -0.058, halfWidth: 0.093, halfHeight: 0.129 }, // broadening
  { z: 0.325, y: -0.258, x: -0.108, halfWidth: 0.086, halfHeight: 0.134 }, // widest feather
  { z: 0.43, y: -0.315, x: -0.165, halfWidth: 0.072, halfHeight: 0.122 },
  { z: 0.52, y: -0.332, x: -0.215, halfWidth: 0.056, halfHeight: 0.100 }, // the low point
  { z: 0.6, y: -0.308, x: -0.255, halfWidth: 0.041, halfHeight: 0.076 }, // hooking up
  { z: 0.655, y: -0.264, x: -0.278, halfWidth: 0.026, halfHeight: 0.049 },
  { z: 0.685, y: -0.222, x: -0.288, halfWidth: 0.012, halfHeight: 0.024 }, // the tip
];
