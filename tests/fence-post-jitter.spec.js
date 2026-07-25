// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { FencePresets, FenceConfigBuilder, createFencePostJitter } from '../js/FencePresets.js';

/**
 * Fence posts stop being a picket line (Cycle 114 grounding pass).
 *
 * Three things are pinned here:
 *   1. The jitter is SEEDED. A run reproduces exactly across builds, across
 *      FencePresets instances, and with Math.random stubbed to a constant.
 *   2. The jitter lands on all three post paths - the instanced spec that
 *      Home Field actually renders, the GLB clone-per-post fallback, and the
 *      fully procedural fallback for a machine without the kit.
 *   3. The jitter stays inside the budget the rails impose. A post that leans
 *      or shrinks past those caps detaches from its rails, which is the one
 *      way this change can look worse than what it replaced.
 *
 * The caps are duplicated here on purpose: the spec is the thing that fails if
 * someone widens the constants in js/FencePresets.js without re-deriving them
 * against the rail heights.
 */

const YAW_MAX = 0.20;
const LEAN_MAX = 0.038;
const HEIGHT_MIN = 0.95;
const HEIGHT_MAX = 1.10;

/** Post height of the shipped kit piece, from cycle105-validation/fence-kiln-spec.md. */
const SHIPPED_POST_HEIGHT = 2.18;
/** Top rail centre; the rail box tops out roughly 0.05 above it. */
const TOP_RAIL_HEIGHT = 1.9;
/** Half the shipped post's square cross-section. */
const POST_HALF_WIDTH = 0.21;

function makeModule(name, meshName, geometry, meshY = 0) {
  const group = new THREE.Group();
  group.name = name;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = meshName;
  mesh.position.y = meshY;
  group.add(mesh);
  return group;
}

/** A kit whose post is a single mesh, so createBorderSegment emits the instancing spec. */
function makeInstancedKit() {
  const presets = new FencePresets();
  presets.useGLBModels = true;
  presets.models.fencePost = makeModule(
    'Fence_Post',
    'Mesh_Fence_Post_Runtime',
    new THREE.BoxGeometry(0.42, SHIPPED_POST_HEIGHT, 0.4),
    SHIPPED_POST_HEIGHT / 2,
  );
  presets.models.fenceRail = makeModule(
    'Fence_Rail',
    'Mesh_Fence_Rail_Runtime',
    new THREE.BoxGeometry(1, 0.1, 0.12),
  );
  return presets;
}

/**
 * A kit whose post holds TWO meshes. _getSingleMeshSource bails on anything but
 * a single mesh, which drops createBorderSegment onto the clone-per-post path.
 */
function makeCloneKit() {
  const presets = makeInstancedKit();
  const extra = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
  extra.name = 'Mesh_Fence_Post_Cap';
  presets.models.fencePost.add(extra);
  return presets;
}

function specFor(segment) {
  return segment.userData.fenceInstancingSpec;
}

/** Every postJitter array under a built fence tree, in traversal order. */
function collectJitter(root) {
  const runs = [];
  root.traverse(node => {
    const spec = node.userData?.fenceInstancingSpec;
    if (spec?.postJitter) runs.push(spec.postJitter);
  });
  return runs;
}

describe('createFencePostJitter — seeded, reproducible, bounded', () => {
  it('produces the identical sequence for the same key', () => {
    const a = createFencePostJitter('border-south:horizontal:100.000', 21);
    const b = createFencePostJitter('border-south:horizontal:100.000', 21);
    expect(a).toEqual(b);
    expect(a).toHaveLength(21);
  });

  it('produces a different sequence for a different key', () => {
    const east = createFencePostJitter('border-east:vertical:100.000', 21);
    const west = createFencePostJitter('border-west:vertical:100.000', 21);
    expect(east).not.toEqual(west);
  });

  it('keeps every draw inside the budget the rails impose', () => {
    const jitter = createFencePostJitter('bounds-probe', 400);
    for (const post of jitter) {
      expect(Math.abs(post.yaw)).toBeLessThanOrEqual(YAW_MAX);
      const lean = Math.hypot(post.leanX, post.leanZ);
      expect(lean).toBeLessThanOrEqual(LEAN_MAX + 1e-12);
      expect(post.heightScale).toBeGreaterThanOrEqual(HEIGHT_MIN);
      expect(post.heightScale).toBeLessThanOrEqual(HEIGHT_MAX);
    }
  });

  it('caps the lean below the angle that would walk a post off its top rail', () => {
    // A post stays attached while its lean displaces the top rail's attachment
    // point by less than the post's half-width.
    const geometricLimit = Math.atan(POST_HALF_WIDTH / TOP_RAIL_HEIGHT);
    expect(LEAN_MAX).toBeLessThan(geometricLimit);
    // And the shortest post still clears the top rail.
    expect(HEIGHT_MIN * SHIPPED_POST_HEIGHT).toBeGreaterThan(TOP_RAIL_HEIGHT + 0.05);
  });

  it('varies the lean direction rather than parking every post on a diagonal', () => {
    const jitter = createFencePostJitter('direction-probe', 200);
    const quadrants = new Set(
      jitter.map(p => `${p.leanX >= 0 ? '+' : '-'}${p.leanZ >= 0 ? '+' : '-'}`),
    );
    expect(quadrants.size).toBe(4);
  });
});

