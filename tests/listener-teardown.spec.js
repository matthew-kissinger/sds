// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// [P3-LISTENER-AUDIT] Scene-swap listener teardown + GPU dispose contract.
//
// 1. disposeScene aborts the scene AbortController (listeners registered with
//    that signal stop firing) and replaces it with a fresh controller for the
//    next scene.
// 2. disposeScene tears down the local 2-player session (LocalInputHandler
//    destroy, player-2 dog mesh removal, session flags cleared).
// 3. OptimizedSheepSystem.dispose() releases the InstancedMesh GPU resources:
//    geometry.dispose(), material.dispose(), and InstancedMesh.dispose()
//    (instanceMatrix buffer).
// 4. GrassSystem.dispose() calls InstancedMesh.dispose() on per-chunk meshes.
// 5. LocalInputHandler.destroy() aborts its window keydown/keyup/blur
//    listeners (pre-fix, every local game start leaked a set).
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

import { disposeScene } from '../js/boot/loadScene.js';
import { OptimizedSheepSystem } from '../js/OptimizedSheep.js';
import { GrassSystem } from '../js/GrassSystem.js';
import { LocalInputHandler } from '../js/LocalInputHandler.js';

describe('disposeScene scene AbortController (P3-LISTENER-AUDIT)', () => {
    it('aborts the scene signal so signal-bound listeners stop firing', async () => {
        const game = { _sceneAbort: new AbortController() };
        const spy = vi.fn();
        window.addEventListener('p3-test-evt', spy, { signal: game._sceneAbort.signal });

        window.dispatchEvent(new Event('p3-test-evt'));
        expect(spy).toHaveBeenCalledTimes(1);

        await disposeScene(game);

        window.dispatchEvent(new Event('p3-test-evt'));
        expect(spy).toHaveBeenCalledTimes(1); // not called again
    });

    it('replaces the controller with a fresh, un-aborted one for the next scene', async () => {
        const before = new AbortController();
        const game = { _sceneAbort: before };

        await disposeScene(game);

        expect(before.signal.aborted).toBe(true);
        expect(game._sceneAbort).not.toBe(before);
        expect(game._sceneAbort).toBeInstanceOf(AbortController);
        expect(game._sceneAbort.signal.aborted).toBe(false);
    });

    it('tears down the local 2-player session (input handler, dog 2, flags)', async () => {
        const destroy = vi.fn();
        const removeMesh2 = vi.fn();
        const sheepdog2 = {
            removePlayerIcon: vi.fn(),
        };
        const sheepdogMesh2 = { parent: { remove: removeMesh2 } };
        const game = {
            _sceneAbort: new AbortController(),
            isLocalMultiplayer: true,
            localInputHandler: { destroy },
            localMultiplayerManager: {},
            twoPlayerCamera: {},
            sheepdog2,
            sheepdogMesh2,
        };

        await disposeScene(game);

        expect(destroy).toHaveBeenCalledTimes(1);
        expect(game.localInputHandler).toBeNull();
        expect(game.localMultiplayerManager).toBeNull();
        expect(game.twoPlayerCamera).toBeNull();
        expect(game.isLocalMultiplayer).toBe(false);
        expect(sheepdog2.removePlayerIcon).toHaveBeenCalledTimes(1);
        expect(removeMesh2).toHaveBeenCalledWith(sheepdogMesh2);
        expect(game.sheepdog2).toBeNull();
        expect(game.sheepdogMesh2).toBeNull();
    });
});

