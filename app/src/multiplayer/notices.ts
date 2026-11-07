// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The room service answers in codes (`room_full`, `start_timeout`), which are
// protocol and stay English. These turn them into the player's language. A code
// newer than this client still reads as words in English, and elsewhere as a
// plain fallback rather than a stray English fragment.

import { activeLocale, isMessageKey, translate } from '@app/i18n/store';

const isCode = (message: string) => /^[a-z_ ]+$/.test(message);
const asWords = (code: string) => code.replaceAll('_', ' ');

/** A failed request's message for display. Text this client already wrote passes through. */
export function noticeText(message: string): string {
  if (!isCode(message)) return message;
  const key = `mp.notice.${message.replaceAll(' ', '_')}`;
  if (isMessageKey(key)) return translate(key);
  if (activeLocale() !== 'en') return translate('mp.notice.other');
  return asWords(message).replace(/^./, (first) => first.toUpperCase());
}

/** Why a match stopped, for "Match interrupted: ..." and the history list. */
export function reasonText(code: string): string {
  const key = `mp.reason.${code}`;
  if (isMessageKey(key)) return translate(key);
  return activeLocale() === 'en' ? asWords(code) : translate('mp.reason.other');
}
