// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-KONVEYOR] Shared konveyor adapter helper: factory wiring parity plus
// the new degradation surfacing (console.warn once per material name +
// konveyor_material_degraded telemetry event).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../js/telemetry.js', () => ({
    emitEvent: vi.fn(() => Promise.resolve(null)),
}));

import { emitEvent } from '../js/telemetry.js';
import {
    createKonveyorMaterialAdapter,
    reportKonveyorMaterialDegradation,
    resetKonveyorMaterialDegradationReportsForTests,
} from '../js/world/createKonveyorAdaptedMaterial.js';

const SEARCH_ON = '?renderer=webgpu&konveyorSpec=1';

function makeAdapter(overrides = {}) {
    return createKonveyorMaterialAdapter({
        flagParam: 'konveyorSpec',
        factoriesGlobal: '__sdsKonveyorSpecMaterialFactories',
        summaryGlobal: null,
        ...overrides,
    });
}

describe('createKonveyorAdaptedMaterial', () => {
    let warnSpy;

    beforeEach(() => {
        resetKonveyorMaterialDegradationReportsForTests();
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.mocked(emitEvent).mockClear();
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('gates on the explicit renderer flag', () => {
        const adapter = makeAdapter();
        expect(adapter.shouldApply('?renderer=webgpu&konveyorSpec=1')).toBe(true);
        expect(adapter.shouldApply('?renderer=webgpu')).toBe(false);
        expect(adapter.shouldApply('?renderer=webgl&konveyorSpec=1')).toBe(false);
        expect(adapter.shouldApply('')).toBe(false);
    });

    it('returns the factory material with controls when the factory is present', () => {
        const adapter = makeAdapter({ controlsUserDataKeys: ['specControls'] });
        const controls = { update: () => {} };
        const material = { name: 'konveyor-spec', userData: { specControls: controls } };
        const contexts = [];

        const result = adapter.createMaterial('spec-kind', 'createSpecMaterial', {
            createDefaultMaterial: () => ({ name: 'default-spec' }),
            search: SEARCH_ON,
            factories: {
                createSpecMaterial: (context) => {
                    contexts.push(context);
                    return material;
                },
            },
            context: { foo: 1 },
        });

        expect(result.material).toBe(material);
        expect(result.controls).toBe(controls);
        expect(result.summary).toEqual({
            kind: 'spec-kind',
            applied: true,
            reason: null,
            hasControls: true,
        });
        expect(contexts).toEqual([{ foo: 1 }]);
        expect(warnSpy).not.toHaveBeenCalled();
        expect(emitEvent).not.toHaveBeenCalled();
    });

    it('prefers explicit factory-result controls over userData controls', () => {
        const adapter = makeAdapter({ controlsUserDataKeys: ['specControls'] });
        const explicitControls = { explicit: true };
        const result = adapter.createMaterial('spec-kind', 'createSpecMaterial', {
            createDefaultMaterial: () => ({ name: 'default-spec' }),
            search: SEARCH_ON,
            factories: {
                createSpecMaterial: () => ({
                    material: { userData: { specControls: { fromUserData: true } } },
                    controls: explicitControls,
                }),
            },
        });
        expect(result.controls).toBe(explicitControls);
    });

    it('falls back without warning when the flag is disabled (normal WebGL path)', () => {
        const adapter = makeAdapter();
        const result = adapter.createMaterial('spec-kind', 'createSpecMaterial', {
            createDefaultMaterial: () => ({ name: 'default-spec' }),
            search: '',
            factories: {},
        });
        expect(result.material.name).toBe('default-spec');
        expect(result.controls).toBe(null);
        expect(result.summary).toEqual({ kind: 'spec-kind', applied: false, reason: 'flag-disabled' });
        expect(warnSpy).not.toHaveBeenCalled();
        expect(emitEvent).not.toHaveBeenCalled();
    });

    it('warns once and emits telemetry when the factory is missing', () => {
        const adapter = makeAdapter();
        const options = {
            createDefaultMaterial: () => ({ name: 'default-spec' }),
            search: SEARCH_ON,
            factories: {},
        };

        const first = adapter.createMaterial('spec-kind', 'createSpecMaterial', options);
        expect(first.material.name).toBe('default-spec');
        expect(first.summary.reason).toBe('missing-factories');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain('spec-kind');
        expect(warnSpy.mock.calls[0][0]).toContain('missing-factories');
        expect(emitEvent).toHaveBeenCalledTimes(1);
        expect(emitEvent).toHaveBeenCalledWith('konveyor_material_degraded', {
            kind: 'spec-kind',
            reason: 'missing-factories',
        });

        // Same material name again: still degrades, but no repeat warn/emit.
        const second = adapter.createMaterial('spec-kind', 'createSpecMaterial', options);
        expect(second.summary.reason).toBe('missing-factories');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(emitEvent).toHaveBeenCalledTimes(1);

        // A different material name gets its own report.
        adapter.createMaterial('other-kind', 'createSpecMaterial', options);
        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(emitEvent).toHaveBeenCalledTimes(2);
    });

    it('warns and emits telemetry when the factory returns nothing', () => {
        const adapter = makeAdapter();
        const result = adapter.createMaterial('spec-kind', 'createSpecMaterial', {
            createDefaultMaterial: () => ({ name: 'default-spec' }),
            search: SEARCH_ON,
            factories: { createSpecMaterial: () => null },
        });
        expect(result.material.name).toBe('default-spec');
        expect(result.summary.reason).toBe('invalid-factory-result');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(emitEvent).toHaveBeenCalledWith('konveyor_material_degraded', {
            kind: 'spec-kind',
            reason: 'invalid-factory-result',
        });
    });

    it('never reports flag-disabled through the degradation reporter', () => {
        reportKonveyorMaterialDegradation('spec-kind', 'flag-disabled');
        expect(warnSpy).not.toHaveBeenCalled();
        expect(emitEvent).not.toHaveBeenCalled();
    });
});
