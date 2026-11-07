// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A language ships complete or not at all (spec/15-languages.md). These hold every
// dictionary to the English keys, its placeholders, the widths of fixed-size
// controls and the project's rules for player-facing prose. They cannot say
// whether a translation is good; docs/translations/ is for that.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../app/src/i18n/locales/en.json';
import context from '../app/src/i18n/context.json';
import { LOCALES } from '../app/src/i18n/resolve';

const read = (path: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../app/src/i18n/${path}`, import.meta.url), 'utf8'));

const translated = LOCALES.filter((locale) => locale.code !== 'en');

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
/** Hangul, kana and CJK ideographs take about twice the width of a Latin letter. */
const displayWidth = (text: string) =>
  [...text].reduce((width, char) => width + (/[ᄀ-ᇿ぀-ヿ㐀-鿿가-힯＀-￯]/.test(char) ? 2 : 1), 0);

// The project's rules for prose (AGENTS.md), plus copy the owner ruled out:
// no app exists, phone support is not established on a real device, and nothing has
// been certified.
const BANNED = /[!！¡\p{Extended_Pictographic}]|\b(apk|android|handphone|smartphone|handy|ponsel|hp)\b|telefon|mudah alih|profesional|professional|m[oó]vil|mobil|celular|telem[oó]vel|t[ée]l[ée]phone|портатив|телефон|смартфон|мобильн|휴대폰|스마트폰|핸드폰|スマホ|スマートフォン|携帯|モバイル|手机|移动端/iu;

describe.each(translated)('$code dictionary', ({ code }) => {
  const dictionary = read(`locales/${code}.json`);

  it('has exactly the English keys in the same order', () => {
    expect(Object.keys(dictionary)).toEqual(Object.keys(en));
  });

  it('fills every string', () => {
    for (const [key, value] of Object.entries(dictionary)) expect(value.trim(), key).not.toBe('');
  });

  it('keeps the placeholders the code fills in', () => {
    for (const [key, value] of Object.entries(dictionary)) {
      if (key === 'format.ordinal') {
        expect(placeholders(value), key).toEqual(['n']);
      } else {
        expect(placeholders(value), key).toEqual(placeholders((en as Record<string, string>)[key]!));
      }
    }
  });

  it('fits fixed-size controls', () => {
    for (const [key, limit] of Object.entries(context.limits)) {
      expect(displayWidth(dictionary[key]!), `${key}: "${dictionary[key]}"`).toBeLessThanOrEqual(limit);
    }
  });

  it('holds to the rules for player-facing prose', () => {
    for (const [key, value] of Object.entries(dictionary)) {
      expect(BANNED.test(value), `${key}: "${value}"`).toBe(false);
    }
  });

  it('is not English left in place', () => {
    // Proper nouns and loanwords legitimately match. A language with most of its
    // strings identical to English is a placeholder that slipped through.
    const same = Object.keys(en).filter((key) => dictionary[key] === (en as Record<string, string>)[key]);
    expect(same.length, same.join(', ')).toBeLessThan(40);
  });

  it('names the language it offers', () => {
    expect(dictionary['offer.prompt']).not.toBe(en['offer.prompt']);
  });
});

describe('English dictionary', () => {
  it('draws no character that would fetch an on-demand font', () => {
    for (const value of Object.values(en)) expect(value).not.toMatch(/[¡-¶¸-ÿŒœŸЁА-ё‚„№]/);
  });

  it('describes every key to a reviewer', () => {
    const prefixes = Object.keys(context.prefixes);
    for (const key of Object.keys(en)) {
      expect(prefixes.some((prefix) => key.startsWith(prefix)), key).toBe(true);
    }
  });
});

describe('the page English players land on', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');

  it('keeps its English head and offers no other version to search engines', () => {
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Sheepdog Sim - Free Sheep Herding Browser Game</title>');
    expect(html).toContain('name="description" content="Play Sheepdog Sim, a free browser herding game. Guide 25, 75 or 200 sheep through one field with keyboard, gamepad or touch controls."');
    expect(html).toContain('rel="canonical" href="https://sheepdogsim.com/"');
    expect(html).not.toContain('hreflang');
  });
});
