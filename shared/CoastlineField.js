// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Coastline boundary primitive — Cycle 64 (Survival / Wolf Coast campaign).
 *
 * A `coastline` boundary expresses an arbitrary concave shoreline (a boot, a
 * peninsula, a bay) that the radial `island` kind cannot. The representation is
 * a precomputed signed-distance field (SDF) built once from a coarse polygon:
 * per tick the sim does one bilinear distance sample plus a 4-tap gradient, so
 * the per-entity cost is O(1) regardless of vertex count or concavity.
 *
 * Decided by `tools/coastline-boundary-spike.mjs` (results in
 * `cycle64-validation/coastline/spike-report.json`): the SDF won on cost
 * (~0.58 ms/tick at 5000 sheep, 3.5x an analytic circle, under a ~1 ms budget),
 * determinism (byte-identical builds), and parity (0.28 deg mean force-direction
 * error vs a true circle, zero escapes over a 600-tick outward storm).
 *
 * Determinism contract (.claude/rules/shared-sim.md):
 *   - Pure: only `+ - * / Math.sqrt` + an even-odd ray cast (all IEEE-754
 *     spec-pinned across V8 / JSC / SpiderMonkey). No trig, no transcendentals,
 *     no Math.random, no DOM / Three.js / `js/` imports.
 *   - Float32 storage truncates deterministically, so independent builds from
 *     the same points + cellSize are byte-identical. The Worker (in the DO) and
 *     every client therefore derive the SAME field from the SAME inline polygon.
 *   - The polygon is the prebaked artifact, inlined in the SceneDef; the field
 *     is built from it at load. We never prebake the SDF binary (the Worker
 *     cannot fetch binaries on the hot path).
 *
 * Force/clamp shape mirrors `shared/BoundaryCollision.js calculateIslandAvoidance`
 * and `applyHardBoundaryConstraintsIsland` byte-for-byte; only the geometry
 * (signed distance + inward direction) is sourced from the SDF instead of a
 * radius. That keeps coastline scenes feeling like the existing island scenes.
 *
 * @typedef {import('./scenes/types.js').CoastlineBoundary} CoastlineBoundary
 */

import { Vector2D } from './Vector2D.js';

/** Default SDF grid resolution in metres when a boundary omits `cellSize`.
 *  12 m gives ~2.5 cells across a 30 m falloff band (Cycle 64 Q1 lean). The
 *  SAME value MUST be used on client and Worker, so scenes fix it on the
 *  boundary def; this is only the fallback. */
export const DEFAULT_COASTLINE_CELL_SIZE = 12;

/** Hard-clamp safety margin (m), identical to the island radial clamp default. */
const HARD_MARGIN = 0.2;

/**
 * Even-odd ray-cast point-in-polygon. Matches js/gamestate/polygonSpawn.js and
 * the spike. Uses only comparisons + one division per edge.
 * @param {number} x
 * @param {number} z
 * @param {Array<{x:number,z:number}>} pts
 * @returns {boolean}
 */
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

/**
 * Minimum distance from (px, pz) to the closed polygon's edges. sqrt only.
 * @param {number} px
 * @param {number} pz
 * @param {Array<{x:number,z:number}>} pts
 * @returns {number}
 */
function distanceToPolygon(px, pz, pts) {
    let best = Infinity;
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
        if (d < best) best = d;
    }
    return best;
}

/**
 * Axis-aligned bounding box of a polygon's points.
 * @param {Array<{x:number,z:number}>} pts
 * @returns {{minX:number,maxX:number,minZ:number,maxZ:number}}
 */
export function pointsBounds(pts) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, maxX, minZ, maxZ };
}

/**
 * Build a signed-distance field from a coastline polygon. Positive inside,
 * negative outside. Stored Float32 so independent builds are byte-identical.
 *
 * @param {Array<{x:number,z:number}>} points  Coastline vertices (world XZ).
 * @param {Object} [opts]
 * @param {number} [opts.cellSize=DEFAULT_COASTLINE_CELL_SIZE]  Grid resolution (m).
 * @param {number} [opts.falloff=30]  Beach band width (m); pads the grid so the
 *   whole falloff band plus a 2-cell skirt is covered for the gradient taps.
 * @returns {{data:Float32Array,width:number,height:number,minX:number,minZ:number,cellSize:number,falloff:number}}
 */
