/**
 * i18n Configuration
 * Internationalization setup using react-i18next.
 *
 * Runtime UI ships in 5 languages. SEO hreflang tags in index.html still cover
 * 18 locales for crawler discovery. Expand runtime locales when a market shows
 * measurable organic traffic. (Cycle 3 trim, 2026-04-24.)
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
