// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The barn. A Kiln program, rendered and revised through `kiln render`,
// exported to assets/barn/barn.glb.
//
// A THREE-BAY THRESHING BARN UNDER A GAMBREL. Timber-framed and boarded, on a
// stone sill wall, with its cart doors in the middle bay of the long south wall,
// a mow bay either side, a hay door with a compact hoist in the west gable and a
// ventilating cupola over the east mow. The doors stand open on their hinges and
// there is a barn behind them: a raised threshing floor, two framed bents, lofts
// over the side bays with hay in them, and a lantern hung inside the door.
//
// IT STANDS IN THE PROCEDURAL BARN'S BOX ON PURPOSE. 16.5 by 10.8 m to the
// boards and a ridge at 10.5 m are BARN in app/src/scene/farmhouse/plan.ts, so
// the pad, the yaw, the cast shadow and the farmer's route are the same for
// either source. Nothing of the procedural geometry is reproduced.
//
// WHY A GAMBREL. The sun in this game is eight degrees up in the north-west and
// both cameras look north, so the door elevation and a south-facing slope of
// any ordinary pitch sit in the shadow band: a plain gable roof arrives from
// the Classic approach as one dark slab over one dark wall. A gambrel's upper
// pitch is shallow enough (22 degrees) to reach the body band, so the roof
// carries two values - a dark steep skirt and a lighter cap - and the outline
// says barn before anything else in it is read. The pitches are arithmetic, not
// taste: see ROOF below.
//
// EVERY MATERIAL IS NAMED AFTER A BAND SET, and the game re-binds by name
// (app/src/scene/farmhouse/kilnBarn.ts). `boards` is the rust-red BARN set,
// `slate` the barn slate, `timber`, `stone`, `opening` and `lamp` the cluster's
// own. The colours below are only so the raw GLB looks approximately right in a
// contact sheet; in game they are replaced by the toon ramp outright.
//
// THE INSIDE IS PAINTED AS THE OPENING. The game has no shadow map: a floor seen
// through a door is lit as if it stood in the field. So every surface inside the
// shell takes the `opening` set - the cluster's warm dark - and the interior
// reads as what it is, a dark volume with forms in it, rather than a lit room.
// The hay is the exception, because the low sun does reach it through the hay
// door, and the lantern is a lamp.
//
// TWO CHANNELS RIDE IN TEXCOORD_0 (see writeSurfaceChannels at the end): the
// convention the farmhouse recipe established for the backdrop shader, written
// from this program's own parts and declared in the root node's extras.

const meta = { name: 'Barn', category: 'architecture', role: 'building' };

// ===================================================================== plan
// The boards' outer faces: BARN in app/src/scene/farmhouse/plan.ts.
const HX = 8.25;
const HZ = 5.4;
/** Every wall, plinth and step starts here, a hand's depth under the pad. */
const FOOT = -0.05;
/**
 * The threshing floor, and every walking surface: 0.15 m over the pad. A floor
 * at the pad's own height is the terrain's plane, and the farmhouse found the
 * ground showing through a 3 cm lift at the owner's cameras.
 */
const FLOOR = 0.15;
/** The stone apron and step before the doors: a centimetre under the floor. */
const APRON = 0.14;
/**
 * The apron's extent, under the swing of both cart-door leaves with a hand's
 * width to spare. Its south-east corner is the barn's nearest point to the
 * pasture: at the barn's yaw it lands on the pad's south edge (z 135 in the
 * terrain manifest), and no further.
 */
const APRON_AT = { x0: -3.1, x1: 4.0, z: -7.5 };
/** The step before the stable door. */
const STEP_AT = { x0: 4.6, x1: 6.0, z: -5.9 };
/** The stone sill wall the frame stands on, and how far it stands proud. */
const PLINTH = 0.55;
const PLINTH_PROUD = 0.08;
/** Boards to the inside lining: the depth of the frame. */
const LINING = 0.2;
/** How far a trim board stands off the boards. */
const PROUD = 0.04;
/** How far a wall's top edge runs up inside the slab over it. */
const BURY = 0.06;

// ===================================================================== roof
const RIDGE_H = 10.5;
/** The cap's pitch, and the knee it starts from: see PROFILE. */
const UPPER_PITCH = (22 * Math.PI) / 180;
const KNEE = [2.9, RIDGE_H - 2.9 * Math.tan(UPPER_PITCH)];
/**
 * The slate's outer surface, half a section from the eave edge to the ridge, as
 * (z, y). Three planes a side, and on the south side, with the barn at its yaw
 * of 0.14 under SUN_DIRECTION (app/src/tsl/palette.ts), they take:
 *
 *   flare   6.0 -> 5.4    30.3 deg   half-lambert 0.39   shadow
 *   lower   5.4 -> 2.9    60.0 deg   half-lambert 0.25   shadow
 *   upper   2.9 -> 0      22.0 deg   half-lambert 0.44   body
 *
 * with the shadow band ending at 0.42 and its terminator 0.07 wide (RAMP). A
 * plain gable at this ridge and span would sit at 38.5 degrees and 0.35, in
 * the shadow band with the wall below it, and the approach would see one dark
 * slab over one dark wall. At 25.8 degrees the cap sat on the terminator's
 * midpoint, half a band, which is a value nobody can name; 22 puts nine-tenths
 * of the body band into it. That is the shallowest the cap goes and still sheds
 * as slate, and it is what puts a second value into the roof from the south.
 */
const PROFILE = [[6.0, 4.65], [HZ, 5.0], KNEE, [0, RIDGE_H]];
/** Slab thickness, perpendicular to each plane. */
const SLATE = 0.2;
/** How far the roof reaches past each gable. */
const VERGE = 0.45;
const XV = HX + VERGE;

// =================================================================== layout
/** The three bays: a mow either side of the threshing floor. */
const BENTS = [-2.4, 3.2];
/** The cart door, centred in the middle bay. */
const CART = { x0: -1.8, x1: 2.6, head: 4.2 };
/** Each leaf, and how far it stands open. Not a pair: one was pushed further. */
const LEAF_W = (CART.x1 - CART.x0) / 2;
const OPEN_WEST = 118;
const OPEN_EAST = 124;
/** The stable door in the east bay: the lower leaf shut, the upper hooked back. */
const STABLE = { x0: 4.75, x1: 5.85, head: 2.25, split: 1.25 };
/** The hay door, high in the west gable below a wall-mounted hoist. */
const HAY = { z0: -0.8, z1: 0.8, y0: 6.7, y1: 8.7 };
/** The cupola, over the east mow rather than the door: see the notes in plan.ts. */
const CUPOLA_X = 4.8;
/**
 * The cupola's boarded body - half its width, and its foot and head - and its
 * cap's reach and apex. The foot is between the slab's two faces all round, so
 * the cupola stands in the slate rather than on it and no angle shows daylight
 * under it.
 */
const CUPOLA = { half: 0.85, low: 10.0, high: 11.5, reach: 1.1, apex: 12.45 };
/** How deep a window's glass sits in its reveal. */
const PANE = 0.14;

/**
 * Every opening, on the wall it is cut in, in that wall's (u, v): u runs along
 * the wall (x on the long walls, z on the gables) and v is height. No two are
 * alike and no two gaps match: a barn is a building that was added to.
 */
