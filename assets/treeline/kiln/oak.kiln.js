// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The treeline oak. A Kiln program, rendered and revised through `kiln render`,
// exported to assets/treeline/kiln/oak.glb.
//
// ONE OAK, THE SPREADING ONE. A thick, short bole that twists a little and
// splits low into five heavy limbs; the limbs carry nine lobes, and the lobes
// are made of overlapping leaf clusters of varied size, so the crown is a broad
// scalloped mass with sky pockets between its lobes and branches showing in
// them. It is the oak of the painted reference the owner chose. The treeline
// instances it for every stand, with only the stand's own box, yaw and shading
// varying it (app/src/scene/treeline/kilnTree.ts fits it to the box).
//
// MASSES, NOT LEAVES. The cameras see these trees from about 20 to 150 metres,
// so a tree reads by its masses, its outline, its values and its colour. There
// are no leaf cards, no alpha and no textures here, and there never should be:
// cut-out cards cost fill rate and hidden-surface removal on a phone, and they
// shimmer at distance. Every cluster is a closed, opaque solid.
//
// THE ASSET CARRIES ONLY WHAT DOES NOT DEPEND ON THE LIGHT. The painting - the
// bands, the warm and cool tones, the leaf-dab breakup of the terminator, the
// swell of the outline, the backlit rim and the sway - is the game's canopy and
// bark materials (treeline/kilnTreeMaterials.ts), in code. What the shader
// cannot know from a vertex on its own, this program bakes:
//
//  - TEXCOORD_0.u on the crown: a seed, one value per cluster, so each cluster
//    can take its own tint and its own breakup.
//  - TANGENT.xyz on the crown: the normal of the LOBE the vertex belongs to,
//    beside the vertex's own (cluster) NORMAL. Lit by a blend of the two, the
//    crown shades as nine big painted masses with scalloped edges, instead of
//    as some fifty small balls. It rides in TANGENT because the GLB bridge
//    carries no other three-component vertex channel; nothing normal-maps
//    this asset.
//  - _CAVITY on both: Kiln's own exposure bake, 1 open to the sky and toward 0
//    under other clusters and inside the crown.
//
// The record of all three is `treeChannels` on the root node (see the end). The
// loader refuses a bake without it.
//
// EVERY MATERIAL IS NAMED AFTER A BAND SET, and the game re-binds by name:
// `leaf` is the crown, `bark` the wood. The colours below only make the raw GLB
// look roughly right on a contact sheet; in game they are discarded.
//
// THE DETAIL TABLE IS THE ONE PLACE A LEVEL OF DETAIL IS DECIDED. A coarser far
// level would be this same program with a smaller table (a longer cluster edge,
// fewer sides on the wood). None is authored: the hub's timing receipt decides
// whether one is needed.
//
// WHAT NO VIEWER CAN SEE IS NOT EXPORTED. The limbs and branches run on inside
// the crown to their lobes' centres, so that no tip can show; after Kiln's
// exposure bake, every face that no viewer could see from any direction is
// left out (`dropUnseen`, under "unseen faces" below). That is over a quarter
// of the wood and none of the crown. The bake still samples the whole tree,
// so every face that stays keeps the cavity it had.

const meta = { name: 'Oak', category: 'vegetation', role: 'tree' };

// =================================================================== detail
const DETAIL = {
  /**
   * The edge a cluster's triangles are cut to, in metres. Each cluster is a
   * geodesic sphere whose frequency (each icosahedron face cut into
   * frequency-squared triangles) is chosen from its radius to give this edge,
   * within `frequency`. Fixed per cluster, the facets showed on the big cores'
   * undersides as straight runs on the outline; cut to one edge length, a big
   * cluster and a small one are equally round, and the canopy material has the
   * vertices it needs to swell the outline into soft lumps.
   */
  edge: 0.42,
  /** The least and most a cluster is cut: 3 is 180 faces, 6 is 720. */
  frequency: [3, 6],
  /** Sides on the bole, the limbs and the secondary branches. */
  bole: 18,
  limb: 12,
  branch: 8,
};

