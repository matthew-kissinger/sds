// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 26 v2.1.0 — per-scene SEO metadata updater.
 *
 * Index.html ships strong baseline SEO (hreflang × 18, full OG + Twitter,
 * schema.org VideoGame + FAQPage + WebApplication, sitemap, robots,
 * preconnect, PWA manifest). The remaining gap was per-scene `<title>`
 * and OG image: deep-link `?scene=field` / `?scene=rolling-hills` /
 * `?scene=open-country` was loading the same metadata as `/` even though
 * each scene has a distinct identity.
 *
 * Canonical URL stays `/` (SPA, single page) — we don't want crawlers
 * fragmenting SEO juice across `?scene=X` URLs. The dynamic update is
 * for social sharing previews when someone shares a deep link, and for
 * tab-title clarity for the player.
 *
 * Source of truth: `shared/scenes/*.js` `name` + `description` fields.
 * Social images at `assets/scenes/entrance/*.webp`.
 */

const SCENE_META = {
    field: {
        title: 'Sheep Dog Sim · Home Field — Relaxing Free Herding Game',
        description: 'Flat fenced pasture. The classic scene. Guide your sheepdog through peaceful meadows in this free, relaxing browser game.',
        ogImage: '/assets/scenes/entrance/field.webp',
        ogImageAlt: 'Sheep Dog Sim — Home Field current renderer capture with sheepdog and flock'
    },
    'rolling-hills': {
        title: 'Sheep Dog Sim · Sheep Dog Island — Relaxing Free Herding Game',
        description: 'An island home with rolling hills and a hidden corral. Find it. Drive the flock home before they wander into the water.',
        ogImage: '/assets/scenes/entrance/rolling-hills.webp',
        ogImageAlt: 'Sheep Dog Sim — Rolling Hills current renderer capture with sheepdog by the shoreline'
    },
    'open-country': {
        title: 'Sheep Dog Sim · Open Country — Relaxing Free Herding Game',
        description: 'A wild island of meadow and woods. Drive the flock through the trees to the portal.',
        ogImage: '/assets/scenes/entrance/open-country.webp',
        ogImageAlt: 'Sheep Dog Sim — Open Country current renderer capture with sheepdog facing the portal'
    },
    newsheepdogland: {
        title: 'Sheep Dog Sim · Newsheepdogland - Survival Herding Game',
        description: 'A boot-shaped survival island. Bring the flock home before wolves thin it after dark.',
        ogImage: '/assets/scenes/entrance/newsheepdogland.webp',
        ogImageAlt: 'Sheep Dog Sim - Newsheepdogland WebGPU capture with homestead, pen, grass, trees, and dusk sea'
    }
};

const ORIGIN = 'https://sheepdogsim.com';

function setMeta(selector, attr, value) {
    if (typeof document === 'undefined') return;
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
}

/**
 * Update document.title + OG/Twitter meta + canonical for the active scene.
 * Safe to call before DOM is fully parsed (queries no-op on missing nodes).
 *
 * @param {'field' | 'rolling-hills' | 'open-country' | 'newsheepdogland' | string} sceneId
 */
export function updateSceneMetadata(sceneId) {
    const meta = SCENE_META[sceneId];
    if (!meta) return; // unknown scene id — leave the index.html defaults alone

    if (typeof document !== 'undefined') {
        document.title = meta.title;
    }

    const ogImageUrl = ORIGIN + meta.ogImage;
    setMeta('meta[property="og:title"]', 'content', meta.title);
    setMeta('meta[property="og:description"]', 'content', meta.description);
    setMeta('meta[property="og:image"]', 'content', ogImageUrl);
    setMeta('meta[property="og:image:alt"]', 'content', meta.ogImageAlt);
    setMeta('meta[name="twitter:title"]', 'content', meta.title);
    setMeta('meta[name="twitter:description"]', 'content', meta.description);
    setMeta('meta[name="twitter:image"]', 'content', ogImageUrl);
    setMeta('meta[name="twitter:image:alt"]', 'content', meta.ogImageAlt);
    setMeta('meta[name="description"]', 'content', meta.description);
}

export const __TEST_ONLY__ = { SCENE_META };
