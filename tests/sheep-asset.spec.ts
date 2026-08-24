// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { afterEach, describe, expect, it } from 'vitest';
import type * as THREE from 'three/webgpu';
import { buildSheepGeometry } from '@app/scene/flock/sheepGeometry';
import { SHEEP_HOOF_SOLE_POINTS } from '@app/scene/flock/sheepParts';
import { HEAD_FACE_SCALE } from '@app/scene/flock/sheepFormTuning';
import { PALETTE } from '@app/tsl/palette';

let geometry: THREE.BufferGeometry | null = null;

afterEach(() => {
  geometry?.dispose();
  geometry = null;
});

function rgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

describe('the instanced sheep asset', () => {
  it('keeps the face decisively ahead of the fleece silhouette', () => {
    geometry = buildSheepGeometry();
    const position = geometry.getAttribute('position');
    const masks = geometry.getAttribute('uv');
    const legs = geometry.getAttribute('uv1');

    let ruffFront = -Infinity;
    let faceFront = -Infinity;
    let faceMinX = Infinity;
    let faceMaxX = -Infinity;

    for (let i = 0; i < position.count; i++) {
      if (masks.getX(i) > 0.5) {
        // The thin poll cap sits on the skull. Exclude its exact half-nod mask
        // so this measures muzzle clearance from the shoulder ruff itself.
        if (Math.abs(masks.getY(i) - 0.5) > 1e-6) {
          ruffFront = Math.max(ruffFront, position.getZ(i));
        }
      } else if (Math.abs(legs.getX(i)) < 0.5 && position.getZ(i) > 0.6) {
        faceFront = Math.max(faceFront, position.getZ(i));
        faceMinX = Math.min(faceMinX, position.getX(i));
        faceMaxX = Math.max(faceMaxX, position.getX(i));
      }
    }

    // The muzzle still clears the forward ruff, but only the cheek and nose sit
    // ahead of it; the rear head loft stays buried instead of reading as a long
    // neck-and-nose lever.
    expect(faceFront - ruffFront).toBeGreaterThanOrEqual(0.05);
    expect(faceFront - ruffFront).toBeLessThan(0.1);
    expect(faceMaxX - faceMinX).toBeGreaterThan(0.45);
  });

  it('has no exposed narrow neck span before the cheek', () => {
    geometry = buildSheepGeometry();
    const position = geometry.getAttribute('position');
    const masks = geometry.getAttribute('uv');
    const legs = geometry.getAttribute('uv1');
    const exposure = geometry.getAttribute('uv2');
    const rings = new Map<string, { z: number; minX: number; maxX: number; exposure: number; count: number }>();

    for (let i = 0; i < position.count; i++) {
      if (masks.getX(i) > 0.5 || Math.abs(legs.getX(i)) > 0.5) continue;
      const z = position.getZ(i);
      const key = z.toFixed(4);
      const ring = rings.get(key) ?? { z, minX: Infinity, maxX: -Infinity, exposure: 0, count: 0 };
      ring.minX = Math.min(ring.minX, position.getX(i));
      ring.maxX = Math.max(ring.maxX, position.getX(i));
      ring.exposure += exposure.getX(i);
      ring.count += 1;
      rings.set(key, ring);
    }

    // Head loft rings have twelve vertices at one z. Ear-box faces do not. The
    // old recipe's first exposed ring was still narrow and sat 0.11 m behind the
    // first cheek ring, which is exactly the stalk the owner saw.
    const headRings = [...rings.values()]
      .filter((ring) => ring.count === 12)
      .map((ring) => ({
        ...ring,
        width: ring.maxX - ring.minX,
        averageExposure: ring.exposure / ring.count,
      }))
      .sort((a, b) => a.z - b.z);
    // Twenty percent average exposure means multiple exterior vertices on the
    // ring carry the contour. The first such ring must already be cheek width.
    const firstExposed = headRings.find((ring) => ring.averageExposure > 0.2);

    expect(headRings).toHaveLength(6);
    expect(headRings[0]!.averageExposure).toBe(0);
    // Sinking the face farther into the ruff leaves only a 1.6 percent faded
    // hull weight on the second root ring, well below a visible pixel.
    expect(headRings[1]!.averageExposure).toBeLessThanOrEqual(0.02);
    expect(headRings[2]!.averageExposure).toBeLessThanOrEqual(0.25);
    expect(firstExposed).toBeDefined();
    expect(firstExposed!.width).toBeGreaterThanOrEqual(0.22);
    expect(headRings.at(-1)!.z - firstExposed!.z).toBeLessThanOrEqual(0.28);
    expect(HEAD_FACE_SCALE).toBe(1.08);
    // The buried ring does not scale, while the visible muzzle gains a modest
    // eight percent in both width and height without adding neck length.
    expect(headRings.at(-1)!.width / headRings[0]!.width).toBeGreaterThan(0.95);
  });

  it('keeps the pale poll cap below one quarter of the dark head height', () => {
    geometry = buildSheepGeometry();
    const position = geometry.getAttribute('position');
    const masks = geometry.getAttribute('uv');
    const legs = geometry.getAttribute('uv1');
    let pollBottom = Infinity;
    let pollTop = -Infinity;
    let headBottom = Infinity;
    let headTop = -Infinity;
    let pollVertices = 0;
    let headVertices = 0;

    for (let i = 0; i < position.count; i++) {
      const wool = masks.getX(i);
      const graze = masks.getY(i);
      const legSign = legs.getX(i);
      const y = position.getY(i);
      // The poll is the only wool part carrying exactly half of the nod.
      if (wool > 0.5 && Math.abs(graze - 0.5) < 1e-6) {
        pollBottom = Math.min(pollBottom, y);
        pollTop = Math.max(pollTop, y);
        pollVertices += 1;
      }
      // Head vertices are non-wool, non-leg vertices. Ears carry a uniform
      // 0.85 mask, so excluding that value leaves the complete dark head loft.
      if (wool < 0.5 && Math.abs(legSign) < 0.5 && Math.abs(graze - 0.85) > 1e-5) {
        headBottom = Math.min(headBottom, y);
        headTop = Math.max(headTop, y);
        headVertices += 1;
      }
    }

    const pollSpan = pollTop - pollBottom;
    const headSpan = headTop - headBottom;
    expect(pollVertices).toBeGreaterThan(0);
    expect(headVertices).toBeGreaterThan(0);
    expect(pollSpan).toBeLessThanOrEqual(0.048);
    expect(pollSpan / headSpan).toBeLessThanOrEqual(0.25);
  });

  it('plants four blocky hooves on the ground with a separated stance', () => {
    geometry = buildSheepGeometry();
    const position = geometry.getAttribute('position');
    const legs = geometry.getAttribute('uv1');

    let minY = Infinity;
    let hoofMinX = Infinity;
    let hoofMaxX = -Infinity;
    let hoofVertices = 0;

    for (let i = 0; i < position.count; i++) {
      if (Math.abs(legs.getX(i)) < 0.5) continue;
      minY = Math.min(minY, position.getY(i));
      if (legs.getY(i) < 0.95) continue;
      hoofVertices += 1;
      hoofMinX = Math.min(hoofMinX, position.getX(i));
      hoofMaxX = Math.max(hoofMaxX, position.getX(i));
    }

    expect(minY).toBeCloseTo(0, 6);
    expect(hoofVertices).toBeGreaterThanOrEqual(24);
    expect(hoofMaxX - hoofMinX).toBeGreaterThan(0.5);

    for (let contact = 0; contact < 4; contact++) {
      const sole = SHEEP_HOOF_SOLE_POINTS.filter((point) => point.contact === contact);
      const width = Math.max(...sole.map(({ x }) => x)) - Math.min(...sole.map(({ x }) => x));
      const depth = Math.max(...sole.map(({ z }) => z)) - Math.min(...sole.map(({ z }) => z));
      // Pin the final-pass proportion fix: each planted extremity is broad
      // enough to read as a foot, rather than the end of a thin dark rod.
      expect(width).toBeGreaterThan(0.115);
      expect(depth).toBeGreaterThan(0.135);
    }
  });

  it('drops the fleece over the upper legs while keeping the hooves planted', () => {
    geometry = buildSheepGeometry();
    const position = geometry.getAttribute('position');
    const masks = geometry.getAttribute('uv');
    const legs = geometry.getAttribute('uv1');
    let woolBottom = Infinity;
    let legTop = -Infinity;

    for (let i = 0; i < position.count; i++) {
      if (masks.getX(i) > 0.5) woolBottom = Math.min(woolBottom, position.getY(i));
      if (Math.abs(legs.getX(i)) > 0.5) legTop = Math.max(legTop, position.getY(i));
    }

    expect(woolBottom).toBeGreaterThan(0.16);
    expect(woolBottom).toBeLessThan(0.24);
    expect(legTop - woolBottom).toBeGreaterThan(0.35);
  });

  it('authors a broad shoulder ruff and flank apron without inflating the body', () => {
    geometry = buildSheepGeometry();
    const position = geometry.getAttribute('position');
    const masks = geometry.getAttribute('uv');

    let woolMinX = Infinity;
    let woolMaxX = -Infinity;
    let ruffMinX = Infinity;
    let ruffMaxX = -Infinity;
    let ruffVertices = 0;

    for (let i = 0; i < position.count; i++) {
      if (masks.getX(i) <= 0.5) continue;
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      woolMinX = Math.min(woolMinX, x);
      woolMaxX = Math.max(woolMaxX, x);
      if (y < 0.58 || z < 0.06 || z > 0.43) continue;
      ruffVertices += 1;
      ruffMinX = Math.min(ruffMinX, x);
      ruffMaxX = Math.max(ruffMaxX, x);
    }

    // The new perimeter is visibly fuller than the 0.75 m former recipe, but
    // stays bounded below a one-metre balloon. The shoulder-specific span pins
    // the collar rather than allowing the central barrel to satisfy the test.
    expect(woolMaxX - woolMinX).toBeGreaterThan(0.82);
    expect(woolMaxX - woolMinX).toBeLessThan(0.95);
    expect(ruffVertices).toBeGreaterThan(20);
    expect(ruffMaxX - ruffMinX).toBeGreaterThan(0.79);
  });

  it('connects the forelock to a deep central brisket', () => {
    geometry = buildSheepGeometry();
    const position = geometry.getAttribute('position');
    const masks = geometry.getAttribute('uv');
    let lowForwardWool = 0;
    let forwardBottom = Infinity;
    let wrappedWool = 0;

    for (let i = 0; i < position.count; i++) {
      if (masks.getX(i) <= 0.5) continue;
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      if (Math.abs(x) > 0.18 || z < 0.24 || z > 0.53) continue;
      if (y < 0.48) lowForwardWool += 1;
      if (masks.getY(i) >= 0.1) wrappedWool += 1;
      forwardBottom = Math.min(forwardBottom, y);
    }

    expect(lowForwardWool).toBeGreaterThan(8);
    expect(wrappedWool).toBeGreaterThan(12);
    expect(forwardBottom).toBeLessThan(0.21);
  });

  it('varies longitudinal fleece spans instead of repeating equal scallops', () => {
    geometry = buildSheepGeometry();
    const position = geometry.getAttribute('position');
    const masks = geometry.getAttribute('uv');
    const bins = [
      { min: -0.48, max: -0.24, left: Infinity, right: -Infinity },
      { min: -0.24, max: 0, left: Infinity, right: -Infinity },
      { min: 0, max: 0.24, left: Infinity, right: -Infinity },
      { min: 0.24, max: 0.48, left: Infinity, right: -Infinity },
    ];

    for (let i = 0; i < position.count; i++) {
      if (masks.getX(i) <= 0.5) continue;
      const x = position.getX(i);
      const z = position.getZ(i);
      const bin = bins.find(({ min, max }) => z >= min && z < max);
      if (bin === undefined) continue;
      bin.left = Math.min(bin.left, x);
      bin.right = Math.max(bin.right, x);
    }

    const spans = bins.map(({ left, right }) => right - left);
    expect(Math.max(...spans) - Math.min(...spans)).toBeGreaterThan(0.06);
    expect(new Set(spans.map((span) => span.toFixed(2))).size).toBeGreaterThanOrEqual(3);
  });

  it('breaks the underside shelf with distinct chest, belly and haunch depths', () => {
    geometry = buildSheepGeometry();
    const position = geometry.getAttribute('position');
    const masks = geometry.getAttribute('uv');
    const bins = [
      { min: -0.48, max: -0.2, bottom: Infinity },
      { min: -0.2, max: 0.12, bottom: Infinity },
      { min: 0.12, max: 0.5, bottom: Infinity },
    ];

    for (let i = 0; i < position.count; i++) {
      if (masks.getX(i) <= 0.5) continue;
      const z = position.getZ(i);
      const bin = bins.find(({ min, max }) => z >= min && z < max);
      if (bin === undefined) continue;
      bin.bottom = Math.min(bin.bottom, position.getY(i));
    }

    const bottoms = bins.map(({ bottom }) => bottom);
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeGreaterThan(0.035);
  });

  it('keeps the single instanced recipe inside its triangle budget', () => {
    geometry = buildSheepGeometry();
    const index = geometry.getIndex();

    expect(index).not.toBeNull();
    expect(index!.count / 3).toBeLessThanOrEqual(2_100);
  });

  it('keeps a warm cream middle over a saturated cool wool shadow', () => {
    const lit = rgb(PALETTE.sheepWoolLit);
    const mid = rgb(PALETTE.sheepWoolMid);
    const shade = rgb(PALETTE.sheepWoolShade);

    expect(mid[0]).toBeGreaterThan(mid[1]);
    expect(mid[1]).toBeGreaterThan(mid[2]);
    expect(shade[1]).toBeGreaterThanOrEqual(shade[0]);
    expect(shade[2]).toBeGreaterThan(shade[1]);
    expect(Math.max(...shade) - Math.min(...shade)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...shade) - Math.min(...shade)).toBeLessThan(40);
    expect(lit[0] + lit[1] + lit[2]).toBeGreaterThan(mid[0] + mid[1] + mid[2]);
    expect(mid[0] + mid[1] + mid[2]).toBeGreaterThan(shade[0] + shade[1] + shade[2]);
  });
});
