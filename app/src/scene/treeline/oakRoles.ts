// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * What an oak is to the treeline: a geometry and a material for each of its
 * two instanced roles, built for the stands the treeline places.
 *
 * The treeline (Treeline.tsx) builds the procedural oak itself. Any other oak
 * reaches it as an `OakBuilder`, made by whoever holds that oak's asset - the
 * Kiln oak's is treeline/kilnOak.ts - so the treeline names no other oak's
 * loader or materials, and a build that never makes the builder carries none
 * of them.
 */

import type * as THREE from 'three/webgpu';

export interface OakRoles {
  readonly name: string;
  readonly crown: readonly [THREE.BufferGeometry, THREE.Material];
  readonly wood: readonly [THREE.BufferGeometry, THREE.Material];
  /** What the development receipt reports about this oak's source. */
  readonly receipt: Record<string, unknown>;
}

/** The stands, as the treeline hands them to an oak. */
export interface OakStands {
  /** Every stand's instance matrix, sixteen floats each, as both meshes draw them. */
  readonly matrices: Float32Array;
  /** Per stand, for the crown: tint, turn and family. */
  readonly crownInstances: THREE.InstancedBufferAttribute;
  /** Per stand, for the wood: tint and 0. */
  readonly woodInstances: THREE.InstancedBufferAttribute;
}

export type OakBuilder = (stands: OakStands) => OakRoles;