// ================================================================= skeleton
/** Where the bole splits into its limbs, metres in the tree's frame. */
const SPLIT = [0.1, 2.7, 0.05];

/**
 * The bole: a short, thick, slightly twisting trunk from the root foot to the
 * split, flared into buttress roots at its foot. The foot is y = 0; the game
 * sinks it a little into the ground.
 */
const BOLE = {
  path: [[0, 0, 0], [0.04, 0.5, -0.02], [0.12, 1.15, -0.05], [0.15, 1.9, 0.0], SPLIT, [0.08, 3.3, 0.05]],
  radius: [1.1, 0.88, 0.7, 0.63, 0.66, 0.55],
  /** Buttress lobes at the foot: how far they stand out at each station. */
  flare: [0.48, 0.27, 0.08, 0.03, 0, 0],
};

/**
 * The limbs, from the split to the lobe each carries, through two bends: heavy
 * at the fork, rising late, as an open-grown oak's do. Two long ones reach
 * across +X and -X under the low side lobes; the others climb more steeply.
 * Each ends at its lobe's centre, deep inside the crown. The path is smoothed
 * through these points (`curve`), so the bends are bends and not elbows.
 */
const LIMBS = [
  { path: [SPLIT, [1.5, 3.2, 0.25], [3.3, 4.0, 0.5], [5.0, 5.1, 0.6]], radius: [0.56, 0.44, 0.33, 0.24] },
  { path: [SPLIT, [-1.4, 3.3, 0.1], [-3.2, 4.3, 0.2], [-4.9, 5.4, 0.2]], radius: [0.54, 0.42, 0.31, 0.22] },
  { path: [SPLIT, [0.35, 3.6, 1.2], [0.75, 4.8, 2.6], [0.9, 5.9, 3.6]], radius: [0.48, 0.37, 0.27, 0.19] },
  { path: [SPLIT, [-0.35, 3.7, -1.1], [-0.8, 4.9, -2.4], [-1.0, 6.1, -3.4]], radius: [0.48, 0.37, 0.27, 0.19] },
  { path: [SPLIT, [0.3, 4.2, -0.1], [0.05, 6.0, 0.1], [0.0, 7.9, 0.0]], radius: [0.5, 0.38, 0.27, 0.17] },
];

/** Secondary branches: from a fraction along a limb, out to a point inside a lobe. */
const BRANCHES = [
  { limb: 4, at: 0.5, tip: [3.1, 7.4, -1.6], radius: [0.2, 0.09] },
  { limb: 1, at: 0.55, tip: [-3.0, 7.6, 1.5], radius: [0.2, 0.09] },
  { limb: 0, at: 0.7, tip: [3.6, 4.5, 2.4], radius: [0.15, 0.07] },
  { limb: 1, at: 0.7, tip: [-3.5, 4.8, -2.2], radius: [0.15, 0.07] },
  { limb: 2, at: 0.7, tip: [-0.2, 6.6, 3.6], radius: [0.12, 0.06] },
  { limb: 3, at: 0.7, tip: [0.1, 6.7, -3.4], radius: [0.12, 0.06] },
];

// ==================================================================== crown
/**
 * The lobes: the big masses the painted oak is read as. One at the end of each
 * limb, two over the shoulders, and two small ones hanging low at the sides, as
 * the reference's do, down to the height of the fork. Each is a core with
 * clusters over its surface from its crown down to `hang` (1 is the top of the
 * lobe, -1 its bottom); the clusters, not the core, make the scalloped outline.
 */