export function buildCoastlineField(points, opts = {}) {
    if (!Array.isArray(points) || points.length < 3) {
        throw new Error('buildCoastlineField: need a polygon with >= 3 points');
    }
    const cellSize = opts.cellSize ?? DEFAULT_COASTLINE_CELL_SIZE;
    const falloff = opts.falloff ?? 30;
    const bb = pointsBounds(points);
    // Pad so the falloff band plus the gradient stencil never reads off-grid.
    const pad = cellSize * 2 + falloff;
    const minX = bb.minX - pad;
    const minZ = bb.minZ - pad;
    const width = Math.ceil((bb.maxX - bb.minX + pad * 2) / cellSize) + 1;
    const height = Math.ceil((bb.maxZ - bb.minZ + pad * 2) / cellSize) + 1;
    const data = new Float32Array(width * height);
    // Track the deepest-interior cell (max signed distance). Used as the target
    // for the hard-clamp fallback when an entity is so far outside that the SDF
    // gradient has flattened - aiming at a guaranteed-interior point reels it
    // back even on a concave shape, where the bbox centre can be outside (the
    // instep bay of a boot).
    let bestSd = -Infinity;
    let interiorX = minX;
    let interiorZ = minZ;
    for (let gz = 0; gz < height; gz++) {
        const wz = minZ + gz * cellSize;
        for (let gx = 0; gx < width; gx++) {
            const wx = minX + gx * cellSize;
            const dist = distanceToPolygon(wx, wz, points);
            const sign = isPointInPolygon(wx, wz, points) ? 1 : -1;
            const sd = sign * dist;
            data[gz * width + gx] = sd;
            if (sd > bestSd) { bestSd = sd; interiorX = wx; interiorZ = wz; }
        }
    }
    return { data, width, height, minX, minZ, cellSize, falloff, interiorX, interiorZ };
}

/**
 * Bilinear signed-distance sample, clamped to grid edges. Positive inside.
 * @param {ReturnType<typeof buildCoastlineField>} field
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function sampleSignedDistance(field, x, z) {
    const { data, width, height, minX, minZ, cellSize } = field;
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
}

/**
 * True when (x, z) lies beyond the padded SDF grid, where the gradient is
 * unreliable and callers should fall back to the interior-point target.
 * @param {ReturnType<typeof buildCoastlineField>} field
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function isOutsideGrid(field, x, z) {
    const maxX = field.minX + (field.width - 1) * field.cellSize;
    const maxZ = field.minZ + (field.height - 1) * field.cellSize;
    return x < field.minX || x > maxX || z < field.minZ || z > maxZ;
}

/**
 * Inward unit direction at (x, z): the normalized gradient of signed distance
 * (points toward increasing distance = toward the interior). Writes into `out`
 * to avoid allocation in hot loops; returns it. Zero vector if the gradient is
 * degenerate.
 * @param {ReturnType<typeof buildCoastlineField>} field
 * @param {number} x
 * @param {number} z
 * @param {{x:number,z:number}} out
 * @returns {{x:number,z:number}}
 */
export function coastlineInwardDir(field, x, z, out) {
    const h = field.cellSize;
    const gx = sampleSignedDistance(field, x + h, z) - sampleSignedDistance(field, x - h, z);
    const gz = sampleSignedDistance(field, x, z + h) - sampleSignedDistance(field, x, z - h);
    const gm = Math.sqrt(gx * gx + gz * gz);
    if (gm < 1e-9) { out.x = 0; out.z = 0; return out; }
    const inv = 1 / gm;
    out.x = gx * inv;
    out.z = gz * inv;
    return out;
}

// Module-level field cache, keyed on the boundary's `points` array identity.
// The frozen SceneDef boundary object is shared across all entities in a scene,
// so the field builds on first use and is reused for the rest of the room/run.
// WeakMap so a scene swap lets the old field be collected.
const _fieldCache = new WeakMap();

/**
 * Build-or-return the cached SDF for a coastline boundary. Eager-call this once
 * at scene load / room creation so the ~20 ms build is a load-time cost, never
 * paid on a tick. Keyed on `boundary.points` identity.
 * @param {CoastlineBoundary} boundary
 * @returns {ReturnType<typeof buildCoastlineField>}
 */
