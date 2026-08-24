// SPDX-License-Identifier: AGPL-3.0-or-later
// The fence a player sees has to be the fence the sim collides against. These
// assertions pin the layout to HOME_FIELD, so a scene tweak that moves the gate
// away from the sim's gate fails here instead of in a playtest.
import { describe, it, expect } from 'vitest';
import { HOME_FIELD } from '@sim/field';
import { RETIREMENT_PASTURE_FENCE } from '@app/scene/FenceLine';
import { rectFenceLayout } from '@app/scene/fenceGeometry';

const { bounds, gate, pen } = HOME_FIELD;

describe('perimeter fence layout', () => {
  const layout = rectFenceLayout(bounds, 5, {
    north: { center: gate.position.x, width: gate.width, kit: true },
  });

  it('leaves exactly one opening, at the gate, 8 m wide', () => {
    const northRails = layout.rails.filter((rail) => rail.z === bounds.maxZ);
    expect(northRails).toHaveLength(2);
    const covered = northRails.reduce((sum, rail) => sum + rail.length, 0);
    expect(bounds.maxX - bounds.minX - covered).toBeCloseTo(gate.width, 6);
  });

  it('puts the opening on the gate centre line', () => {
    const gatePosts = layout.posts.filter((post) => post.gatePost);
    expect(gatePosts.map((post) => post.x).sort((a, b) => a - b)).toEqual([
      gate.position.x - gate.width / 2,
      gate.position.x + gate.width / 2,
    ]);
    for (const post of gatePosts) expect(post.z).toBe(bounds.maxZ);
  });

  it('closes the other three sides', () => {
    for (const [axis, value] of [
      ['z', bounds.minZ],
      ['x', bounds.minX],
      ['x', bounds.maxX],
    ] as const) {
      const side = layout.rails.filter((rail) =>
        axis === 'z' ? rail.z === value : rail.x === value,
      );
      expect(side).toHaveLength(1);
    }
  });
});

describe('pen fence layout', () => {
  const layout = rectFenceLayout(
    RETIREMENT_PASTURE_FENCE,
    4,
    {},
    ['north', 'west', 'east'],
  );

  it('adds only three sides because the perimeter rails are its front fence', () => {
    expect(layout.rails).toHaveLength(3);
    expect(layout.rails.some((rail) => rail.z === bounds.maxZ)).toBe(false);
    expect(layout.rails.some((rail) => rail.z === pen.maxZ)).toBe(true);
    expect(layout.rails.filter((rail) => rail.axis === 'z')).toHaveLength(2);
  });

  it('attaches both side runs directly to the perimeter rail line', () => {
    expect(RETIREMENT_PASTURE_FENCE.minZ).toBe(bounds.maxZ);
    const sideRuns = layout.rails.filter((rail) => rail.axis === 'z');
    expect(sideRuns.map((rail) => rail.from)).toEqual([bounds.maxZ, bounds.maxZ]);
    expect(sideRuns.map((rail) => rail.to)).toEqual([pen.maxZ, pen.maxZ]);
    const attachmentPosts = layout.posts.filter((post) => post.z === bounds.maxZ);
    expect(attachmentPosts.map((post) => post.x).sort((a, b) => a - b)).toEqual([
      pen.minX,
      pen.maxX,
    ]);
  });

  it('adds no opening or second gate kit', () => {
    expect(layout.openings).toHaveLength(0);
    expect(layout.posts.filter((post) => post.gatePost)).toHaveLength(0);
  });
});
