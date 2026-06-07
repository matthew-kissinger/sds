#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * R&D spike: coastline boundary primitive (Survival / Wolf Coast campaign).
 *
 * Throwaway benchmark - NOT shipped, NOT imported by the game. It exists to
 * pick the representation for a non-circular ("coastline") sim boundary BEFORE
 * touching the fence-frozen deterministic core (shared/BoundaryCollision.js,
 * shared/scenes/types.js). Mirrors the collision-stutter-probe pattern.
 *
 * Three candidates, all producing the SAME steering force shape as the engine's
 * island path (shared/BoundaryCollision.js calculateIslandAvoidance): a
 * smoothstep ramp over a falloff band, steered inward, Reynolds-style
 * (normalize -> *maxSpeed*forceMultiplier -> subtract velocity -> limit).
 * The only thing that differs is HOW we get (signed distance to shore, inward
 * unit direction):
 *
 *   1. circle   - analytic radial distance (the current `island` kind). Control.
 *   2. sdf-grid - precomputed signed-distance-field on a ~10m grid; per tick one
 *                 bilinear distance sample + a 4-tap gradient. O(1) per entity.
 *   3. poly     - per-tick point-in-polygon (sign) + min-segment-distance
 *                 (magnitude) + nearest-point inward dir, guarded by a coarse
 *                 "deep interior" reject grid (broadphase).
 *
 * Measures: per-tick cost at 200/1000/5000 entities for interior vs shoreline
 * distributions; SDF build cost + memory; determinism (build twice + sim twice
 * -> identical); falloff parity against the analytic circle on a 64-gon.
 *
 * Run:  node tools/coastline-boundary-spike.mjs
 * Out:  cycle64-validation/coastline/spike-report.json
 *
 * Pure JS, only + - * / Math.sqrt in the hot paths (the V8/JSC/SpiderMonkey
 * spec-pinned ops per .claude/rules/shared-sim.md). No trig, no Math.random in
 * sim paths (mulberry32 seeds everything).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// ----------------------------------------------------------------------------
// Determinism primitives (copied; shared/ can't be imported into a tool freely
// and we want the spike self-contained).
// ----------------------------------------------------------------------------

/** mulberry32 - identical to shared/Random.js + scripts/bake-heightmap.mjs. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a Float64 view, quantised to 1e-4 so cross-run float noise in
 *  the *reporting* layer doesn't mask a real determinism break. The sim itself
 *  is exact; this just yields a stable comparable digest. */
