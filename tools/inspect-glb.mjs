/**
 * One-shot GLB bbox inspector. Reads a GLB via @gltf-transform/core and
 * prints scene-bbox + per-mesh bbox so we can spot pivot-at-centroid vs
 * pivot-at-base issues without needing a browser.
 *
 * Usage: node tools/inspect-glb.mjs <path1.glb> [<path2.glb> ...]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;

const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'draco3d.encoder': await draco3d.createEncoderModule(),
        'meshopt.decoder': MeshoptDecoder
    });

for (const path of process.argv.slice(2)) {
    const doc = await io.read(path);
    const root = doc.getRoot();
    console.log(`\n=== ${path} ===`);

    let sceneMin = [Infinity, Infinity, Infinity];
    let sceneMax = [-Infinity, -Infinity, -Infinity];
    let totalTris = 0;

    for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            const pos = prim.getAttribute('POSITION');
            if (!pos) continue;
            const arr = pos.getArray();
            const cnt = pos.getCount();
            // Walk the actual (dequantized) array to get true float bbox
            // — accessor.getMin/Max may return raw quantized values for
            // meshopt/draco-compressed accessors.
            const min = [Infinity, Infinity, Infinity];
            const max = [-Infinity, -Infinity, -Infinity];
            for (let i = 0; i < cnt; i++) {
                for (let k = 0; k < 3; k++) {
                    const v = arr[i * 3 + k];
                    if (v < min[k]) min[k] = v;
                    if (v > max[k]) max[k] = v;
                }
            }
            totalTris += (prim.getIndices()?.getCount() ?? cnt) / 3;
            for (let i = 0; i < 3; i++) {
                if (min[i] < sceneMin[i]) sceneMin[i] = min[i];
                if (max[i] > sceneMax[i]) sceneMax[i] = max[i];
            }
            console.log(
                `  mesh "${mesh.getName() || '(unnamed)'}"`,
                `verts=${cnt}`,
                `bbox y=[${min[1].toFixed(3)}, ${max[1].toFixed(3)}]`,
                `(span ${(max[1] - min[1]).toFixed(3)})`
            );
        }
    }
    const fmt = (a) => `[${a.map(v => v.toFixed(3)).join(', ')}]`;
    console.log(`  scene bbox y=[${sceneMin[1].toFixed(3)}, ${sceneMax[1].toFixed(3)}]`);
    console.log(`  scene bbox min ${fmt(sceneMin)}  max ${fmt(sceneMax)}`);
    console.log(`  ~${Math.round(totalTris)} tris`);
    // Heuristic — pivot at base is min.y ≈ 0; pivot at centroid is
    // |min.y| ≈ |max.y|.
    const symmetry = Math.abs(Math.abs(sceneMin[1]) - Math.abs(sceneMax[1])) / Math.max(Math.abs(sceneMin[1]), Math.abs(sceneMax[1]) || 1);
    if (sceneMin[1] > -0.01) console.log('  pivot: at base (good)');
    else if (symmetry < 0.3) console.log('  pivot: at centroid (need bbox compensation at load)');
    else console.log('  pivot: offset (need bbox compensation at load)');
}
