// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The sentence that travels with a shared link. The picture is the card.
// This is what a text shows before the preview arrives. "This week" is only
// for a run that just finished. An older run names its Monday.

import { translate } from '@app/i18n/store';
import { localizedOrdinal } from './runGroups';

/** `m:ss.s`. `182.85` seconds is `3:02.9`. */
export function formatCardClock(seconds: number): string {
  const tenths = Math.max(0, Math.round(seconds * 10 + 1e-6));
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}.${frac}`;
}

/** Japanese and Chinese close a sentence with their own wide stop and no space after it. */
function sentences(...parts: readonly string[]): string {
  return parts.reduce((text, part) => `${text}${/[。！？]$/.test(text) ? '' : ' '}${part}`);
}

export function cardShareTitle(clock: string, flockSize: number): string {
  return translate('share.title', { clock, count: flockSize });
}

export function completionShareText(input: {
  readonly clock: string;
  readonly flockSize: number;
  readonly weekRank?: number;
  readonly weekPlayers?: number;
  readonly newBest: boolean;
}): string {
  const lead = input.newBest ? [translate('share.newBest')] : [];
  const time = translate('share.time', { clock: input.clock, count: input.flockSize });
  if (input.weekRank === undefined || input.weekPlayers === undefined) return sentences(...lead, time);
  return sentences(...lead, time, translate('share.weekRank', { rank: localizedOrdinal(input.weekRank), players: input.weekPlayers }));
}

export function historyShareText(input: {
  readonly clock: string;
  readonly flockSize: number;
  readonly weekRank?: number;
  readonly weekPlayers?: number;
  readonly weekLabel?: string;
}): string {
  const time = translate('share.time', { clock: input.clock, count: input.flockSize });
  if (
    input.weekRank === undefined
    || input.weekPlayers === undefined
    || input.weekLabel === undefined
  ) return time;
  return sentences(time, translate('share.historyRank', { rank: localizedOrdinal(input.weekRank), players: input.weekPlayers, week: input.weekLabel }));
}

export type ShareOutcome = 'shared' | 'copied' | 'idle';

export async function sendShare(
  input: { readonly title: string; readonly text: string; readonly url: string },
  deps: {
    readonly share?: (data: { title: string; text: string; url: string }) => Promise<void>;
    readonly writeText?: (value: string) => Promise<void>;
  },
): Promise<ShareOutcome> {
  if (deps.share) {
    try {
      await deps.share({ title: input.title, text: input.text, url: input.url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'idle';
    }
  }
  if (!deps.writeText) return 'idle';
  try {
    await deps.writeText(`${input.text}\n${input.url}`);
    return 'copied';
  } catch {
    return 'idle';
  }
}

export function absoluteShareUrl(path: string, origin: string): string {
  return new URL(path, origin).href;
}
