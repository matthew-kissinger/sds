// SPDX-License-Identifier: AGPL-3.0-or-later
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { HOME_FIELD } from '@sim/field';

export const GATE_OPENING_LIFT = 0.075;

/** Editable deterministic recipe: two open brackets around the passable mouth.
 * Every vertex samples the terrain. The centre remains completely unmarked. */
export function buildGateOpeningGeometry(groundY: (x: number, z: number) => number): BufferGeometry {
  const positions: number[] = [];
  const tones: number[] = [];
  const { position, width } = HOME_FIELD.gate;
  const rect = (x0: number, z0: number, x1: number, z1: number, tone: number) => {
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      positions.push(x!, groundY(x!, z!) + GATE_OPENING_LIFT, z!);
      tones.push(tone);
    }
  };
  for (const side of [-1, 1]) {
    const edge = position.x + side * (width / 2 - 0.45);
    const inner = edge - side * 0.85;
    const x0 = Math.min(edge, inner), x1 = Math.max(edge, inner);
    // A muted painted foundation and inset cream face share one draw.
    rect(edge - 0.24, position.z - 1.3, edge + 0.24, position.z + 2.7, 0);
    rect(x0 - 0.24, position.z - 1.3, x1 + 0.24, position.z - 0.82, 0);
    rect(edge - 0.14, position.z - 1.2, edge + 0.14, position.z + 2.6, 1);
    rect(x0 - 0.14, position.z - 1.2, x1 + 0.14, position.z - 0.92, 1);
  }
  // Separate the inset face by 2 mm to avoid overlapping coplanar triangles.
  for (let i = 0; i < tones.length; i++) positions[i * 3 + 1]! += tones[i]! * 0.002;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('gateTone', new Float32BufferAttribute(tones, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