describe('instanced fence spec — the path Home Field renders', () => {
  it('carries a per-post transform, not just a count', () => {
    const presets = makeInstancedKit();
    const segment = presets.createBorderSegment(100, 'horizontal', { seedKey: 'border-south' });
    const spec = specFor(segment);

    expect(spec).toBeDefined();
    expect(spec.postJitter).toHaveLength(spec.postCount);
  });

  it('gives adjacent posts a different height and a different yaw', () => {
    const presets = makeInstancedKit();
    const spec = specFor(presets.createBorderSegment(100, 'horizontal', { seedKey: 'border-south' }));

    for (let i = 1; i < spec.postJitter.length; i++) {
      const prev = spec.postJitter[i - 1];
      const cur = spec.postJitter[i];
      expect(cur.heightScale).not.toBeCloseTo(prev.heightScale, 4);
      expect(cur.yaw).not.toBeCloseTo(prev.yaw, 4);
    }
  });

  it('reproduces exactly on a second load, from a fresh FencePresets', () => {
    const first = specFor(makeInstancedKit().createBorderSegment(100, 'horizontal', { seedKey: 'border-south' }));
    const second = specFor(makeInstancedKit().createBorderSegment(100, 'horizontal', { seedKey: 'border-south' }));
    expect(second.postJitter).toEqual(first.postJitter);
  });

  it('does not repeat the same run on two borders of equal length', () => {
    const presets = makeInstancedKit();
    const east = specFor(presets.createBorderSegment(100, 'vertical', { seedKey: 'border-east' }));
    const west = specFor(presets.createBorderSegment(100, 'vertical', { seedKey: 'border-west' }));
    expect(west.postJitter).not.toEqual(east.postJitter);
  });
});

describe('a whole single-player fence build is identical between two loads', () => {
  const BOUNDS = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
  const GATE = { width: 8, position: { x: 0, z: 100 } };
  const PASTURE = { minX: -30, maxX: 30, minZ: 102, maxZ: 130 };

  function build() {
    const presets = makeInstancedKit();
    return new FenceConfigBuilder(presets).buildSinglePlayerFences(BOUNDS, GATE, PASTURE);
  }

  it('reproduces every post transform in every run', () => {
    const first = collectJitter(build());
    const second = collectJitter(build());
    expect(first.length).toBeGreaterThan(4);
    expect(second).toEqual(first);
  });

  it('does not draw the same posts for the two halves of a centred gate run', () => {
    // The gate sits at x = 0 on a 200m border, so the left and right halves are
    // both 96m. Same length, same orientation, and the player stands right
    // between them, so they must not mirror.
    const runs = collectJitter(build());
    const ninetySix = runs.filter(run => run.length === Math.ceil(96 / 5) + 1);
    expect(ninetySix.length).toBeGreaterThanOrEqual(2);
    expect(ninetySix[0]).not.toEqual(ninetySix[1]);
  });

  it('does not draw the same posts for the pen\'s two side fences', () => {
    const runs = collectJitter(build());
    // Pen depth 28 -> ceil(28 / 5) + 1 = 7 posts. Back fence is 60m wide, so
    // only the two side fences land on this count.
    const sides = runs.filter(run => run.length === Math.ceil(28 / 5) + 1);
    expect(sides).toHaveLength(2);
    expect(sides[0]).not.toEqual(sides[1]);
  });
});