const OPENINGS = [
  { id: 'cart', wall: 'south', u: [CART.x0, CART.x1], v: [FLOOR, CART.head], kind: 'door' },
  { id: 'stable', wall: 'south', u: [STABLE.x0, STABLE.x1], v: [FLOOR, STABLE.head], kind: 'door' },
  { id: 'south-w1', wall: 'south', u: [-7.0, -6.2], v: [2.3, 3.1], kind: 'window' },
  { id: 'south-w2', wall: 'south', u: [-4.75, -3.85], v: [2.45, 3.2], kind: 'window' },
  { id: 'south-w3', wall: 'south', u: [6.95, 7.65], v: [2.35, 3.15], kind: 'window' },
  { id: 'north-w1', wall: 'north', u: [-5.85, -4.95], v: [2.4, 3.2], kind: 'window' },
  { id: 'north-w2', wall: 'north', u: [5.6, 6.4], v: [2.6, 3.3], kind: 'window' },
  { id: 'hay', wall: 'west', u: [HAY.z0, HAY.z1], v: [HAY.y0, HAY.y1], kind: 'hay' },
  { id: 'west-w1', wall: 'west', u: [2.45, 3.35], v: [1.6, 2.6], kind: 'window' },
  { id: 'west-w2', wall: 'west', u: [-3.4, -2.6], v: [1.7, 2.5], kind: 'window' },
  { id: 'loft', wall: 'east', u: [-0.75, 0.35], v: [6.5, 7.75], kind: 'lamp' },
  { id: 'east-w1', wall: 'east', u: [-3.2, -2.4], v: [1.5, 2.4], kind: 'window' },
  { id: 'east-w2', wall: 'east', u: [2.05, 2.95], v: [1.65, 2.45], kind: 'window' },
];

// ================================================================== vectors
/**
 * A length rounded to the millimetre, for everything this program writes down
 * as a number: the channels (nothing the shader does with a distance resolves
 * finer, and it lets the triangles round a shared corner carry one value there,
 * so the export welds them into one vertex) and the records in the extras.
 */
const metres = (value) => Math.round(value * 1000) / 1000;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

/** Newell's normal of a planar polygon, unnormalised. */
function newell(points) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

// ============================================================ the sections
/**
 * A polyline offset inward by `t`, perpendicular to each segment, mitred at the
 * joints, cut plumb at the eave and meeting its mirror at the ridge. This is the
 * underside of the slab, and every wall top is measured against it.
 */
function offsetProfile(profile, t) {
  const lines = [];
  for (let i = 0; i + 1 < profile.length; i += 1) {
    const [z0, y0] = profile[i];
    const [z1, y1] = profile[i + 1];
    const length = Math.hypot(z1 - z0, y1 - y0);
    const n = [(y1 - y0) / length, -(z1 - z0) / length];
    lines.push({ p: [z0 - t * n[0], y0 - t * n[1]], d: [z1 - z0, y1 - y0] });
  }
  const atZ = (line, z) => [z, line.p[1] + ((z - line.p[0]) / line.d[0]) * line.d[1]];
  const meet = (a, b) => {
    const det = a.d[0] * b.d[1] - a.d[1] * b.d[0];
    const s = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / det;
    return [a.p[0] + s * a.d[0], a.p[1] + s * a.d[1]];
  };
  const out = [atZ(lines[0], profile[0][0])];
  for (let i = 1; i < lines.length; i += 1) out.push(meet(lines[i - 1], lines[i]));
  out.push(atZ(lines[lines.length - 1], 0));
  return out;
}

/** Height of a (z, y) polyline running eave to ridge, at |z|. */
function heightAt(poly, z) {
  const a = Math.abs(z);
  for (let i = 0; i + 1 < poly.length; i += 1) {
    const [z0, y0] = poly[i];
    const [z1, y1] = poly[i + 1];
    if (a <= z0 + 1e-9 && a >= z1 - 1e-9) return y0 + ((y1 - y0) * (a - z0)) / (z1 - z0);
  }
  return poly[0][1];
}

/** Metres along the slate from its eave edge to |z|: the course channel. */
function slopeLength(z) {
  const a = Math.abs(z);
  let run = 0;
  for (let i = 0; i + 1 < PROFILE.length; i += 1) {
    const [z0, y0] = PROFILE[i];
    const [z1, y1] = PROFILE[i + 1];
    const length = Math.hypot(z1 - z0, y1 - y0);
    if (a <= z0 + 1e-9 && a >= z1 - 1e-9) return run + (length * (z0 - a)) / (z0 - z1);
    run += length;
  }
  return run;
}

const UNDER = offsetProfile(PROFILE, SLATE);

// ================================================================== sheets
/**
 * Triangles for one part, flat-normalled, with the slate channel carried along
 * per vertex. Every helper here winds its faces from an outward direction it is
 * handed, so no corner order has to be remembered and a reversed face cannot
 * happen silently.
 */
class Sheet {
  constructor() {
    this.p = [];
    this.n = [];
    this.v = [];
  }

  tri(a, b, c, v) {
    const n = cross(sub(b, a), sub(c, a));
    const length = Math.hypot(n[0], n[1], n[2]);
    if (length < 1e-10) return;
    const corners = [a, b, c];
    for (let k = 0; k < 3; k += 1) {
      this.p.push(corners[k][0], corners[k][1], corners[k][2]);
      this.n.push(n[0] / length, n[1] / length, n[2] / length);
      this.v.push(v === undefined ? -1 : v[k]);
    }
  }

  /** A planar convex polygon, wound to face `out`, fanned from its first corner. */
  face(points, out, v) {
    const flip = dot(newell(points), out) < 0;
    const p = flip ? [...points].reverse() : points;
    const w = v === undefined ? undefined : flip ? [...v].reverse() : v;
    for (let i = 1; i + 1 < p.length; i += 1) {
      this.tri(p[0], p[i], p[i + 1], w && [w[0], w[i], w[i + 1]]);
    }
  }

  /** A planar face with holes, ear-clipped in its own (u, v) and mapped by `at`. */
  holed(contour, holes, at, out) {
    const triangles = THREE.ShapeUtils.triangulateShape(
      contour.map(([u, v]) => new THREE.Vector2(u, v)),
      holes.map((hole) => hole.map(([u, v]) => new THREE.Vector2(u, v))),
    );
    const corners = [...contour, ...holes.flat()].map(at);
    for (const [i, j, k] of triangles) {
      const a = corners[i];
      const b = corners[j];
      const c = corners[k];
      if (dot(cross(sub(b, a), sub(c, a)), out) < 0) this.tri(a, c, b);
      else this.tri(a, b, c);
    }
  }
}

/** A rectangle in (u, v), counter-clockwise. */
const rect = (u, v) => [[u[0], v[0]], [u[1], v[0]], [u[1], v[1]], [u[0], v[1]]];

const sorted = ([a, b]) => (a <= b ? [a, b] : [b, a]);

/**
 * An axis-aligned box. `skip` lists faces to leave out, by outward axis: a face
 * that lies against something is never drawn.
 */
function box(sheet, X, Y, Z, skip = '') {
  const [x0, x1] = sorted(X);
  const [y0, y1] = sorted(Y);
  const [z0, z1] = sorted(Z);
  const off = skip.split(' ');
  const faces = [
    ['+x', [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]],
    ['-x', [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0]],
    ['+y', [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]],
    ['-y', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]],
    ['+z', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]],
    ['-z', [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]],
  ];
  for (const [key, corners, out] of faces) if (!off.includes(key)) sheet.face(corners, out);
}

