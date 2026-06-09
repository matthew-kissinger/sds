// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * i18n Configuration
 * Internationalization setup using react-i18next.
 *
 * Runtime UI ships in 5 languages, matching the hreflang and JSON-LD
 * advertisements in index.html (truth-up: P1-L10N, 2026-06-09). Adding a
 * locale means a real translation in js/locales/, an entry in LANGUAGES
 * below, and a matching hreflang + schema line in index.html.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/index.js';
import es from './locales/es/index.js';
import pt from './locales/pt/index.js';
import ja from './locales/ja/index.js';
import zhCN from './locales/zh-CN/index.js';

export const LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', flag: '🇨🇳' },
];

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            es: { translation: es },
            pt: { translation: pt },
            ja: { translation: ja },
            'zh-CN': { translation: zhCN },
        },
        fallbackLng: 'en',
        debug: false,

        interpolation: {
            escapeValue: false
        },

        detection: {
            order: ['localStorage', 'navigator', 'htmlTag'],
            caches: ['localStorage'],
            lookupLocalStorage: 'sheepdog-language'
        }
    });

export default i18n;
