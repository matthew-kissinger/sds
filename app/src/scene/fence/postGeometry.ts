// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The post, as one geometry every post instance shares: line posts and pier
 * shafts alike. Unit height, unit width, foot at y = -0.5.
 *
 * A HEWN POST, NOT A PAWN. Five facets rather than four so a post never presents
 * a flat face square to the camera the way a box does; a slight taper up the
 * shaft, so the silhouette narrows the way split timber does; and a short flare
 * at the foot, most of it below the ground line, so the post reads as driven
 * into the field rather than set on it. Tested in flat black, that outline is a
 * post - the stepped block finial it replaces was a chess piece.
 *
 * The shaft is wider at the head than it was. Seen near edge-on at the phone
 * camera the old profile closed to 23 cm of screen and read as a surveyor's
 * stake; timber has to keep a cross-section from every angle, so the head is now
 * 50 per cent of girth rather than 42 and the girth itself is larger
 * (placement.ts).
 *
 * THE HEAD IS CHAMFERED, and the chamfer is the last four per cent of the shaft.
 * A post cut square across the top presents one flat quad to a camera looking
 * down and nothing at all to one looking along the run; a chamfer gives the low
 * sun a distinct bright ring around a smaller flat, so a row of post heads reads
 * as a row of lit marks along the top of the fence from any angle. The chamfer is
 * shaded by its LOCAL HEIGHT rather than by its normal (timberMaterial.ts), which
 * is what makes it survive the instance scale: three transforms an instanced
 * normal by the instance matrix, so a 45 degree chamfer on a post scaled
 * (0.33, 1.9, 0.33) arrives at 10 degrees and shades as a side face.
 *
 * NORMALS ARE AUTHORED, NOT COMPUTED, and that is the whole reason the taper is
 * affordable. Three transforms an instanced normal by the instance matrix
 * directly, so a side normal with any y component gets sheared by the (girth,
 * height, girth) scale - on a 0.33 m post 1.9 m tall, a taper's 4 degree normal
 * arrives at 23 degrees and the shaft shades as though it were a cone. Forcing
 * every side normal horizontal survives that scale exactly, and the taper then
 * does its work in the silhouette where it was wanted.
 *
 * THE HULL IS A SECOND SET OF NORMALS OVER THE SAME TOPOLOGY. The outline is
 * grown along the normal (timberMaterial.ts), and a shell grown along FACE
 * normals splits open at every edge where two faces disagree - which on this
 * profile is the whole rim of the head, exactly where the critic saw the drawn
 * line break. The hull's rim vertices carry a normal that points out AND up, so
 * the shell closes over the corner instead of tearing at it.
 */

import * as THREE from 'three/webgpu';

const SIDES = 5;

/**
 * The profile, bottom to top: height as a fraction of the piece, and half-width
 * as a fraction of its girth. The first two rings are the foot flare and sit
 * below the ground line on a line post; the third is where the shaft proper
 * starts.
 */
const PROFILE = [
  { y: 0, r: 0.66 },
  { y: 0.07, r: 0.66 },
  { y: 0.22, r: 0.58 },
  { y: 0.955, r: 0.5 },
  { y: 1, r: 0.35 },
] as const;

/**
 * @param hull true for the outline shell: rim vertices get a normal that leaves
 *   the piece diagonally so the grown shell stays closed over the head and foot
 */