/** A box turned `yaw` radians about its own vertical axis through `centre`. */
function turnedBox(sheet, centre, half, yaw, skip = '') {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const turn = (p) => [centre[0] + p[0] * cos + p[2] * sin, centre[1] + p[1], centre[2] - p[0] * sin + p[2] * cos];
  const local = new Sheet();
  box(local, [-half[0], half[0]], [-half[1], half[1]], [-half[2], half[2]], skip);
  for (let i = 0; i < local.p.length; i += 9) {
    const c = [0, 3, 6].map((k) => turn([local.p[i + k], local.p[i + k + 1], local.p[i + k + 2]]));
    sheet.tri(c[0], c[1], c[2]);
  }
}

// ==================================================================== walls
/**
 * The four walls as frames: `at(u, v, d)` maps a point on a wall, `d` metres in
 * from its outer face, into the barn's frame. `uAxis` is the direction u runs.
 */
const WALLS = {
  south: { at: (u, v, d) => [u, v, -HZ + d], out: [0, 0, -1], uAxis: [1, 0, 0] },
  north: { at: (u, v, d) => [u, v, HZ - d], out: [0, 0, 1], uAxis: [1, 0, 0] },
  west: { at: (u, v, d) => [-HX + d, v, u], out: [-1, 0, 0], uAxis: [0, 0, 1] },
  east: { at: (u, v, d) => [HX - d, v, u], out: [1, 0, 0], uAxis: [0, 0, 1] },
};

/** A box laid on a wall in its own (u, v, d), with the face against it left off. */
function wallBox(sheet, wall, U, V, D, skip = '') {
  const w = WALLS[wall];
  const a = w.at(U[0], V[0], D[0]);
  const b = w.at(U[1], V[1], D[1]);
  const against = { south: '+z', north: '-z', west: '+x', east: '-x' }[wall];
  box(sheet, [a[0], b[0]], [a[1], b[1]], [a[2], b[2]], `${against} ${skip}`);
}

/**
 * The four (or, for a door, three) faces lining an opening through `depth`, on
 * one of the walls or on any other frame shaped like one.
 */
function reveal(sheet, opening, depth, w = WALLS[opening.wall]) {
  const [u0, u1] = opening.u;
  const [v0, v1] = opening.v;
  const up = [0, 1, 0];
  sheet.face([w.at(u0, v0, 0), w.at(u0, v1, 0), w.at(u0, v1, depth), w.at(u0, v0, depth)], w.uAxis);
  sheet.face([w.at(u1, v0, 0), w.at(u1, v1, 0), w.at(u1, v1, depth), w.at(u1, v0, depth)], mul(w.uAxis, -1));
  sheet.face([w.at(u0, v1, 0), w.at(u1, v1, 0), w.at(u1, v1, depth), w.at(u0, v1, depth)], mul(up, -1));
  if (opening.kind !== 'door') {
    sheet.face([w.at(u0, v0, 0), w.at(u1, v0, 0), w.at(u1, v0, depth), w.at(u0, v0, depth)], up);
  }
}

/** The gable's top edge, run up inside the slab: under the roof, all the way over. */
function gableTop(limit) {
  const joints = UNDER.filter(([z]) => z < limit - 1e-6 && z > 1e-6);
  const right = [[limit, heightAt(UNDER, limit) + BURY], ...joints.map(([z, y]) => [z, y + BURY]), [0, UNDER[UNDER.length - 1][1] + BURY]];
  const left = [...right].reverse().slice(1).map(([z, y]) => [-z, y]);
  return [...right, ...left];
}

