// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Steps a week token the server already resolved. The server is the
// authority for which Monday a token means; this only asks for the one before.

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

function utcWeekStart(ms: number): number {
  const date = new Date(ms);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return midnight - ((date.getUTCDay() + 6) % 7) * DAY_MS;
}

function formatIsoWeek(ms: number): string {
  const start = utcWeekStart(ms);
  const year = new Date(start + 3 * DAY_MS).getUTCFullYear();
  const week1 = utcWeekStart(Date.UTC(year, 0, 4));
  const week = Math.round((start - week1) / WEEK_MS) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The ISO week before `token`, or null when `token` is not one. */
export function previousIsoWeek(token: string): string | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(token);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const start = utcWeekStart(Date.UTC(year, 0, 4)) + (week - 1) * WEEK_MS;
  if (new Date(start + 3 * DAY_MS).getUTCFullYear() !== year) return null;
  return formatIsoWeek(start - DAY_MS);
}
