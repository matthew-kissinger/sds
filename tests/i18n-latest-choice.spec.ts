// SPDX-License-Identifier: AGPL-3.0-or-later
// A dictionary that lands late must not undo a newer choice. tools/i18n-probe.mjs
// checks the same thing in a browser, which CI does not have.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => {
  const hold = () => {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => { open = resolve; });
    return { open, opened };
  };
  return { slow: hold(), failing: hold() };
});

vi.mock('../app/src/i18n/locales/ko.json', async () => {
  await gate.slow.opened;
  return { default: { 'title.playSolo': 'late' } };
});
vi.mock('../app/src/i18n/locales/ja.json', async () => {
  await gate.failing.opened;
  throw new Error('chunk failed');
});

const saved = new Map<string, string>();
const CHOICE = 'sheepdog.language.v1';

beforeEach(() => {
  vi.stubGlobal('document', { documentElement: { lang: 'en' } });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value); },
  });
});

describe('choosing a language', () => {
  it('keeps the newest choice when an older dictionary lands after it', async () => {
    const { activeLocale, chooseLocale } = await import('../app/src/i18n/store');
    const overtaken = chooseLocale('ko');
    expect(await chooseLocale('de')).toBe(true);
    gate.slow.open();
    expect(await overtaken).toBe(false);
    expect(activeLocale()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(saved.get(CHOICE)).toBe('de');
  });

  it('says nothing about an older dictionary failing after a newer choice', async () => {
    const { chooseLocale, useI18nStore } = await import('../app/src/i18n/store');
    const overtaken = chooseLocale('ja');
    expect(await chooseLocale('es')).toBe(true);
    gate.failing.open();
    expect(await overtaken).toBe(false);
    expect(useI18nStore.getState().loadFailed).toBe(false);
    expect(saved.get(CHOICE)).toBe('es');
  });
});
