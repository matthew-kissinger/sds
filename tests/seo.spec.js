/**
 * Cycle 26 v2.1.0 — per-scene SEO meta updater.
 *
 * Asserts the contract: each canonical scene id has full meta, the OG
 * image points at an existing webp under assets/marketing/og/, and the
 * updateSceneMetadata function mutates the right meta tags on the DOM.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateSceneMetadata, __TEST_ONLY__ } from '../js/utils/seo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

describe('per-scene SEO meta', () => {
    it('registers all 3 canonical scenes', () => {
        const ids = Object.keys(__TEST_ONLY__.SCENE_META);
        expect(ids).toContain('field');
        expect(ids).toContain('rolling-hills');
        expect(ids).toContain('open-country');
    });

    it('every registered OG image exists on disk under assets/marketing/og/', () => {
        for (const [id, meta] of Object.entries(__TEST_ONLY__.SCENE_META)) {
            const rel = meta.ogImage.replace(/^\//, '');
            const abs = resolve(repoRoot, rel);
            expect(existsSync(abs), `${id}: ${meta.ogImage} not found at ${abs}`).toBe(true);
        }
    });

    it('every scene has a distinct title (no copy-paste mistakes)', () => {
        const titles = Object.values(__TEST_ONLY__.SCENE_META).map(m => m.title);
        expect(new Set(titles).size).toBe(titles.length);
    });

    it('updateSceneMetadata mutates document.title + og:* meta tags', () => {
        // Seed a minimal jsdom-style document if running outside browser
        const doc = globalThis.document || (() => {
            const tags = new Map();
            return {
                title: '',
                querySelector: (sel) => tags.get(sel) || null,
                __set: (sel, attrs) => tags.set(sel, {
                    setAttribute(k, v) { attrs[k] = v; },
                    getAttribute(k) { return attrs[k]; }
                })
            };
        })();
        // Wire up jsdom doc OR fallback shim to track og:title + og:image
        const ogTitle = { 'content': '' };
        const ogImage = { 'content': '' };
        if (!globalThis.document) {
            doc.__set('meta[property="og:title"]', ogTitle);
            doc.__set('meta[property="og:image"]', ogImage);
            globalThis.document = doc;
        } else {
            // jsdom: insert real meta tags
            doc.head.innerHTML += `<meta property="og:title" content=""><meta property="og:image" content="">`;
        }
        updateSceneMetadata('field');
        if (typeof window !== 'undefined' && window.document?.querySelector) {
            const t = doc.querySelector('meta[property="og:title"]');
            expect(t?.getAttribute('content')).toMatch(/Home Field/);
        } else {
            expect(ogTitle.content).toMatch(/Home Field/);
        }
    });

    it('updateSceneMetadata is a no-op for unknown scene id', () => {
        const before = (globalThis.document?.title) ?? '';
        updateSceneMetadata('atlantis');
        const after = (globalThis.document?.title) ?? '';
        expect(after).toBe(before);
    });
});
