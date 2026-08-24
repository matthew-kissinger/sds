export interface FramePacingSummary {
  readonly samples: number;
  readonly p95: number;
  readonly max: number;
}

export interface FramePacingChecks {
  readonly frames: boolean;
  readonly freezeFree: boolean;
}

export interface MobileEmulationProfile {
  readonly cpuSlowdown: number;
  readonly latencyMs: number;
  readonly downloadMbps: number;
  readonly uploadMbps: number;
}

export const MAX_RAF_GAP_MS: number;
export const MAX_STARTUP_RAF_GAP_MS: number;
export const MID_MOBILE_PROFILE: Readonly<MobileEmulationProfile>;

export function evaluateFramePacing(
  runtime: FramePacingSummary,
  startup: FramePacingSummary,
  frameBudgetMs: number,
  startupTimedOut?: boolean,
): FramePacingChecks;

export function requestedBackendMatches(requested: string, actual: string): boolean;

export function drawCallsWithinBudget(
  summary: Pick<FramePacingSummary, 'samples' | 'p95'>,
): boolean;

export function failureCollectionsAreEmpty(
  ...collections: ReadonlyArray<unknown>[]
): boolean;
