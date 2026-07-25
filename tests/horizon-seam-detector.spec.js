// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 114 Phase 7 - horizon-seam detector contract.
 *
 * The gate itself is a browser tool and cannot run in vitest. What can run here
 * is everything the gate decides WITH: where the bands go, what a step across
 * them measures, and when a score becomes a pass. Those are pure functions, and
 * pinning them is what stops the next agent from quietly widening a band or
 * softening a verdict to make a red run go green.
 *
 * The frames are synthetic on purpose. A fixture PNG would make this a test of
 * Cycle 112's captures, and those captures were measured to be unusable (see
 * the header of tools/validation/horizon-seam.mjs). A synthetic frame with a
 * known step is the only way to assert the detector reports the step it was
 * given.
 */
import { describe, it, expect } from 'vitest';
import {
  bandsFromCameraLines,
  bandsFromHorizonRow,
  scoreHorizonStep,
  sweepSeparation,
  frameMeanDiffCodeValues,
  verdict,
} from '../tools/validation/horizon-seam.mjs';

const W = 128;
const H = 200;

/**
 * A frame that is `skyRgb` above `horizonY` and `groundRgb` below it, in 8-bit
 * channels. Straight edge, no gradient, so the step the detector reports is the
 * step that was put in.
 */
function makeFrame(horizonY, skyRgb, groundRgb, { width = W, height = H } = {}) {
  const channels = 4;
  const data = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    const c = y < horizonY ? skyRgb : groundRgb;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return { data, width, height, channels };
}

const LEVEL_LINES = { horizonY: 100, terrainEdgeY: 114, fogFarY: 136, height: H };

describe('band geometry', () => {
  it('puts sky above the horizon and the fogged strip between terrain edge and fog.far', () => {
    const b = bandsFromCameraLines(LEVEL_LINES);
    expect(b.ok).toBe(true);
    // Sky band sits entirely above the horizon line.
    expect(b.sky[1]).toBeLessThan(LEVEL_LINES.horizonY);
    // Ground band sits entirely below the terrain edge and above fog.far.
    expect(b.ground[0]).toBeGreaterThan(LEVEL_LINES.terrainEdgeY);
    expect(b.ground[1]).toBeLessThanOrEqual(LEVEL_LINES.fogFarY);
    // The transition rows between horizon and terrain edge are never sampled.
    expect(b.sky[1]).toBeLessThan(b.ground[0]);
    for (let y = LEVEL_LINES.horizonY; y <= LEVEL_LINES.terrainEdgeY; y++) {
      expect(y > b.sky[1] && y < b.ground[0]).toBe(true);
    }
  });

  it('refuses a frame whose bands fall outside it rather than clamping them in', () => {
    // A top-down camera: the zero-pitch horizon is above the top of the picture.
    const b = bandsFromCameraLines({ horizonY: 4, terrainEdgeY: 18, fogFarY: 40, height: H });
    expect(b.ok).toBe(false);
    expect(b.reason).toMatch(/outside the frame/);
  });

  it('refuses when the terrain edge and fog.far project too close to leave a fogged strip', () => {
    const b = bandsFromCameraLines({ horizonY: 100, terrainEdgeY: 114, fogFarY: 119, height: H });
    expect(b.ok).toBe(false);
    expect(b.reason).toMatch(/fully-fogged strip/);
  });

  it('rejects a non-finite line instead of scoring NaN bands', () => {
    expect(bandsFromCameraLines({ ...LEVEL_LINES, horizonY: NaN }).ok).toBe(false);
    expect(bandsFromHorizonRow(NaN, H).ok).toBe(false);
  });
});

describe('step scoring', () => {
  it('reports the per-channel step it was given', () => {
    // Sky (100,150,200) against ground (120,150,180): per-channel mean of
    // |20|, |0|, |20| over 255 = 40/3/255 = 0.05229...
    const img = makeFrame(107, [100, 150, 200], [120, 150, 180]);
    const s = scoreHorizonStep(img, bandsFromHorizonRow(107, H));
    expect(s.ok).toBe(true);
    expect(s.step).toBeCloseTo((20 + 0 + 20) / 3 / 255, 6);
  });

  it('scores a converged horizon at zero', () => {
    const img = makeFrame(107, [130, 160, 190], [130, 160, 190]);
    const s = scoreHorizonStep(img, bandsFromHorizonRow(107, H));
    expect(s.step).toBe(0);
  });

  it('catches a colour step that luminance alone would miss', () => {
    // Blue sky against a pale terrain chosen to sit at the same luminance.
    // 0.2126*38 + 0.7152*143 + 0.0722*242 = 127.9; 0.2126*168+0.7152*115+0.0722*145 = 128.4
    const img = makeFrame(107, [38, 143, 242], [168, 115, 145]);
    const s = scoreHorizonStep(img, bandsFromHorizonRow(107, H));
    expect(s.lumStep).toBeLessThan(0.01);
    expect(s.step).toBeGreaterThan(0.2);
  });

  it('does not let a minority of broken columns carry the score', () => {
    // A converged horizon with a treeline breaking the skyline in 25% of
    // columns. The broken run is 4 wide on a 16 pitch rather than every 4th
    // column: the sampler strides by 4, so an every-4th pattern would land on
    // the broken columns and only the broken columns, which tests aliasing
    // rather than the median.
    const img = makeFrame(107, [130, 160, 190], [130, 160, 190]);
    for (let x = 0; x < W; x++) {
      if (x % 16 >= 4) continue;
      for (let y = 80; y < 107; y++) {
        const i = (y * W + x) * 4;
        img.data[i] = 20; img.data[i + 1] = 60; img.data[i + 2] = 10;
      }
    }
    const s = scoreHorizonStep(img, bandsFromHorizonRow(107, H));
    expect(s.step).toBe(0);
  });

  it('refuses rather than scores when too few columns are sampleable', () => {
    const img = makeFrame(107, [100, 150, 200], [120, 150, 180], { width: 32 });
    // inset 0.45 leaves ~3 columns at the sampling stride.
    const s = scoreHorizonStep(img, bandsFromHorizonRow(107, H), { inset: 0.45 });
    expect(s.ok).toBe(false);
    expect(s.reason).toMatch(/sampleable columns/);
  });
});

