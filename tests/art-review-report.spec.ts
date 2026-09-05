// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { compareReports, renderArtReview } from '../tools/art-review-report.mjs';

function receipt() {
  return { label: 'baseline', seed: 42, flockSize: 200, sampleTick: 300,
    build: { stableDuringProbe: true }, results: [{ name: 'art-follow-webgpu',
      viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1,
      camera: 'follow', backend: 'webgpu', requestedBackend: 'webgpu',
      quality: { requested: 'high', tier: 'high' }, canvas: { bufferWidth: 2560, bufferHeight: 1440 },
      emulation: null, runtime: { seconds: 60, frameBudgetMs: 16.7, frameTimes: { p95: 12 } },
      boot: { budgetMs: 2000 }, screenshot: 'C:\\capture\\art-follow-webgpu.png',
      pass: false, checks: { boot: false },
    }] };
}

describe('art review evidence', () => {
  it('only computes performance deltas for matching measurement settings', () => {
    const baseline = receipt();
    const candidate = receipt();
    candidate.results[0]!.runtime.frameTimes.p95 = 14;
    expect(compareReports(baseline, candidate)[0]).toMatchObject({ comparable: true, p95DeltaMs: 2 });
    candidate.results[0]!.runtime.seconds = 5;
    expect(compareReports(baseline, candidate)[0]).toMatchObject({ comparable: false, p95DeltaMs: null });
  });
  it('rejects missing scenarios, failed captures and unstable builds', () => {
    const baseline = receipt();
    const candidate = receipt();
    candidate.results = [];
    expect(compareReports(baseline, candidate)[0]!.comparable).toBe(false);
    expect(compareReports(baseline, { ...baseline, results: [{ name: 'art-follow-webgpu', error: 'crash' }] })[0]!.comparable).toBe(false);
    baseline.build.stableDuringProbe = false;
    expect(compareReports(baseline, baseline)[0]!.comparable).toBe(false);
  });
  it('does not compare two equally unverified camera or quality settings', () => {
    const baseline = receipt();
    baseline.results[0]!.quality.tier = 'unverified';
    expect(compareReports(baseline, baseline)[0]!.comparable).toBe(false);
  });
  it('shows failures, limitations and portable side-by-side captures without injecting HTML', () => {
    const baseline = receipt();
    const html = renderArtReview(baseline, baseline, { label: '<script>', duration: 5,
      releaseExit: 1, profileExit: 1, sourceStable: true, artVerdict: 'UNREVIEWED',
      physicalMobile: 'NOT_TESTED', comparison: compareReports(baseline, baseline), note: 'Emulation only',
    }, []);
    expect(html).toContain('../baseline/art-follow-webgpu.png');
    expect(html).toContain('FAILED: boot');
    expect(html).toContain('SHORT ITERATION RUN');
    expect(html).toContain('NOT_TESTED');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
