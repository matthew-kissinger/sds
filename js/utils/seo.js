// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
const SCENE_META = {
    field: {
        title: 'Home Field - Sheep Dog Sim Starter Pasture',
        description: 'Flat fenced starter pasture with one gate, clean flock reads, solo modes, and multiplayer support.',
        ogImage: '/assets/scenes/social/field.webp',
        ogImageAlt: 'Sheep Dog Sim Home Field capture with sheepdog and flock'
    },
    'rolling-hills': {
        title: 'Rolling Hills - Sheep Dog Sim Island Herding',
        description: 'Golden-hour island with rolling terrain, shoreline water, trees, rocks, and a fenced pasture to drive the flock into.',
        ogImage: '/assets/scenes/social/rolling-hills.webp',
        ogImageAlt: 'Sheep Dog Sim Rolling Hills capture by the shoreline'
    },
    'open-country': {
        title: 'Open Country - Sheep Dog Sim Portal Island',
        description: 'A 380-metre island with a gather zone, long terrain routes, and a portal objective.',
        ogImage: '/assets/scenes/social/open-country.webp',
        ogImageAlt: 'Sheep Dog Sim Open Country capture facing the portal'
    },
    newsheepdogland: {
        title: 'Newsheepdogland Lab - Sheep Dog Sim',
        description: 'Gated lab for directed beta testing of larger scene scale, homestead routing, day/night pressure, and large-flock systems.',
        ogImage: '/assets/scenes/social/newsheepdogland.webp',
        ogImageAlt: 'Sheep Dog Sim Newsheepdogland gated lab capture'
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