describe('verdict', () => {
  const ok = (step) => ({ ok: true, step });

  it('passes only when the shipped step is a small residual of the control', () => {
    expect(verdict(ok(0.02), ok(0.40)).pass).toBe(true);
  });

  it('fails a shipped step over a quarter of the control', () => {
    const v = verdict(ok(0.15), ok(0.40));
    expect(v.pass).toBe(false);
    expect(v.kind).toBe('seam');
  });

  it('fails, not passes, when the frame cannot be measured', () => {
    const v = verdict({ ok: false, reason: 'bands outside the frame' }, ok(0.4));
    expect(v.pass).toBe(false);
    expect(v.kind).toBe('unmeasurable');
  });

  it('fails when the control did not move the frame', () => {
    // Cycle 112's three Classic captures: an A/B under one code value.
    const v = verdict(ok(0.001), ok(0.004));
    expect(v.pass).toBe(false);
    expect(v.kind).toBe('unproven');
  });

  it('fails when the known-bad does not score worse than the shipped frame', () => {
    // The Rolling Hills failure that stopped Cycle 112 promoting its reporter.
    const v = verdict(ok(0.088), ok(0.066));
    expect(v.pass).toBe(false);
    expect(v.kind).toBe('unproven');
  });

  it('holds the absolute backstop when a huge control would otherwise wave a seam through', () => {
    const v = verdict(ok(0.20), ok(0.90));
    expect(v.pass).toBe(false);
    expect(v.kind).toBe('seam');
  });
});

describe('fixture separation sweep', () => {
  it('separates a genuine pair at every row that carries a boundary', () => {
    // after: sky and distant ground converged, the shipped state.
    // before: the same sky over ground painted the wrong colour, the defect.
    const after = makeFrame(107, [130, 160, 190], [130, 160, 190]);
    const before = makeFrame(107, [130, 160, 190], [220, 220, 220]);
    const sweep = sweepSeparation(after, before, { inset: 0 });
    expect(sweep.rows).toBeGreaterThan(5);
    expect(sweep.fraction).toBe(1);
    // The bar the fixture check holds pairs to has to be clearable by a pair
    // that genuinely carries the defect, or the check is rigged to fail.
    expect(sweep.fraction).toBeGreaterThanOrEqual(0.9);
  });

  it('excludes rows where neither frame reads a boundary rather than counting them against the pair', () => {
    const after = makeFrame(107, [130, 160, 190], [130, 160, 190]);
    const before = makeFrame(107, [130, 160, 190], [220, 220, 220]);
    const sweep = sweepSeparation(after, before, { inset: 0 });
    // Most of a 200px frame is flat sky or flat ground; only rows straddling
    // the boundary can say anything.
    expect(sweep.skipped).toBeGreaterThan(sweep.rows);
  });

  it('does not separate two frames that differ only by noise', () => {
    const after = makeFrame(107, [130, 160, 190], [90, 120, 70]);
    const before = makeFrame(107, [130, 160, 190], [90, 120, 70]);
    before.data[(150 * W + 10) * 4] = 255;
    const sweep = sweepSeparation(after, before, { inset: 0 });
    expect(sweep.fraction).toBeLessThan(0.9);
  });
});

describe('frame difference', () => {
  it('measures an unchanged pair at zero code values', () => {
    const a = makeFrame(107, [130, 160, 190], [90, 120, 70]);
    const b = makeFrame(107, [130, 160, 190], [90, 120, 70]);
    expect(frameMeanDiffCodeValues(a, b)).toBe(0);
  });

  it('measures a uniform 30-code-value shift as 30', () => {
    const a = makeFrame(107, [100, 100, 100], [100, 100, 100]);
    const b = makeFrame(107, [130, 130, 130], [130, 130, 130]);
    expect(frameMeanDiffCodeValues(a, b)).toBeCloseTo(30, 6);
  });
});
