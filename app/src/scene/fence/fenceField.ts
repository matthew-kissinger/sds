// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Authored joinery on the game's exact collision outline, shared with the lab.
import { FIELD_FENCE_SECTIONS } from './fieldSections';
import { rectFenceLayout, runDivisions, postKey, hash01 } from '../fenceGeometry';
import { buildPosts, buildRails } from './buildMeshes';
import { DEFAULT_TIMBER_STYLE, type TimberStyle } from './timberStyle';
import { PALETTE } from '@app/tsl/palette';
import type { GroundSampler, PostPlacement, RailPlacement } from './placement';
import type { GateLeafAssembly } from './gateKit';
import type { FenceKit } from './fenceKit';
import { fenceShadowMotion } from './fenceShadowMotion';

/** Warmer oak, visible strokes and a quieter contour; still the shared TSL. */
export const OAK_FENCE_STYLE: TimberStyle = {
  ...DEFAULT_TIMBER_STYLE,
  bands: PALETTE.fenceOak,
  outlineWidth: 0.004,
  outlineColor: PALETTE.fenceOakOutline,
  gatePaintStrength: 0,
};

export function fenceFieldPlacements(kit: FenceKit, groundY: GroundSampler) {
  const straight = kit.modules.find(m => m.id === 'straight')!;
  const corner = kit.modules.find(m => m.id === 'corner')!;
  const gate = kit.modules.find(m => m.id === 'gate')!;
  const lineStock = straight.posts[0]!;
  const cornerStock = corner.posts.find(p => p.x === 0 && p.z === 0)!;
  const postsByKey = new Map<string, PostPlacement>();
  const rails: RailPlacement[] = [], leaves: GateLeafAssembly[] = [];
  const bayMin = Math.min(...straight.posts.map(p => p.x));
  const bayMax = Math.max(...straight.posts.map(p => p.x));
  const layouts = FIELD_FENCE_SECTIONS.map(section => ({ section,
    layout: rectFenceLayout(section.rect, section.postSpacing ?? 5, section.gaps, section.sides),
  }));
  // An adjoining pen terminates on the perimeter's rail. Split that rail FIRST,
  // then divide each subspan, so its common post is also the end of both bays.
  // Adding a pen post after dividing the old run leaves a second post nearby.
  const corners = layouts.flatMap(({ layout }) => layout.posts.filter(p => p.corner));
  const cornerKeys = new Set(corners.map(p => postKey(p.x, p.z)));

  for (const { section, layout } of layouts) {
    const spacing = section.postSpacing ?? 5;
    const gatePostKeys = new Set(layout.posts.filter(p => p.gatePost).map(p => postKey(p.x, p.z)));
    const runs = layout.rails.flatMap(run => {
      const cuts = [run.from, ...corners.filter(p =>
        Math.abs(run.axis === 'x' ? p.z - run.z : p.x - run.x) < 1e-7,
      ).map(p => run.axis === 'x' ? p.x : p.z)
        .filter(along => along > run.from && along < run.to), run.to];
      const sorted = [...new Set(cuts)].sort((a, b) => a - b);
      return sorted.slice(0, -1).map((from, i) => {
        const to = sorted[i + 1]!;
        return { ...run, from, to, length: to - from,
          ...(run.axis === 'x' ? { x: (from + to) / 2 } : { z: (from + to) / 2 }),
        };
      });
    });
    for (const run of runs) {
      const divisions = runDivisions(run.length, spacing), stride = run.length / divisions;
      for (let i = 0; i <= divisions; i++) {
        const along = i === divisions ? run.to : run.from + stride * i;
        const x = run.axis === 'x' ? along : run.x;
        const z = run.axis === 'x' ? run.z : along;
        const key = postKey(x, z);
        if (gatePostKeys.has(key) || postsByKey.has(key)) continue;
        const source = cornerKeys.has(key) ? cornerStock : lineStock;
        postsByKey.set(key, { ...source, x, z,
          baseY: source.baseY + groundY(x, z), seed: hash01(x, z, 89), yaw: 0,
        });
      }
      for (let i = 0; i < divisions; i++) {
        const lo = run.from + stride * i, hi = lo + stride;
        const map = (x: number, z: number) => {
          const along = lo + (x - bayMin) / (bayMax - bayMin) * stride;
          return run.axis === 'x'
            ? { x: along + run.outX * z, z: run.z + run.outZ * z }
            : { x: run.x + run.outX * z, z: along + run.outZ * z };
        };
        for (const r of straight.rails) {
          const a = map(r.ax, r.az), b = map(r.bx, r.bz);
          rails.push({ ...r, ax: a.x, az: a.z, bx: b.x, bz: b.z,
            ay: r.ay + groundY(a.x, a.z), by: r.by + groundY(b.x, b.z),
            seed: hash01(lo, run.axis === 'x' ? run.z : run.x, 43 + Math.round(r.ay * 100)),
          });
        }
        if (hi > run.to + 1e-7) throw new Error('Fence bay exceeded its run');
      }
    }
    // The corner module supplies just its knee braces; ordinary bays meet the
    // common post. Do not stamp complete panels over the corner a second time.
    for (const p of layout.posts.filter(p => p.corner && !p.gatePost)) {
      const sx = p.x === section.rect.maxX ? 1 : -1;
      const sz = p.z === section.rect.minZ ? 1 : -1;
      const included = layout.rails;
      for (const r of corner.rails.filter(r => r.ax !== r.bx && r.az === r.bz || r.az !== r.bz && r.ax === r.bx)) {
        if (Math.abs(r.ax - r.bx) > 2 || Math.abs(r.az - r.bz) > 2) continue;
        const alongX = Math.abs(r.ax - r.bx) > 0;
        // A shared side of the pen has no new rail and needs no duplicate brace.
        if (!included.some(run => run.axis === (alongX ? 'x' : 'z')
          && (alongX ? Math.abs(run.z - p.z) < 1e-7 : Math.abs(run.x - p.x) < 1e-7))) continue;
        const ax = p.x + r.ax * sx, az = p.z + r.az * sz;
        const bx = p.x + r.bx * sx, bz = p.z + r.bz * sz;
        rails.push({ ...r, ax, az, bx, bz, ay: r.ay + groundY(ax, az), by: r.by + groundY(bx, bz) });
      }
    }
    for (const opening of layout.openings.filter(o => o.kit)) {
      const x = (opening.ax + opening.bx) / 2, z = (opening.az + opening.bz) / 2;
      const map = (px: number, pz: number) => ({
        x: x + px * opening.ux - pz * opening.nx,
        z: z + px * opening.uz - pz * opening.nz,
      });
      let clearance = -Infinity;
      for (const leaf of gate.leaves) for (let i = 0; i <= 24; i++) {
        const angle = leaf.closeTurn * i / 24, c = Math.cos(angle), s = Math.sin(angle);
        for (const r of leaf.parts) for (const [px, pz] of [[r.ax, r.az], [r.bx, r.bz]]) {
          const dx = px! - leaf.hingeX, dz = pz! - leaf.hingeZ;
          const at = map(leaf.hingeX + dx * c - dz * s, leaf.hingeZ + dx * s + dz * c);
          clearance = Math.max(clearance, groundY(at.x, at.z));
        }
      }
      for (const p of gate.posts) {
        const at = map(p.x, p.z), y = groundY(at.x, at.z);
        postsByKey.set(postKey(at.x, at.z), { ...p, ...at, baseY: p.baseY + y,
          height: p.height + clearance - y });
      }
      const transform = (r: RailPlacement, hung: boolean): RailPlacement => {
        const a = map(r.ax, r.az), b = map(r.bx, r.bz);
        return { ...r, ax: a.x, az: a.z, bx: b.x, bz: b.z,
          ay: r.ay + (hung ? clearance : groundY(a.x, a.z)),
          by: r.by + (hung ? clearance : groundY(b.x, b.z)),
        };
      };
      rails.push(...gate.rails.map(r => transform(r, false)));
      leaves.push(...gate.leaves.map(l => { const hinge = map(l.hingeX, l.hingeZ);
        return { ...l, hingeX: hinge.x, hingeZ: hinge.z, parts: l.parts.map(r => transform(r, true)) };
      }));
    }
  }
  return { posts: [...postsByKey.values()], rails, leaves };
}

export function buildFenceField(kit: FenceKit, groundY: GroundSampler) {
  const { posts, rails, leaves } = fenceFieldPlacements(kit, groundY);
  const postMeshes = buildPosts(posts, OAK_FENCE_STYLE), railBatch = buildRails(rails, leaves, OAK_FENCE_STYLE);
  for (const mesh of postMeshes) { mesh.geometry.dispose(); mesh.geometry = kit.post.clone(); }
  for (const mesh of railBatch.meshes) { mesh.geometry.dispose(); mesh.geometry = kit.rail.clone(); }
  const shadowMotion = fenceShadowMotion(posts, rails, leaves, groundY);
  const objects = [...postMeshes, ...railBatch.meshes, shadowMotion.shadow];
  return { objects, railBatch, posts, rails, leaves, updateGate(progress: number) {
    railBatch.updateGate(progress); shadowMotion.update(progress);
  } };
}