function hashPositions(px, pz, n) {
  let h = 0x811c9dc5 >>> 0;
  const q = (v) => Math.round(v * 1e4) | 0;
  for (let i = 0; i < n; i++) {
    let v = q(px[i]) >>> 0;
    h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193) >>> 0;
    v = q(pz[i]) >>> 0;
    h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ----------------------------------------------------------------------------
// Geometry (copied from js/gamestate/polygonSpawn.js - even-odd ray cast +
// segment distance; sqrt only).
// ----------------------------------------------------------------------------

function isPointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, zi = pts[i].z;
    const xj = pts[j].x, zj = pts[j].z;
    if (((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Min distance to polygon edges AND the nearest point on the boundary
 *  (so the caller can build an inward direction without finite differences). */
function nearestBoundary(px, pz, pts) {
  let best = Infinity;
  let cx = px, cz = pz;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    let t = 0;
    if (lenSq > 0) {
      t = ((px - a.x) * dx + (pz - a.z) * dz) / lenSq;
      if (t < 0) t = 0; else if (t > 1) t = 1;
    }
    const qx = a.x + t * dx;
    const qz = a.z + t * dz;
    const ex = px - qx;
    const ez = pz - qz;
    const d = Math.sqrt(ex * ex + ez * ez);
    if (d < best) { best = d; cx = qx; cz = qz; }
  }
  return { dist: best, cx, cz };
}

/** Shoelace area of a closed polygon (m^2). */
function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}

function bbox(pts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** Per-axis scale the polygon so its bbox matches targetW x targetD, about the
 *  bbox centre. Used to study the spike at the spec's real Wolf Coast scale
 *  (~2550 x 2100 m) without re-authoring the silhouette by hand. */
function fitToBox(pts, targetW, targetD) {
  const bb = bbox(pts);
  const cx = (bb.minX + bb.maxX) / 2;
  const cz = (bb.minZ + bb.maxZ) / 2;
  const sx = targetW / (bb.maxX - bb.minX);
  const sz = targetD / (bb.maxZ - bb.minZ);
  return pts.map((p) => ({ x: cx + (p.x - cx) * sx, z: cz + (p.z - cz) * sz }));
}

/** Subdivide edges longer than maxEdge so the point count resembles a real
 *  banking coastline (spec says 40-80 pts). Build cost scales with edge count,
 *  so this makes the build-cost measurement honest. */
function densify(pts, maxEdge) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push({ x: a.x, z: a.z });
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const n = Math.floor(len / maxEdge);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      out.push({ x: a.x + dx * t, z: a.z + dz * t });
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// The boot polygon (Wolf Coast silhouette, coarse ~44 pts). Concave at the
// instep. +X east (toe), +Z north (mountain). Tuned to roughly fill the spec's
// box X[-1200,1350] Z[-950,1150] and approach 3.3 km^2 (measured + reported).
// ----------------------------------------------------------------------------

const BOOT = [
  // leg, west side, going south
  { x: -380, z: 1100 }, { x: -430, z: 920 }, { x: -410, z: 720 },
  { x: -440, z: 520 }, { x: -415, z: 320 }, { x: -445, z: 120 },
  { x: -420, z: -100 },
  // heel (south-west of the foot)
  { x: -520, z: -300 }, { x: -600, z: -480 }, { x: -560, z: -650 },
  { x: -400, z: -760 },
  // foot bottom, going east
  { x: -120, z: -780 }, { x: 200, z: -790 }, { x: 520, z: -785 },
  { x: 840, z: -775 }, { x: 1080, z: -740 }, { x: 1250, z: -660 },
  // toe (far east)
  { x: 1360, z: -520 }, { x: 1380, z: -380 }, { x: 1300, z: -260 },
  // foot top (instep side, concave), going west; kept high near the toe so the
  // house+pen at (1150,-350) sits inside the foot, not above it.
  { x: 1120, z: -250 }, { x: 900, z: -300 }, { x: 640, z: -320 },
  { x: 380, z: -330 }, { x: 160, z: -330 },
  // instep notch rising toward the front of the leg
  { x: 80, z: -160 }, { x: 60, z: 60 }, { x: 85, z: 260 },
  // leg, east side, going north
  { x: 75, z: 460 }, { x: 100, z: 660 }, { x: 80, z: 860 },
  { x: 70, z: 1060 },
  // top of leg, back to start
  { x: -130, z: 1110 }, { x: -380, z: 1100 },
];

// Landmarks from the spec, to confirm they fall inside the silhouette.
const LANDMARKS = {
  mountainSummit: { x: -150, z: 900 },
  housePen: { x: 1150, z: -350 },
  forestBand: { x: -150, z: 550 },
  tallGrassBand: { x: -100, z: 250 },
  footLowland: { x: 400, z: -550 },
};

// ----------------------------------------------------------------------------
// Steering: the exact island force shape (calculateIslandAvoidance), factored so
// every candidate shares it and only the geometry (signedDist, inward dir)
// differs.
// ----------------------------------------------------------------------------

const CFG = { maxSpeed: 1.5, maxForce: 0.05, forceMultiplier: 1.5 };
const HARD_MARGIN = 0.2;

// Reused force-output scratch so the per-tick hot loop never allocates (the
// engine likewise reuses Vector2D-shaped output). Callers must read [0],[1]
// before the next force() call.
const _F = new Float64Array(2);
function zeroF() { _F[0] = 0; _F[1] = 0; return _F; }

function smoothstep01(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Given signed distance to shore (positive = inside) and a unit inward dir,
 *  return the steering force [fx,fz]. Byte-for-byte the island formula:
 *  band = [0, falloff]; force smoothstep; inward * maxSpeed*force*1.2; then
 *  normalize, *maxSpeed*forceMultiplier, subtract velocity, limit. */
function islandForce(sd, inX, inZ, vx, vz, falloff) {
  if (sd >= falloff) return zeroF(); // deep interior: zero force (matches d<=safeRadius)
  const t = (falloff - sd) / falloff; // sd=falloff ->0, sd=0 ->1, sd<0 -> >1
  const force = smoothstep01(t);
  let sx = inX * CFG.maxSpeed * force * 1.2;
  let sz = inZ * CFG.maxSpeed * force * 1.2;
  const mag = Math.sqrt(sx * sx + sz * sz);
  if (mag === 0) return zeroF();
  const inv = 1 / mag;
  sx = sx * inv * (CFG.maxSpeed * CFG.forceMultiplier) - vx;
  sz = sz * inv * (CFG.maxSpeed * CFG.forceMultiplier) - vz;
  const lim = CFG.maxForce * 2.5;
  const sm = Math.sqrt(sx * sx + sz * sz);
  if (sm > lim) { const k = lim / sm; sx *= k; sz *= k; }
  _F[0] = sx; _F[1] = sz; return _F;
}

// --- Candidate 1: circle (analytic, the current island kind) ----------------
function makeCircle(center, radius, falloff) {
  return {
    name: 'circle',
    falloff,
    force(px, pz, vx, vz) {
      const dx = px - center.x;
      const dz = pz - center.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const sd = radius - dist; // signed distance to shore, + inside
      if (sd >= falloff) return zeroF();
      // inward unit dir = toward centre
      const inv = dist > 1e-6 ? 1 / dist : 0;
      return islandForce(sd, -dx * inv, -dz * inv, vx, vz, falloff);
    },
    clamp(out, px, pz) {
      const dx = px - center.x;
      const dz = pz - center.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const maxR = radius - HARD_MARGIN;
      if (dist > maxR && dist > 1e-6) {
        const k = maxR / dist;
        out[0] = center.x + dx * k;
        out[1] = center.z + dz * k;
      } else { out[0] = px; out[1] = pz; }
    },
  };
}

// --- Candidate 2: SDF grid --------------------------------------------------
function buildSDF(pts, cellSize, falloff) {
  const bb = bbox(pts);
  const pad = cellSize * 2 + falloff;
  const minX = bb.minX - pad;
  const minZ = bb.minZ - pad;
  const width = Math.ceil((bb.maxX - bb.minX + pad * 2) / cellSize) + 1;
  const height = Math.ceil((bb.maxZ - bb.minZ + pad * 2) / cellSize) + 1;
  const data = new Float32Array(width * height);
  for (let gz = 0; gz < height; gz++) {
    const wz = minZ + gz * cellSize;
    for (let gx = 0; gx < width; gx++) {
      const wx = minX + gx * cellSize;
      const { dist } = nearestBoundary(wx, wz, pts);
      const sign = isPointInPolygon(wx, wz, pts) ? 1 : -1;
      data[gz * width + gx] = sign * dist;
    }
  }
  return { data, width, height, minX, minZ, cellSize, falloff, bytes: data.byteLength };
}

function makeSDF(sdf) {
  const { data, width, height, minX, minZ, cellSize, falloff } = sdf;
  const sample = (x, z) => {
    let fx = (x - minX) / cellSize;
    let fz = (z - minZ) / cellSize;
    if (fx < 0) fx = 0; else if (fx > width - 1) fx = width - 1;
    if (fz < 0) fz = 0; else if (fz > height - 1) fz = height - 1;
    const x0 = fx | 0, z0 = fz | 0;
    const x1 = x0 + 1 < width ? x0 + 1 : x0;
    const z1 = z0 + 1 < height ? z0 + 1 : z0;
    const tx = fx - x0, tz = fz - z0;
    const a = data[z0 * width + x0];
    const b = data[z0 * width + x1];
    const c = data[z1 * width + x0];
    const d = data[z1 * width + x1];
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return top + (bot - top) * tz;
  };
  const h = cellSize;
  return {
    name: 'sdf-grid',
    falloff,
    sample,
    force(px, pz, vx, vz) {
      const sd = sample(px, pz);
      if (sd >= falloff) return zeroF();
      // gradient (points toward increasing sd = inward)
      const gx = sample(px + h, pz) - sample(px - h, pz);
      const gz = sample(px, pz + h) - sample(px, pz - h);
      const gm = Math.sqrt(gx * gx + gz * gz);
      if (gm < 1e-9) return zeroF();
      const inv = 1 / gm;
      return islandForce(sd, gx * inv, gz * inv, vx, vz, falloff);
    },
    clamp(out, px, pz) {
      const sd = sample(px, pz);
      if (sd < HARD_MARGIN) {
        const gx = sample(px + h, pz) - sample(px - h, pz);
        const gz = sample(px, pz + h) - sample(px, pz - h);
        const gm = Math.sqrt(gx * gx + gz * gz);
        if (gm > 1e-9) {
          const inv = 1 / gm;
          const push = HARD_MARGIN - sd;
          out[0] = px + gx * inv * push;
          out[1] = pz + gz * inv * push;
          return;
        }
      }
      out[0] = px; out[1] = pz;
    },
  };
}

// --- Candidate 3: direct polygon + deep-interior broadphase ------------------
function buildDeepGrid(pts, coarse, falloff) {
  const bb = bbox(pts);
  const pad = coarse;
  const minX = bb.minX - pad;
  const minZ = bb.minZ - pad;
  const width = Math.ceil((bb.maxX - bb.minX + pad * 2) / coarse) + 1;
  const height = Math.ceil((bb.maxZ - bb.minZ + pad * 2) / coarse) + 1;
  const deep = new Uint8Array(width * height);
  // a cell is "deep" if its centre is inside AND further than falloff + the
  // cell half-diagonal from any edge (so nothing within the falloff band is
  // ever wrongly skipped).
  const safety = falloff + coarse * 0.7072 + coarse * 0.5;
  for (let gz = 0; gz < height; gz++) {
    const wz = minZ + (gz + 0.5) * coarse;
    for (let gx = 0; gx < width; gx++) {
      const wx = minX + (gx + 0.5) * coarse;
      if (isPointInPolygon(wx, wz, pts)) {
        const { dist } = nearestBoundary(wx, wz, pts);
        if (dist > safety) deep[gz * width + gx] = 1;
      }
    }
  }
  return { deep, width, height, minX, minZ, coarse, bytes: deep.byteLength };
}

function makePoly(pts, deepGrid, falloff) {
  const { deep, width, height, minX, minZ, coarse } = deepGrid;
  const isDeep = (x, z) => {
    const gx = ((x - minX) / coarse) | 0;
    const gz = ((z - minZ) / coarse) | 0;
    if (gx < 0 || gz < 0 || gx >= width || gz >= height) return false;
    return deep[gz * width + gx] === 1;
  };
  return {
    name: 'poly',
    falloff,
    force(px, pz, vx, vz) {
      if (isDeep(px, pz)) return zeroF(); // broadphase reject
      const { dist, cx, cz } = nearestBoundary(px, pz, pts);
      const inside = isPointInPolygon(px, pz, pts);
      const sd = inside ? dist : -dist;
      if (sd >= falloff) return zeroF();
      // inward dir
      let ix, iz;
      if (inside) { ix = px - cx; iz = pz - cz; }
      else { ix = cx - px; iz = cz - pz; }
      const m = Math.sqrt(ix * ix + iz * iz);
      if (m < 1e-9) return zeroF();
      const inv = 1 / m;
      return islandForce(sd, ix * inv, iz * inv, vx, vz, falloff);
    },
    clamp(out, px, pz) {
      const { dist, cx, cz } = nearestBoundary(px, pz, pts);
      const inside = isPointInPolygon(px, pz, pts);
      const sd = inside ? dist : -dist;
      if (sd < HARD_MARGIN) {
        let ix, iz;
        if (inside) { ix = px - cx; iz = pz - cz; }
        else { ix = cx - px; iz = cz - pz; }
        const m = Math.sqrt(ix * ix + iz * iz);
        if (m > 1e-9) {
          const inv = 1 / m;
          const push = HARD_MARGIN - sd;
          out[0] = px + ix * inv * push;
          out[1] = pz + iz * inv * push;
          return;
        }
      }
      out[0] = px; out[1] = pz;
    },
  };
}

// ----------------------------------------------------------------------------
// Entity sampling
// ----------------------------------------------------------------------------

/** Uniformly sample n points inside the polygon (rejection), seeded. */
function sampleInterior(pts, n, seed) {
  const rnd = mulberry32(seed);
  const bb = bbox(pts);
  const px = new Float64Array(n);
  const pz = new Float64Array(n);
  let i = 0, guard = 0;
  while (i < n && guard < n * 200) {
    const x = bb.minX + rnd() * (bb.maxX - bb.minX);
    const z = bb.minZ + rnd() * (bb.maxZ - bb.minZ);
    guard++;
    if (isPointInPolygon(x, z, pts)) { px[i] = x; pz[i] = z; i++; }
  }
  return { px, pz, n: i };
}

/** Sample n points within `band` metres inside the shore (the worst case for
 *  the poly candidate: everything pays the full polygon test). Seeded. */
function sampleShoreline(pts, n, band, seed) {
  const rnd = mulberry32(seed);
  const bb = bbox(pts);
  const px = new Float64Array(n);
  const pz = new Float64Array(n);
  let i = 0, guard = 0;
  while (i < n && guard < n * 600) {
    const x = bb.minX + rnd() * (bb.maxX - bb.minX);
    const z = bb.minZ + rnd() * (bb.maxZ - bb.minZ);
    guard++;
    if (!isPointInPolygon(x, z, pts)) continue;
    const { dist } = nearestBoundary(x, z, pts);
    if (dist <= band) { px[i] = x; pz[i] = z; i++; }
  }
  return { px, pz, n: i };
}

// ----------------------------------------------------------------------------
// Benchmark + sim harness
// ----------------------------------------------------------------------------

/** Time the pure per-tick force computation over a fixed entity set. */
function benchForceCost(candidate, set, ticks) {
  const { px, pz, n } = set;
  const vx = new Float64Array(n);
  const vz = new Float64Array(n);
  // warmup (JIT)
  for (let w = 0; w < 20; w++) {
    for (let i = 0; i < n; i++) candidate.force(px[i], pz[i], vx[i], vz[i]);
  }
  const t0 = performance.now();
  let sink = 0;
  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < n; i++) {
      const f = candidate.force(px[i], pz[i], vx[i], vz[i]);
      sink += f[0];
    }
  }
  const t1 = performance.now();
  if (!Number.isFinite(sink)) throw new Error('NaN in force bench');
  return (t1 - t0) / ticks; // ms per tick
}

/** Integrate a seeded flock for `ticks` under one candidate's boundary force +
 *  hard clamp. Returns a position digest + escape stats for determinism +
 *  parity checks. Velocities start pointed outward so sheep press the shore. */
function runSim(candidate, set, ticks, seed) {
  const n = set.n;
  const px = Float64Array.from(set.px.subarray(0, n));
  const pz = Float64Array.from(set.pz.subarray(0, n));
  const vx = new Float64Array(n);
  const vz = new Float64Array(n);
  const rnd = mulberry32(seed);
  const cx = BOOT.reduce((s, p) => s + p.x, 0) / BOOT.length;
  const cz = BOOT.reduce((s, p) => s + p.z, 0) / BOOT.length;
  for (let i = 0; i < n; i++) {
    // bias velocity outward from the centroid so they drift into the shore
    const dx = px[i] - cx, dz = pz[i] - cz;
    const m = Math.sqrt(dx * dx + dz * dz) || 1;
    const speed = 0.6 + rnd() * 0.6;
    vx[i] = (dx / m) * speed;
    vz[i] = (dz / m) * speed;
  }
  const out = [0, 0];
  let escaped = 0;
  let maxOutside = 0;
  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < n; i++) {
      const f = candidate.force(px[i], pz[i], vx[i], vz[i]);
      vx[i] += f[0];
      vz[i] += f[1];
      // clamp speed to maxSpeed
      const sp = Math.sqrt(vx[i] * vx[i] + vz[i] * vz[i]);
      if (sp > CFG.maxSpeed) { const k = CFG.maxSpeed / sp; vx[i] *= k; vz[i] *= k; }
      px[i] += vx[i];
      pz[i] += vz[i];
      candidate.clamp(out, px[i], pz[i]);
      px[i] = out[0];
      pz[i] = out[1];
    }
  }
  // final containment audit (against the true polygon, the ground truth)
  for (let i = 0; i < n; i++) {
    if (!isPointInPolygon(px[i], pz[i], BOOT)) {
      escaped++;
      const { dist } = nearestBoundary(px[i], pz[i], BOOT);
      if (dist > maxOutside) maxOutside = dist;
    }
  }
  return { digest: hashPositions(px, pz, n), escaped, maxOutside, n };
}

