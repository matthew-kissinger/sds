// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 26 v2.1.0 — per-scene SEO meta updater.
 *
 * Asserts the contract: each canonical scene id has full meta, the OG
 * image points at an existing current scene social webp, and the
 * updateSceneMetadata function mutates the right meta tags on the DOM.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { updateSceneMetadata, __TEST_ONLY__ } from '../js/utils/seo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

describe('per-scene SEO meta', () => {
    it('registers the entrance scene set', () => {
        const ids = Object.keys(__TEST_ONLY__.SCENE_META);
        expect(ids).toContain('field');
        expect(ids).toContain('rolling-hills');
        expect(ids).toContain('open-country');
        expect(ids).toContain('newsheepdogland');
    });

    it('every registered social image exists on disk under assets/scenes/social/', () => {
        for (const [id, meta] of Object.entries(__TEST_ONLY__.SCENE_META)) {
            expect(meta.ogImage, id).toMatch(/^\/assets\/scenes\/social\/.+\.webp$/);
            const rel = meta.ogImage.replace(/^\//, '');
            const abs = resolve(repoRoot, rel);
            expect(existsSync(abs), `${id}: ${meta.ogImage} not found at ${abs}`).toBe(true);
        }
    });

    it('social cards and matching hero captures have launch dimensions', async () => {
        for (const [id, meta] of Object.entries(__TEST_ONLY__.SCENE_META)) {
            const socialRel = meta.ogImage.replace(/^\//, '');
            const socialMeta = await sharp(resolve(repoRoot, socialRel)).metadata();
            expect(`${socialMeta.width}x${socialMeta.height}`, id).toBe('1200x630');

            const heroRel = socialRel.replace('assets/scenes/social/', 'assets/scenes/entrance/');
            const heroMeta = await sharp(resolve(repoRoot, heroRel)).metadata();
            expect(`${heroMeta.width}x${heroMeta.height}`, id).toBe('1920x1080');
        }
    });

    it('every scene has a distinct title (no copy-paste mistakes)', () => {
        const titles = Object.values(__TEST_ONLY__.SCENE_META).map(m => m.title);
        expect(new Set(titles).size).toBe(titles.length);
    });

    it('scene metadata uses the launch content matrix, not stale relaxing-game copy', () => {
        for (const [id, meta] of Object.entries(__TEST_ONLY__.SCENE_META)) {
            expect(meta.title, id).not.toMatch(/Relaxing Free Herding Game|Sheep Dog Island/);
            expect(meta.description, id).not.toMatch(/peaceful meadows|experimental|performance tuning continues/i);
            expect(meta.description.length, id).toBeGreaterThan(70);
        }
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

describe('static public SEO files', () => {
    const publicSeoFiles = [
        'index.html',
        'about.html',
        'support.html',
        'privacy.html',
        'public/manifest.webmanifest',
        'public/llms.txt',
        'public/scenes/home-field.html',
        'public/scenes/rolling-hills.html',
        'public/scenes/open-country.html',
        'public/scenes/newsheepdogland.html'
    ];

    it('public SEO surfaces do not contain launch-stale copy', () => {
        const stale = [
            /Three\.js 0\.184/,
            /peaceful meadows/i,
            /currently marked experimental/i,
            /performance tuning continues/i,
            /three biomes/i,
            /Timed mode/i,
            /survival wolves/i,
            /wolves after dark/i,
            /four scenes/i,
            /four playable/i,
            /three hand-built islands/i,
            /survival island/i
        ];

        for (const rel of publicSeoFiles) {
            const text = readFileSync(resolve(repoRoot, rel), 'utf8');
            for (const pattern of stale) {
                expect(text, `${rel} should not match ${pattern}`).not.toMatch(pattern);
            }
        }
    });

    it('sitemap lastmod matches the launch SEO refresh date', () => {
        const sitemap = readFileSync(resolve(repoRoot, 'public/sitemap.xml'), 'utf8');
        const dates = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
        expect(dates.length).toBeGreaterThanOrEqual(7);
        expect(new Set(dates)).toEqual(new Set(['2026-06-30']));
        expect(sitemap).toContain('https://sheepdogsim.com/support');
        expect(sitemap).toContain('https://sheepdogsim.com/privacy');
        expect(sitemap).not.toContain('https://sheepdogsim.com/scenes/newsheepdogland');
    });
});
