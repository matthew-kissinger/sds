// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * What a baked GLB exports, read from the GLB.
 *
 * A ledger that states the triangle count of the file it pins has to take the
 * count FROM that file: a number typed in beside the digest is a second source
 * of truth that goes stale on the first intentional re-bake, and did. The
 * house and barn ledgers (record-house-asset.mjs, record-barn-asset.mjs) call
 * this for every "as exported" field, and the specs hold the loaders to it.
 *
 * Only the JSON chunk and the position accessors' min/max are read; no
 * geometry is decoded. Bounds are the world-space extent of every mesh node's
 * position box, which for axis-aligned Kiln parts is the bake's own bounds.
 */

/** Parse the GLB container: JSON chunk, then the one binary chunk. */
export function glbJson(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
}

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major 4x4 from a node's TRS, as glTF defines it. */
function localMatrix(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz;
  const xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

function transformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/**
 * Counts and extents as exported. `binding` maps the authored material names
 * to the game's band sets, the same table the loader carries, so the
 * per-surface triangle split can be held equal to what the loader welds.
 */
export function exportedCounts(bytes, binding) {
  const json = glbJson(bytes);
  const world = new Map();
  const visit = (index, parent) => {
    const node = json.nodes[index];
    const matrix = multiply(parent, localMatrix(node));
    world.set(index, matrix);
    for (const child of node.children ?? []) visit(child, matrix);
  };
  for (const root of json.scenes[json.scene ?? 0].nodes) visit(root, identity());

  let triangles = 0;
  let meshNodes = 0;
  const perSurface = {};
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const [index, matrix] of world) {
    const node = json.nodes[index];
    if (node.mesh === undefined) continue;
    meshNodes++;
    for (const primitive of json.meshes[node.mesh].primitives) {
      if ((primitive.mode ?? 4) !== 4) throw new Error(`primitive mode ${primitive.mode} is not triangles`);
      const count = primitive.indices !== undefined
        ? json.accessors[primitive.indices].count
        : json.accessors[primitive.attributes.POSITION].count;
      const t = count / 3;
      triangles += t;
      const material = json.materials[primitive.material].name;
      const surface = binding[material];
      if (surface === undefined) throw new Error(`unbound material "${material}"`);
      perSurface[surface] = (perSurface[surface] ?? 0) + t;
      const position = json.accessors[primitive.attributes.POSITION];
      for (const sx of [0, 1]) for (const sy of [0, 1]) for (const sz of [0, 1]) {
        const corner = transformPoint(matrix, [
          sx ? position.max[0] : position.min[0],
          sy ? position.max[1] : position.min[1],
          sz ? position.max[2] : position.min[2],
        ]);
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], corner[axis]);
          max[axis] = Math.max(max[axis], corner[axis]);
        }
      }
    }
  }
  const round = (value) => Math.round(value * 100) / 100;
  // In the order the loaders bucket them, largest first, so a diff reads.
  const trianglesPerSurface = Object.fromEntries(
    Object.entries(perSurface).sort((a, b) => b[1] - a[1]),
  );
  return {
    triangles,
    exportedMeshNodes: meshNodes,
    exportedGeometries: json.meshes.length,
    materials: json.materials.length,
    textures: (json.textures ?? []).length,
    images: (json.images ?? []).length,
    gltfExtensions: json.extensionsUsed ?? [],
    boundsMetres: { x: round(max[0] - min[0]), y: round(max[1] - min[1]), z: round(max[2] - min[2]) },
    trianglesPerSurface,
  };
}