export function postGeometry(hull = false): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const last = PROFILE.length - 1;

  const angle = (i: number): number => ((i + 0.5) / SIDES) * Math.PI * 2;
  const cos = (i: number): number => Math.cos(angle(i));
  const sin = (i: number): number => Math.sin(angle(i));

  /** Ring index to the y component the hull wants on it. Flat everywhere the
   *  surface is continuous, diagonal at the two rims. */
  const rimY = (ring: number): number => {
    if (!hull) return 0;
    if (ring === last) return 1;
    if (ring === 0) return -1;
    return 0;
  };

  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number): void => {
    positions.push(x, y - 0.5, z);
    normals.push(nx, ny, nz);
  };

  for (let s = 0; s < SIDES; s++) {
    // One flat facet spans corner s to corner s+1; its normal is the outward
    // direction of the midpoint between them, held exactly horizontal.
    const mid = (angle(s) + angle(s + 1)) / 2;
    const nx = Math.cos(mid);
    const nz = Math.sin(mid);
    const ax = cos(s);
    const az = sin(s);
    const cx = cos(s + 1);
    const cz = sin(s + 1);
    for (let b = 0; b < last; b++) {
      const lo = PROFILE[b]!;
      const hi = PROFILE[b + 1]!;
      const ly = rimY(b);
      const hy = rimY(b + 1);
      // Two triangles, wound so the OUTWARD face is the front face. Corners run
      // from +x toward +z, and taking them in that order round a rising quad
      // puts the front face on the inside: the post is then backface-culled to
      // nothing and the outline shows through it, which is a flat dark brown
      // column that no change to any timber tone can move.
      push(ax * lo.r, lo.y, az * lo.r, nx, ly, nz);
      push(cx * hi.r, hi.y, cz * hi.r, nx, hy, nz);
      push(cx * lo.r, lo.y, cz * lo.r, nx, ly, nz);
      push(ax * lo.r, lo.y, az * lo.r, nx, ly, nz);
      push(ax * hi.r, hi.y, az * hi.r, nx, hy, nz);
      push(cx * hi.r, hi.y, cz * hi.r, nx, hy, nz);
    }
  }

  // Caps. The top one carries the whole warm catch at both gameplay cameras, so
  // on the solid it is a real face with a real +y normal rather than a hole; on
  // the hull its rim leaves diagonally to meet the shaft's shell.
  const cap = (ring: { readonly y: number; readonly r: number }, up: boolean): void => {
    const ny = up ? 1 : -1;
    for (let s = 0; s < SIDES; s++) {
      const a: [number, number] = [cos(s) * ring.r, sin(s) * ring.r];
      const c: [number, number] = [cos(s + 1) * ring.r, sin(s + 1) * ring.r];
      // Corners run from +x toward +z, which winds an upward face the wrong way
      // round, so the top fan takes them in reverse and the bottom one does not.
      const tri: [number, number][] = up ? [[0, 0], c, a] : [[0, 0], a, c];
      for (const [x, z] of tri) {
        positions.push(x, ring.y - 0.5, z);
        const radial = Math.hypot(x, z);
        if (hull && radial > 1e-6) normals.push(x / radial, ny, z / radial);
        else normals.push(0, ny, 0);
      }
    }
  };
  cap(PROFILE[last]!, true);
  cap(PROFILE[0]!, false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

/**
 * A unit box whose eight corners carry a normal pointing out along all three
 * axes at once, un-normalised. Grown by the outline shader that is a mitred
 * expansion - the same number of centimetres on every face and no split at any
 * edge - where three's own BoxGeometry, with six face normals, would tear into
 * six unconnected plates.
 */
export function railHullGeometry(): THREE.BufferGeometry {
  const corner = (i: number): [number, number, number] => [
    i & 1 ? 0.5 : -0.5,
    i & 2 ? 0.5 : -0.5,
    i & 4 ? 0.5 : -0.5,
  ];
  const quads: [number, number, number, number][] = [
    [0, 2, 3, 1], // -z
    [5, 7, 6, 4], // +z
    [4, 6, 2, 0], // -x
    [1, 3, 7, 5], // +x
    [2, 6, 7, 3], // +y
    [4, 0, 1, 5], // -y
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  for (const quad of quads) {
    for (const i of [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]) {
      const [x, y, z] = corner(i);
      positions.push(x, y, z);
      normals.push(Math.sign(x), Math.sign(y), Math.sign(z));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

interface CombinedGeometryBuffers {
  readonly positions: number[];
  readonly normals: number[];
  readonly outlineFlags: number[];
}

/**
 * Append a surface or hull to the one-draw timber geometry.
 *
 * The hull keeps the exact positions and authored normals used by the former
 * BackSide pass. Reversing each triangle makes FrontSide culling retain the
 * same faces that BackSide retained before, which is the proven one-buffer
 * outline convention used by the rocks and fallen log.
 */
function appendGeometry(
  target: CombinedGeometryBuffers,
  source: THREE.BufferGeometry,
  outline: boolean,
): void {
  const geometry = source.index === null ? source : source.toNonIndexed();
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  if (positions === undefined || normals === undefined || positions.count !== normals.count) {
    throw new Error('Fence timber geometry requires matching position and normal attributes');
  }
  if (positions.count % 3 !== 0) {
    throw new Error('Fence timber geometry must contain complete triangles');
  }

  for (let triangle = 0; triangle < positions.count; triangle += 3) {
    const order = outline
      ? [triangle, triangle + 2, triangle + 1]
      : [triangle, triangle + 1, triangle + 2];
    for (const vertex of order) {
      target.positions.push(positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex));
      target.normals.push(normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex));
      target.outlineFlags.push(outline ? 1 : 0, 0);
    }
  }

  if (geometry !== source) geometry.dispose();
  source.dispose();
}

function timberGeometry(surface: THREE.BufferGeometry, hull: THREE.BufferGeometry): THREE.BufferGeometry {
  const buffers: CombinedGeometryBuffers = {
    positions: [],
    normals: [],
    outlineFlags: [],
  };
  appendGeometry(buffers, surface, false);
  appendGeometry(buffers, hull, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  // uv.x is constant for every triangle: 0 for timber, 1 for the reversed hull.
  // The fence has no texture UVs, so this costs no authored channel.
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.outlineFlags, 2));
  return geometry;
}

/** One post buffer containing the unchanged surface and inverted hull. */
export function postTimberGeometry(): THREE.BufferGeometry {
  return timberGeometry(postGeometry(), postGeometry(true));
}

/** One rail buffer containing the unchanged box surface and mitred hull. */
export function railTimberGeometry(): THREE.BufferGeometry {
  return timberGeometry(new THREE.BoxGeometry(1, 1, 1), railHullGeometry());
}