const LOBES = [
  { at: [5.1, 5.3, 0.6], size: [2.9, 2.0, 2.6], clusters: 6, hang: -0.7 },
  { at: [-5.0, 5.6, 0.2], size: [2.8, 2.0, 2.6], clusters: 6, hang: -0.7 },
  { at: [0.9, 6.1, 3.7], size: [2.7, 2.1, 2.3], clusters: 5, hang: -0.5 },
  { at: [-1.0, 6.3, -3.5], size: [2.7, 2.1, 2.3], clusters: 5, hang: -0.5 },
  { at: [0.0, 8.4, 0.0], size: [3.5, 2.4, 3.2], clusters: 7, hang: -0.3 },
  { at: [3.2, 7.7, -1.8], size: [2.3, 1.9, 2.1], clusters: 5, hang: -0.4 },
  { at: [-3.1, 7.9, 1.6], size: [2.3, 1.9, 2.1], clusters: 5, hang: -0.4 },
  { at: [3.7, 4.5, 2.6], size: [2.0, 1.5, 1.8], clusters: 4, hang: -0.8 },
  { at: [-3.6, 4.8, -2.3], size: [1.9, 1.5, 1.7], clusters: 4, hang: -0.8 },
];

/** How far out a cluster's centre sits, as a share of its lobe's radii. */
const SHELL = 0.8;
/** Cluster radius as a share of its lobe's mean radius, and the spread. */
const CLUSTER_SIZE = [0.32, 0.3];
/** Clusters flatten a little: a clump of leaves is a dome, not a ball. */
const CLUSTER_SQUASH = 0.84;
/**
 * A triangle is dropped when all three of its corners lie inside ONE other
 * cluster's drawn surface, with this much to spare. The drawn surface of a
 * cluster is its polyhedron, which sits inside the true ellipsoid by the
 * polyhedron's own inradius (worked out below for each subdivision), so that
 * is the depth tested against. The canopy material only ever swells a cluster
 * outward, along its own normal, by a noise that is nearly constant across a
 * triangle, so a dropped triangle stays covered as the outline moves.
 */
const BURIED = 0.98;
/** Every wood tip must end at least this deep inside some cluster (as a share
 *  of that cluster's radius), so no branch end can show through the leaves. */
const TIP_DEPTH = 0.75;

// ================================================================= helpers
/** A deterministic hash in [0, 1). No Math.random anywhere in this program. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function normalise(p) {
  const l = Math.hypot(p[0], p[1], p[2]);
  return [p[0] / l, p[1] / l, p[2] / l];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function lerp3(a, b, f) {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

const T = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON = {
  points: [
    [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0],
    [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T],
    [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
  ].map(normalise),
  faces: [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ],
};

/**
 * A unit geodesic sphere: every icosahedron face cut into a triangular lattice
 * of `frequency` steps a side, its points pushed out onto the sphere. Shared
 * vertices, indexed, outward winding.
 */
function geodesic(frequency) {
  const points = [];
  const known = new Map();
  const point = (p) => {
    const n = normalise(p);
    const key = n.map((v) => Math.round(v * 1e6)).join(',');
    let index = known.get(key);
    if (index === undefined) {
      index = points.length;
      points.push(n);
      known.set(key, index);
    }
    return index;
  };
  const faces = [];
  for (const [a, b, c] of ICOSAHEDRON.faces) {
    const [A, B, C] = [ICOSAHEDRON.points[a], ICOSAHEDRON.points[b], ICOSAHEDRON.points[c]];
    // Row i runs from A toward B, column j from that row's start toward C.
    const at = (i, j) => point(lerp3(lerp3(A, B, i / frequency), lerp3(A, C, i / frequency), i === 0 ? 0 : j / i));
    for (let i = 0; i < frequency; i += 1) {
      for (let j = 0; j <= i; j += 1) {
        faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)]);
        if (j < i) faces.push([at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
    }
  }
  // How far inside the unit sphere the nearest face plane sits: the drawn
  // surface is never further in than this.
  let inradius = 1;
  for (const [a, b, c] of faces) {
    const n = normalise(cross(sub(points[b], points[a]), sub(points[c], points[a])));
    inradius = Math.min(inradius, Math.abs(dot(n, points[a])));
  }
  return { points, faces, inradius };
}

/** One sphere per frequency in use, built when first asked for. */
const SPHERES = new Map();
function sphereOf(frequency) {
  if (!SPHERES.has(frequency)) SPHERES.set(frequency, geodesic(frequency));
  return SPHERES.get(frequency);
}