function build() {
  const root = createRoot('Barn');

  // Body-band colours of each set, for a contact sheet only (see the header).
  const boards = gameMaterial(0x9c5e44, { roughness: 0.92 });
  boards.name = 'boards';
  const slate = gameMaterial(0x6a6058, { roughness: 0.88 });
  slate.name = 'slate';
  const timber = gameMaterial(0x8f7154, { roughness: 0.85 });
  timber.name = 'timber';
  const stone = gameMaterial(0xab917a, { roughness: 0.92 });
  stone.name = 'stone';
  const opening = gameMaterial(0x463c3e, { roughness: 0.9 });
  opening.name = 'opening';
  const lamp = gameMaterial(0xffb04a, { roughness: 0.6, emissive: 0xffb04a, emissiveIntensity: 1.5 });
  lamp.name = 'lamp';

  const slateChannel = new Map();
  const undersides = [];
  const part = (name, material, sheet, parent) => {
    if (sheet.p.length === 0) return null;
    const mesh = createPart(name, meshGeo({ positions: sheet.p, normals: sheet.n }), material, { parent: parent ?? root });
    if (material === slate) slateChannel.set(mesh, Float32Array.from(sheet.v));
    return mesh;
  };

  // ------------------------------------------------------------- the plinth
  // Stone under every wall, proud of the boards by a thumb's width so its top
  // reads as a lit line at the foot of a shaded wall. It stops at the two doors
  // that reach the floor.
  {
    const s = new Sheet();
    const zo = HZ + PLINTH_PROUD;
    const xo = HX + PLINTH_PROUD;
    const south = [[-xo, CART.x0], [CART.x1, STABLE.x0], [STABLE.x1, xo]];
    for (const [a, b] of south) {
      s.face([[a, FOOT, -zo], [b, FOOT, -zo], [b, PLINTH, -zo], [a, PLINTH, -zo]], [0, 0, -1]);
      s.face([[a, PLINTH, -zo], [b, PLINTH, -zo], [b, PLINTH, -HZ], [a, PLINTH, -HZ]], [0, 1, 0]);
      for (const [x, out] of [[a, -1], [b, 1]]) {
        if (Math.abs(x) >= xo - 1e-6) continue;
        s.face([[x, FOOT, -zo], [x, PLINTH, -zo], [x, PLINTH, -HZ], [x, FOOT, -HZ]], [out, 0, 0]);
      }
    }
    s.face([[-xo, FOOT, zo], [xo, FOOT, zo], [xo, PLINTH, zo], [-xo, PLINTH, zo]], [0, 0, 1]);
    s.face([[-xo, PLINTH, zo], [xo, PLINTH, zo], [xo, PLINTH, HZ], [-xo, PLINTH, HZ]], [0, 1, 0]);
    for (const sx of [-1, 1]) {
      const x = sx * xo;
      s.face([[x, FOOT, -zo], [x, FOOT, zo], [x, PLINTH, zo], [x, PLINTH, -zo]], [sx, 0, 0]);
      // The corner squares of the ledge belong to the long sides.
      s.face([[x, PLINTH, -HZ], [x, PLINTH, HZ], [sx * HX, PLINTH, HZ], [sx * HX, PLINTH, -HZ]], [0, 1, 0]);
    }
    part('Plinth', stone, s);
  }

  // A stone apron before the cart doors, under the swing of both leaves, and a
  // step at the stable door. Both run in to the threshold board's face, under
  // the plinth either side of the door, so no slot opens between them.
  {
    const s = new Sheet();
    box(s, [APRON_AT.x0, APRON_AT.x1], [FOOT, APRON], [APRON_AT.z, -(HZ + 0.03)], '-y +z');
    box(s, [STEP_AT.x0, STEP_AT.x1], [FOOT, APRON], [STEP_AT.z, -(HZ + 0.03)], '-y +z');
    part('Apron', stone, s);
  }

  // ------------------------------------------------------------- the walls
  const topOuter = heightAt(UNDER, HZ) + BURY;
  const topInner = heightAt(UNDER, HZ - LINING) + BURY;
  const holesOn = (wall, kinds) => OPENINGS
    .filter((o) => o.wall === wall && kinds.includes(o.kind))
    .map((o) => rect(o.u, o.v));
  {
    const outer = new Sheet();
    const lining = new Sheet();
    // South, the door elevation. The two doors that reach the floor are notches
    // in the boards rather than holes in them.
    outer.holed(
      [
        [-HX, PLINTH], [CART.x0, PLINTH], [CART.x0, CART.head], [CART.x1, CART.head], [CART.x1, PLINTH],
        [STABLE.x0, PLINTH], [STABLE.x0, STABLE.head], [STABLE.x1, STABLE.head], [STABLE.x1, PLINTH],
        [HX, PLINTH], [HX, topOuter], [-HX, topOuter],
      ],
      holesOn('south', ['window']),
      ([u, v]) => [u, v, -HZ],
      [0, 0, -1],
    );
    const li = HX - LINING;
    lining.holed(
      [
        [-li, FLOOR], [CART.x0, FLOOR], [CART.x0, CART.head], [CART.x1, CART.head], [CART.x1, FLOOR],
        [STABLE.x0, FLOOR], [STABLE.x0, STABLE.head], [STABLE.x1, STABLE.head], [STABLE.x1, FLOOR],
        [li, FLOOR], [li, topInner], [-li, topInner],
      ],
      [],
      ([u, v]) => [u, v, -(HZ - LINING)],
      [0, 0, 1],
    );
    // North: shut, with its winnowing doors laid on the boards (see below).
    outer.holed(rect([-HX, HX], [PLINTH, topOuter]), holesOn('north', ['window']), ([u, v]) => [u, v, HZ], [0, 0, 1]);
    lining.face(rect([-li, li], [FLOOR, topInner]).map(([u, v]) => [u, v, HZ - LINING]), [0, 0, -1]);
    // The gables, boarded right up under the slate.
    for (const [wall, sx] of [['west', -1], ['east', 1]]) {
      const contour = [[-HZ, PLINTH], [HZ, PLINTH], ...gableTop(HZ)];
      outer.holed(contour, holesOn(wall, ['window', 'hay', 'lamp']), ([u, v]) => [sx * HX, v, u], [sx, 0, 0]);
      const inner = [[-(HZ - LINING), FLOOR], [HZ - LINING, FLOOR], ...gableTop(HZ - LINING)];
      lining.holed(inner, holesOn(wall, ['hay']), ([u, v]) => [sx * (HX - LINING), v, u], [-sx, 0, 0]);
    }
    part('Walls', boards, outer);
    part('Lining', opening, lining);
  }

  // Corner boards, a belt across each gable at the eaves, and the reveals.
  {
    const s = new Sheet();
    const head = 4.8;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        box(s, [sx * (HX - 0.2), sx * (HX + PROUD)], [PLINTH, head], [sz * HZ, sz * (HZ + PROUD)], `${sz > 0 ? '-z' : '+z'} -y +y`);
        box(s, [sx * HX, sx * (HX + PROUD)], [PLINTH, head], [sz * (HZ - 0.2), sz * HZ], `${sx > 0 ? '-x' : '+x'} ${sz > 0 ? '+z' : '-z'} -y +y`);
      }
      box(s, [sx * HX, sx * (HX + 0.05)], [4.58, 4.78], [-(HZ + PROUD), HZ + PROUD], sx > 0 ? '-x' : '+x');
    }
    for (const o of OPENINGS) reveal(s, o, o.kind === 'window' || o.kind === 'lamp' ? PANE : LINING);
    part('Trim', timber, s);
  }

  // Windows: dark glass set into the reveal, and a sill board under each.
  {
    const glass = new Sheet();
    const glow = new Sheet();
    const sills = new Sheet();
    for (const o of OPENINGS.filter((x) => x.kind === 'window' || x.kind === 'lamp')) {
      const w = WALLS[o.wall];
      const pane = [w.at(o.u[0], o.v[0], PANE), w.at(o.u[1], o.v[0], PANE), w.at(o.u[1], o.v[1], PANE), w.at(o.u[0], o.v[1], PANE)];
      (o.kind === 'lamp' ? glow : glass).face(pane, w.out);
      // A sill and nothing over the head: at the distance the barn is seen
      // from a window is a dark note with a lit edge under it, and the reveal
      // already lines it.
      wallBox(sills, o.wall, [o.u[0] - 0.07, o.u[1] + 0.07], [o.v[0] - 0.08, o.v[0]], [-0.07, 0], '-y');
    }
    part('Glass', opening, glass);
    part('LoftLamp', lamp, glow);
    part('Sills', timber, sills);
  }

  // --------------------------------------------------------------- the roof
  // Three planes a side, run out over both verges, with a fascia board on the
  // eave, matching barge boards on both verges and a centred ridge roll.
  // Owner-directed 2026-10-17: both gambrel ends finish at the ordinary verge;
  // the former pointed hay hood made one ridge end protrude by 1.30 m.
  {
    const top = new Sheet();
    const soffit = new Sheet();
    const ceiling = new Sheet();
    const boardsEdge = new Sheet();
    const stations = PROFILE;
    const under = UNDER;
    for (const sz of [-1, 1]) {
      for (let i = 0; i + 1 < stations.length; i += 1) {
        const [za, ya] = stations[i];
        const [zb, yb] = stations[i + 1];
        const out = unit([0, za - zb, sz * (yb - ya)]);
        top.face(
          [[-XV, ya, sz * za], [XV, ya, sz * za], [XV, yb, sz * zb], [-XV, yb, sz * zb]],
          out,
          [slopeLength(za), slopeLength(za), slopeLength(zb), slopeLength(zb)],
        );
      }
      // The underside, cut where the walls are: over the boards it is the barn's
      // ceiling, beyond them it is the soffit under the eave and the verge.
      for (let i = 0; i + 1 < under.length; i += 1) {
        const [za, ya] = under[i];
        const [zb, yb] = under[i + 1];
        const out = unit([0, -(za - zb), -sz * (yb - ya)]);
        const cuts = za > HZ && zb < HZ ? [[za, ya], [HZ, heightAt(UNDER, HZ)], [zb, yb]] : [[za, ya], [zb, yb]];
        for (let k = 0; k + 1 < cuts.length; k += 1) {
          const [z0, y0] = cuts[k];
          const [z1, y1] = cuts[k + 1];
          const outside = Math.min(z0, z1) >= HZ - 1e-6;
          for (const [x0, x1] of [[-XV, -HX], [-HX, HX], [HX, XV]]) {
            const target = outside || Math.abs(x0 + x1) > 1e-6 ? soffit : ceiling;
            target.face([[x0, y0, sz * z0], [x1, y0, sz * z0], [x1, y1, sz * z1], [x0, y1, sz * z1]], out);
          }
        }
      }
      const [ze, ye] = PROFILE[0];
      boardsEdge.face([[-XV, UNDER[0][1], sz * ze], [XV, UNDER[0][1], sz * ze], [XV, ye, sz * ze], [-XV, ye, sz * ze]], [0, 0, sz]);
      for (const sx of [-1, 1]) {
        for (let i = 0; i + 1 < stations.length; i += 1) {
          const a = stations[i];
          const b = stations[i + 1];
          const c = under[i + 1];
          const d = under[i];
          boardsEdge.face([a, b, c, d].map(([z, y]) => [sx * XV, y, sz * z]), [sx, 0, 0]);
        }
      }
    }
    // The ridge roll projects the same four centimetres past both verges.
    box(top, [-(XV + 0.04), XV + 0.04], [RIDGE_H - 0.12, RIDGE_H + 0.1], [-0.17, 0.17], '-y');
    part('Roof', slate, top);
    undersides.push(part('Soffit', timber, soffit), part('Ceiling', opening, ceiling));
    part('Barge', timber, boardsEdge);
  }

  // --------------------------------------------------------- the hay hoist
  // The hay door remains a working opening. Its compact wall-mounted hoist sits
  // above the lintel, wholly under the ordinary 0.45 m verge, so the hardware
  // reads at the door without extending or changing the roof silhouette.
  {
    const mount = new Sheet();
    const pulley = new Sheet();
    box(mount, [-HX - 0.14, -HX + 0.02], [HAY.y1 + 0.15, HAY.y1 + 0.65], [-0.12, 0.12]);
    box(mount, [-HX - 0.37, -HX - 0.05], [HAY.y1 + 0.49, HAY.y1 + 0.62], [-0.06, 0.06]);
    box(pulley, [-HX - 0.34, -HX - 0.18], [HAY.y1 + 0.23, HAY.y1 + 0.47], [-0.05, 0.05]);
    part('HayHoist', timber, mount);
    part('HayPulley', opening, pulley);
  }

  // ------------------------------------------------------------ the cupola
  // A boarded lantern on the ridge with a louvre in each face and a slate cap,
  // sunk into the roof so no angle shows daylight under it.
  {
    const base = new Sheet();
    const louvre = new Sheet();
    const dark = new Sheet();
    const cap = new Sheet();
    const capUnder = new Sheet();
    const finial = new Sheet();
    const vane = new Sheet();
    const { half, low, high } = CUPOLA;
    const hole = { u: [-0.55, 0.55], v: [10.72, 11.32] };
    const sides = [
      { at: (u, v, d) => [CUPOLA_X + half - d, v, u], out: [1, 0, 0], uAxis: [0, 0, 1] },
      { at: (u, v, d) => [CUPOLA_X - half + d, v, u], out: [-1, 0, 0], uAxis: [0, 0, 1] },
      { at: (u, v, d) => [CUPOLA_X + u, v, half - d], out: [0, 0, 1], uAxis: [1, 0, 0] },
      { at: (u, v, d) => [CUPOLA_X + u, v, -half + d], out: [0, 0, -1], uAxis: [1, 0, 0] },
    ];
    for (const side of sides) {
      base.holed(rect([-half, half], [low, high]), [rect(hole.u, hole.v)], ([u, v]) => side.at(u, v, 0), side.out);
      reveal(louvre, { wall: 'cupola', u: hole.u, v: hole.v, kind: 'louvre' }, 0.1, side);
      dark.face(rect(hole.u, hole.v).map(([u, v]) => side.at(u, v, 0.1)), side.out);
      // Three slats, each a board falling outward, top face and front edge.
      for (const y of [11.24, 11.04, 10.84]) {
        const back = (u) => side.at(u, y, 0.09);
        const front = (u) => side.at(u, y - 0.15, 0.01);
        const lowFront = (u) => side.at(u, y - 0.18, 0.01);
        louvre.face([back(hole.u[0]), back(hole.u[1]), front(hole.u[1]), front(hole.u[0])], add(side.out, [0, 1, 0]));
        louvre.face([front(hole.u[0]), front(hole.u[1]), lowFront(hole.u[1]), lowFront(hole.u[0])], side.out);
      }
    }
    // The cap: a pyramid with a skirt, its soffit and fascia.
    const { reach } = CUPOLA;
    const eave = high;
    const apex = [CUPOLA_X, CUPOLA.apex, 0];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [CUPOLA_X + a * reach, eave, b * reach]);
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const mid = mul(add(a, b), 0.5);
      cap.face([a, b, apex], add(sub(mid, [CUPOLA_X, eave, 0]), [0, 0.6, 0]));
      const lower = (p) => [p[0], p[1] - 0.08, p[2]];
      capUnder.face([a, b, lower(b), lower(a)], sub(mid, [CUPOLA_X, eave, 0]));
    }
    capUnder.face(corners.map((p) => [p[0], p[1] - 0.08, p[2]]), [0, -1, 0]);
    box(finial, [CUPOLA_X - 0.07, CUPOLA_X + 0.07], [12.3, 12.75], [-0.07, 0.07], '-y');
    // The vane: a rod, and an arrow on it pointing roughly into the weather.
    box(vane, [CUPOLA_X - 0.022, CUPOLA_X + 0.022], [12.75, 13.4], [-0.022, 0.022], '-y');
    turnedBox(vane, [CUPOLA_X, 13.18, 0], [0.45, 0.04, 0.012], 0.6);
    turnedBox(vane, [CUPOLA_X - 0.38 * Math.cos(0.6), 13.18, 0.38 * Math.sin(0.6)], [0.08, 0.1, 0.012], 0.6);
    part('Cupola', boards, base);
    part('CupolaLouvres', timber, louvre);
    part('CupolaDark', opening, dark);
    part('CupolaCap', slate, cap);
    undersides.push(part('CupolaSoffit', timber, capUnder));
    part('CupolaFinial', timber, finial);
    part('Weathervane', opening, vane);
  }

  // ------------------------------------------------------- the cart doors
  // Framed in timber on the boards: two posts and a lintel, a threshold board,
  // and an inner lintel the lantern hangs from.
  {
    const s = new Sheet();
    const z0 = -(HZ + PROUD);
    box(s, [CART.x0 - 0.26, CART.x0], [PLINTH, CART.head], [z0, -HZ], '+z +y -y');
    box(s, [CART.x1, CART.x1 + 0.26], [PLINTH, CART.head], [z0, -HZ], '+z +y -y');
    box(s, [CART.x0 - 0.26, CART.x1 + 0.26], [CART.head, CART.head + 0.26], [z0 - 0.02, -HZ], '+z');
    box(s, [CART.x0, CART.x1], [FOOT, FLOOR + 0.05], [-(HZ + 0.03), -(HZ - LINING)], '-y -x +x +z');
    box(s, [STABLE.x0, STABLE.x1], [FOOT, FLOOR + 0.05], [-(HZ + 0.03), -(HZ - LINING)], '-y -x +x +z');
    part('DoorFrames', timber, s);
    const inner = new Sheet();
    box(inner, [CART.x0 - 0.1, CART.x1 + 0.1], [CART.head, CART.head + 0.25], [-(HZ - LINING), -(HZ - LINING) + 0.22], '-z');
    part('InnerLintel', opening, inner);
  }

  /**
   * One cart-door leaf, built shut along +x (or -x) from its hinge, then turned
   * open about the hinge. Ledged and braced on the face that is the inside when
   * shut - which is the face both cameras see once it stands open - with the
   * braces rising from the hinge side, the way a braced door is hung.
   */
  const leaf = (name, hingeX, sign, degrees) => {
    const hinge = createPivot(name, [hingeX, 0, -(HZ + 0.07)], root);
    hinge.rotation.y = (sign * degrees * Math.PI) / 180;
    const slab = new Sheet();
    const frame = new Sheet();
    const x = (t) => sign * t;
    const y0 = FLOOR + 0.04;
    const y1 = CART.head - 0.04;
    const t = 0.035;
    box(slab, [x(0.02), x(LEAF_W - 0.02)], [y0, y1], [-t, t]);
    const ledges = [y0 + 0.32, (y0 + y1) / 2, y1 - 0.32];
    for (const y of ledges) box(frame, [x(0.08), x(LEAF_W - 0.08)], [y - 0.09, y + 0.09], [t, t + 0.04], '-z');
    for (let k = 0; k + 1 < ledges.length; k += 1) {
      const p = [x(0.22), ledges[k] + 0.09];
      const q = [x(LEAF_W - 0.22), ledges[k + 1] - 0.09];
      const along = unit([q[0] - p[0], q[1] - p[1], 0]);
      const across = mul([-along[1], along[0], 0], 0.075);
      const corner = (c, s) => [c[0] + s * across[0], c[1] + s * across[1]];
      const ring = [corner(p, -1), corner(q, -1), corner(q, 1), corner(p, 1)];
      frame.face(ring.map(([a, b]) => [a, b, t + 0.035]), [0, 0, 1]);
      for (const [i, j] of [[0, 1], [2, 3]]) {
        const out = sub([...ring[i], t], [...ring[(i + 3) % 4], t]);
        frame.face([[...ring[i], t], [...ring[j], t], [...ring[j], t + 0.035], [...ring[i], t + 0.035]], [out[0], out[1], 0]);
      }
    }
    part(`${name}_Boards`, boards, slab, hinge);
    part(`${name}_Ledges`, timber, frame, hinge);
  };
  leaf('CartDoorWest', CART.x0, 1, OPEN_WEST);
  leaf('CartDoorEast', CART.x1, -1, OPEN_EAST);

  // The stable door: the lower leaf shut in its reveal, the upper hooked back
  // flat against the boards so the top of the door is a dark hole.
  {
    const s = new Sheet();
    box(s, [STABLE.x0 + 0.02, STABLE.x1 - 0.02], [FLOOR + 0.06, STABLE.split - 0.02], [-(HZ - 0.03), -(HZ - 0.09)], '-x +x -y');
    part('StableDoorLower', boards, s);
    const hinge = createPivot('StableDoorUpper', [STABLE.x0, 0, -(HZ + 0.03)], root);
    hinge.rotation.y = (172 * Math.PI) / 180;
    const upper = new Sheet();
    box(upper, [0.02, STABLE.x1 - STABLE.x0 - 0.02], [STABLE.split, STABLE.head - 0.03], [-0.025, 0.025]);
    part('StableDoorUpper_Boards', boards, upper, hinge);
  }

  // The hay door: matching shut leaves, with a sill and head board on the
  // gable. Each leaf owns its hinge so a future functional door can open them
  // independently; the static game welds their closed geometry as usual.
  {
    const s = new Sheet();
    wallBox(s, 'west', [HAY.z0 - 0.1, HAY.z1 + 0.1], [HAY.y0 - 0.08, HAY.y0], [-0.08, 0]);
    wallBox(s, 'west', [HAY.z0 - 0.12, HAY.z1 + 0.12], [HAY.y1, HAY.y1 + 0.1], [-0.05, 0]);
    part('HayDoorFrame', timber, s);
    const mid = (HAY.z0 + HAY.z1) / 2;
    const half = (HAY.z1 - HAY.z0) / 2;
    const hayLeaf = (name, hingeZ, sign) => {
      const hinge = createPivot(name, [-(HX + 0.05), 0, hingeZ], root);
      const leafSheet = new Sheet();
      const ledges = new Sheet();
      box(leafSheet, [-0.03, 0.03], [HAY.y0 + 0.02, HAY.y1 - 0.02], [sign * 0.02, sign * (half - 0.02)]);
      for (const y of [HAY.y0 + 0.35, HAY.y1 - 0.35]) {
        box(ledges, [0.03, 0.06], [y - 0.09, y + 0.09], [sign * 0.08, sign * (half - 0.08)], '-x');
      }
      part(`${name}_Boards`, boards, leafSheet, hinge);
      part(`${name}_Ledges`, timber, ledges, hinge);
    };
    hayLeaf('HayDoorSouth', mid - half, 1);
    hayLeaf('HayDoorNorth', mid + half, -1);
  }

  // The winnowing doors on the north side, shut: laid on the boards as relief.
  {
    const frame = new Sheet();
    const leaves = new Sheet();
    box(frame, [-1.27, -1.05], [PLINTH, 3.62], [HZ, HZ + PROUD], '-z -y +y');
    box(frame, [1.85, 2.07], [PLINTH, 3.62], [HZ, HZ + PROUD], '-z -y +y');
    box(frame, [-1.27, 2.07], [3.62, 3.88], [HZ, HZ + PROUD + 0.02], '-z');
    box(leaves, [-1.05, 0.38], [PLINTH + 0.03, 3.6], [HZ, HZ + 0.03], '-z');
    box(leaves, [0.42, 1.85], [PLINTH + 0.03, 3.6], [HZ, HZ + 0.03], '-z');
    part('NorthDoorFrame', timber, frame);
    part('NorthDoors', boards, leaves);
  }

  // -------------------------------------------------------------- inside
  // The threshing floor, two bents framing the middle bay, lofts over the mows,
  // hay in both, and the lantern.
  {
    const s = new Sheet();
    box(s, [-(HX - LINING), HX - LINING], [FOOT, FLOOR], [-(HZ - LINING), HZ - LINING], '-x +x -y -z +z');
    for (const bx of BENTS) {
      for (const sz of [-1, 1]) {
        box(s, [bx - 0.13, bx + 0.13], [FLOOR, 4.4], [sz * 4.92, sz * 5.18], '+y -y');
        box(s, [bx - 0.11, bx + 0.11], [4.72, 8.7], [sz * 2.64, sz * 2.86], '+y -y');
      }
      box(s, [bx - 0.13, bx + 0.13], [4.4, 4.72], [-(HZ - LINING), HZ - LINING], '+y -z +z');
      box(s, [bx - 0.12, bx + 0.12], [8.45, 8.7], [-2.86, 2.86], '-z +z');
    }
    const li = HX - LINING;
    box(s, [-li, BENTS[0] - 0.13], [4.4, 4.55], [-(HZ - LINING), HZ - LINING], '-x -z +z');
    box(s, [BENTS[1] + 0.13, li], [4.4, 4.55], [-(HZ - LINING), HZ - LINING], '+x -z +z');
    part('Interior', opening, s);

    // The mows: hay heaped on each loft, banked against the walls under the
    // steep pitch and crowned under the ridge, every point of it a hand or
    // more under the slate. Only the face the hay door opens onto is lit hay;
    // the rest is indoors and takes the dark like everything else in here.
    const hay = new Sheet();
    const mowDark = new Sheet();
    const mow = (x0, x1, shoulder, crown, lit) => {
      const section = (x) => [
        [x, 4.55, -4.9], [x, 4.55, 4.9], [x, 5.25, 4.9], [x, shoulder, 3.4],
        [x, crown, 0], [x, shoulder, -3.4], [x, 5.25, -4.9],
      ];
      (lit ? hay : mowDark).face(section(x0), [-1, 0, 0]);
      mowDark.face(section(x1), [1, 0, 0]);
      // Over the top from one wall side to the other. The section is convex,
      // so out of it is away from any point inside it, such as (y 5, z 0).
      const ring = section(0).slice(1).map(([, y, z]) => [y, z]);
      ring.push([4.55, -4.9]);
      for (let i = 0; i + 1 < ring.length; i += 1) {
        const [ya, za] = ring[i];
        const [yb, zb] = ring[i + 1];
        const out = [0, (ya + yb) / 2 - 5, (za + zb) / 2];
        mowDark.face([[x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb]], out);
      }
    };
    mow(-7.6, -2.75, 6.6, 7.4, true);
    mow(3.55, 7.85, 6.0, 6.7, false);
    part('Hay', timber, hay);
    part('Mows', opening, mowDark);

    const dark = new Sheet();
    const glow = new Sheet();
    const at = [1.55, -(HZ - LINING) + 0.11];
    box(dark, [at[0] - 0.015, at[0] + 0.015], [3.45, CART.head], [at[1] - 0.015, at[1] + 0.015], '+y -y');
    box(dark, [at[0] - 0.13, at[0] + 0.13], [3.38, 3.45], [at[1] - 0.13, at[1] + 0.13]);
    box(dark, [at[0] - 0.12, at[0] + 0.12], [3.0, 3.06], [at[1] - 0.12, at[1] + 0.12]);
    box(glow, [at[0] - 0.1, at[0] + 0.1], [3.06, 3.38], [at[1] - 0.1, at[1] + 0.1], '+y -y');
    part('LanternFrame', opening, dark);
    part('Lantern', lamp, glow);
  }

  defineBudget({ triangles: 2800 });
  writeSurfaceChannels(root, { materials: { boards, slate, timber, stone, opening, lamp }, slateChannel, undersides });
  root.userData.outlineEnvelope = outlineEnvelope();
  root.userData.footprint = FOOTPRINT;
  return root;
}

