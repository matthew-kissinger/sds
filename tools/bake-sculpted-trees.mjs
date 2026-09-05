// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Editable oak authoring source. Broad opaque volumes, no leaf cards or textures.
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(import.meta.url);
const repo = resolve(import.meta.dirname, '..');
const output = resolve(repo, 'assets/treeline/sculpted-oak-family.json');
const round = (value) => Math.round(value * 1e6) / 1e6;

// Whole-tree local space: ground y=0, crown top y=1, width less than one.
// Unequal shoulder heights and openings are authored, not random leaf noise.
export const OAK_LOBES = [
  { centre: [-0.295, 0.60, 0.015], radii: [0.185, 0.135, 0.195], yaw: -0.2 },
  { centre: [0.27, 0.65, 0.045], radii: [0.21, 0.155, 0.215], yaw: 0.26 },
  { centre: [-0.02, 0.76, 0.015], radii: [0.32, 0.21, 0.29], yaw: 0.07 },
  { centre: [-0.23, 0.77, 0.15], radii: [0.17, 0.14, 0.17], yaw: -0.25 },
  { centre: [-0.11, 0.91, -0.05], radii: [0.18, 0.09, 0.18], yaw: 0.1 },
  { centre: [0.19, 0.81, -0.12], radii: [0.19, 0.15, 0.18], yaw: 0.3 },
  { centre: [-0.08, 0.62, -0.20], radii: [0.235, 0.14, 0.185], yaw: -0.12 },
];

// Continuous tapering paths. Every exposed branch terminates inside a crown.
const BOUGHS = [
  [[0, 0, 0], [-0.025, 0.09, 0.008], 0.075, 0.046],
  [[-0.025, 0.09, 0.008], [-0.05, 0.255, 0.012], 0.046, 0.035],
  [[-0.05, 0.255, 0.012], [0.015, 0.43, 0], 0.036, 0.028],
  [[-0.038, 0.285, 0.01], [-0.195, 0.455, 0.012], 0.029, 0.019],
  [[-0.195, 0.455, 0.012], [-0.31, 0.595, 0.018], 0.02, 0.006],
  [[0.005, 0.405, 0], [0.175, 0.515, 0.04], 0.027, 0.018],
  [[0.175, 0.515, 0.04], [0.28, 0.655, 0.045], 0.018, 0.005],
  [[0.012, 0.42, 0], [-0.045, 0.655, 0.015], 0.025, 0.017],
  [[-0.045, 0.655, 0.015], [0.035, 0.90, -0.025], 0.017, 0.004],
  [[-0.045, 0.63, 0.01], [-0.22, 0.80, -0.075], 0.016, 0.004],
  [[0.11, 0.485, 0.02], [0.235, 0.80, -0.115], 0.017, 0.004],
  [[-0.02, 0.49, 0.005], [-0.025, 0.725, 0.205], 0.019, 0.004],
  [[-0.035, 0.32, 0.01], [-0.035, 0.66, -0.215], 0.019, 0.004],
];

function append(target, geometry, part) {
  const mesh = geometry.index ? geometry.toNonIndexed() : geometry;
  target.positions.push(...Array.from(mesh.attributes.position.array, round));
  target.normals.push(...Array.from(mesh.attributes.normal.array, round));
  if (target.parts) target.parts.push(...Array(mesh.attributes.position.count).fill(part));
  if (mesh !== geometry) mesh.dispose();
  geometry.dispose();
}

export function buildSculptedOak() {
  const foliage = { positions: [], normals: [], parts: [], triangles: 0 };
  const wood = { positions: [], normals: [], triangles: 0 };
  for (const [part, lobe] of OAK_LOBES.entries()) {
    const geometry = new THREE.SphereGeometry(1, 10, 5);
    const positions = geometry.attributes.position;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const x = positions.getX(vertex), y = positions.getY(vertex), z = positions.getZ(vertex);
      // Broad uneven shoulders. Small enough to preserve the placement envelope.
      const swell = 1 + 0.045 * Math.sin(x * 6.2 + z * 4.1 + part * 1.7) * (1 - y * y);
      positions.setXYZ(vertex, x * swell, y, z * swell);
    }
    geometry.scale(...lobe.radii);
    geometry.rotateY(lobe.yaw);
    geometry.translate(...lobe.centre);
    append(foliage, geometry, part);
  }
  // A connected crown receives one broad light pattern. Retain some local
  // shoulder shading, but avoid seven identical lit discs on seven lobes.
  // These normals encode form only; the runtime sun remains the light authority.
  for (let index = 0; index < foliage.positions.length; index += 3) {
    const broad = new THREE.Vector3(
      foliage.positions[index] / 0.50,
      (foliage.positions[index + 1] - 0.58) / 0.32,
      foliage.positions[index + 2] / 0.42,
    ).normalize();
    const local = new THREE.Vector3(...foliage.normals.slice(index, index + 3));
    local.lerp(broad, 0.68).normalize();
    foliage.normals.splice(index, 3, ...local.toArray().map(round));
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const [from, to, base, tip] of BOUGHS) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(tip, base, direction.length(), 7, 1, false);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
    geometry.translate(...a.add(b).multiplyScalar(0.5).toArray());
    append(wood, geometry);
  }
  // Clamp the tilted root's rim into the soil plane, not a floating angled cut.
  for (let index = 1; index < wood.positions.length; index += 3) {
    if (wood.positions[index] < 0.025) wood.positions[index] = 0;
  }
  foliage.triangles = foliage.positions.length / 9;
  wood.triangles = wood.positions.length / 9;
  return { foliage, wood };
}

export function sculptedOakDocument() {
  return {
    version: 1, id: 'sculpted-oak-family',
    provenance: {
      author: 'Matthew Kissinger', license: 'AGPL-3.0-or-later',
      source: 'tools/bake-sculpted-trees.mjs',
      sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    },
    geometry: buildSculptedOak(),
  };
}

if (resolve(process.argv[1] ?? '') === file) {
  const document = sculptedOakDocument();
  const serialized = `${JSON.stringify(document)}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(output, 'utf8') !== serialized) throw new Error('Sculpted oak bake differs from committed geometry.');
  } else writeFileSync(output, serialized);
  console.log(`Sculpted oak: ${document.geometry.foliage.triangles} crown + ${document.geometry.wood.triangles} wood triangles`);
}