/** The geodesic frequency that cuts a cluster of this radius to `DETAIL.edge`. */
function frequencyFor(radius) {
  const [least, most] = DETAIL.frequency;
  return Math.max(least, Math.min(most, Math.round((1.05 * radius) / DETAIL.edge)));
}

/** Squared distance of a point from a cluster's centre, in units of its radii. */
function depthIn(p, cluster) {
  const dx = (p[0] - cluster.c[0]) / cluster.r[0];
  const dy = (p[1] - cluster.c[1]) / cluster.r[1];
  const dz = (p[2] - cluster.c[2]) / cluster.r[2];
  return dx * dx + dy * dy + dz * dz;
}

/** The clusters of one lobe: its core, then a shell over its upper surface. */
function lobeClusters(lobe, l) {
  const [ax, ay, az] = lobe.size;
  const mean = (ax + ay + az) / 3;
  const out = [{
    c: [lobe.at[0], lobe.at[1] - ay * 0.12, lobe.at[2]],
    r: [ax * 0.88, ay * 0.8, az * 0.88],
    detail: frequencyFor(Math.max(ax * 0.88, ay * 0.8, az * 0.88)),
    lobe: l,
    seed: hash(l * 7.1),
  }];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < lobe.clusters; i += 1) {
    // Fibonacci points over the lobe, from its crown down to `hang`: below
    // that the underside is the core's, in shade.
    const y = 1 - ((i + 0.5) / lobe.clusters) * (1 - lobe.hang);
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * golden + l * 1.7;
    const d = [Math.cos(phi) * ring, y, Math.sin(phi) * ring];
    const r = mean * (CLUSTER_SIZE[0] + CLUSTER_SIZE[1] * hash(l * 31 + i * 3.7));
    out.push({
      c: [lobe.at[0] + d[0] * ax * SHELL, lobe.at[1] + d[1] * ay * SHELL, lobe.at[2] + d[2] * az * SHELL],
      r: [r, r * CLUSTER_SQUASH, r],
      detail: frequencyFor(r),
      lobe: l,
      seed: hash(l * 13.3 + i * 5.1),
    });
  }
  return out;
}

/**
 * Every cluster as one indexed geometry, with every triangle buried inside
 * another cluster removed. Each vertex carries its cluster's own smooth normal
 * (NORMAL), its lobe's normal (TANGENT.xyz) and its cluster's seed (uv.x).
 * `owners` names each triangle's cluster, by its place in `clusters`.
 */
