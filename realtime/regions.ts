// SPDX-License-Identifier: AGPL-3.0-or-later
export const REGIONS = { na: 'enam', eu: 'weur', apac: 'apac' } as const;
export type Region = keyof typeof REGIONS;
export function isRegion(value: unknown): value is Region {
  return typeof value === 'string' && Object.hasOwn(REGIONS, value);
}
export function regionOf(handle: string): Region | null {
  const region = handle.split('_')[0];
  return isRegion(region) && /^(na|eu|apac)_[a-f0-9]{32}$/.test(handle) ? region : null;
}
export function randomKey(): string { return crypto.randomUUID().replaceAll('-', ''); }
