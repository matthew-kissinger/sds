// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import { createColdImpostorGeometry } from '../js/world/TreePlacement.js';

/**
 * Cross-billboard trunk alignment (Cycle 92).
 *
 * The kiln bake centers its ortho camera on the bbox center, so the trunk
 * (model origin) sits off-center in every atlas tile by its projection onto
 * the capture view's right vector (sin a, 0, -cos a). The three crossed
 * quads rotate about the instance origin; without the in-plane compensation
 * shift each plane shows the trunk offset a different direction and the
 * tree reads as a split trunk. These tests pin the compensation: the tile
 * content's trunk column must land on the rotation axis for every quad.
 */

const TILES = 4;
const AZIMUTHS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

function makeSidecar(bboxMin, bboxMax) {
    return {
        bbox: { min: bboxMin, max: bboxMax },
        yOffset: (bboxMin[1] + bboxMax[1]) * 0.5,
        tilesX: TILES,
        tilesY: TILES,
        atlasWidth: TILES * 512,
        atlasHeight: TILES * 512,
        azimuths: AZIMUTHS,
    };
}

/** In-plane horizontal center of each of the 3 quads, projected on its own
 *  plane direction. With the trunk-shift compensation this equals -uT. */
function quadPlaneOffsets(geo) {
    const pos = geo.getAttribute('position');
    const offsets = [];
    for (let q = 0; q < 3; q++) {
        const angle = (q * Math.PI) / 3;
        const rx = Math.cos(angle);
        const rz = Math.sin(angle);
        let sx = 0;
        let sz = 0;
        for (let v = 0; v < 6; v++) {
            sx += pos.getX(q * 6 + v);
            sz += pos.getZ(q * 6 + v);
        }
        offsets.push((sx / 6) * rx + (sz / 6) * rz);
    }
    return offsets;
}

describe('createColdImpostorGeometry - trunk-split compensation', () => {
    it('centered bbox produces axis-centered quads (regression: pre-92 shape)', () => {
        const geo = createColdImpostorGeometry(makeSidecar([-0.5, 0, -0.5], [0.5, 1, 0.5]), 0);
        for (const off of quadPlaneOffsets(geo)) expect(Math.abs(off)).toBeLessThan(1e-9);
    });

    it('off-center bbox shifts every quad by -uT for the chosen azimuth tile', () => {
        // tree1-shaped asymmetry: bbox center (cx, cz) away from the trunk axis.
        const min = [-0.236320783592627, 0, -0.2816386120516551];
        const max = [0.2574322736163801, 1, 0.2089471044368585];
        const cx = (min[0] + max[0]) * 0.5;
        const cz = (min[2] + max[2]) * 0.5;
        for (let azTile = 0; azTile < TILES; azTile++) {
            const a = AZIMUTHS[azTile];
            const uT = -cx * Math.sin(a) + cz * Math.cos(a);
            const geo = createColdImpostorGeometry(makeSidecar(min, max), azTile);
            for (const off of quadPlaneOffsets(geo)) {
                expect(off).toBeCloseTo(-uT, 6); // positions are float32
            }
        }
    });

    it('keeps 18 vertices and the single-tile UV window', () => {
        const geo = createColdImpostorGeometry(makeSidecar([-0.3, 0, -0.2], [0.2, 1, 0.3]), 2);
        expect(geo.getAttribute('position').count).toBe(18);
        const uv = geo.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) {
            const u = uv.getX(i);
            expect(u).toBeGreaterThanOrEqual(2 / TILES);
            expect(u).toBeLessThanOrEqual(3 / TILES);
        }
    });
});