function crownGeometry(clusters) {
  const positions = [];
  const normals = [];
  const lobeNormals = [];
  const uvs = [];
  const indices = [];
  const owners = [];
  clusters.forEach((cluster, k) => {
    const sphere = sphereOf(cluster.detail);
    const lobe = LOBES[cluster.lobe];
    const world = sphere.points.map((d) => [
      cluster.c[0] + d[0] * cluster.r[0],
      cluster.c[1] + d[1] * cluster.r[1],
      cluster.c[2] + d[2] * cluster.r[2],
    ]);
    // For each corner, the other clusters whose drawn surface it lies inside.
    const inside = world.map((p) => clusters.flatMap((other, j) => {
      if (j === k) return [];
      const limit = sphereOf(other.detail).inradius * BURIED;
      return depthIn(p, other) < limit * limit ? [j] : [];
    }));
    const kept = sphere.faces.filter(([a, b, c]) =>
      !inside[a].some((j) => inside[b].includes(j) && inside[c].includes(j)));
    if (kept.length === 0) return;
    // Only the vertices a kept face uses are written.
    const remap = new Map();
    for (const face of kept) {
      for (const v of face) {
        if (remap.has(v)) continue;
        remap.set(v, positions.length / 3);
        const d = sphere.points[v];
        const p = world[v];
        positions.push(p[0], p[1], p[2]);
        const n = normalise([d[0] / cluster.r[0], d[1] / cluster.r[1], d[2] / cluster.r[2]]);
        normals.push(n[0], n[1], n[2]);
        // The lobe's normal: the gradient of its ellipsoid at this vertex.
        const ln = normalise([
          (p[0] - lobe.at[0]) / (lobe.size[0] * lobe.size[0]),
          (p[1] - lobe.at[1]) / (lobe.size[1] * lobe.size[1]),
          (p[2] - lobe.at[2]) / (lobe.size[2] * lobe.size[2]),
        ]);
        lobeNormals.push(ln[0], ln[1], ln[2], 1);
        uvs.push(cluster.seed, 0);
      }
      indices.push(remap.get(face[0]), remap.get(face[1]), remap.get(face[2]));
      owners.push(k);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('tangent', new THREE.Float32BufferAttribute(lobeNormals, 4));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return { geometry, owners };
}

/**
 * A tube along a polyline, a radius per station. Its foot is never capped (it
 * is buried in its parent, or the bole's in the ground); its end is capped with
 * a low cone only when `capped`, because only the bole's end stands in the open,
 * between the limbs that leave it. Every other end is buried in a lobe.
 * Parallel-transport frames, smooth normals, faces wound outward.
 */
function tube(path, radii, sides, flare, capped) {
  const positions = [];
  const normals = [];
  const indices = [];
  const tangentAt = (i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    return normalise(sub(b, a));
  };
  const first = tangentAt(0);
  let n0 = Math.abs(first[1]) < 0.9 ? normalise(cross(first, [0, 1, 0])) : normalise(cross(first, [1, 0, 0]));
  for (let i = 0; i < path.length; i += 1) {
    const t = tangentAt(i);
    const along = dot(n0, t);
    n0 = normalise([n0[0] - t[0] * along, n0[1] - t[1] * along, n0[2] - t[2] * along]);
    const b = cross(t, n0);
    for (let s = 0; s < sides; s += 1) {
      const angle = (s / sides) * Math.PI * 2;
      const dir = [
        n0[0] * Math.cos(angle) + b[0] * Math.sin(angle),
        n0[1] * Math.cos(angle) + b[1] * Math.sin(angle),
        n0[2] * Math.cos(angle) + b[2] * Math.sin(angle),
      ];
      const r = radii[i] * (flare ? flare(i, angle) : 1);
      positions.push(path[i][0] + dir[0] * r, path[i][1] + dir[1] * r, path[i][2] + dir[2] * r);
      normals.push(dir[0], dir[1], dir[2]);
    }
  }
  for (let i = 0; i + 1 < path.length; i += 1) {
    for (let s = 0; s < sides; s += 1) {
      const a = i * sides + s;
      const b = i * sides + ((s + 1) % sides);
      const c = (i + 1) * sides + s;
      const d = (i + 1) * sides + ((s + 1) % sides);
      indices.push(a, b, c, b, d, c);
    }
  }
  if (capped) {
    const last = path.length - 1;
    const t = tangentAt(last);
    const rise = radii[last] * 0.35;
    const apex = positions.length / 3;
    positions.push(path[last][0] + t[0] * rise, path[last][1] + t[1] * rise, path[last][2] + t[2] * rise);
    normals.push(t[0], t[1], t[2]);
    for (let s = 0; s < sides; s += 1) {
      indices.push(last * sides + s, last * sides + ((s + 1) % sides), apex);
    }
  }
  return { positions, normals, indices };
}

/** Point a fraction of the way along a polyline, by length. */
function along(path, f) {
  const lengths = [];
  let total = 0;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const l = Math.hypot(...sub(path[i + 1], path[i]));
    lengths.push(l);
    total += l;
  }
  let goal = f * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (goal <= lengths[i]) return lerp3(path[i], path[i + 1], goal / lengths[i]);
    goal -= lengths[i];
  }
  return path[path.length - 1];
}

/**
 * A smooth path through control points (Catmull-Rom, the ends held), `steps`
 * stations to a span, with the radius carried linearly between the points'.
 */
function curve(points, radii, steps) {
  const path = [];
  const radius = [];
  const at = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      path.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t
        + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
        + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3)));
      radius.push(radii[i] + (radii[i + 1] - radii[i]) * t);
    }
  }
  path.push(points[points.length - 1]);
  radius.push(radii[radii.length - 1]);
  return { path, radius };
}

