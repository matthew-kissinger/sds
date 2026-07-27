// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function buildPlayStartUrl(baseUrl, args, entry) {
  const url = new URL(baseUrl);
  url.searchParams.delete('perfMode');
  url.searchParams.set('probeRender', '1');
  url.searchParams.set('playStartProbe', '1');
  url.searchParams.set('renderer', args.renderer);
  if (args.perfMode) url.searchParams.set('perfMode', '1');
  if (args.collisionProbe) url.searchParams.set('collisionProbe', '1');
  if (entry.flow === 'sandbox') url.hash = `s/${entry.sandboxHash}`;
  if (entry.diagnostic) {
    url.searchParams.set('scene', entry.sceneId);
    url.searchParams.set('autostart', '1');
    url.searchParams.set('mode', entry.rungId);
  }
  return url;
}

export function resolvePlayStartBudgets(base, entry) {
  if (entry.diagnostic) {
    return {
      ...base,
      coldInputResponsiveMs: 6000,
      coldSettledMs: 9000,
      maxPostPlayableLongTaskMs: 500,
      settledFrameP95Ms: 50,
    };
  }
  if (!entry.cpuStress) return base;
  return {
    ...base,
    coldInputResponsiveMs: base.stressColdInputResponsiveMs ?? base.coldInputResponsiveMs,
    warmInputResponsiveMs: base.stressWarmInputResponsiveMs ?? base.warmInputResponsiveMs,
    coldSettledMs: base.stressColdSettledMs ?? base.coldSettledMs,
    warmSettledMs: base.stressWarmSettledMs ?? base.warmSettledMs,
    settledFrameP95Ms: base.stressSettledFrameP95Ms ?? base.settledFrameP95Ms,
  };
}

export function findSettledAt({ frames, longTasks, inputResponsive, budgets }) {
  const lastBadTaskEnd = longTasks
    .filter((task) => task.startTime >= inputResponsive && task.duration > budgets.maxPostPlayableLongTaskMs)
    .reduce((latest, task) => Math.max(latest, task.startTime + task.duration), inputResponsive);
  const eligible = frames.filter((frame) => frame.at >= lastBadTaskEnd);
  for (let i = 0; i < eligible.length; i += 1) {
    const start = eligible[i].at;
    const minimumEnd = start + 2000;
    const endIndex = eligible.findIndex((frame, index) => index >= i && frame.at >= minimumEnd);
    if (endIndex < 0) continue;
    const window = eligible.slice(i, endIndex + 1);
    const p95 = percentile(window.map((frame) => frame.duration), 95);
    if (p95 <= budgets.settledFrameP95Ms) {
      return { at: eligible[endIndex].at, p95, frames: window.length };
    }
  }
  return null;
}
