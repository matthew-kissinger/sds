/**
 * resolveAssetUrl — turn an absolute-root asset path into one that
 * works under any deployment base.
 *
 * sheepdogsim.com (Cloudflare Pages, root-served): `/terrain/x.bin`
 *   stays `/terrain/x.bin` — fetch resolves to sheepdogsim.com/...
 *
 * itch.io (html-classic.itch.zone, served from /html/<build-id>/):
 *   `/terrain/x.bin` becomes `./terrain/x.bin` — fetch resolves
 *   relative to the build root, not the CDN root.
 *
 * Vite injects `import.meta.env.BASE_URL` at build time:
 *   - root deploys: '/'
 *   - relative deploys (BUILD_TARGET=itchio): './'
 *
 * Paths that are already relative ('terrain/x.bin') or fully qualified
 * ('https://...') pass through unchanged.
 *
 * @param {string | null | undefined} path
 * @returns {string | null}
 */
export function resolveAssetUrl(path) {
    if (!path) return null;
    if (!path.startsWith('/')) return path;
    if (/^[a-z]+:\/\//i.test(path)) return path;
    const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    return base + path.slice(1);
}