function woodGeometry(tubes) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (const t of tubes) {
    const base = positions.length / 3;
    positions.push(...t.positions);
    normals.push(...t.normals);
    for (const i of t.indices) indices.push(base + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Refuse a wood tip that would end near the crown's surface. */
function requireBuried(tip, clusters, label) {
  const deepest = Math.min(...clusters.map((cluster) => depthIn(tip, cluster)));
  if (deepest > TIP_DEPTH * TIP_DEPTH) {
    throw new Error(`${label} ends at ${Math.sqrt(deepest).toFixed(2)} of its nearest cluster's radius; it must end inside ${TIP_DEPTH}`);
  }
}

/**
 * Refuse wood that comes back out of the crown once it has gone in. From the
 * fork up to where it enters the leaves a limb or a branch is meant to show;
 * a stretch crossing open air between two clusters after that reads as a tip
 * poking through. Covered means the wood's whole thickness (`radius`, metres,
 * from the foot of the path to its tip) is inside one cluster's drawn surface.
 */
function requireCovered(path, radius, clusters, label) {
  let entered = false;
  for (let i = 0; i <= 48; i += 1) {
    const f = i / 48;
    const p = along(path, f);
    const thick = radius[0] + (radius[1] - radius[0]) * f;
    const covered = clusters.some((cluster) =>
      Math.sqrt(depthIn(p, cluster)) < BURIED * sphereOf(cluster.detail).inradius - thick / Math.min(...cluster.r));
    if (covered) entered = true;
    else if (entered) {
      throw new Error(`${label} comes back out of the crown ${f.toFixed(2)} of the way along, at y ${p[1].toFixed(2)}`);
    }
  }
}

// ============================================================= unseen faces
/**
 * A face is left out of the export only when no viewer could see it from any
 * direction, with the tree moving as the game moves it. Each test is made so
 * that it can only keep too much, never drop a face that could show:
 *
 *  - Only the clusters hide anything, each taken at its polyhedron's inradius
 *    (its drawn surface is never further in) and then `sway` smaller. The most
 *    the game's sway moves one height of a tree against another is 0.24 m in
 *    this program's metres, at the stand whose box is narrowest for its
 *    height; `sway` leaves room over that. The wood hides nothing.
 *  - Each face is tried at seven points (its centre, its corners and its edge
 *    midpoints), each where it is and pushed out along the face's normal by
 *    each of `margins`, past the most the canopy material's swell carries a
 *    leaf vertex out (0.29 m across, 0.18 m up).
 *  - It is looked at from `directions` directions spread over the whole
 *    sphere, the half it faces: no camera is assumed. It stays if any point
 *    is in the clear along any of them. Four and sixteen times as many
 *    directions leave out the same number of faces.
 *
 * Seen from a stand's box and yaw instead, everything here is the same: the
 * stand's matrix maps lines to lines and keeps which side of a face a
 * direction is on. The two motions are given in this program's metres; the
 * root node records both (`treeUnseen`), and the game's tests hold its sway
 * and swell inside them (tests/tree-kiln.spec.ts).
 */
const UNSEEN = { directions: 600, sway: 0.3, margins: [0, 0.15, 0.3, 0.4] };

/** `count` directions spread evenly over the sphere, a Fibonacci spiral. */
function viewDirections(count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(1 - y * y);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    out.push([Math.cos(phi) * ring, y, Math.sin(phi) * ring]);
  }
  return out;
}

/** Does anything in `solids` (ellipsoids) lie along the ray from `o` toward `d`? */
function occluded(o, d, solids, skip) {
  for (let j = 0; j < solids.length; j += 1) {
    if (j === skip) continue;
    const { c, r } = solids[j];
    const p = [(o[0] - c[0]) / r[0], (o[1] - c[1]) / r[1], (o[2] - c[2]) / r[2]];
    const outside = dot(p, p) - 1;
    if (outside < 0) return true;
    const q = [d[0] / r[0], d[1] / r[1], d[2] / r[2]];
    const b = dot(p, q);
    const disc = b * b - dot(q, q) * outside;
    // From outside, both crossings lie on one side: ahead when the far one is.
    if (disc >= 0 && Math.sqrt(disc) > b) return true;
  }
  return false;
}

/**
 * One flag per triangle of `geometry`: can some viewer see it? `owners` names
 * each crown triangle's own cluster, which cannot hide its own outer face and
 * is not asked; the wood has none. A face with no area draws nothing.
 */
function seenFaces(geometry, owners, solids, directions) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const corner = (at) => [position.getX(at), position.getY(at), position.getZ(at)];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const seen = [];
  for (let t = 0; t < index.count / 3; t += 1) {
    const [a, b, c] = [0, 1, 2].map((k) => corner(index.getX(t * 3 + k)));
    const across = cross(sub(b, a), sub(c, a));
    if (Math.hypot(across[0], across[1], across[2]) === 0) {
      seen.push(false);
      continue;
    }
    const n = normalise(across);
    const centre = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const points = [centre, a, b, c, mid(a, b), mid(b, c), mid(c, a)];
    const facing = directions.filter((d) => dot(d, n) > 0);
    const skip = owners ? owners[t] : -1;
    seen.push(UNSEEN.margins.some((m) => points.some((p) => {
      const o = [p[0] + n[0] * m, p[1] + n[1] * m, p[2] + n[2] * m];
      return facing.some((d) => !occluded(o, d, solids, skip));
    })));
  }
  return seen;
}

