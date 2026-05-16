import { describe, expect, it } from 'vitest';

import {
    buildRendererTelemetrySql,
    extractRowsFromWranglerJson,
    summarizeRows,
} from '../tools/konveyor-renderer-telemetry-summary.mjs';

describe('konveyor renderer telemetry summary tool', () => {
    it('builds a bounded read-only renderer telemetry query', () => {
        const sql = buildRendererTelemetrySql(14);
        expect(sql).toContain("WHERE name = 'renderer_mode_resolved'");
        expect(sql).toContain("datetime('now', '-14 days')");
        expect(sql).toContain("json_extract(props, '$.effective')");
        expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
    });

    it('extracts rows from wrangler d1 json output shapes', () => {
        const rows = [{ effective: 'webgl', count: 3 }];
        expect(extractRowsFromWranglerJson(JSON.stringify([{ results: rows }]))).toEqual(rows);
        expect(extractRowsFromWranglerJson(JSON.stringify({ result: [{ results: rows }] }))).toEqual(rows);
    });

    it('summarizes production WebGPU and fallback counts', () => {
        const summary = summarizeRows([
            { effective: 'webgpu-production', fallback_reason: 'none', count: 4 },
            { effective: 'webgl', fallback_reason: 'webgpu-unavailable', count: 2 },
        ], 7);

        expect(summary.total).toBe(6);
        expect(summary.productionWebGpu).toBe(4);
        expect(summary.fallbacks).toBe(2);
    });
});
