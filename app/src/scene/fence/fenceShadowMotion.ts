// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildFenceShadow } from './shadowCast';
import type { GateLeafAssembly } from './gateKit';
import type { GroundSampler, PostPlacement, RailPlacement } from './placement';

/** Gate shadows share the existing merged draw. Bake a 7.5-degree arc
 * table once; interpolate its moving tail without allocations during the swing.
 * Static perimeter positions are stored once. Only gate poses form the table.
 * At a four-metre leaf tip, chord error is under 9 mm before ground projection.
 */
export function fenceShadowMotion(posts: PostPlacement[], rails: RailPlacement[],
  leaves: GateLeafAssembly[], groundY: GroundSampler) {
  const steps = 24;
  const frames: Float32Array[] = [];
  const shadow = buildFenceShadow(posts, rails, groundY);
  const start = shadow.geometry.getAttribute('position').array.length;
  for (let i = 0; i <= steps; i++) {
    const posed = leaves.flatMap(leaf => {
      const angle = leaf.closeTurn * i / steps, c = Math.cos(angle), s = Math.sin(angle);
      return leaf.parts.map(p => ({ ...p,
        ax: leaf.hingeX + (p.ax - leaf.hingeX) * c - (p.az - leaf.hingeZ) * s,
        az: leaf.hingeZ + (p.ax - leaf.hingeX) * s + (p.az - leaf.hingeZ) * c,
        bx: leaf.hingeX + (p.bx - leaf.hingeX) * c - (p.bz - leaf.hingeZ) * s,
        bz: leaf.hingeZ + (p.bx - leaf.hingeX) * s + (p.bz - leaf.hingeZ) * c,
      }));
    });
    const sample = buildFenceShadow([], posed, groundY);
    frames.push(new Float32Array(sample.geometry.getAttribute('position').array));
    if (i === 0) {
      const joined = mergeGeometries([shadow.geometry, sample.geometry]);
      if (!joined) throw new Error('Could not merge static and gate shadows');
      shadow.geometry.dispose(); shadow.geometry = joined;
    }
    sample.geometry.dispose(); (sample.material as THREE.Material).dispose();
  }
  const position = shadow.geometry.getAttribute('position') as THREE.BufferAttribute;
  if (frames.some(f => f.length !== position.array.length - start)) throw new Error('Fence shadow arc changed topology');
  position.setUsage(THREE.DynamicDrawUsage);
  let last = 0;
  return { shadow, update(progress: number) {
    if (progress === last) return;
    const at = Math.max(0, Math.min(steps, progress * steps));
    const low = Math.floor(at), high = Math.min(steps, low + 1), weight = at - low;
    const a = frames[low]!, b = frames[high]!;
    for (let i = 0; i < a.length; i++) position.array[start + i] = a[i]! + (b[i]! - a[i]!) * weight;
    position.clearUpdateRanges();
    position.addUpdateRange(start, position.array.length - start);
    position.needsUpdate = true;
    last = progress;
  } };
}
