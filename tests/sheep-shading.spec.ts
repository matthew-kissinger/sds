// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { buildSheepGeometry } from '@app/scene/flock/sheepGeometry';
import { makeSheepOutlineMaterial } from '@app/scene/flock/sheepMaterial';
import { buildSheepOutlineGeometry } from '@app/scene/flock/sheepOutlineGeometry';
import { PALETTE } from '@app/tsl/palette';
import { uniform } from '@app/tsl/nodes';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('sheep cel shading and outline contracts', () => {
  it('keeps every authored sheep pigment in the master palette', () => {
    const material = source('app/src/scene/flock/sheepMaterial.ts');
    const ramp = source('app/src/scene/flock/sheepRamp.ts');
    const sheepColor = source('app/src/scene/flock/sheepColor.ts');

    expect(PALETTE.sheepOutline).toMatch(/^#[0-9a-f]{6}$/i);
    expect(PALETTE.sheepFace).toMatch(/^#[0-9a-f]{6}$/i);
    expect(PALETTE.sheepLeg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(PALETTE.sheepHoof).toMatch(/^#[0-9a-f]{6}$/i);
    expect(material).toContain('color(PALETTE.sheepOutline)');
    expect(ramp).toContain('PALETTE.sheepWoolLit');
    expect(ramp).toContain('PALETTE.sheepWoolMid');
    expect(ramp).toContain('PALETTE.sheepWoolShade');
    expect(sheepColor).toContain('color(PALETTE.sheepFace)');
    expect(sheepColor).toContain('color(PALETTE.sheepLeg)');
    expect(sheepColor).toContain('color(PALETTE.sheepHoof)');
  });

  it('uses one intentional three-value ramp with only two terminators', () => {
    const ramp = source('app/src/scene/flock/sheepRamp.ts');

    expect(ramp).toContain('const EDGE_SHADE');
    expect(ramp).toContain('const EDGE_LIT');
    expect(ramp).not.toContain('EDGE_MID');
    expect(ramp.match(/const into[A-Z][A-Za-z]+ = band\(/g)).toHaveLength(1);
    expect(ramp.match(/const outOf[A-Z][A-Za-z]+ = band\(/g)).toHaveLength(1);
  });

  it('cancels anisotropic instance scale along the full hull direction', () => {
    const material = source('app/src/scene/flock/sheepMaterial.ts');
    const flock = source('app/src/scene/Flock.tsx');
    const direction = [0.36, 0.48, 0.8] as const;
    const scale = [0.82, 1.17, 1.06] as const;
    const ratios = [scale[1] / scale[0], 1, scale[1] / scale[2]] as const;
    const localOffset = direction.map(
      (component, axis) => component * ratios[axis]! / scale[1],
    );
    const worldOffset = localOffset.map((component, axis) => component * scale[axis]!);

    expect(worldOffset[0]).toBeCloseTo(direction[0], 12);
    expect(worldOffset[1]).toBeCloseTo(direction[1], 12);
    expect(worldOffset[2]).toBeCloseTo(direction[2], 12);
    expect(material).toContain('nodes.outlineScale.x, float(1), nodes.outlineScale.y');
    expect(flock).toContain('packed[packedAt + 2] = scaleY / shape[shapeAt]!');
    expect(flock).toContain('packed[packedAt + 3] = scaleY / shape[shapeAt + 2]!');
    expect(flock).toContain('motionValues[motionAt + 2] = ink / scaleY;');
    expect(flock).not.toContain('const outlineScale = useMemo');
  });

  it('keeps narrow head and leg ink lighter than the fleece silhouette', () => {
    const material = source('app/src/scene/flock/sheepMaterial.ts');

    expect(material).toContain('const OUTLINE_WOOL = 1.25;');
    expect(material).toContain('const OUTLINE_HEAD = 0.48;');
    expect(material).toContain('const OUTLINE_LEG = 0.28;');
    expect(material).not.toContain('OUTLINE_THIN');
    expect(material).toContain('mix(darkPartWidth, float(OUTLINE_WOOL), nodes.masks.x)');
  });

  it('breaks the lower terminator with one low-frequency fleece-form wave', () => {
    const material = source('app/src/scene/flock/sheepMaterial.ts');
    const colorSource = source('app/src/scene/flock/sheepColor.ts');

    expect(material).toContain('const FORM_WAVE_Z = 1.75;');
    expect(material).toContain('const FORM_WAVE_X = 2.1;');
    expect(material).toContain('const FORM_WAVE_DEPTH = 0.075;');
    expect(material).toContain('const FORM_PHASE_SPREAD = 11.7;');
    expect(material).toContain('.mul(nodes.masks.x)');
    expect(colorSource).toContain('const MOTTLE_BROAD = 0.68;');
    expect(colorSource).toContain('const MOTTLE_MID = 1.35;');
    expect(colorSource).toContain('broad.mul(float(0.88)).add(midOctave.mul(float(0.12)))');
  });

  it('opens one restrained key plane on the face and shanks but not the hooves', () => {
    const colorSource = source('app/src/scene/flock/sheepColor.ts');

    expect(colorSource).toContain('const DARK_KEY_PLANE = [0.065, 0.038, 0.024] as const;');
    expect(colorSource).toContain('bands.key.mul(float(0.75))');
    expect(colorSource).toContain('.mul(float(1).sub(hoof))');
  });

  it('uses the packed identity seed for one bounded fill-and-outline contour wave', () => {
    const material = source('app/src/scene/flock/sheepMaterial.ts');

    expect(material).toContain('const IDENTITY_CONTOUR_DEPTH = 0.028;');
    expect(material).toContain('const IDENTITY_CONTOUR_Z = 3.1;');
    expect(material).toContain('const IDENTITY_CONTOUR_PHASE = 9.73;');
    expect(material.match(/fleeceIdentityPosition\(positionLocal, nodes\)/g)).toHaveLength(2);
    expect(material).toContain('.mul(nodes.masks.x)');
  });

  it('constructs the TSL outline graph with one packed style attribute', () => {
    const style = new THREE.InstancedBufferAttribute(new Float32Array([1, 1, 1, 1]), 4);
    const motion = new THREE.InstancedBufferAttribute(new Float32Array(4), 4);
    const terrain = new THREE.InstancedBufferAttribute(new Float32Array(4), 4);
    const material = makeSheepOutlineMaterial(style, motion, uniform(1), terrain);

    expect(material.isMeshBasicNodeMaterial).toBe(true);
    expect(material.side).toBe(THREE.BackSide);
    expect(material.depthWrite).toBe(false);
    expect(material.positionNode).toBeDefined();
    material.dispose();
  });

  it('replaces separate wool puff hulls with one exterior fleece proxy', () => {
    const body = buildSheepGeometry();
    const outline = buildSheepOutlineGeometry(body);
    const masks = outline.getAttribute('uv');
    const exposure = outline.getAttribute('uv2');
    const index = outline.getIndex();
    let woolVertices = 0;
    let nonWoolVertices = 0;
    let proxyMinX = Infinity;
    let proxyMaxX = -Infinity;
    let bodyMinX = Infinity;
    let bodyMaxX = -Infinity;

    expect(index).not.toBeNull();
    expect(index!.count % 3).toBe(0);
    expect(index!.count).toBeLessThan(body.getIndex()!.count);
    expect(outline.getAttribute('position').count).toBeLessThan(2_100);
    expect(index!.count / 3).toBeLessThan(900);
    for (let i = 0; i < masks.count; i++) {
      if (masks.getX(i) > 0.5) {
        woolVertices += 1;
        expect(exposure.getX(i)).toBe(1);
        proxyMinX = Math.min(proxyMinX, outline.getAttribute('position').getX(i));
        proxyMaxX = Math.max(proxyMaxX, outline.getAttribute('position').getX(i));
      } else {
        nonWoolVertices += 1;
      }
    }
    const bodyWoolPosition = body.getAttribute('position');
    const bodyMasks = body.getAttribute('uv');
    for (let i = 0; i < bodyWoolPosition.count; i++) {
      if (bodyMasks.getX(i) <= 0.5) continue;
      bodyMinX = Math.min(bodyMinX, bodyWoolPosition.getX(i));
      bodyMaxX = Math.max(bodyMaxX, bodyWoolPosition.getX(i));
    }
    expect(woolVertices).toBeGreaterThan(30);
    expect(nonWoolVertices).toBeGreaterThan(100);
    expect((proxyMaxX - proxyMinX) / (bodyMaxX - bodyMinX)).toBeGreaterThan(0.94);
    expect((proxyMaxX - proxyMinX) / (bodyMaxX - bodyMinX)).toBeLessThan(1);
    expect(Object.keys(outline.attributes).sort()).toEqual(['normal', 'position', 'uv', 'uv1', 'uv2']);

    const position = outline.getAttribute('position');
    let longestTriangleEdge = 0;
    for (let i = 0; i < index!.count; i += 3) {
      const triangle = [index!.getX(i), index!.getX(i + 1), index!.getX(i + 2)];
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
        const from = triangle[a]!;
        const to = triangle[b]!;
        longestTriangleEdge = Math.max(longestTriangleEdge, Math.hypot(
          position.getX(from) - position.getX(to),
          position.getY(from) - position.getY(to),
          position.getZ(from) - position.getZ(to),
        ));
      }
    }
    expect(longestTriangleEdge).toBeLessThan(0.8);

    const bodyPosition = body.getAttribute('position');
    const bodyIndex = body.getIndex()!;
    let longestBodyTriangleEdge = 0;
    for (let i = 0; i < bodyIndex.count; i += 3) {
      const triangle = [bodyIndex.getX(i), bodyIndex.getX(i + 1), bodyIndex.getX(i + 2)];
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
        const from = triangle[a]!;
        const to = triangle[b]!;
        longestBodyTriangleEdge = Math.max(longestBodyTriangleEdge, Math.hypot(
          bodyPosition.getX(from) - bodyPosition.getX(to),
          bodyPosition.getY(from) - bodyPosition.getY(to),
          bodyPosition.getZ(from) - bodyPosition.getZ(to),
        ));
      }
    }
    expect(longestBodyTriangleEdge).toBeLessThan(0.8);

    outline.dispose();
    body.dispose();
  });
});
