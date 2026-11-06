// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The interface language. English ships in the bundle and every other dictionary
// is its own chunk, fetched only by a player who chose that language or is being
// offered it, so an English player downloads nothing here and waits for nothing.
// Interface text reads this store through `useT`; code outside React uses `translate`.

import { create } from 'zustand';
import en from './locales/en.json';
import {
  DEFAULT_LOCALE,
  localeFromSearch,
  localeToOffer,
  resolveLocale,
  searchWithoutLang,
  type LocaleCode,
  type LocaleSource,
} from './resolve';

export type MessageKey = keyof typeof en;
export type Messages = Readonly<Record<MessageKey, string>>;
type PluralBase<K = MessageKey> = K extends `${infer Base}.other` ? Base : never;
type Params = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, params?: Params) => string;

const CHOICE_KEY = 'sheepdog.language.v1';
const DECLINED_KEY = 'sheepdog.language-offer-declined.v1';
const DICTIONARY_WAIT_MS = 1500;

const DICTIONARIES: Readonly<Record<Exclude<LocaleCode, 'en'>, () => Promise<{ default: Messages }>>> = {
  id: () => import('./locales/id.json'),
  ms: () => import('./locales/ms.json'),
  ko: () => import('./locales/ko.json'),
  ja: () => import('./locales/ja.json'),
  'zh-CN': () => import('./locales/zh-CN.json'),
  es: () => import('./locales/es.json'),
  'pt-BR': () => import('./locales/pt-BR.json'),
  fr: () => import('./locales/fr.json'),
  de: () => import('./locales/de.json'),
  ru: () => import('./locales/ru.json'),
};

export interface LanguageOffer {
  readonly code: LocaleCode;
  readonly prompt: string;
  readonly accept: string;
  readonly decline: string;
}

interface I18nState {
  readonly locale: LocaleCode;
  readonly source: LocaleSource;
  readonly t: Translate;
  readonly loadFailed: boolean;
  readonly offer: LanguageOffer | null;
}

function translator(messages: Messages): Translate {
  return (key, params) => {
    // A dictionary is complete by test. The fallback covers a stale cached chunk.
    const template = messages[key] ?? en[key];
    if (params === undefined) return template;
    return template.replace(/\{(\w+)\}/g, (hole, name: string) => {
      const value = params[name];
      return value === undefined ? hole : String(value);
    });
  };
}

export const useI18nStore = create<I18nState>(() => ({
  locale: DEFAULT_LOCALE,
  source: 'default',
  t: translator(en),
  loadFailed: false,
  offer: null,
}));

export const useT = (): Translate => useI18nStore((state) => state.t);
export const useLocale = (): LocaleCode => useI18nStore((state) => state.locale);

export const translate: Translate = (key, params) => useI18nStore.getState().t(key, params);
export const activeLocale = (): LocaleCode => useI18nStore.getState().locale;

/** A singular and plural pair sharing a stem, chosen by the language's own rule. */
export function pluralKey(base: PluralBase, count: number): MessageKey {
  const category = new Intl.PluralRules(activeLocale()).select(count);
  return (category === 'one' ? `${base}.one` : `${base}.other`) as MessageKey;
}

export function translatePlural(base: PluralBase, count: number, params?: Params): string {
  return translate(pluralKey(base, count), { count, ...params });
}

export const isMessageKey = (key: string): key is MessageKey => key in en;

/** A duration in tenths of a second: "83.4" here, "83,4" where a comma is the decimal mark. */
export function formatSeconds(seconds: number): string {
  return new Intl.NumberFormat(activeLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }).format(seconds);
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // It still applies to this page; it just is not remembered.
  }
}

async function loadDictionary(code: LocaleCode): Promise<Messages> {
  return code === 'en' ? en : (await DICTIONARIES[code]()).default;
}

/** Only the newest request may apply, however late an older dictionary lands. */
let newestRequest = 0;

/** True if this language is now the interface's. False if a newer choice overtook it. */
async function activate(code: LocaleCode): Promise<boolean> {
  newestRequest += 1;
  const request = newestRequest;
  let messages: Messages;
  try {
    messages = await loadDictionary(code);
  } catch (error) {
    if (request !== newestRequest) return false;
    throw error;
  }
  if (request !== newestRequest) return false;
  useI18nStore.setState({ locale: code, t: translator(messages), loadFailed: false });
  document.documentElement.lang = code;
  return true;
}

/**
 * Fetches the offered language's own dictionary for the words of the offer, which
 * also makes accepting it instant. Nothing waits on this, and a player whose
 * browser is in English or in a language the game lacks never reaches the import.
 */
function prepareOffer(search: string): void {
  const code = localeToOffer({
    search,
    saved: read(CHOICE_KEY),
    declined: read(DECLINED_KEY),
    languages: navigator.languages ?? [],
  });
  if (code === null) return;
  void loadDictionary(code).then((messages) => {
    if (read(CHOICE_KEY) !== null) return;
    useI18nStore.setState({
      offer: { code, prompt: messages['offer.prompt'], accept: messages['offer.accept'], decline: messages['offer.decline'] },
    });
  }, () => undefined);
}

/**
 * Called once before the first render. Returns null for English, which stays
 * synchronous. Otherwise the promise settles when the dictionary has arrived or
 * after a short wait, whichever is first: a slow dictionary must not hold the game
 * back, so the interface starts in English and changes language when the chunk
 * lands. A failed chunk leaves English in place.
 */
export function startLocale(): Promise<void> | null {
  const { search, pathname, hash } = window.location;
  const fromUrl = localeFromSearch(search);
  // `?lang=` sets and saves the language, then leaves the address: a reload must
  // not undo a later choice in the picker, and `/` stays the one page there is.
  if (fromUrl !== null) write(CHOICE_KEY, fromUrl);
  if (new URLSearchParams(search).has('lang')) {
    window.history.replaceState(null, '', `${pathname}${searchWithoutLang(search)}${hash}`);
  }
  const { code, source } = resolveLocale({ search, saved: read(CHOICE_KEY) });
  useI18nStore.setState({ source });
  prepareOffer(search);
  if (code === DEFAULT_LOCALE) return null;
  const loaded = activate(code).then(() => undefined, (error: unknown) => {
    console.warn('language_load_failed', code, error);
  });
  return Promise.race([
    loaded,
    new Promise<void>((resolve) => { window.setTimeout(resolve, DICTIONARY_WAIT_MS); }),
  ]);
}

/** The picker's action. The language changes without a reload, so a run in progress survives. */
export async function chooseLocale(code: LocaleCode): Promise<boolean> {
  try {
    if (!await activate(code)) return false;
  } catch (error) {
    console.warn('language_load_failed', code, error);
    useI18nStore.setState({ loadFailed: true });
    return false;
  }
  write(CHOICE_KEY, code);
  useI18nStore.setState({ offer: null });
  return true;
}

export function declineOffer(): void {
  const { offer } = useI18nStore.getState();
  if (offer === null) return;
  write(DECLINED_KEY, offer.code);
  useI18nStore.setState({ offer: null });
}
