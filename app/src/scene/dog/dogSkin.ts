// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Deterministic anatomical weights; no painted binary or runtime nearest-joint guessing. */
import * as THREE from 'three/webgpu';
import { DOG_JOINTS, type DogPartRange } from './dogRigDefinition';

const clamp = (value: number) => Math.min(1, Math.max(0, value));
export function attachDogSkin(geometry: THREE.BufferGeometry, ranges: readonly DogPartRange[]): void {
  const anchors = DOG_JOINTS.slice(1, 6).map((joint) => joint.position[2]);
  const positions = geometry.getAttribute('position');
  const indices = new Uint16Array(positions.count * 4);
  const weights = new Float32Array(positions.count * 4);
  const blend = (vertex: number, a: number, b: number, amount: number) => {
    const t = clamp(amount);
    indices[vertex * 4] = a;
    indices[vertex * 4 + 1] = b;
    weights[vertex * 4] = 1 - t;
    weights[vertex * 4 + 1] = t;
  };
  const bodySegment = (z: number) => {
    let segment = 0;
    while (segment < 3 && z > anchors[segment + 1]!) segment++;
    return segment;
  };
  for (const { part, start, count } of ranges) {
    for (let i = start; i < start + count; i++) {
      const y = positions.getY(i);
      const z = positions.getZ(i);
      if (part === 'body') {
        const segment = bodySegment(z);
        blend(i, segment + 1, segment + 2,
          (z - anchors[segment]!) / (anchors[segment + 1]! - anchors[segment]!));
      } else if (part === 'tail') {
        if (z > -1.02) blend(i, 1, 8, (-z - 0.9) / 0.12);
        else blend(i, 8, 9, (-z - 1.02) / 0.48);
      } else if (part.startsWith('ear')) {
        blend(i, 5, part === 'ear-left' ? 6 : 7, (y - (DOG_JOINTS[6]!.position[1] - 0.04)) / 0.12);
      } else {
        const fore = part.includes('fore');
        const left = part.endsWith('left');
        const upper = fore ? (left ? 10 : 13) : (left ? 16 : 19);
        if (part.startsWith('paw')) blend(i, upper + 2, upper + 2, 0);
        else {
          const joint = DOG_JOINTS[upper + 1]!.position[1];
          if (y < 0.3) blend(i, upper + 1, upper + 2, (0.3 - y) / 0.1);
          else blend(i, upper, upper + 1, (joint + 0.09 - y) / 0.18);
          if (fore && y > 0.86) {
            // The buried shoulder follows the SAME chest/neck skin as the body.
            // Blend into the articulating upper arm below; never rotate the cap
            // out of the torso by assigning its entire surface to the leg joint.
            const t = clamp((y - 0.86) / 0.29);
            const torsoWeight = t * t * (3 - 2 * t);
            const segment = bodySegment(z);
            const along = clamp((z - anchors[segment]!) / (anchors[segment + 1]! - anchors[segment]!));
            weights[i * 4] = weights[i * 4]! * (1 - torsoWeight);
            weights[i * 4 + 1] = weights[i * 4 + 1]! * (1 - torsoWeight);
            indices[i * 4 + 2] = segment + 1;
            indices[i * 4 + 3] = segment + 2;
            weights[i * 4 + 2] = torsoWeight * (1 - along);
            weights[i * 4 + 3] = torsoWeight * along;
          }
        }
      }
    }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}
