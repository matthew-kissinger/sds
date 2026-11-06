// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Which language a page shows. Pure, so the rule spec/15-languages.md promises is
// testable without a browser: `/` is English unless this player has saved a choice
// or the address carries `?lang=`. The browser's language never switches anything;
// it only decides whether the title screen offers a language. Nothing here redirects.

import locales from './locales.json';

export type LocaleCode = 'en' | 'id' | 'ms' | 'ko' | 'ja' | 'zh-CN' | 'es' | 'pt-BR' | 'fr' | 'de' | 'ru';
export type LocaleSource = 'url' | 'saved' | 'default';

export interface LocaleInfo {
  readonly code: LocaleCode;
  readonly nativeName: string;
  readonly reviewed: boolean;
  readonly credit?: { readonly text: string; readonly url: string };
}

export const LOCALES = locales as readonly LocaleInfo[];
export const DEFAULT_LOCALE: LocaleCode = 'en';

const byCode = new Map(LOCALES.map((locale) => [locale.code as string, locale]));

export function isLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && byCode.has(value);
}

export function localeInfo(code: LocaleCode): LocaleInfo {
  return byCode.get(code)!;
}

const isTraditionalChinese = (tag: string) => /^zh(-[a-z0-9]+)*-(hant|tw|hk|mo)(-|$)/i.test(tag);

/**
 * The language a tag such as `pt-PT` or `zh-Hans-SG` falls under, if the game has
 * it. Region variants share a dictionary, with one exception: Traditional Chinese
 * readers are not treated as though Simplified were their language.
 */
export function localeFromTag(tag: string): LocaleCode | null {
  const lower = tag.toLowerCase();
  const primary = lower.split('-')[0];
  if (primary === 'zh') return isTraditionalChinese(lower) ? null : 'zh-CN';
  if (primary === 'pt') return 'pt-BR';
  // `in` is the withdrawn tag for Indonesian, which old Android WebViews still report.
  if (primary === 'in') return 'id';
  return isLocale(primary) ? primary : null;
}

/** `?lang=<code>`, when it names a language this build has. */
export function localeFromSearch(search: string): LocaleCode | null {
  const value = new URLSearchParams(search).get('lang');
  return value === null ? null : localeFromTag(value);
}

/** The address without `lang`, so a later choice in the picker survives a reload. */
export function searchWithoutLang(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('lang');
  const rest = params.toString();
  return rest === '' ? '' : `?${rest}`;
}

export function resolveLocale(input: {
  readonly search: string;
  readonly saved: unknown;
}): { readonly code: LocaleCode; readonly source: LocaleSource } {
  const fromUrl = localeFromSearch(input.search);
  if (fromUrl !== null) return { code: fromUrl, source: 'url' };
  if (isLocale(input.saved)) return { code: input.saved, source: 'saved' };
  return { code: DEFAULT_LOCALE, source: 'default' };
}

/**
 * The language to offer on the title screen, or null. Only for someone who has
 * made no choice and has not turned this offer down. The first browser language
 * the game has decides, so a browser that puts English first is offered nothing.
 */
export function localeToOffer(input: {
  readonly search: string;
  readonly saved: unknown;
  readonly declined: unknown;
  readonly languages: readonly string[];
}): LocaleCode | null {
  if (localeFromSearch(input.search) !== null || isLocale(input.saved)) return null;
  for (const language of input.languages) {
    // A browser in Traditional usually lists bare `zh` next, which is not an invitation.
    if (isTraditionalChinese(language)) return null;
    const code = localeFromTag(language);
    if (code === null) continue;
    return code === DEFAULT_LOCALE || code === input.declined ? null : code;
  }
  return null;
}