/**
 * Give `mesh` only the triangles flagged in `keep` and only the vertices they
 * use, in their order. Every attribute of a vertex that stays, the baked
 * `_cavity` among them, is carried over as it was, and so is the bake's record.
 */
function keepFaces(mesh, keep) {
  const source = mesh.geometry;
  const index = source.getIndex();
  const used = new Uint8Array(source.getAttribute('position').count);
  for (let t = 0; t < keep.length; t += 1) {
    if (keep[t]) for (let k = 0; k < 3; k += 1) used[index.getX(t * 3 + k)] = 1;
  }
  const remap = new Int32Array(used.length).fill(-1);
  let count = 0;
  for (let v = 0; v < used.length; v += 1) if (used[v]) remap[v] = count++;
  const geometry = new THREE.BufferGeometry();
  geometry.name = source.name;
  for (const [name, attribute] of Object.entries(source.attributes)) {
    // Every channel here is plain 32-bit floats: anything else is refused, not
    // converted.
    if (attribute.isInterleavedBufferAttribute || !(attribute.array instanceof Float32Array)) {
      throw new Error(`keepFaces: ${name} is not a plain float attribute`);
    }
    const size = attribute.itemSize;
    const values = new Float32Array(count * size);
    for (let v = 0; v < used.length; v += 1) {
      if (remap[v] < 0) continue;
      for (let k = 0; k < size; k += 1) values[remap[v] * size + k] = attribute.array[v * size + k];
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, size, attribute.normalized));
  }
  const indices = [];
  for (let t = 0; t < keep.length; t += 1) {
    if (keep[t]) for (let k = 0; k < 3; k += 1) indices.push(remap[index.getX(t * 3 + k)]);
  }
  geometry.setIndex(indices);
  geometry.userData = { ...source.userData };
  mesh.geometry = geometry;
}

/** Leave out of the crown and the wood every face no viewer can see. */
function dropUnseen({ clusters, crown, crownOwners, wood }) {
  const solids = clusters.map((cluster) => {
    const inradius = sphereOf(cluster.detail).inradius;
    return { c: cluster.c, r: cluster.r.map((v) => Math.max(1e-6, v * inradius - UNSEEN.sway)) };
  });
  const directions = viewDirections(UNSEEN.directions);
  keepFaces(crown, seenFaces(crown.geometry, crownOwners, solids, directions));
  keepFaces(wood, seenFaces(wood.geometry, null, solids, directions));
}

// ==================================================================== build
/**
 * The spreading oak, at one level of detail, as its wood and its crown: the
 * two parts, with what `dropUnseen` needs to judge them after the bake.
 */
