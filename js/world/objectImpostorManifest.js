/**
 * Object-impostor manifest loader (Cycle 50 Phase 3).
 *
 * Resolves the runtime impostor atlas base path for a tree type from
 * assets/objects.manifest.json instead of a hardcoded `assets/models/trees/<id>`
 * string template. Client-side only (fetches over the network), mirroring
 * js/world/placementManifest.js. Degrade-not-crash: any fetch/parse failure or a
 * missing object falls back to the legacy path so production rendering is
 * unchanged even when the manifest is absent (e.g. an old cached deploy).
 *
 * The manifest is copied into dist/assets by vite-plugin-static-copy
 * (`assets/*`), so it serves at the same relative root as the impostor atlases
 * loadKilnImpostor already fetches.
 */

const MANIFEST_URL = 'assets/objects.manifest.json';
let manifestPromise = null;

/** Fetch + cache the object manifest; resolve to null (never throw) on failure. */
export function loadObjectManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const res = await fetch(MANIFEST_URL);
        if (!res.ok) throw new Error(`object manifest: HTTP ${res.status}`);
        const m = await res.json();
        if (!m || !Array.isArray(m.objects) || !m.layoutPresets) {
          throw new Error('object manifest: malformed');
        }
        return m;
      } catch (err) {
        console.warn('[impostor-manifest] load failed; using legacy paths:', err);
        return null;
      }
    })();
  }
  return manifestPromise;
}

function posixDirname(p) {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i) : '.';
}

/**
 * Repo-relative impostor atlas base (no extension) for an object id + layout,
 * derived from the manifest the same way the baker's impostorAssetBase does:
 * `<dir(runtimeModel)>[/<preset.subdir>]/<id>[.<variant>].imposter`. Returns
 * null if the object/layout/preset/default-variant isn't in the manifest.
 */
export function manifestImpostorBase(manifest, objectId, layoutId) {
  const obj = manifest?.objects?.find((o) => o.id === objectId);
  if (!obj?.impostor?.enabled || !obj.impostor.layouts?.includes(layoutId)) return null;
  const preset = manifest.layoutPresets?.[layoutId];
  if (!preset) return null;
  const variant = obj.impostor.variants?.find((v) => v.default) ?? obj.impostor.variants?.[0];
  if (!variant) return null;
  const dir = posixDirname(obj.runtimeModel);
  const base = preset.subdir ? `${dir}/${preset.subdir}` : dir;
  const suffix = variant.default ? '' : `.${variant.id}`;
  return `${base}/${obj.id}${suffix}.imposter`;
}

/** Legacy pre-Cycle-50 path shape — the fallback when the manifest is unavailable. */
function legacyImpostorBase(objectId, octahedral) {
  const dir = octahedral ? 'assets/models/trees/octahedral' : 'assets/models/trees';
  return `${dir}/${objectId}.imposter`;
}

/**
 * Resolve the impostor atlas base path (no extension) for a tree type + route.
 * Manifest-first with a legacy fallback. `octahedral` selects the octahedral
 * layout (lab-gated); otherwise latlon-hemi-y (the production default).
 *
 * @param {string} objectId  e.g. 'tree1'
 * @param {{ octahedral?: boolean }} [opts]
 * @returns {Promise<string>}  e.g. 'assets/models/trees/tree1.imposter'
 */
export async function resolveImpostorBase(objectId, { octahedral = false } = {}) {
  const layoutId = octahedral ? 'octahedral' : 'latlon-hemi-y';
  const manifest = await loadObjectManifest();
  return (manifest && manifestImpostorBase(manifest, objectId, layoutId))
    ?? legacyImpostorBase(objectId, octahedral);
}
