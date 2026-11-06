// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import {
  localeFromSearch,
  localeFromTag,
  localeToOffer,
  resolveLocale,
  searchWithoutLang,
} from '../app/src/i18n/resolve';
import { formatSeconds, pluralKey, translate, translatePlural, useI18nStore } from '../app/src/i18n/store';
import { localizedOrdinal } from '../app/src/scores/runGroups';

describe('which language a page shows', () => {
  it('is English for anyone who has not chosen, whatever the browser says', () => {
    expect(resolveLocale({ search: '', saved: null })).toEqual({ code: 'en', source: 'default' });
  });

  it('honours a saved choice', () => {
    expect(resolveLocale({ search: '', saved: 'id' })).toEqual({ code: 'id', source: 'saved' });
    expect(resolveLocale({ search: '', saved: 'en' })).toEqual({ code: 'en', source: 'saved' });
  });

  it('lets ?lang= override a saved choice', () => {
    expect(resolveLocale({ search: '?lang=ko', saved: 'id' })).toEqual({ code: 'ko', source: 'url' });
    expect(resolveLocale({ search: '?seed=1&lang=en', saved: 'id' })).toEqual({ code: 'en', source: 'url' });
  });

  it('ignores a saved value or ?lang= this build does not have', () => {
    expect(resolveLocale({ search: '', saved: 'tlh' })).toEqual({ code: 'en', source: 'default' });
    expect(resolveLocale({ search: '?lang=tlh', saved: 'id' })).toEqual({ code: 'id', source: 'saved' });
    expect(resolveLocale({ search: '?lang=', saved: null })).toEqual({ code: 'en', source: 'default' });
  });
});

describe('language tags', () => {
  it('matches region variants to the one dictionary', () => {
    expect(localeFromTag('es-MX')).toBe('es');
    expect(localeFromTag('pt')).toBe('pt-BR');
    expect(localeFromTag('pt-PT')).toBe('pt-BR');
    expect(localeFromTag('de-AT')).toBe('de');
    expect(localeFromTag('ms-MY')).toBe('ms');
  });

  it('reads the withdrawn Indonesian tag', () => {
    expect(localeFromTag('in-ID')).toBe('id');
  });

  it('serves Simplified Chinese to Simplified readers only', () => {
    expect(localeFromTag('zh-CN')).toBe('zh-CN');
    expect(localeFromTag('zh')).toBe('zh-CN');
    expect(localeFromTag('zh-Hans-SG')).toBe('zh-CN');
    expect(localeFromTag('zh-TW')).toBeNull();
    expect(localeFromTag('zh-HK')).toBeNull();
    expect(localeFromTag('zh-Hant-CN')).toBeNull();
  });

  it('reads ?lang= in any case', () => {
    expect(localeFromSearch('?lang=ID')).toBe('id');
    expect(localeFromSearch('?lang=zh-cn')).toBe('zh-CN');
    expect(localeFromSearch('?seed=4')).toBeNull();
  });
});

describe('the address after ?lang=', () => {
  it('loses only lang, so the two documented parameters survive', () => {
    expect(searchWithoutLang('?lang=id')).toBe('');
    expect(searchWithoutLang('?seed=4&lang=id&debug=webgl')).toBe('?seed=4&debug=webgl');
    expect(searchWithoutLang('')).toBe('');
  });
});

describe('the language offer', () => {
  const offer = (over: Partial<Parameters<typeof localeToOffer>[0]>) =>
    localeToOffer({ search: '', saved: null, declined: null, languages: [], ...over });

  it('goes to a browser in a language the game has', () => {
    expect(offer({ languages: ['id-ID', 'en'] })).toBe('id');
    expect(offer({ languages: ['xx', 'ko-KR'] })).toBe('ko');
  });

  it('goes to nobody whose browser puts English first or has no language the game has', () => {
    expect(offer({ languages: ['en-US', 'id'] })).toBeNull();
    expect(offer({ languages: ['tlh'] })).toBeNull();
    expect(offer({ languages: ['zh-TW', 'en'] })).toBeNull();
    // The usual list on a Traditional system: bare `zh` must not bring Simplified back.
    expect(offer({ languages: ['zh-TW', 'zh', 'en-US', 'en'] })).toBeNull();
    expect(offer({ languages: ['zh-Hant-HK', 'zh'] })).toBeNull();
    expect(offer({ languages: ['zh-CN', 'zh'] })).toBe('zh-CN');
    expect(offer({ languages: [] })).toBeNull();
  });

  it('stops once there is any choice, including choosing English', () => {
    expect(offer({ languages: ['id'], saved: 'en' })).toBeNull();
    expect(offer({ languages: ['id'], saved: 'id' })).toBeNull();
    expect(offer({ languages: ['id'], search: '?lang=id' })).toBeNull();
  });

  it('is not repeated once declined', () => {
    expect(offer({ languages: ['id'], declined: 'id' })).toBeNull();
    expect(offer({ languages: ['ko'], declined: 'id' })).toBe('ko');
  });
});

describe('translation', () => {
  beforeEach(() => {
    useI18nStore.setState({ locale: 'en', t: useI18nStore.getInitialState().t, loadFailed: false });
  });

  it('is plain English until a dictionary is loaded', () => {
    expect(translate('title.playSolo')).toBe('Play solo');
    expect(translate('hud.penned', { count: 3, total: 25 })).toBe('3 of 25 sheep penned');
    expect(localizedOrdinal(12)).toBe('12th');
    expect(localizedOrdinal(21)).toBe('21st');
  });

  it('writes a decimal the way the language does', () => {
    expect(formatSeconds(83.42)).toBe('83.4');
    expect(formatSeconds(1234.5)).toBe('1234.5');
    useI18nStore.setState({ locale: 'fr' });
    expect(formatSeconds(83.42)).toBe('83,4');
  });

  it('leaves a hole it was not given a value for, so markup can be cut at it', () => {
    expect(translate('identity.runningAs').split('{name}')).toEqual(['Running as ', '']);
  });

  it('chooses the singular by the language rule', () => {
    expect(translatePlural('mine.runs', 1)).toBe('1 run');
    expect(translatePlural('mine.runs', 2)).toBe('2 runs');
  });

  it('sends a language with more plural categories to .other for everything but one', () => {
    useI18nStore.setState({ locale: 'ru' });
    expect(pluralKey('mine.runs', 1)).toBe('mine.runs.one');
    for (const count of [2, 5, 21, 25]) {
      // 21 is "one" to Russian's rule, and the dictionary writes it as "Забегов: 21".
      expect(['mine.runs.one', 'mine.runs.other']).toContain(pluralKey('mine.runs', count));
    }
    expect(pluralKey('mine.runs', 5)).toBe('mine.runs.other');
  });
});