// ============================================== what the mesh cannot say
/**
 * THE OUTLINE'S ENVELOPE, written by the bake rather than copied into the game.
 *
 * The game draws its outline as an inverted hull grown from a plain closed
 * envelope of each building (app/src/scene/farmhouse/hull.ts), and the envelope
 * has to sit ON the roof it outlines: a few centimetres outside the slab and
 * its underside shows as a dark ledge under every eave. A hand copy of a roof
 * drifts, and the farmhouse's did. So this record describes the masses as built,
 * from the same constants the parts above were built from, and the game derives
 * the envelope from it:
 *
 *  - `slab`: the roof slab, extruded along x between its verges. `top` is its
 *    outer surface and `under` its underside, each a section across the ridge
 *    from the south eave edge to the north one, as [z, y]; corner i of one is
 *    corner i of the other, square across the slab.
 *  - `boxes`: the walls, from the foot to under the soffit, and the cupola's
 *    boarded body, from inside the slate to its cap.
 *  - `caps`: the cupola's slate cap, a square pyramid: its eave square and apex.
 *
 * The small hay-hoist hardware and the vane are left out of this coarse envelope.
 */
function outlineEnvelope() {
  const full = (half) => [...half.map(([z, y]) => [-z, y]), ...half.slice(0, -1).reverse()];
  const mm = (values) => values.map(metres);
  return {
    version: 1,
    slab: { x: mm([-XV, XV]), top: full(PROFILE).map(mm), under: full(UNDER).map(mm) },
    boxes: [
      { x: mm([-HX, HX]), y: mm([FOOT, heightAt(UNDER, HZ)]), z: mm([-HZ, HZ]) },
      {
        x: mm([CUPOLA_X - CUPOLA.half, CUPOLA_X + CUPOLA.half]),
        y: mm([CUPOLA.low, CUPOLA.high]),
        z: mm([-CUPOLA.half, CUPOLA.half]),
      },
    ],
    caps: [
      {
        x: mm([CUPOLA_X - CUPOLA.reach, CUPOLA_X + CUPOLA.reach]),
        z: mm([-CUPOLA.reach, CUPOLA.reach]),
        y: metres(CUPOLA.high),
        apex: mm([CUPOLA_X, CUPOLA.apex, 0]),
      },
    ],
  };
}

