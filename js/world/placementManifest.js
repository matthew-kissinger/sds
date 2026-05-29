/**
 * Placement-manifest loader (Cycle 45 Phase 3).
 *
 * Loads a build-time-baked tree-placement manifest (see tools/bake-placement.mjs)
 * so a scene that declares `placementManifest` skips the seeded Poisson scatter at
 * scene-load. Client-side only: this lives under js/ (not shared/) because it
 * fetches over the network and rebases the URL through resolveAssetUrl, neither of
 * which belongs in the deterministic shared sim.
 */
import { resolveAssetUrl } from '../utils/assetUrl.js';

/** @type {Map<string, Promise<import('../../shared/TreePlacement.js').TreeInstance[]>>} */
const cache = new Map();

/**
 * Fetch + parse a baked placement manifest, returning its tree array. Cached by
 * resolved URL so repeated scene-loads of the same scene reuse one fetch. Throws
 * on network/parse failure or a malformed manifest; callers fall back to runtime
 * generateTrees so a broken asset degrades to the old path instead of an empty map.
 *
 * @param {string} manifestUrl Raw scene-def URL (absolute-root, e.g. '/placement/field.json').
 * @returns {Promise<import('../../shared/TreePlacement.js').TreeInstance[]>}
 */
export function loadPlacementTrees(manifestUrl) {
    const url = resolveAssetUrl(manifestUrl);
    let pending = cache.get(url);
    if (!pending) {
        pending = (async () => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`placement manifest ${url}: HTTP ${res.status}`);
            const manifest = await res.json();
            if (!manifest || !Array.isArray(manifest.trees)) {
                throw new Error(`placement manifest ${url}: missing trees[]`);
            }
            return manifest.trees;
        })();
        // Don't cache a rejected fetch — a transient failure should be retryable
        // on the next scene-load rather than poisoning the cache for the session.
        pending.catch(() => cache.delete(url));
        cache.set(url, pending);
    }
    return pending;
}

/**
 * Drop baked trees that overlap this load's rocks. The bake is rock-free (runtime
 * rocks are Math.random, so they vary per load and can't be baked against); this
 * applies the same `rock.radius + 4m` rejection generateTrees uses internally, so
 * baked trees don't clip through rock formations.
 *
 * @param {import('../../shared/TreePlacement.js').TreeInstance[]} trees
 * @param {Array<{x:number,z:number,radius:number}> | null | undefined} rockPositions
 * @returns {import('../../shared/TreePlacement.js').TreeInstance[]}
 */
export function rejectTreesOnRocks(trees, rockPositions) {
    if (!rockPositions || rockPositions.length === 0) return trees;
    const padding = 4;
    return trees.filter((t) => {
        for (const r of rockPositions) {
            const dx = t.x - r.x;
            const dz = t.z - r.z;
            const rr = r.radius + padding;
            if (dx * dx + dz * dz < rr * rr) return false;
        }
        return true;
    });
}
