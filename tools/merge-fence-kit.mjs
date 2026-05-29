#!/usr/bin/env node
/**
 * Merge the four used fence/gate pieces into ONE shared-texture kit GLB.
 *
 * Background: the fence/gate set shipped as seven standalone GLBs, each
 * embedding the SAME wood texture set (three 512px PBR maps, byte-identical
 * across every file - verified by sha256). Geometry per piece is trivial
 * (12-256 tris), so each ~670 KiB file was ~98% duplicated texture. Three of
 * the seven (Fence_Segment, Gate_Complete, Corner_Post) were never even
 * instantiated at runtime.
 *
 * This builds a single kit GLB whose default scene holds four identity-wrapper
 * nodes named Fence_Post / Fence_Rail / Gate_Post / Gate_Arch. Each wrapper is
 * a faithful copy of that piece's original scene subtree (same transforms,
 * same geometry), so cloning the wrapper at runtime reproduces exactly what
 * cloning the old per-file gltf.scene produced. dedup() then collapses the
 * twelve duplicated texture references down to the three unique images, so the
 * maps ship once instead of four times.
 *
 * Runtime consumer: js/FencePresets.js loadModels() loads this kit once and
 * pulls each wrapper via scene.getObjectByName(<name>).
 *
 * One-off migration. Sources are read from assets/models/ (the compressed,
 * proven-identical-texture build) and fall back to assets/_originals/models/.
 * After the live sources are deleted, the pre-merge pieces remain in
 * assets/_originals/models/ and in git history.
 *
 * Usage: node tools/merge-fence-kit.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, unpartition } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const MODELS_DIR = join(REPO_ROOT, 'assets', 'models');
const ORIGINALS_DIR = join(REPO_ROOT, 'assets', '_originals', 'models');
const OUT_PATH = join(MODELS_DIR, 'Fence_Kit-v1.0.0.glb');

// Runtime wrapper name -> source filename. Order is the kit's child order.
const PIECES = [
  { name: 'Fence_Post', file: 'Fence_Post-v1.0.0.glb' },
  { name: 'Fence_Rail', file: 'Fence_Rail-v1.0.0.glb' },
  { name: 'Gate_Post', file: 'Gate_Post-v1.0.0.glb' },
  { name: 'Gate_Arch', file: 'Gate_Arch-v1.0.0.glb' },
];

function resolveSource(file) {
  const live = join(MODELS_DIR, file);
  if (existsSync(live)) return live;
  const orig = join(ORIGINALS_DIR, file);
  if (existsSync(orig)) return orig;
  throw new Error(`source GLB not found in models/ or _originals/: ${file}`);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'meshopt.decoder': MeshoptDecoder,
  });

const kitDoc = new Document();
kitDoc.getRoot().getAsset().generator = 'merge-fence-kit.mjs';
const kitScene = kitDoc.createScene('FenceKit');

for (const piece of PIECES) {
  const path = resolveSource(piece.file);
  const src = await io.read(path);

  // Copy the source graph into the kit doc; map gives us the source scene's
  // counterpart inside the kit doc.
  const map = mergeDocuments(kitDoc, src);
  const srcScene = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0];
  const mergedScene = map.get(srcScene);
  if (!mergedScene) throw new Error(`merge produced no scene for ${piece.file}`);

  // Re-parent the merged scene's root nodes under an identity wrapper so the
  // wrapper plays the role the old per-file scene-root Group played.
  const wrapper = kitDoc.createNode(piece.name);
  for (const child of [...mergedScene.listChildren()]) {
    wrapper.addChild(child); // reparents (a node has a single parent)
  }
  kitScene.addChild(wrapper);
  mergedScene.dispose(); // drop the now-empty source scene
}

kitDoc.getRoot().setDefaultScene(kitScene);

// Collapse the duplicated textures/materials/meshes/accessors, drop anything
// left unreferenced, then fold the per-source buffers into a single buffer
// (mergeDocuments keeps them separate; GLB allows only one).
await kitDoc.transform(dedup(), prune(), unpartition());

// The sources were Draco + Meshopt compressed; reading decoded the geometry to
// raw accessors but the extension records rode along. Drop them so we emit a
// plain GLB - scripts/compress-glbs.mjs re-applies the canonical Draco+Meshopt
// (and the 512px texture cap) afterward, matching every other asset.
for (const ext of kitDoc.getRoot().listExtensionsUsed()) {
  const name = ext.extensionName;
  if (name === 'KHR_draco_mesh_compression' || name === 'EXT_meshopt_compression') {
    ext.dispose();
  }
}

await io.write(OUT_PATH, kitDoc);

// ---- inline structural validation -------------------------------------------
const root = kitDoc.getRoot();
const scenes = root.listScenes();
const wrappers = kitScene.listChildren().map((n) => n.getName());
const textures = root.listTextures();
const texHashes = new Set();
let texBytes = 0;
for (const t of textures) {
  const img = t.getImage();
  if (img) {
    texHashes.add(createHash('sha256').update(img).digest('hex').slice(0, 12));
    texBytes += img.byteLength;
  }
}

console.log('\n=== Fence_Kit build ===');
console.log(`scenes: ${scenes.length} (expect 1)`);
console.log(`default scene: ${root.getDefaultScene()?.getName()}`);
console.log(`wrappers: ${wrappers.join(', ')}`);
for (const w of kitScene.listChildren()) {
  let tris = 0;
  let meshCount = 0;
  w.traverse((n) => {
    const mesh = n.getMesh && n.getMesh();
    if (mesh) {
      meshCount++;
      for (const prim of mesh.listPrimitives()) {
        const idx = prim.getIndices();
        tris += idx ? idx.getCount() / 3 : (prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
      }
    }
  });
  console.log(`  ${w.getName()}: ${meshCount} mesh-node(s), ${Math.round(tris)} tris`);
}
console.log(`textures: ${textures.length} (distinct payloads: ${texHashes.size})`);
console.log(`materials: ${root.listMaterials().length}`);
console.log(`embedded texture bytes: ${(texBytes / 1024).toFixed(1)} KiB`);
const outBytes = readFileSync(OUT_PATH).byteLength;
console.log(`output: ${OUT_PATH} (${(outBytes / 1024).toFixed(1)} KiB)`);

// Hard asserts: bail loudly if the kit is malformed or dedup failed.
const names = PIECES.map((p) => p.name);
const missing = names.filter((n) => !wrappers.includes(n));
if (missing.length) throw new Error(`missing wrapper node(s): ${missing.join(', ')}`);
if (scenes.length !== 1) throw new Error(`expected 1 scene, got ${scenes.length}`);
if (texHashes.size > 3) {
  throw new Error(`dedup failed: ${texHashes.size} distinct texture payloads (expected <= 3)`);
}
console.log('\nOK: kit valid (4 wrappers, single scene, textures deduped).');
