// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector4 } from 'three/webgpu';
import { projectGate } from '@app/ui/gateProjection';
import { buildGateOpeningGeometry } from '@app/scene/gateOpeningGeometry';

function clipAt(x: number, y: number, z: number) {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.5, 1200);
  camera.updateMatrixWorld();
  return new Vector4(x, y, z, 1).applyMatrix4(camera.matrixWorldInverse)
    .applyMatrix4(camera.projectionMatrix);
}

describe('gate guidance camera projection', () => {
  it('anchors a visible destination and preserves terrain-occlusion status', () => {
    const cue = projectGate(clipAt(0, 0, -100), 1600, 900, 100, true);
    expect(cue.onScreen).toBe(true);
    expect(cue.obscured).toBe(true);
    expect(cue.y).toBeLessThan(450);
  });

  it('treats a gate near the viewport edge as visible despite HUD insets', () => {
    const cue = projectGate({ x: -0.94, y: 0, w: 1 }, 1600, 900, 20);
    expect(cue.onScreen).toBe(true);
    expect(cue.x).toBeCloseTo(48);
  });

  it('keeps the opening centre clear and samples every marker vertex above terrain', () => {
    const groundY = (x: number, z: number) => x * 0.03 + z * 0.01;
    const geometry = buildGateOpeningGeometry(groundY);
    const positions = geometry.getAttribute('position');
    expect(positions.count / 3).toBe(16);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      expect(Math.abs(x)).toBeGreaterThan(2.4);
      expect(positions.getY(i) - groundY(x, z)).toBeGreaterThan(0.07);
      expect(z).toBeGreaterThanOrEqual(98.69);
      expect(z).toBeLessThanOrEqual(102.71);
    }
    geometry.dispose();
  });

  it('points to the correct side when the destination is behind the lens', () => {
    const left = projectGate(clipAt(-20, 0, 50), 1600, 900, 100);
    const right = projectGate(clipAt(20, 0, 50), 1600, 900, 100);
    expect(left.onScreen).toBe(false);
    expect(left.x).toBeLessThan(800);
    expect(right.x).toBeGreaterThan(800);
  });

  it('keeps a stable finite turn cue directly behind and on the camera plane', () => {
    for (const z of [0, 0.001, 100]) {
      const cue = projectGate(clipAt(0, 0, z), 390, 844, 20);
      expect(cue.onScreen).toBe(false);
      expect([cue.x, cue.y, cue.angle].every(Number.isFinite)).toBe(true);
      expect(cue.x).toBeGreaterThan(195);
    }
  });

  it('keeps offscreen targets inside the safe cue region across viewports', () => {
    for (const [width, height] of [[390, 844], [844, 390], [2560, 1440]]) {
      for (const [x, y] of [[-100, 0], [100, 0], [0, 100], [0, -100]]) {
        const cue = projectGate(clipAt(x!, y!, -1), width!, height!, 90);
        expect(cue.onScreen).toBe(false);
        expect(cue.x).toBeGreaterThanOrEqual(80);
        expect(cue.x).toBeLessThanOrEqual(width! - (height! < 500 ? 200 : 80));
        expect(cue.y).toBeGreaterThanOrEqual(110);
        expect(cue.y).toBeLessThanOrEqual(height! - (width! < 600 ? 240 : height! < 500 ? 108 : 70));
      }
    }
  });
});
