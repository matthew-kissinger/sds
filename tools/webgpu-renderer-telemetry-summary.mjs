// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_DIR = resolve(ROOT, 'worker');
const WRANGLER_BIN = resolve(WORKER_DIR, 'node_modules/wrangler/bin/wrangler.js');

function parseArgs(argv) {
    const args = {
        days: 7,
        database: 'sds-db',
        remote: false,
        local: false,
        json: false,
        sqlOnly: false,
    };

    for (const arg of argv.slice(2)) {
        if (arg === '--remote') args.remote = true;
        else if (arg === '--local') args.local = true;
        else if (arg === '--json') args.json = true;
        else if (arg === '--sql-only') args.sqlOnly = true;
        else if (arg.startsWith('--days=')) args.days = Number(arg.slice('--days='.length));
        else if (arg.startsWith('--database=')) args.database = arg.slice('--database='.length);
        else if (arg === '--help' || arg === '-h') args.help = true;
        else throw new Error(`Unknown argument: ${arg}`);
    }

    if (!Number.isInteger(args.days) || args.days < 1 || args.days > 90) {
        throw new Error('--days must be an integer from 1 to 90');
    }
    if (args.local && args.remote) {
        throw new Error('Use only one of --local or --remote');
    }
    return args;
}

export function buildRendererTelemetrySql(days = 7) {
    if (!Number.isInteger(days) || days < 1 || days > 90) {
        throw new Error('days must be an integer from 1 to 90');
    }

    return `
WITH renderer_events AS (
    SELECT
        created_at,
        COALESCE(json_extract(props, '$.requested'), '') AS requested,
        COALESCE(json_extract(props, '$.effective'), '') AS effective,
        COALESCE(NULLIF(json_extract(props, '$.fallbackReason'), ''), 'none') AS fallback_reason,
        COALESCE(NULLIF(json_extract(props, '$.sceneId'), ''), 'unknown') AS scene_id,
        CASE json_extract(props, '$.webgpuApiAvailable') WHEN 1 THEN 1 ELSE 0 END AS webgpu_api_available,
        CASE json_extract(props, '$.productionWebGpu') WHEN 1 THEN 1 ELSE 0 END AS production_webgpu,
        CASE json_extract(props, '$.productionOk') WHEN 1 THEN 1 ELSE 0 END AS production_ok,
        CASE json_extract(props, '$.devicePreflightOk') WHEN 1 THEN 1 ELSE 0 END AS device_preflight_ok
    FROM events
    WHERE name = 'renderer_mode_resolved'
      AND created_at >= datetime('now', '-${days} days')
)
SELECT
    requested,
    effective,
    fallback_reason,
    scene_id,
    webgpu_api_available,
    production_webgpu,
    production_ok,
    device_preflight_ok,
    COUNT(*) AS count,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen
FROM renderer_events
GROUP BY
    requested,
    effective,
    fallback_reason,
    scene_id,
    webgpu_api_available,
    production_webgpu,
    production_ok,
    device_preflight_ok
ORDER BY count DESC, effective ASC, fallback_reason ASC, scene_id ASC;
`.trim();
}

export function extractRowsFromWranglerJson(text) {
    const parsed = JSON.parse(text);
    const containers = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of containers) {
        if (Array.isArray(item?.results)) return item.results;
        if (Array.isArray(item?.result?.[0]?.results)) return item.result[0].results;
        if (Array.isArray(item?.result?.results)) return item.result.results;
    }
    return [];
}

export function summarizeRows(rows, days) {
    const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const fallbacks = rows
        .filter((row) => row.fallback_reason && row.fallback_reason !== 'none')
        .reduce((sum, row) => sum + Number(row.count || 0), 0);
    const productionWebGpu = rows
        .filter((row) => row.effective === 'webgpu-production')
        .reduce((sum, row) => sum + Number(row.count || 0), 0);

    return {
        days,
        total,
        productionWebGpu,
        fallbacks,
        rows,
    };
}

function renderMarkdown(summary) {
    const lines = [
        `Renderer telemetry summary (${summary.days} days)`,
        '',
        `Total events: ${summary.total}`,
        `Production WebGPU events: ${summary.productionWebGpu}`,
        `Fallback events: ${summary.fallbacks}`,
        '',
    ];

    if (summary.rows.length === 0) {
        lines.push('No `renderer_mode_resolved` events found in the selected window.');
        return lines.join('\n');
    }

    lines.push('| requested | effective | fallback | scene | api | production | ok | device | count | first seen | last seen |');
    lines.push('|---|---|---|---|---:|---:|---:|---:|---:|---|---|');
    for (const row of summary.rows) {
        lines.push([
            row.requested || '',
            row.effective || '',
            row.fallback_reason || '',
            row.scene_id || '',
            Number(row.webgpu_api_available || 0),
            Number(row.production_webgpu || 0),
            Number(row.production_ok || 0),
            Number(row.device_preflight_ok || 0),
            Number(row.count || 0),
            row.first_seen || '',
            row.last_seen || '',
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    return lines.join('\n');
}

function runWrangler(args, sql) {
    if (!existsSync(WRANGLER_BIN)) {
        throw new Error('Missing worker/node_modules/wrangler/bin/wrangler.js; run `cd worker && npm install` first.');
    }

    const wranglerArgs = [
        WRANGLER_BIN,
        'd1',
        'execute',
        args.database,
        '--command',
        sql,
        '--json',
    ];
    if (args.remote) wranglerArgs.push('--remote');
    else wranglerArgs.push('--local');

    const result = spawnSync(process.execPath, wranglerArgs, {
        cwd: WORKER_DIR,
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(result.error?.message || result.stderr || result.stdout || `wrangler exited with ${result.status}`);
    }
    return result.stdout;
}

function printHelp() {
    console.log(`Usage: node tools/webgpu-renderer-telemetry-summary.mjs [--remote|--local] [--days=7] [--json] [--sql-only]

Read-only D1 summary for renderer_mode_resolved telemetry. Use --remote after a
deploy to evaluate WebGPU default-readiness. Defaults to --local when neither
--remote nor --local is supplied.`);
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        return;
    }

    const sql = buildRendererTelemetrySql(args.days);
    if (args.sqlOnly) {
        console.log(sql);
        return;
    }

    const raw = runWrangler(args, sql);
    const rows = extractRowsFromWranglerJson(raw);
    const summary = summarizeRows(rows, args.days);
    console.log(args.json ? JSON.stringify(summary, null, 2) : renderMarkdown(summary));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
    main().catch((error) => {
        console.error(error?.message || error);
        process.exit(1);
    });
}
