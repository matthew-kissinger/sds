// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The retirement floor keeps HOME_FIELD.pen, x [-30, 30] z [102, 130], and a
 * short worn tongue reaches the perimeter gate at z = 100 (see the geometry
 * note in sim/field.ts: the simulation's 2 m corridor is open only within the
 * gate width).
 *
 * The visible enclosure is attached directly to the perimeter rails and adds
 * only three sides (FenceLine.tsx). The existing north field fence is its front
 * side. There is one gate kit in the scene, on that shared rail line.
 *
 * The floor is trodden earth, authored as traffic radiating out of the gate
 * mouth (pen/floorMaterial.ts), and it is quieter than the pasture it interrupts
 * in both value and saturation. It is the destination, not the landmark.
 *
 * The floor is flat because the GROUND is flat here: the terrain bake levels the
 * gate approach, the corridor and the pen as one pad (assets/terrain manifest,
 * pad `pen-and-gate`), so a plane laid at `groundY` of the pen centre sits on
 * the terrain everywhere inside it rather than only at one point.
 *
 * Where that floor stops, real geometry stands across the line rather than a
 * softer gradient: two instanced meshes of grass tufts and stones straddling the
 * boundary (pen/boundaryDressing.ts). Two draw calls, both built once at mount.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { HOME_FIELD } from '@sim/field';
import { useHeightfield } from '@app/world/heightfield';
import { buildBoundaryDressing, type BoundarySpec } from './pen/boundaryDressing';
import { makePenFloorMaterial, type PenFloorSpec } from './pen/floorMaterial';

const { pen, gate, bounds } = HOME_FIELD;
const PEN_WIDTH = pen.maxX - pen.minX;
const PEN_DEPTH = pen.maxZ - pen.minZ;
const PEN_CENTER_X = (pen.minX + pen.maxX) / 2;
const PEN_CENTER_Z = (pen.minZ + pen.maxZ) / 2;

/** The corridor floor between the perimeter gate line and the pen's south fence. */
const CORRIDOR_DEPTH = pen.minZ - bounds.maxZ;
const CORRIDOR_CENTER_Z = bounds.maxZ + CORRIDOR_DEPTH / 2;

/** Trodden earth laid over the pad, not into it. Enough to clear the terrain
 *  triangles underneath at this distance without reading as a lip, and enough
 *  that a post foot standing in it never stipples against it. */
const FLOOR_LIFT = 0.055;

const FLOOR: PenFloorSpec = {
  minX: pen.minX,
  maxX: pen.maxX,
  minZ: pen.minZ,
  maxZ: pen.maxZ,
  mouthX: gate.position.x,
  mouthZ: bounds.maxZ,
  mouthWidth: gate.width,
};

/** The line the floor dressing straddles; it is not a second timber fence. */
const BOUNDARY: BoundarySpec = {
  minX: pen.minX,
  maxX: pen.maxX,
  minZ: pen.minZ,
  maxZ: pen.maxZ,
  mouthX: gate.position.x,
  mouthWidth: gate.width,
  corridorMinZ: bounds.maxZ,
};

export function Pen() {
  const ground = useMemo(() => makePenFloorMaterial(FLOOR), []);
  const field = useHeightfield();
  const floorY = field.groundY(PEN_CENTER_X, PEN_CENTER_Z) + FLOOR_LIFT;

  // Built once, at mount: neither the boundary nor the ground under it moves.
  const dressing = useMemo(
    () => buildBoundaryDressing(BOUNDARY, (x, z) => field.groundY(x, z)),
    [field],
  );

  useEffect(() => () => ground.dispose(), [ground]);
  useEffect(
    () => () => {
      for (const mesh of dressing) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        // Guarded rather than called straight: the instance buffer is only an
        // InstancedMesh's to free, and a plain Mesh sliding into this list later
        // would throw on unmount rather than at the edit that caused it.
        if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
      }
    },
    [dressing],
  );

  return (
    <group>
      <mesh
        material={ground}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[PEN_CENTER_X, floorY, PEN_CENTER_Z]}
      >
        <planeGeometry args={[PEN_WIDTH, PEN_DEPTH]} />
      </mesh>
      <mesh
        material={ground}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[gate.position.x, floorY, CORRIDOR_CENTER_Z]}
      >
        <planeGeometry args={[gate.width, CORRIDOR_DEPTH]} />
      </mesh>
      {dressing.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </group>
  );
}
