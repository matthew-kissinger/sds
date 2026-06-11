// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { suppressShadowOverrideVersionChurn } from '../js/rendering/shadowOverrideMaterialFix.js';

/**
 * Cycle 92: the shadow-pass override material version-churn fix.
 * Material.alphaTest's core setter bumps version on every zero-crossing;
 * the shadow pass writes a different alphaTest per caster into ONE shared
 * material, so a mixed caster set re-keys every shadow RenderObject every
 * frame. The fix replaces the instance's alphaTest with a non-bumping
 * accessor - value still reads back per object, version stays put.
 */

function makeShadowPassMaterial() {
    const m = new THREE.MeshBasicMaterial();
    m.isShadowPassMaterial = true;
    return m;
}

describe('suppressShadowOverrideVersionChurn', () => {
    it('baseline: stock material bumps version on each alphaTest zero-crossing', () => {
        const m = new THREE.MeshBasicMaterial();
        const v0 = m.version;
        m.alphaTest = 0.4;
        m.alphaTest = 0;
        m.alphaTest = 0.4;
        expect(m.version).toBe(v0 + 3);
    });

    it('patched shadow material keeps version constant across alphaTest flips', () => {
        const m = makeShadowPassMaterial();
        expect(suppressShadowOverrideVersionChurn(m)).toBe(true);
        const v0 = m.version;
        for (let i = 0; i < 10; i++) m.alphaTest = i % 2 ? 0.4 : 0;
        expect(m.version).toBe(v0);
        m.alphaTest = 0.4;
        expect(m.alphaTest).toBe(0.4);
        m.alphaTest = 0;
        expect(m.alphaTest).toBe(0);
    });

    it('is one-shot per instance and refuses non-shadow materials', () => {
        const m = makeShadowPassMaterial();
        expect(suppressShadowOverrideVersionChurn(m)).toBe(true);
        expect(suppressShadowOverrideVersionChurn(m)).toBe(false);
        expect(suppressShadowOverrideVersionChurn(new THREE.MeshBasicMaterial())).toBe(false);
        expect(suppressShadowOverrideVersionChurn(null)).toBe(false);
    });

    it('material.needsUpdate still works for real shader invalidation', () => {
        const m = makeShadowPassMaterial();
        suppressShadowOverrideVersionChurn(m);
        const v0 = m.version;
        m.needsUpdate = true;
        expect(m.version).toBe(v0 + 1);
    });
});
