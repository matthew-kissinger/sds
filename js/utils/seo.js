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
 * OG images at `assets/marketing/og/og-{field|rh-sunset|open-country}.webp`.
 */

const SCENE_META = {
    field: {
        title: 'Sheep Dog Sim · Home Field — Relaxing Free Herding Game',
        description: 'Flat fenced pasture. The classic scene. Guide your sheepdog through peaceful meadows in this free, relaxing browser game.',
        ogImage: '/assets/marketing/og/og-field.webp',
        ogImageAlt: 'Sheep Dog Sim — Home Field, the flat fenced classic scene'
    },
    'rolling-hills': {
        title: 'Sheep Dog Sim · Sheep Dog Island — Relaxing Free Herding Game',
        description: 'An island home with rolling hills and a hidden corral. Find it. Drive the flock home before they wander into the water.',
        ogImage: '/assets/marketing/og/og-rh-sunset.webp',
        ogImageAlt: 'Sheep Dog Sim — Sheep Dog Island sunset with sheepdog and 1000-sheep flock'
    },
    'open-country': {
        title: 'Sheep Dog Sim · Open Country — Relaxing Free Herding Game',
        description: 'A wild island of meadow and woods. Drive the flock through the trees to the portal.',
        ogImage: '/assets/marketing/og/og-open-country.webp',
        ogImageAlt: 'Sheep Dog Sim — Open Country wild island with meadow, woods, and portal'
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
 * @param {'field' | 'rolling-hills' | 'open-country' | string} sceneId
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
