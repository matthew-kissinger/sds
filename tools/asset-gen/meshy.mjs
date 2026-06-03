// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Meshy AI text-to-3D batch generator (Cycle 15 Phase 1).
 *
 * Reads a prompt set from `tools/asset-gen/prompts/<set>.json`, runs each
 * prompt through Meshy's two-stage `preview → refine` flow, downloads
 * the resulting GLBs into `tools/asset-gallery/staging/<subdir>/`, then
 * stops. From there, drive `tools/asset-gallery.mjs` to view + pick the
 * best, and `tools/asset-gen/integrate.mjs` to wire picks into the
 * runtime asset pipeline.
 *
 * Why two stages? Meshy's preview stage generates untextured geometry
 * fast (~30-60s); refine adds the PBR textures (~60-90s). Running both
 * sequentially is the documented workflow for game-ready output.
 *
 * Required env: MESHY_API_KEY (workspace key from app.meshy.ai). The
 * shared key file is `~/.config/mk-agent/env`; load it before running:
 *   export MESHY_API_KEY=$(grep ^MESHY_API_KEY= ~/.config/mk-agent/env | cut -d= -f2)
 *   node tools/asset-gen/meshy.mjs --set=rocks --count=8
 *
 * CLI:
 *   --set=<name>         prompt set under prompts/ (rocks|trees|flora|...)
 *   --count=<n>          how many prompts to run (default: all)
 *   --offset=<n>         skip first N prompts (resume after partial run)
 *   --model=<id>         override prompt-set's ai_model (default: meshy-5)
 *   --skip-refine        preview stage only (faster, untextured)
 *   --dry-run            print what would be requested, don't call API
 *
 * Output: one GLB per prompt, named `<category>_<index>_<slug>.glb`,
 * plus a manifest.json with prompt + task metadata for traceability.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const args = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);

const API_KEY = process.env.MESHY_API_KEY;
const API_BASE = 'https://api.meshy.ai/openapi/v2';
const DRY = !!args['dry-run'];

if (!API_KEY && !DRY) {
    console.error('[MESHY] MESHY_API_KEY env var not set. Get a key from app.meshy.ai → API and either');
    console.error('         export it for this shell, or store in ~/.config/mk-agent/env and load it:');
    console.error('           export MESHY_API_KEY=$(grep ^MESHY_API_KEY= ~/.config/mk-agent/env | cut -d= -f2)');
    console.error('       Or run with --dry-run to verify the prompt batch without calling the API.');
    process.exit(1);
}

const setName = args.set;
if (!setName) {
    console.error('[MESHY] Required: --set=<name> (one of: rocks, trees, flora, or any file under tools/asset-gen/prompts/)');
    process.exit(1);
}

async function loadPromptSet(name) {
    const path = resolve(__dirname, 'prompts', `${name}.json`);
    return JSON.parse(await readFile(path, 'utf8'));
}