// ----------------------------------------------------------------------------
// Falloff parity: SDF/poly coastline vs analytic circle, on a 64-gon circle.
// ----------------------------------------------------------------------------

function circlePolygon(center, radius, segs) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push({ x: center.x + Math.cos(a) * radius, z: center.z + Math.sin(a) * radius });
  }
  return pts;
}

function parityVsCircle(falloff, cellSize) {
  const center = { x: 0, z: 0 };
  const radius = 300;
  const segs = 64;
  const poly = circlePolygon(center, radius, segs);
  const analytic = makeCircle(center, radius, falloff);
  const sdf = makeSDF(buildSDF(poly, cellSize, falloff));
  const rnd = mulberry32(99);
  // Two honest measures:
  //  - onOffAgree: do both candidates agree on whether ANY force applies?
  //    (the engine force magnitude is binary; a slight shore-definition shift
  //     on a 64-gon vs the ideal circle flips a thin threshold shell.)
  //  - dirErrDeg: when BOTH apply force, how far apart do the (bounded) force
  //    vectors point? This is the real fidelity number.
  let both = 0, onOffAgree = 0, sumDirErr = 0, maxDirErr = 0, total = 0;
  const RAD2DEG = 180 / Math.PI;
  for (let k = 0; k < 6000; k++) {
    const ang = rnd() * Math.PI * 2;
    // sample across the whole band plus a margin either side of the shore so we
    // exercise interior, band, and just-outside.
    const r = radius - rnd() * (falloff + 4) + 2;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    const vx = Math.cos(ang) * 0.8;
    const vz = Math.sin(ang) * 0.8;
    const a = analytic.force(x, z, vx, vz);
    const am = a[0] * a[0] + a[1] * a[1];
    const ax = a[0], az = a[1];
    const b = sdf.force(x, z, vx, vz);
    const bm = b[0] * b[0] + b[1] * b[1];
    const aOn = am > 1e-12, bOn = bm > 1e-12;
    total++;
    if (aOn === bOn) onOffAgree++;
    if (aOn && bOn) {
      both++;
      const dot = (ax * b[0] + az * b[1]) / (Math.sqrt(am) * Math.sqrt(bm));
      const ang2 = Math.acos(Math.max(-1, Math.min(1, dot))) * RAD2DEG;
      sumDirErr += ang2;
      if (ang2 > maxDirErr) maxDirErr = ang2;
    }
  }
  return {
    radius, falloff, cellSize, segs, total, bothActive: both,
    onOffAgreePct: +((onOffAgree / total) * 100).toFixed(2),
    meanDirErrDeg: +(sumDirErr / Math.max(1, both)).toFixed(3),
    maxDirErrDeg: +maxDirErr.toFixed(3),
  };
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  const FALLOFF = 30;       // beach band width (m)
  const SDF_CELL = 10;      // SDF grid resolution (m)
  const DEEP_CELL = 40;     // broadphase coarse grid (m)
  const SHORE_BAND = 30;    // shoreline distribution band (m)
  const COUNTS = [200, 1000, 5000];
  const COST_TICKS = 200;
  const SIM_TICKS = 600;

  const report = { generatedBy: 'tools/coastline-boundary-spike.mjs', params: { FALLOFF, SDF_CELL, DEEP_CELL, SHORE_BAND, COST_TICKS, SIM_TICKS } };

  // --- scene geometry facts ---
  const area = polygonArea(BOOT);
  const bb = bbox(BOOT);
  const landmarks = {};
  for (const [k, p] of Object.entries(LANDMARKS)) landmarks[k] = isPointInPolygon(p.x, p.z, BOOT);
  report.geometry = {
    vertices: BOOT.length,
    areaM2: Math.round(area),
    areaKm2: +(area / 1e6).toFixed(3),
    targetKm2: 3.3,
    bbox: { minX: bb.minX, maxX: bb.maxX, minZ: bb.minZ, maxZ: bb.maxZ, widthM: bb.maxX - bb.minX, depthM: bb.maxZ - bb.minZ },
    landmarksInside: landmarks,
  };

  // --- build candidates ---
  const center = { x: (bb.minX + bb.maxX) / 2, z: (bb.minZ + bb.maxZ) / 2 };
  const circleRadius = Math.min(bb.maxX - bb.minX, bb.maxZ - bb.minZ) / 2; // a comparable disc
  const circle = makeCircle(center, circleRadius, FALLOFF);

  let tb = performance.now();
  const sdfData = buildSDF(BOOT, SDF_CELL, FALLOFF);
  const sdfBuildMs = performance.now() - tb;
  const sdf = makeSDF(sdfData);

  tb = performance.now();
  const deepData = buildDeepGrid(BOOT, DEEP_CELL, FALLOFF);
  const deepBuildMs = performance.now() - tb;
  const poly = makePoly(BOOT, deepData, FALLOFF);

  // determinism of the SDF build: build twice -> byte-identical
  const sdf2 = buildSDF(BOOT, SDF_CELL, FALLOFF);
  let sdfIdentical = sdfData.data.length === sdf2.data.length;
  if (sdfIdentical) {
    for (let i = 0; i < sdfData.data.length; i++) {
      if (sdfData.data[i] !== sdf2.data[i]) { sdfIdentical = false; break; }
    }
  }

  report.build = {
    sdf: { cellSize: SDF_CELL, width: sdfData.width, height: sdfData.height, cells: sdfData.width * sdfData.height, bytes: sdfData.bytes, kib: +(sdfData.bytes / 1024).toFixed(1), buildMs: +sdfBuildMs.toFixed(2), deterministicByteIdentical: sdfIdentical },
    deepGrid: { cellSize: DEEP_CELL, width: deepData.width, height: deepData.height, cells: deepData.width * deepData.height, bytes: deepData.bytes, buildMs: +deepBuildMs.toFixed(2) },
    maxDenseGridCellsCeiling: 262144,
  };

  // --- cost benchmark: interior + shoreline distributions ---
  const candidates = [circle, sdf, poly];
  report.cost = { note: 'ms per tick, lower is better. circle = analytic control.', interior: {}, shoreline: {} };
  for (const count of COUNTS) {
    const interior = sampleInterior(BOOT, count, 1000 + count);
    const shoreline = sampleShoreline(BOOT, count, SHORE_BAND, 7000 + count);
    report.cost.interior[count] = { actualN: interior.n };
    report.cost.shoreline[count] = { actualN: shoreline.n };
    for (const c of candidates) {
      report.cost.interior[count][c.name] = +benchForceCost(c, interior, COST_TICKS).toFixed(4);
      report.cost.shoreline[count][c.name] = +benchForceCost(c, shoreline, COST_TICKS).toFixed(4);
    }
  }

  // --- determinism: sim twice, same seed -> identical digest + zero escapes ---
  report.determinism = {};
  for (const c of candidates) {
    if (c.name === 'circle') continue; // circle uses a disc, different geometry; skip
    const set = sampleInterior(BOOT, 1000, 4242);
    const r1 = runSim(c, set, SIM_TICKS, 13);
    const r2 = runSim(c, set, SIM_TICKS, 13);
    report.determinism[c.name] = {
      digestRun1: r1.digest,
      digestRun2: r2.digest,
      identical: r1.digest === r2.digest,
      escaped: r1.escaped,
      maxOutsideM: +r1.maxOutside.toFixed(3),
      n: r1.n,
    };
  }

  // --- build-cost + resolution sweep at the REAL Wolf Coast scale ---
  // Fit the boot to the spec bbox (2550 x 2100 m) and densify to a realistic
  // 40-80 pt coastline, then sweep grid resolution. This is the number that
  // decides "build at load" vs "prebake": the SDF build runs once at scene load
  // on the client AND once at room creation on the Worker (which can't fetch a
  // baked binary), so it must be cheap on the Worker's small CPU budget.
  const realBoot = densify(fitToBox(BOOT, 2550, 2100), 140);
  const realArea = polygonArea(realBoot);
  report.scaleSweep = {
    note: 'SDF build at spec scale (bbox 2550x2100m). buildMs is the one-time cost paid on client scene-load AND Worker room-creation.',
    realBootVertices: realBoot.length,
    realAreaKm2: +(realArea / 1e6).toFixed(3),
    resolutions: {},
  };
  for (const cell of [8, 10, 12, 16, 20]) {
    const t = performance.now();
    const s = buildSDF(realBoot, cell, FALLOFF);
    const ms = performance.now() - t;
    // confirm per-tick cost is resolution-independent (O(1) bilinear sample)
    const sCand = makeSDF(s);
    const shore = sampleShoreline(realBoot, 5000, SHORE_BAND, 31000 + cell);
    const perTick = benchForceCost(sCand, shore, 100);
    report.scaleSweep.resolutions[`cell${cell}m`] = {
      cells: s.width * s.height,
      kib: +(s.bytes / 1024).toFixed(1),
      buildMs: +ms.toFixed(2),
      perTickMs5kShore: +perTick.toFixed(4),
    };
  }

  // --- parity vs analytic circle on a 64-gon ---
  report.parity = {
    note: 'SDF coastline force vs analytic circle force, sampled in the falloff band on a 64-gon of radius 300. Error as % of the bounded force magnitude.',
    cell10: parityVsCircle(FALLOFF, 10),
    cell5: parityVsCircle(FALLOFF, 5),
  };

  // --- verdict gate ---
  const cost5kInterior = { circle: report.cost.interior[5000].circle, sdf: report.cost.interior[5000]['sdf-grid'], poly: report.cost.interior[5000].poly };
  const cost5kShore = { circle: report.cost.shoreline[5000].circle, sdf: report.cost.shoreline[5000]['sdf-grid'], poly: report.cost.shoreline[5000].poly };
  const circleWorst = Math.max(cost5kInterior.circle, cost5kShore.circle);
  const sdfWorst = Math.max(cost5kInterior.sdf, cost5kShore.sdf);
  const polyWorst = Math.max(cost5kInterior.poly, cost5kShore.poly);
  // Budget framing: boundary avoidance should be a small fraction of the per-
  // tick sim. The collision pass (the heaviest shared step) tuned to ~1.7ms at
  // 5000 sheep, so a < 1.0ms boundary pass at 5000 is comfortably in budget;
  // the more telling number is the multiple over the analytic circle control.
  const ABS_BUDGET_MS = 1.0;
  report.verdict = {
    absBudgetMsAt5k: ABS_BUDGET_MS,
    circleWorstCaseMs: +circleWorst.toFixed(4),
    sdfWorstCaseMs: +sdfWorst.toFixed(4),
    polyWorstCaseMs: +polyWorst.toFixed(4),
    sdfOverCircleX: +(sdfWorst / circleWorst).toFixed(2),
    polyOverCircleX: +(polyWorst / circleWorst).toFixed(2),
    sdfWithinBudget: sdfWorst < ABS_BUDGET_MS,
    polyWithinBudget: polyWorst < ABS_BUDGET_MS,
    sdfDistributionStable: +(cost5kShore.sdf / cost5kInterior.sdf).toFixed(2),
    polyDistributionStable: +(cost5kShore.poly / cost5kInterior.poly).toFixed(2),
    sdfDeterministic: report.build.sdf.deterministicByteIdentical && report.determinism['sdf-grid'].identical,
    sdfNoEscapes: report.determinism['sdf-grid'].escaped === 0,
    polyNoEscapes: report.determinism['poly'].escaped === 0,
    parityMeanDirErrDeg: report.parity.cell10.meanDirErrDeg,
    parityOnOffAgreePct: report.parity.cell10.onOffAgreePct,
    recommendation: (sdfWorst < ABS_BUDGET_MS && report.build.sdf.deterministicByteIdentical && report.determinism['sdf-grid'].identical && report.determinism['sdf-grid'].escaped === 0)
      ? 'sdf-grid' : 'needs-review',
  };

  const outPath = resolve(process.cwd(), 'cycle64-validation/coastline/spike-report.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(report, null, 2) + '\n');

  // --- console summary ---
  const g = report.geometry;
  console.log(`\nWolf Coast boot polygon: ${g.vertices} verts, ${g.areaKm2} km^2 (target ${g.targetKm2}), bbox ${g.bbox.widthM}x${g.bbox.depthM} m`);
  console.log(`Landmarks inside: ${Object.entries(g.landmarksInside).map(([k, v]) => `${k}=${v ? 'Y' : 'N'}`).join(' ')}`);
  console.log(`\nSDF build: ${report.build.sdf.cells} cells, ${report.build.sdf.kib} KiB, ${report.build.sdf.buildMs} ms, byte-identical=${report.build.sdf.deterministicByteIdentical}`);
  console.log(`\nBuild cost at REAL scale (bbox 2550x2100m, ${report.scaleSweep.realBootVertices}-pt coast, ${report.scaleSweep.realAreaKm2} km^2) - one-time, client load + Worker room-create:`);
  for (const [k, v] of Object.entries(report.scaleSweep.resolutions)) {
    console.log(`  ${k.padEnd(8)}: ${String(v.cells).padStart(7)} cells  ${String(v.kib).padStart(7)} KiB  build ${String(v.buildMs).padStart(7)} ms  perTick5k ${v.perTickMs5kShore} ms`);
  }
  console.log(`\nPer-tick cost (ms), 5000 entities:`);
  console.log(`  interior : circle=${cost5kInterior.circle}  sdf=${cost5kInterior.sdf}  poly=${cost5kInterior.poly}`);
  console.log(`  shoreline: circle=${cost5kShore.circle}  sdf=${cost5kShore.sdf}  poly=${cost5kShore.poly}`);
  console.log(`\nDeterminism: sdf identical=${report.determinism['sdf-grid'].identical} escapes=${report.determinism['sdf-grid'].escaped} | poly escapes=${report.determinism['poly'].escaped}`);
  console.log(`Parity vs analytic circle (cell=10m): onOffAgree=${report.parity.cell10.onOffAgreePct}% meanDir=${report.parity.cell10.meanDirErrDeg}deg maxDir=${report.parity.cell10.maxDirErrDeg}deg`);
  console.log(`\nVERDICT (boundary avoidance, 5000 entities, budget ${ABS_BUDGET_MS}ms):`);
  console.log(`  circle(control)=${report.verdict.circleWorstCaseMs}ms  sdf=${report.verdict.sdfWorstCaseMs}ms (${report.verdict.sdfOverCircleX}x)  poly=${report.verdict.polyWorstCaseMs}ms (${report.verdict.polyOverCircleX}x)`);
  console.log(`  sdf: withinBudget=${report.verdict.sdfWithinBudget} deterministic=${report.verdict.sdfDeterministic} noEscapes=${report.verdict.sdfNoEscapes} distStable=${report.verdict.sdfDistributionStable}x`);
  console.log(`  poly: withinBudget=${report.verdict.polyWithinBudget} noEscapes=${report.verdict.polyNoEscapes} distStable=${report.verdict.polyDistributionStable}x`);
  console.log(`  >>> RECOMMENDATION: ${report.verdict.recommendation}`);
  console.log(`\nReport: ${outPath}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
