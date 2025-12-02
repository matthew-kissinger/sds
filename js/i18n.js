/**
 * i18n Configuration
 * Internationalization setup using react-i18next
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import en from './locales/en/index.js';
import es from './locales/es/index.js';
import pt from './locales/pt/index.js';
import ja from './locales/ja/index.js';
import de from './locales/de/index.js';
import fr from './locales/fr/index.js';
import zhCN from './locales/zh-CN/index.js';
import ko from './locales/ko/index.js';
import ru from './locales/ru/index.js';
import it from './locales/it/index.js';
import tr from './locales/tr/index.js';
import pl from './locales/pl/index.js';
import nl from './locales/nl/index.js';
import ar from './locales/ar/index.js';
import id from './locales/id/index.js';
import hi from './locales/hi/index.js';
import th from './locales/th/index.js';
import fil from './locales/fil/index.js';

// Available languages configuration
export const LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', flag: '🇨🇳' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
    { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
    { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
    { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
    { code: 'fil', name: 'Filipino', nativeName: 'Filipino', flag: '🇵🇭' },
];

i18n
    // Detect user language
    .use(LanguageDetector)
    // Pass i18n instance to react-i18next
    .use(initReactI18next)
    // Initialize i18next
    .init({
        resources: {
            en: { translation: en },
            es: { translation: es },
            pt: { translation: pt },
            ja: { translation: ja },
            de: { translation: de },
            fr: { translation: fr },
            'zh-CN': { translation: zhCN },
            ko: { translation: ko },
            ru: { translation: ru },
            it: { translation: it },
            tr: { translation: tr },
            pl: { translation: pl },
            nl: { translation: nl },
            ar: { translation: ar },
            id: { translation: id },
            hi: { translation: hi },
            th: { translation: th },
            fil: { translation: fil }
        },
        fallbackLng: 'en',
        debug: false,

        interpolation: {
            escapeValue: false // React already escapes values
        },

        detection: {
            // Order of language detection
            order: ['localStorage', 'navigator', 'htmlTag'],
            // Cache user language preference
            caches: ['localStorage'],
            lookupLocalStorage: 'sheepdog-language'
        }
    });

export default i18n;
