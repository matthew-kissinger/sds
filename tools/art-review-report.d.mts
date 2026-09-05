// SPDX-License-Identifier: AGPL-3.0-or-later
export interface Comparison {
  name: string;
  comparable: boolean;
  reasons: string[];
  p95DeltaMs: number | null;
}
export function compareReports(baseline: object, candidate: object): Comparison[];
export function renderArtReview(report: object, baseline: object | null, review: object, sources: object[]): string;