/**
 * THE GROUND THE BARN COVERS AT ITS FOOT, in the barn's frame: the walls with
 * their plinth, the apron before the cart doors and the step at the stable
 * door, as [minX, maxX] by [minZ, maxZ] rectangles. The grass bake cuts these
 * when this barn ships; it reads them from KILN_BARN_FOOTPRINT in
 * app/src/scene/farmhouse/plan.ts, because a bake script does not read a GLB,
 * and tests/barn-kiln.spec.ts holds that copy to this record.
 */
const FOOTPRINT = [
  { id: 'barn', minX: -(HX + PLINTH_PROUD), maxX: HX + PLINTH_PROUD, minZ: -(HZ + PLINTH_PROUD), maxZ: HZ + PLINTH_PROUD },
  { id: 'barn apron', minX: APRON_AT.x0, maxX: APRON_AT.x1, minZ: APRON_AT.z, maxZ: -(HZ + PLINTH_PROUD) },
  { id: 'barn step', minX: STEP_AT.x0, maxX: STEP_AT.x1, minZ: STEP_AT.z, maxZ: -(HZ + PLINTH_PROUD) },
].map(({ id, minX, maxX, minZ, maxZ }) => ({ id, minX: metres(minX), maxX: metres(maxX), minZ: metres(minZ), maxZ: metres(maxZ) }));