export function getCoastlineField(boundary) {
    const points = boundary.points;
    let field = _fieldCache.get(points);
    if (!field) {
        field = buildCoastlineField(points, {
            cellSize: boundary.cellSize ?? DEFAULT_COASTLINE_CELL_SIZE,
            falloff: boundary.falloff,
        });
        _fieldCache.set(points, field);
    }
    return field;
}

const _inward = { x: 0, z: 0 };

/**
 * Coastline avoidance steering force. Structurally identical to
 * `calculateIslandAvoidance`: zero inside the safe zone, a smoothstep ramp
 * across the falloff band steered inward, then the Reynolds shape
 * (normalize -> *maxSpeed*forceMultiplier -> subtract velocity -> limit).
 *
 * @param {{position:{x:number,z:number}, velocity:{x:number,z:number}}} entity
 * @param {CoastlineBoundary} boundary
 * @param {Object} [config]
 * @returns {Vector2D}
 */
export function coastlineAvoidance(entity, boundary, config = {}) {
    const {
        maxSpeed = 1.5,
        maxForce = 0.05,
        forceMultiplier = 1.5
    } = config;
    const steer = new Vector2D(0, 0);
    const field = getCoastlineField(boundary);
    const falloff = field.falloff;
    const sd = sampleSignedDistance(field, entity.position.x, entity.position.z);

    // Inside the safe zone (more than `falloff` inside the shore): no force.
    if (sd >= falloff) return steer;

    // smoothstep t in [0, 1] across the band, saturating outside the shore.
    const tRaw = (falloff - sd) / falloff;
    const t = Math.min(1, Math.max(0, tRaw));
    const force = t * t * (3 - 2 * t);

    coastlineInwardDir(field, entity.position.x, entity.position.z, _inward);
    if (_inward.x !== 0 || _inward.z !== 0) {
        steer.x = _inward.x * maxSpeed * force * 1.2;
        steer.z = _inward.z * maxSpeed * force * 1.2;
    }

    if (steer.magnitude() > 0) {
        steer.normalize();
        steer.multiply(maxSpeed * forceMultiplier);
        steer.subtract(entity.velocity);
        steer.limit(maxForce * 2.5);
    }
    return steer;
}

/**
 * Hard coastline clamp: when an entity is within `margin` of the shore (or
 * outside it), push it back inward along the SDF gradient so it cannot leave
 * the land polygon. Mirrors `applyHardBoundaryConstraintsIsland`; returns a new
 * position Vector2D (does not mutate the entity).
 *
 * @param {{position:{x:number,z:number,clone?:Function}}} entity
 * @param {CoastlineBoundary} boundary
 * @param {Object} [config]
 * @returns {Vector2D}
 */
export function applyHardCoastlineConstraint(entity, boundary, config = {}) {
    const { margin = HARD_MARGIN } = config;
    const position = entity.position.clone
        ? entity.position.clone()
        : new Vector2D(entity.position.x, entity.position.z);
    const field = getCoastlineField(boundary);
    const sd = sampleSignedDistance(field, position.x, position.z);
    if (sd < margin) {
        let ix;
        let iz;
        if (isOutsideGrid(field, position.x, position.z)) {
            // Past the padded grid the SDF gradient is unreliable (one axis can
            // clamp to the edge while the other still varies, giving a sideways
            // pseudo-gradient that slides along the edge instead of returning).
            // Aim straight at the polygon's deepest-interior point (computed at
            // build time, guaranteed inside even on a concave shape). The clamp
            // runs every tick, so an entity flung far out converges back in fast.
            ix = field.interiorX - position.x;
            iz = field.interiorZ - position.z;
            const m = Math.sqrt(ix * ix + iz * iz);
            if (m > 1e-9) { ix /= m; iz /= m; } else { ix = 0; iz = 0; }
        } else {
            coastlineInwardDir(field, position.x, position.z, _inward);
            ix = _inward.x;
            iz = _inward.z;
        }
        if (ix !== 0 || iz !== 0) {
            const push = margin - sd; // positive: how far inward to move
            position.x += ix * push;
            position.z += iz * push;
        }
    }
    return position;
}

/**
 * Bounding box of a coastline boundary's points. Used by boundaryToBounds and
 * the collision broadphase to derive a rect view of a coastline.
 * @param {CoastlineBoundary} boundary
 * @returns {{minX:number,maxX:number,minZ:number,maxZ:number}}
 */
export function coastlineBounds(boundary) {
    return pointsBounds(boundary.points);
}