function spreadingOak(parent, leaf, bark) {
  const clusters = [];
  LOBES.forEach((lobe, l) => clusters.push(...lobeClusters(lobe, l)));

  const tubes = [tube(BOLE.path, BOLE.radius, DETAIL.bole, (i, angle) => {
    const out = BOLE.flare[i];
    // Five buttresses, turning a little with height: the bole twists.
    return 1 + out * Math.pow(Math.max(0, Math.cos(angle * 5 + i * 0.4)), 3) - out * 0.22;
  }, true)];
  const limbs = LIMBS.map((limb, i) => {
    requireBuried(limb.path[limb.path.length - 1], clusters, `limb ${i}`);
    const smooth = curve(limb.path, limb.radius, 2);
    requireCovered(smooth.path, [limb.radius[0], limb.radius[limb.radius.length - 1]], clusters, `limb ${i}`);
    tubes.push(tube(smooth.path, smooth.radius, DETAIL.limb));
    return smooth.path;
  });
  BRANCHES.forEach((branch, i) => {
    requireBuried(branch.tip, clusters, `branch ${i}`);
    const from = along(limbs[branch.limb], branch.at);
    const mid = lerp3(from, branch.tip, 0.5);
    mid[1] += 0.35;
    const smooth = curve([from, mid, branch.tip], [branch.radius[0], (branch.radius[0] + branch.radius[1]) / 2, branch.radius[1]], 2);
    requireCovered(smooth.path, branch.radius, clusters, `branch ${i}`);
    tubes.push(tube(smooth.path, smooth.radius, DETAIL.branch));
  });
  const leaves = crownGeometry(clusters);
  const wood = createPart('Oak_Wood', woodGeometry(tubes), bark, { parent });
  const crown = createPart('Oak_Crown', leaves.geometry, leaf, { parent });
  return { clusters, crown, crownOwners: leaves.owners, wood };
}

function build() {
  const root = createRoot('Oak');
  const leaf = gameMaterial(0x5f8a46, { roughness: 0.95, flatShading: false });
  leaf.name = 'leaf';
  const bark = gameMaterial(0x6d4f33, { roughness: 0.95, flatShading: false });
  bark.name = 'bark';

  // Each variant of the family is a node marked `treeVariant`; the loader
  // instances every one it finds. There is one.
  const spreading = createRoot('Oak_Spreading');
  spreading.userData.treeVariant = 'spreading';
  root.add(spreading);
  const oak = spreadingOak(spreading, leaf, bark);

  // The exposure bake samples the whole tree; only then is what no viewer
  // can see left out, so every face that stays keeps the cavity it had.
  bakeSurfaceAttributes(root, { edge: false, cavity: { rays: 32, radius: 4 } });
  dropUnseen(oak);
  defineBudget({ triangles: 10000, draws: 2 });
  root.userData.treeChannels = TREE_CHANNELS;
  root.userData.treeUnseen = TREE_UNSEEN;
  return root;
}

/** What rides in each channel; the loader checks it before reading any of them. */
const TREE_CHANNELS = {
  version: 1,
  attribute: 'TEXCOORD_0',
  u: 'leaf: the cluster seed in [0, 1), one value per cluster; bark: 0',
  v: '0 on both',
  lobeNormal: 'TANGENT',
  lobeNormalMeaning: 'leaf only: xyz is the outward normal of the lobe the vertex belongs to, the gradient of that lobe ellipsoid at the vertex, and w is 1. Not a tangent: nothing normal-maps this asset.',
  cavity: '_CAVITY, Kiln exposure bake: 1 open to the sky, toward 0 under other clusters',
};

/** What leaving the unseen faces out assumed of the game's motion. */
const TREE_UNSEEN = {
  version: 1,
  sway: UNSEEN.sway,
  swell: Math.max(...UNSEEN.margins),
  meaning: 'Faces no viewer can see from any direction were left out. That holds while no part of the tree moves against another by more than `sway`, and no leaf vertex is pushed out by more than `swell`, both in metres of this program.',
};