// ===================================================== the surface channels
/**
 * THE TWO CHANNELS THE GAME'S BACKDROP SHADER READS, written by the bake, in the
 * convention assets/house/farmhouse.kiln.js established for the farmhouse.
 *
 * The game welds every triangle into the farmhouse cluster's band-set buffers and
 * draws them with one shared toon graph (app/src/scene/farmhouse/surfaceMaterial.ts),
 * which reads `uv` as two numbers that are not texture coordinates:
 *
 *  - `uv.x` selects a surface inside a band set. On slate it is 1, which is the
 *    barn's browner slate (BARN_ROOF) rather than the house's. Everything else
 *    here carries 0: boards, timber, stone (DRESS, no course joints), the dark.
 *  - `uv.y` is metres. On boards and timber it is how far the face sits below
 *    the underside of the roof directly over it, so the first 0.46 m draws the
 *    shadow band under an eave, a verge or the cupola cap; negative
 *    where a face runs up inside a slab, which is hidden; 9 where no roof is over
 *    it or the face is inside the shell. On slate it is metres along the roof
 *    from its eave edge - across the knee, not restarting there, because the cap
 *    of a gambrel is the same roof getting more sky, not a second eave - and -1
 *    on every slate face that is not that surface (roll, cupola cap).
 *    9 on stone; 0 on openings and lamps.
 *
 * The distance below a roof is a vertical ray from the vertex, a fifth of a
 * millimetre off its face (see `below`), to the first downward-facing roof
 * underside over it (the soffits, the ceiling and the cupola cap's),
 * so it follows the eave on the long walls and the rake on the gables
 * with no second copy of the roof's arithmetic. Faces are first split where the
 * underside over them bends (the ridge and the knee and flare mitres) and
 * where the roof ends (the eave edge, the verges), so the distance is exactly
 * linear across every triangle.
 */
const SURFACE_CHANNELS = {
  version: 1,
  attribute: 'TEXCOORD_0',
  u: 'surface selector inside the band set: 1 barn slate (roof), otherwise 0',
  v: 'metres: below the roof underside over the face (boards, timber; 9 none or indoors, negative inside a slab); '
    + 'along the slate from its eave edge (slate; -1 off that surface); 9 on stone; 0 on openings and lamps',
};
const OPEN_SKY = 9;

