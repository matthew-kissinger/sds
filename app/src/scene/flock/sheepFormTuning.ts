// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Shared authored offsets for the sheep silhouette. */
export const FLEECE_LIFT = 0.075;
/** Sink the complete head and ear assembly into the shoulder fleece. */
export const HEAD_LIFT = -0.115;
/**
 * How much further the nose reaches than the buried head root, metres.
 *
 * It is a STRETCH, not a translation: the root ring stays where it is and each
 * ring moves by its own distance along the head, so the loft lengthens rather
 * than detaching from the shoulder.
 *
 * 0.02 was a short final reach that kept a blunt muzzle "without rebuilding a
 * neck", and the result measured 0.04 m of head beyond the fleece - a nub. The
 * neck is rebuilt now, in wool (sheepGeometry's last two puffs), so the stretch
 * can carry the face out to where an animal's face is without exposing a bare
 * stalk behind it. The fleece reaches 0.86 and the nose 0.925, so the clearance
 * the asset tests hold between muzzle and ruff is unchanged while the head
 * itself is 0.19 m clear of the BODY.
 */
export const HEAD_FORWARD = 0.17;
/** Enlarge the visible skull and muzzle without lengthening the buried neck. */
export const HEAD_FACE_SCALE = 1.08;
