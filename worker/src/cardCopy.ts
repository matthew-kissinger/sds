// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The words on the card. The picture, the page, and the Open Graph tags all
// read from here so a rank cannot be phrased two ways.

const ONES = ['th', 'st', 'nd', 'rd'] as const;

/** "9th", "11th", "22nd". */
export function formatOrdinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${ONES[value % 10] ?? 'th'}`;
}

/**
 * `m:ss.s` from seconds. Rounds through integer tenths. `182.85` is `3:02.9`,
 * which `Number#toFixed` does not promise.
 */
export function formatClock(seconds: number): string {
  const tenths = Math.max(0, Math.round(seconds * 10 + 1e-6));
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}.${frac}`;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export interface CardFacts {
  readonly name: string;
  readonly sheepCount: 25 | 75 | 200;
  readonly scoreSeconds: number;
  readonly allTimeRank: number;
  readonly allTimePlayers: number;
  readonly weekRank: number;
  readonly weekPlayers: number;
  /** `week of 19 Oct` */
  readonly weekLabel: string;
}

export function cardTitle(facts: CardFacts): string {
  return `${formatClock(facts.scoreSeconds)} · ${facts.sheepCount} sheep`;
}

/** Week first. The picture carries the same two ranks without the field sizes. */
export function cardDescription(facts: CardFacts): string {
  const week = `${formatOrdinal(facts.weekRank)} of ${facts.weekPlayers} in the ${facts.weekLabel}`;
  const allTime = `${formatOrdinal(facts.allTimeRank)} of ${facts.allTimePlayers} all-time`;
  return `${week}. ${allTime}.`;
}

export function playLabel(sheepCount: 25 | 75 | 200): string {
  return `Play ${sheepCount} sheep`;
}