function writeSurfaceChannels(root, spec) {
  root.updateMatrixWorld(true);
  const m = spec.materials;
  const probes = spec.undersides.filter(Boolean).map((mesh) => {
    const probe = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    probe.matrixAutoUpdate = false;
    probe.matrixWorld.copy(mesh.matrixWorld);
    return probe;
  });
  const raycaster = new THREE.Raycaster();
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Matrix3();
  // Where an underside bends (the ridge and the knee and flare mitres)
  // or ends (the eave edge, the verges). Faces are cut along these
  // first, so every triangle is wholly under one underside or clear of all.
  const splits = [
    ['z', 0],
    ...UNDER.slice(1, -1).flatMap(([z]) => [['z', z], ['z', -z]]),
    ['z', PROFILE[0][0]], ['z', -PROFILE[0][0]], ['x', XV], ['x', -XV],
  ];
  // ...and the planes a sample must stay on its own triangle's side of: those,
  // and the walls' outer faces, where the soffit outside meets the ceiling in.
  const sides = [...splits, ['x', HX], ['x', -HX], ['z', HZ], ['z', -HZ]];
  /**
   * Signed metres from corner `p` of triangle `tri` up to the first roof
   * underside over it, or null.
   *
   * The ray is not fired from the corner itself, because a corner is very often
   * ON the edge of the roof it wants: a soffit's own corner, a wall's top at the
   * eave line, a door leaf split where the eave ends. It is fired from a point a
   * fifth of a millimetre into the triangle, then a fifth of a millimetre off its
   * face - which is what puts a wall lying in the gable's plane under the verge
   * outside rather than the ceiling inside, and a barge board just past the
   * verge it edges - and then held on the triangle's own side of every plane
   * above, so the step off the face cannot carry it across an eave line. A
   * triangle then reads exactly one roof, or none, at all three corners.
   */
  const below = (p, n, tri) => {
    const middle = tri[0].clone().add(tri[1]).add(tri[2]).divideScalar(3);
    const q = p.clone().lerp(middle, Math.min(1, 0.0002 / Math.max(p.distanceTo(middle), 1e-9)));
    q.addScaledVector(n, 0.0002);
    for (const [axis, value] of sides) {
      const s = tri.map((corner) => corner[axis] - value);
      if (Math.min(...s) >= -1e-6 && Math.max(...s) > 1e-6) q[axis] = Math.max(q[axis], value + 1e-4);
      else if (Math.max(...s) <= 1e-6 && Math.min(...s) < -1e-6) q[axis] = Math.min(q[axis], value - 1e-4);
    }
    raycaster.set(new THREE.Vector3(q.x, p.y - 0.15, q.z), up);
    for (const hit of raycaster.intersectObjects(probes, false)) {
      normal.getNormalMatrix(hit.object.matrixWorld);
      if (hit.face.normal.clone().applyMatrix3(normal).y < 0) return hit.point.y - p.y;
    }
    return null;
  };

  const meshes = [];
  root.traverse((node) => { if (node.isMesh) meshes.push(node); });
  for (const mesh of meshes) {
    const material = mesh.material;
    let geometry = mesh.geometry;
    let u = 0;
    let v;
    if (material === m.slate) {
      u = 1;
      v = spec.slateChannel.get(mesh);
    } else if (material === m.stone) {
      v = new Float32Array(geometry.getAttribute('position').count).fill(OPEN_SKY);
    } else if (material === m.opening || material === m.lamp) {
      v = new Float32Array(geometry.getAttribute('position').count).fill(0);
    } else {
      for (const [axis, value] of splits) geometry = splitAcross(geometry, mesh.matrixWorld, axis, value);
      v = belowChannel(mesh.matrixWorld, geometry, below);
    }
    const uv = new Float32Array(v.length * 2);
    for (let i = 0; i < v.length; i += 1) {
      uv[i * 2] = u;
      uv[i * 2 + 1] = metres(v[i]);
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    mesh.geometry = geometry;
  }
  root.userData.surfaceChannels = SURFACE_CHANNELS;
}

/** Height of the slate's outer surface over |z|, for telling outside from in. */
const roofTop = (z) => heightAt(PROFILE, Math.min(Math.abs(z), PROFILE[0][0]));

/**
 * Whether a triangle, in the barn's frame, faces out of the barn: a step off it
 * along its own normal lands outside the boards, or above the slate. Reveals,
 * linings and everything indoors do not.
 */
function facesOut(a, b, c) {
  const n = unit(cross(sub(b, a), sub(c, a)));
  const step = add(mul(add(add(a, b), c), 1 / 3), mul(n, 0.02));
  const inside = Math.abs(step[0]) < HX - 0.005 && Math.abs(step[2]) < HZ - 0.005
    && step[1] < roofTop(step[2]) && step[1] > FOOT;
  return !inside;
}

const worldOf = (attribute, i, matrix) => new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(matrix);
const toArray = (p) => [p.x, p.y, p.z];

/** Metres below the roof over each exterior face; OPEN_SKY on every other. */
function belowChannel(matrixWorld, geometry, below) {
  const position = geometry.getAttribute('position');
  const v = new Float32Array(position.count);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);
  for (let t = 0; t < position.count; t += 3) {
    const corner = [0, 1, 2].map((k) => worldOf(position, t + k, matrixWorld));
    const exterior = facesOut(...corner.map(toArray));
    const n = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('normal'), t).applyMatrix3(normalMatrix).normalize();
    for (let k = 0; k < 3; k += 1) {
      const distance = exterior ? below(corner[k], n, corner) : null;
      v[t + k] = distance === null ? OPEN_SKY : distance;
    }
  }
  return v;
}

/**
 * Cut every exterior triangle of a non-indexed geometry that crosses the plane
 * `axis = value` (in the barn's frame), keeping its winding, so a channel that
 * bends there stays linear across each triangle. Indoor faces carry a constant
 * and are left whole.
 */
function splitAcross(geometry, matrixWorld, axis, value) {
  const position = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const corners = [];
  for (let i = 0; i < position.count; i += 1) {
    const w = worldOf(position, i, matrixWorld);
    const s = w[axis] - value;
    corners.push({
      p: new THREE.Vector3().fromBufferAttribute(position, i),
      n: new THREE.Vector3().fromBufferAttribute(normals, i),
      w,
      s: Math.abs(s) < 1e-6 ? 0 : s,
    });
  }
  const cut = (tri) => {
    const s = tri.map((c) => c.s);
    return Math.min(...s) < 0 && Math.max(...s) > 0 && facesOut(...tri.map((c) => toArray(c.w)));
  };
  let crosses = false;
  for (let t = 0; t < corners.length; t += 3) {
    if (cut([corners[t], corners[t + 1], corners[t + 2]])) crosses = true;
  }
  if (!crosses) return geometry;

  const p = [];
  const n = [];
  const emit = (polygon) => {
    for (let k = 1; k + 1 < polygon.length; k += 1) {
      for (const c of [polygon[0], polygon[k], polygon[k + 1]]) {
        p.push(c.p.x, c.p.y, c.p.z);
        n.push(c.n.x, c.n.y, c.n.z);
      }
    }
  };
  for (let t = 0; t < corners.length; t += 3) {
    const tri = [corners[t], corners[t + 1], corners[t + 2]];
    if (!cut(tri)) {
      emit(tri);
      continue;
    }
    for (const keep of [1, -1]) {
      const polygon = [];
      for (let k = 0; k < 3; k += 1) {
        const a = tri[k];
        const b = tri[(k + 1) % 3];
        if (a.s * keep >= 0) polygon.push(a);
        if (a.s * b.s < 0) {
          const f = a.s / (a.s - b.s);
          polygon.push({ p: a.p.clone().lerp(b.p, f), n: a.n.clone().lerp(b.n, f).normalize(), s: 0, w: a.w.clone().lerp(b.w, f) });
        }
      }
      if (polygon.length >= 3) emit(polygon);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  return out;
}
