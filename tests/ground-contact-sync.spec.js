// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The dog's ground contact reaches the terrain.
 *
 * Cycle 114 Phase 5 put a contact-darkening term in four shaders: both grass
 * paths and both terrain paths. The grass half works without help, because it
 * reuses the interactor uniforms `GrassSystem.updateInteractors` already syncs
 * every frame. The terrain half has no interactor array and needs the dog
 * handed to it.
 *
 * That sync was missing on first write. Both terrain materials carried the
 * shader term AND a comment saying "picked up per-frame by
 * TerrainBuilder#_syncGroundContact", and no such method existed, so
 * `uContactStrength` never left zero and the darkening was invisible on exactly
 * the bald ground it exists to cover. Nothing caught it: the shader compiled,
 * every other spec passed, and the term is a multiply by a uniform that happens
 * to be zero.
 *
 * A shader term whose driving uniform is never written is indistinguishable
 * from a shader term that works, until someone looks at the screen. Hence this.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GROUND_CONTACT } from '../js/world/groundShading.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** Minimal stand-ins for the two material shapes _syncGroundContact writes. */
function webglMaterial() {
    const v3 = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
    const v2 = () => ({ x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } });
    return {
        uniforms: {
            uContactPosition: { value: v3() },
            uContactFacing: { value: v2() },
            uContactStrength: { value: 0 },
        },
        userData: {},
    };
}

function webgpuMaterial() {
    const v3 = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
    const v2 = () => ({ x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } });
    return {
        uniforms: undefined,
        userData: {
            groundContactNodeUniforms: {
                position: { value: v3() },
                facing: { value: v2() },
                strength: { value: 0 },
            },
        },
    };
}

/**
 * Call the real method against a bare object carrying only `terrain.material`.
 * `_syncGroundContact` touches nothing else, which is the point of testing it
 * separately from the 2,000-line builder it lives on.
 */
async function syncWith(material, entities) {
    const { TerrainBuilder } = await import('../js/TerrainBuilder.js');
    const host = { terrain: { material } };
    TerrainBuilder.prototype._syncGroundContact.call(host, entities);
    return material;
}

const DOG = { position: { x: 12, y: 1.5, z: -7 }, type: 'dog', facingDirection: 0 };
const SHEEP = { position: { x: 3, y: 0, z: 4 }, type: 'sheep', facingDirection: 1 };

describe('_syncGroundContact drives the terrain contact uniforms', () => {
    it('writes the dog position and a non-zero strength on the WebGL path', async () => {
        const m = await syncWith(webglMaterial(), [DOG, SHEEP]);
        expect(m.uniforms.uContactStrength.value).toBe(GROUND_CONTACT.strength);
        expect(m.uniforms.uContactStrength.value).toBeGreaterThan(0);
        expect(m.uniforms.uContactPosition.value.x).toBe(12);
        expect(m.uniforms.uContactPosition.value.z).toBe(-7);
    });

    it('writes the same values through the WebGPU node uniforms', async () => {
        const m = await syncWith(webgpuMaterial(), [DOG, SHEEP]);
        const n = m.userData.groundContactNodeUniforms;
        expect(n.strength.value).toBe(GROUND_CONTACT.strength);
        expect(n.position.value.x).toBe(12);
        expect(n.position.value.z).toBe(-7);
    });

    it('holds strength at zero when no dog is present, so a dogless scene is untouched', async () => {
        const m = await syncWith(webglMaterial(), [SHEEP]);
        expect(m.uniforms.uContactStrength.value).toBe(0);
    });

    it('ignores sheep when picking the contact entity', async () => {
        // Sheep first in the array. A naive entities[0] would take it, and the
        // contact would follow a sheep around instead of the dog.
        const m = await syncWith(webglMaterial(), [SHEEP, DOG]);
        expect(m.uniforms.uContactPosition.value.x).toBe(12);
    });

    it('converts a scalar facing to a unit direction the way updateInteractors does', async () => {
        const m = await syncWith(webglMaterial(), [{ ...DOG, facingDirection: Math.PI / 2 }]);
        expect(m.uniforms.uContactFacing.value.x).toBeCloseTo(0, 6);
        expect(m.uniforms.uContactFacing.value.y).toBeCloseTo(1, 6);
    });

    it('normalises a vector facing', async () => {
        const m = await syncWith(webglMaterial(), [{ ...DOG, facingDirection: { x: 0, z: 5 } }]);
        expect(m.uniforms.uContactFacing.value.y).toBeCloseTo(1, 6);
    });

    it('falls back to +Z rather than a zero-length facing', async () => {
        // A zero-length facing NaNs the oriented rounded-rect maths in both
        // shaders, which renders as a hole rather than a shadow.
        const m = await syncWith(webglMaterial(), [{ position: DOG.position, type: 'dog' }]);
        expect(m.uniforms.uContactFacing.value.x).toBe(0);
        expect(m.uniforms.uContactFacing.value.y).toBe(1);
    });

    it('survives a missing material, a missing terrain and missing entities', async () => {
        const { TerrainBuilder } = await import('../js/TerrainBuilder.js');
        expect(() => TerrainBuilder.prototype._syncGroundContact.call({}, [DOG])).not.toThrow();
        expect(() => TerrainBuilder.prototype._syncGroundContact.call({ terrain: {} }, [DOG])).not.toThrow();
        expect(() => TerrainBuilder.prototype._syncGroundContact.call(
            { terrain: { material: webglMaterial() } }, undefined
        )).not.toThrow();
    });
});

describe('the contact term is actually wired into all four shader paths', () => {
    // The regression that motivated this file was a term present in the shader
    // and dead at runtime. These four assertions are the cheap half; the sync
    // tests above are the half that would have caught it.
    it('WebGL grass reads the shared contact falloff', () => {
        const src = read('js/GrassSystem.js');
        expect(src).toContain('sdsGroundContactFalloff');
    });

    it('WebGPU grass reads the shared contact falloff', () => {
        const src = read('js/world/webgpuGrassBladeNodeMaterial.js');
        expect(src).toContain('buildGroundContactFalloffNode');
    });

    it('WebGL terrain reads the shared contact function', () => {
        const src = read('js/TerrainBuilder.js');
        expect(src).toContain('sdsGroundContact(');
    });

    it('WebGPU terrain reads the shared contact node', () => {
        const src = read('js/world/webgpuTerrainNodeMaterial.js');
        expect(src).toContain('buildGroundContactNode');
    });

    it('the per-frame hook calls the sync', () => {
        // Without this line the uniforms above are written exactly never.
        const src = read('js/TerrainBuilder.js');
        expect(src).toMatch(/updateGrassAnimation[\s\S]{0,400}_syncGroundContact\(/);
    });
});
