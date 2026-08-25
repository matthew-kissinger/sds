// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { HOOF_LIFT, sheepLegPose } from './flockTuning';
import {
  SHEEP_HOOF_BASELINE,
  SHEEP_HOOF_CONTACTS,
  SHEEP_HOOF_SOLE_POINTS,
} from './sheepParts';

/** Safety cap for local leg extension on the field's bounded slopes. */
export const SHEEP_TERRAIN_OFFSET_LIMIT = 0.08;

function clampSheepOffset(value: number): number {
  return Math.max(-SHEEP_TERRAIN_OFFSET_LIMIT, Math.min(SHEEP_TERRAIN_OFFSET_LIMIT, value));
}

export interface GroundSampler {
  groundY(x: number, z: number): number;
}

export interface LocalFoot {
  readonly x: number;
  readonly z: number;
}

/**
 * Local-space leg extension needed to put one authored sole on the drawn
 * terrain. `swingZ` follows the foot through its gait rather than sampling only
 * the standing pose. The caller supplies the root's already-sampled ground.
 */
export function footTerrainOffset(
  field: GroundSampler,
  rootGround: number,
  rootX: number,
  rootZ: number,
  yaw: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  foot: LocalFoot,
  swingZ = 0,
): number {
  return footTerrainOffsetFromBasis(
    field,
    rootGround,
    rootX,
    rootZ,
    Math.cos(yaw),
    Math.sin(yaw),
    scaleX,
    scaleY,
    scaleZ,
    foot,
    swingZ,
  );
}

/** Same calculation when the frame loop has already solved the yaw basis. */
export function footTerrainOffsetFromBasis(
  field: GroundSampler,
  rootGround: number,
  rootX: number,
  rootZ: number,
  cosYaw: number,
  sinYaw: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  foot: LocalFoot,
  swingZ = 0,
): number {
  const localX = foot.x * scaleX;
  const localZ = (foot.z + swingZ) * scaleZ;
  const worldX = rootX + cosYaw * localX + sinYaw * localZ;
  const worldZ = rootZ - sinYaw * localX + cosYaw * localZ;
  return (field.groundY(worldX, worldZ) - rootGround) / scaleY;
}

/** Four moving hoof-centre samples written straight into the instance buffer. */
export function writeSheepTerrainOffsets(
  out: Float32Array,
  at: number,
  field: GroundSampler,
  rootGround: number,
  rootX: number,
  rootZ: number,
  cosYaw: number,
  sinYaw: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  positiveSwing: number,
  negativeSwing: number,
): void {
  out[at] = clampSheepOffset(footTerrainOffsetFromBasis(
    field, rootGround, rootX, rootZ, cosYaw, sinYaw,
    scaleX, scaleY, scaleZ, SHEEP_HOOF_CONTACTS[0], positiveSwing,
  ));
  out[at + 1] = clampSheepOffset(footTerrainOffsetFromBasis(
    field, rootGround, rootX, rootZ, cosYaw, sinYaw,
    scaleX, scaleY, scaleZ, SHEEP_HOOF_CONTACTS[1], negativeSwing,
  ));
  out[at + 2] = clampSheepOffset(footTerrainOffsetFromBasis(
    field, rootGround, rootX, rootZ, cosYaw, sinYaw,
    scaleX, scaleY, scaleZ, SHEEP_HOOF_CONTACTS[2], negativeSwing,
  ));
  out[at + 3] = clampSheepOffset(footTerrainOffsetFromBasis(
    field, rootGround, rootX, rootZ, cosYaw, sinYaw,
    scaleX, scaleY, scaleZ, SHEEP_HOOF_CONTACTS[3], positiveSwing,
  ));
}

export interface SheepContactReceipt {
  footErrorMax: number;
  stanceContacts: number;
}

/** Debug-only, independent perimeter check of the animated stance soles. */
export function measureSheepStanceContact(
  out: SheepContactReceipt,
  field: GroundSampler,
  terrainOffsets: Float32Array,
  terrainAt: number,
  rootGround: number,
  rootX: number,
  rootZ: number,
  cosYaw: number,
  sinYaw: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  phase: number,
  stride: number,
): void {
  out.footErrorMax = 0;
  out.stanceContacts = 0;
  for (const sole of SHEEP_HOOF_SOLE_POINTS) {
    const pose = sheepLegPose(phase, sole.legSign);
    const hoofLift = pose.lift * stride * HOOF_LIFT;
    if (hoofLift > 1e-6) continue;
    out.stanceContacts += 1;
    const localX = sole.x * scaleX;
    const localZ = (sole.z + pose.travel * stride) * scaleZ;
    const footX = rootX + cosYaw * localX + sinYaw * localZ;
    const footZ = rootZ - sinYaw * localX + cosYaw * localZ;
    const renderedY = rootGround - SHEEP_HOOF_BASELINE * scaleY
      + (sole.y + terrainOffsets[terrainAt + sole.contact]!) * scaleY;
    out.footErrorMax = Math.max(
      out.footErrorMax,
      Math.abs(renderedY - field.groundY(footX, footZ)),
    );
  }
}
