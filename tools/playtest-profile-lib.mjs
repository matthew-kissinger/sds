// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/** Active-play gaps above this are visible freezes even when p95 is green. */
export const MAX_RAF_GAP_MS = 100;

/**
 * Cold browser and media initialization has a slightly wider ceiling. Exact
 * traces found one atomic AudioContext task around 75 ms; launch scheduling can
 * place it across a 100-120 ms rAF interval even though no frame has yet been
 * offered to the player. 150 ms still rejects the former 1.7 s pipeline stall
 * while keeping the active-play ceiling at 100 ms.
 */
export const MAX_STARTUP_RAF_GAP_MS = 150;

/** Shared mid-mobile boot/perf profile from spec/08's 4G acceptance path. */
export const MID_MOBILE_PROFILE = Object.freeze({
  cpuSlowdown: 4,
  latencyMs: 40,
  downloadMbps: 9,
  uploadMbps: 3,
});

/**
 * Keep the percentile budget and the catastrophic-gap budget independent.
 * A single multi-second stall can sit below p95 in a long run, so neither check
 * is a substitute for the other.
 */
export function evaluateFramePacing(runtime, startup, frameBudgetMs, startupTimedOut = false) {
  const hasRuntimeSamples = runtime.samples > 0;
  const hasStartupSamples = startup.samples > 0;
  return {
    frames: hasRuntimeSamples && runtime.p95 <= frameBudgetMs,
    freezeFree: hasRuntimeSamples
      && hasStartupSamples
      && !startupTimedOut
      && runtime.max <= MAX_RAF_GAP_MS
      && startup.max <= MAX_STARTUP_RAF_GAP_MS,
  };
}

export function requestedBackendMatches(requested, actual) {
  return requested === actual;
}

export function drawCallsWithinBudget(summary) {
  return summary.samples > 0 && summary.p95 > 0 && summary.p95 < 100;
}

export function failureCollectionsAreEmpty(...collections) {
  return collections.every((collection) => collection.length === 0);
}