describe('OptimizedSheepSystem.dispose GPU release (P3-LISTENER-AUDIT)', () => {
    it('disposes geometry, material, and the InstancedMesh instance buffers', () => {
        const scene = new THREE.Scene();
        const system = new OptimizedSheepSystem(scene, 1, {
            centerX: 0,
            centerZ: 0,
            spreadRadius: 0,
            count: 1,
        });

        const mesh = system.instancedMesh;
        const geometryDispose = vi.spyOn(system.mergedGeometry, 'dispose');
        const materialDispose = vi.spyOn(system.material, 'dispose');
        const meshDispose = vi.spyOn(mesh, 'dispose');

        system.dispose();

        expect(geometryDispose).toHaveBeenCalledTimes(1);
        expect(materialDispose).toHaveBeenCalledTimes(1);
        expect(meshDispose).toHaveBeenCalledTimes(1);
        expect(mesh.parent).toBeNull(); // removed from scene
        expect(system.instancedMesh).toBeNull();
        expect(system.mergedGeometry).toBeNull();
        expect(system.material).toBeNull();
    });

    it('is idempotent (second dispose is a no-op)', () => {
        const scene = new THREE.Scene();
        const system = new OptimizedSheepSystem(scene, 1, {
            centerX: 0,
            centerZ: 0,
            spreadRadius: 0,
            count: 1,
        });
        system.dispose();
        expect(() => system.dispose()).not.toThrow();
    });
});

describe('GrassSystem.dispose chunk release (P3-LISTENER-AUDIT)', () => {
    it('disposes per-chunk InstancedMesh instance buffers and owned geometry', () => {
        // Prototype-only instance: constructing a full GrassSystem needs shader
        // fetches + a renderer; dispose() only touches the fields stubbed here.
        const grass = Object.create(GrassSystem.prototype);
        const instancedChunkMesh = {
            geometry: { dispose: vi.fn() },
            dispose: vi.fn(),
        };
        const meadowQuadMesh = {
            geometry: { dispose: vi.fn() },
            // plain THREE.Mesh has no dispose(); the call must be optional
        };
        grass.chunks = new Map([
            ['a', { mesh: instancedChunkMesh, ownsGeometry: false }],
            ['b', { mesh: meadowQuadMesh, isMeadowQuad: true }],
        ]);
        grass.scene = { remove: vi.fn() };
        grass._computeCullController = null;
        grass.grassMaterial = { dispose: vi.fn() };
        grass.webgpuGrassBladeMaterialControls = null;
        grass.noiseTexture = { dispose: vi.fn() };
        grass.clumpGeometry = { dispose: vi.fn() };
        const meadowQuadMaterialDispose = vi.fn();
        grass._meadowQuadMaterial = { dispose: meadowQuadMaterialDispose };

        expect(() => grass.dispose()).not.toThrow();

        expect(instancedChunkMesh.dispose).toHaveBeenCalledTimes(1);
        // Shared clump geometry is NOT disposed per-chunk...
        expect(instancedChunkMesh.geometry.dispose).not.toHaveBeenCalled();
        // ...but the meadow quad's owned geometry is.
        expect(meadowQuadMesh.geometry.dispose).toHaveBeenCalledTimes(1);
        expect(grass.scene.remove).toHaveBeenCalledTimes(2);
        expect(grass.grassMaterial.dispose).toHaveBeenCalledTimes(1);
        expect(grass.noiseTexture.dispose).toHaveBeenCalledTimes(1);
        expect(grass.clumpGeometry.dispose).toHaveBeenCalledTimes(1);
        expect(meadowQuadMaterialDispose).toHaveBeenCalledTimes(1);
    });
});

describe('LocalInputHandler.destroy listener teardown (P3-LISTENER-AUDIT)', () => {
    it('stops handling input after destroy()', () => {
        const handler = new LocalInputHandler();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
        expect(handler.player1Keys.w).toBe(true);
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
        expect(handler.player1Keys.w).toBe(false);

        handler.destroy();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
        expect(handler.player1Keys.w).toBe(false);
    });

    it('no longer toggles pause on Escape after destroy()', () => {
        const handler = new LocalInputHandler();
        const pauseSpy = vi.fn();
        window.addEventListener('game-pause-change', pauseSpy);
        try {
            handler.destroy();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            expect(handler.isPaused).toBe(false);
            expect(pauseSpy).not.toHaveBeenCalled();
        } finally {
            window.removeEventListener('game-pause-change', pauseSpy);
        }
    });

    it('does not stack handlers across sessions (old instance is inert)', () => {
        const first = new LocalInputHandler();
        first.destroy();
        const second = new LocalInputHandler();
        try {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            expect(first.isPaused).toBe(false);
            expect(second.isPaused).toBe(true);
        } finally {
            second.destroy();
        }
    });
});