function slugify(prompt) {
    return prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

async function api(path, init = {}) {
    const res = await fetch(API_BASE + path, {
        ...init,
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {})
        }
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) {
        throw new Error(`Meshy ${init.method ?? 'GET'} ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    }
    return json;
}

async function pollTask(taskId, label) {
    const TIMEOUT_MS = 6 * 60 * 1000; // 6 min ceiling per stage
    const POLL_MS = 5000;
    const start = Date.now();
    while (Date.now() - start < TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const task = await api(`/text-to-3d/${taskId}`);
        const status = task.status;
        const progress = task.progress ?? 0;
        process.stdout.write(`\r[MESHY] ${label} ${status} ${progress}%   `);
        if (status === 'SUCCEEDED') {
            process.stdout.write('\n');
            return task;
        }
        if (status === 'FAILED' || status === 'CANCELED' || status === 'EXPIRED') {
            process.stdout.write('\n');
            throw new Error(`${label} ${status}: ${task.task_error?.message ?? 'no error message'}`);
        }
    }
    throw new Error(`${label} timed out after ${TIMEOUT_MS / 1000}s`);
}

async function downloadGlb(url, outPath) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download ${url} → ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(outPath, buf);
    return buf.byteLength;
}

async function generateOne({ prompt, index, set, outDir }) {
    const slug = slugify(prompt);
    const filename = `${set.category}_${String(index).padStart(2, '0')}_${slug}.glb`;
    const outPath = resolve(outDir, filename);

    const previewBody = {
        mode: 'preview',
        prompt: `${set.stylePrefix ? set.stylePrefix + ', ' : ''}${prompt}`,
        ai_model: args.model ?? set.aiModel ?? 'meshy-5',
        model_type: set.modelType ?? 'lowpoly',
        target_polycount: set.polycount ?? 2000,
        topology: set.topology ?? 'triangle',
        should_remesh: true,
        symmetry_mode: 'auto'
    };

    if (DRY) {
        console.log(`[MESHY] DRY → ${filename}`);
        console.log('         body:', JSON.stringify(previewBody));
        return { filename, prompt, dryRun: true };
    }

    console.log(`[MESHY] [${index + 1}] preview submit: ${prompt.slice(0, 60)}…`);
    const previewTask = await api('/text-to-3d', {
        method: 'POST',
        body: JSON.stringify(previewBody)
    });
    const previewId = previewTask.result;
    if (!previewId) throw new Error('No preview task id in response: ' + JSON.stringify(previewTask));

    const previewDone = await pollTask(previewId, `[${index + 1}] preview`);

    let finalTask = previewDone;
    if (!args['skip-refine']) {
        console.log(`[MESHY] [${index + 1}] refine submit (preview ${previewId})`);
        const refineRes = await api('/text-to-3d', {
            method: 'POST',
            body: JSON.stringify({
                mode: 'refine',
                preview_task_id: previewId
            })
        });
        const refineId = refineRes.result;
        finalTask = await pollTask(refineId, `[${index + 1}] refine`);
    }

    const glbUrl = finalTask.model_urls?.glb;
    if (!glbUrl) throw new Error(`No GLB url in task ${finalTask.id}: ${JSON.stringify(finalTask.model_urls)}`);

    const bytes = await downloadGlb(glbUrl, outPath);
    console.log(`[MESHY] [${index + 1}] saved ${filename} (${(bytes / 1024).toFixed(1)} KB)`);

    return {
        filename,
        prompt,
        previewTaskId: previewId,
        refineTaskId: args['skip-refine'] ? null : finalTask.id,
        bytes
    };
}

async function main() {
    const set = await loadPromptSet(setName);
    const offset = Number(args.offset ?? 0);
    const count = args.count ? Number(args.count) : set.prompts.length;
    const slice = set.prompts.slice(offset, offset + count);

    const outDir = resolve(ROOT, 'tools/asset-gallery/staging', set.stagingSubdir ?? set.category);
    await mkdir(outDir, { recursive: true });

    console.log(`[MESHY] Set: ${setName} (${slice.length} of ${set.prompts.length} prompts) → ${outDir}`);
    console.log(`[MESHY] Mode: ${args['skip-refine'] ? 'preview-only' : 'preview → refine'}, model=${args.model ?? set.aiModel ?? 'meshy-5'}`);

    const manifest = {
        set: setName,
        runStart: new Date().toISOString(),
        offset,
        count,
        results: []
    };

    for (let i = 0; i < slice.length; i++) {
        try {
            const result = await generateOne({
                prompt: slice[i],
                index: offset + i,
                set,
                outDir
            });
            manifest.results.push({ ...result, ok: true });
        } catch (err) {
            console.error(`[MESHY] [${offset + i + 1}] FAILED: ${err.message}`);
            manifest.results.push({ prompt: slice[i], ok: false, error: err.message });
        }
        // Short pause between requests; Meshy free tier has rate caps.
        if (i < slice.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }

    manifest.runEnd = new Date().toISOString();
    await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    const ok = manifest.results.filter((r) => r.ok).length;
    console.log(`\n[MESHY] Done: ${ok}/${slice.length} GLBs in ${outDir}`);
    console.log(`[MESHY] Open the gallery: npm run gallery -- --dir=tools/asset-gallery/staging/${set.stagingSubdir ?? set.category}`);
}

main().catch((err) => {
    console.error('[MESHY] FATAL:', err);
    process.exit(1);
});
