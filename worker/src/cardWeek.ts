// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// A score week is Monday 00:00 UTC through the next Monday. The name is the
// Monday, so a run keeps its week after that week has closed.

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface ResolvedWeek {
  readonly start: number;
  readonly end: number;
  readonly token: string;
  readonly label: string;
}

/** Monday 00:00 UTC of the week that contains `ms`. */
export function utcWeekStart(ms: number): number {
  const date = new Date(ms);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  return midnight - daysFromMonday * DAY_MS;
}

export function weekLabel(ms: number): string {
  const monday = new Date(utcWeekStart(ms));
  return `week of ${monday.getUTCDate()} ${MONTHS[monday.getUTCMonth()]}`;
}

/** ISO week of the Monday that contains `ms`. Week 1 holds 4 January. */
export function formatIsoWeek(ms: number): string {
  const start = utcWeekStart(ms);
  const thursday = start + 3 * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week1 = utcWeekStart(Date.UTC(year, 0, 4));
  const week = Math.round((start - week1) / WEEK_MS) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * `2026-W43` is that ISO week. Week 53 is refused in a year that does not
 * have one, so a typo cannot select a Monday that belongs to another year.
 */
export function parseIsoWeek(value: string): { start: number; end: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const week1 = utcWeekStart(Date.UTC(year, 0, 4));
  const start = week1 + (week - 1) * WEEK_MS;
  if (new Date(start + 3 * DAY_MS).getUTCFullYear() !== year) return null;
  return { start, end: start + WEEK_MS };
}

/** `current` uses `now`. Anything else must be an ISO week token. */
export function resolveWeek(value: string, now: number): ResolvedWeek | null {
  if (value === 'current') {
    const start = utcWeekStart(now);
    return { start, end: start + WEEK_MS, token: formatIsoWeek(now), label: weekLabel(now) };
  }
  const parsed = parseIsoWeek(value);
  if (!parsed) return null;
  return { ...parsed, token: value, label: weekLabel(parsed.start) };
}