describe('GLB clone-per-post path', () => {
  it('leans, yaws and scales each clone while leaving its authored foot at y = 0', () => {
    const presets = makeCloneKit();
    const segment = presets.createBorderSegment(40, 'horizontal', { seedKey: 'clone-probe' });
    const posts = segment.children.filter(child => child.name === 'Fence_Post');

    expect(posts.length).toBeGreaterThan(4);
    for (const post of posts) {
      // The kit's wrapper origin is authored at ground contact, so the clone
      // path must not move it; _surfaceToTerrain owns position.y.
      expect(post.position.y).toBe(0);
      expect(Math.abs(post.rotation.x)).toBeLessThanOrEqual(LEAN_MAX);
      expect(Math.abs(post.rotation.z)).toBeLessThanOrEqual(LEAN_MAX);
      expect(post.scale.y).toBeGreaterThanOrEqual(HEIGHT_MIN);
      expect(post.scale.y).toBeLessThanOrEqual(HEIGHT_MAX);
    }
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i].scale.y).not.toBeCloseTo(posts[i - 1].scale.y, 4);
      expect(posts[i].rotation.y).not.toBeCloseTo(posts[i - 1].rotation.y, 4);
    }
  });

  it('keeps the run-axis yaw for a vertical segment', () => {
    const presets = makeCloneKit();
    const segment = presets.createBorderSegment(40, 'vertical', { seedKey: 'clone-probe' });
    const posts = segment.children.filter(child => child.name === 'Fence_Post');

    for (const post of posts) {
      expect(Math.abs(post.rotation.y - Math.PI / 2)).toBeLessThanOrEqual(YAW_MAX);
    }
  });
});

describe('procedural fallback — same fence shape without the kit', () => {
  function proceduralPosts(seedKey = 'procedural-probe', orientation = 'horizontal', length = 40) {
    const presets = new FencePresets();
    presets.useGLBModels = false;
    const segment = presets.createBorderSegment(length, orientation, { seedKey });
    segment.updateMatrixWorld(true);
    const posts = segment.children.filter(child => child.geometry?.type === 'CylinderGeometry');
    return { presets, segment, posts };
  }

  it('plants every post foot on the nominal (x, z) at y = 0 despite the lean', () => {
    const { presets, posts } = proceduralPosts();
    const actualSpacing = 40 / (posts.length - 1);

    posts.forEach((post, i) => {
      // The fallback cylinder is centred on its own origin, so the foot is
      // half the AUTHORED height below it; localToWorld folds in the seeded
      // Y scale and the lean.
      const foot = post.localToWorld(new THREE.Vector3(0, -presets.fenceHeight / 2, 0));
      expect(foot.x).toBeCloseTo(i * actualSpacing - 20, 9);
      expect(foot.y).toBeCloseTo(0, 9);
      expect(foot.z).toBeCloseTo(0, 9);
    });
  });

  it('gives adjacent posts a different height and a different yaw', () => {
    const { posts } = proceduralPosts();
    expect(posts.length).toBeGreaterThan(4);
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i].scale.y).not.toBeCloseTo(posts[i - 1].scale.y, 4);
      expect(posts[i].rotation.y).not.toBeCloseTo(posts[i - 1].rotation.y, 4);
    }
  });

  it('draws the same posts the instanced path would for the same run', () => {
    const { posts } = proceduralPosts('shared-run');
    const spec = specFor(makeInstancedKit().createBorderSegment(40, 'horizontal', { seedKey: 'shared-run' }));

    expect(posts).toHaveLength(spec.postJitter.length);
    posts.forEach((post, i) => {
      expect(post.scale.y).toBeCloseTo(spec.postJitter[i].heightScale, 12);
      expect(post.rotation.y).toBeCloseTo(spec.postJitter[i].yaw, 12);
    });
  });
});

describe('the jitter does not come from Math.random', () => {
  const originalRandom = Math.random;
  afterEach(() => {
    Math.random = originalRandom;
  });

  it('still varies post to post with Math.random pinned to a constant', () => {
    // Not a throwing stub: THREE.MathUtils.generateUUID calls Math.random for
    // every Object3D, so a throw would fail on construction rather than on the
    // thing under test. A constant is the sharper probe - anything actually
    // reading Math.random would emit an identical post every time.
    Math.random = () => 0.5;
    const spec = specFor(makeInstancedKit().createBorderSegment(100, 'horizontal', { seedKey: 'pinned' }));
    const unpinned = specFor(makeInstancedKit().createBorderSegment(100, 'horizontal', { seedKey: 'pinned' }));

    const heights = new Set(spec.postJitter.map(p => p.heightScale));
    expect(heights.size).toBe(spec.postJitter.length);
    Math.random = originalRandom;
    expect(spec.postJitter).toEqual(unpinned.postJitter);
  });
});
