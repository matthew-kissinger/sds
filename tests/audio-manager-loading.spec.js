/** @vitest-environment jsdom */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AudioManager } from '../js/AudioManager.js';

const MAIN_SOURCE = readFileSync(resolve(process.cwd(), 'js/main.js'), 'utf8');
const MENU_CONTROLLER_SOURCE = readFileSync(resolve(process.cwd(), 'js/MenuController.js'), 'utf8');
const AUDIO_MANAGER_SOURCE = readFileSync(resolve(process.cwd(), 'js/AudioManager.js'), 'utf8');
const CINEMATIC_SOURCE = readFileSync(resolve(process.cwd(), 'js/cinematic.js'), 'utf8');
const SCREENSHOT_GOLDEN_SOURCE = readFileSync(resolve(process.cwd(), 'tools/validation/screenshot-golden.mjs'), 'utf8');

function deferred() {
    let resolvePromise;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });
    return { promise, resolve: resolvePromise };
}

describe('play-start audio ownership', () => {
    it('keeps the duplicate progressive loader out of the runtime', () => {
        expect(MAIN_SOURCE).not.toMatch(/GameAssetLoader/);
        expect(MENU_CONTROLLER_SOURCE).not.toMatch(/playGameplayMusic/);
        expect(MAIN_SOURCE).not.toMatch(/isMusicReady/);
        expect(AUDIO_MANAGER_SOURCE).not.toMatch(/loadSounds\(\{ all: true \}\)/);
        expect(AUDIO_MANAGER_SOURCE).not.toMatch(/_deferredSfxScheduled/);
        expect(AUDIO_MANAGER_SOURCE).not.toMatch(/isMusicReady/);
        expect(AUDIO_MANAGER_SOURCE).toMatch(/setMediaElementSource/);
        expect(AUDIO_MANAGER_SOURCE).toMatch(/\.preload = 'none'/);
    });

    it('keeps cinematic starts inside an awaitable guarded round transaction', () => {
        expect(MAIN_SOURCE).toMatch(/return gameInstance\.menuController\.selectSolo/);
        expect(CINEMATIC_SOURCE).toMatch(/async startSolo/);
        expect(CINEMATIC_SOURCE).toMatch(/window\.__sdsBootLoading = true/);
        expect(CINEMATIC_SOURCE).toMatch(/await game\.startSoloGame/);
        expect(SCREENSHOT_GOLDEN_SOURCE).toMatch(/await window\.__sdsCinema\.startSolo/);
        expect(SCREENSHOT_GOLDEN_SOURCE).toMatch(/--case=/);
    });

    it('single-flights the first flock bleat selection', async () => {
        const first = deferred();
        const manager = Object.assign(Object.create(AudioManager.prototype), {
            sounds: { sheepBleats: [] },
            _sheepBleatLoad: null,
            _loadBuffer: vi.fn(() => first.promise),
        });

        const one = manager._loadSheepBleat();
        const two = manager._loadSheepBleat();
        expect(manager._loadBuffer).toHaveBeenCalledTimes(1);
        first.resolve(null);
        await Promise.all([one, two]);
        expect(manager._sheepBleatLoad).toBeNull();
    });

    it('single-flights lazy sound and dog-bark object construction', async () => {
        const buffer = deferred();
        const manager = Object.assign(Object.create(AudioManager.prototype), {
            sounds: { uiClick: null, dogBarks: { jep: null } },
            _soundLoads: new Map(),
            _loadBuffer: vi.fn(() => buffer.promise),
            soundVolumeMultipliers: { dogBarks: 0.6 },
            masterVolume: 0.7,
            sfxVolume: 0.8,
        });

        const clickOne = manager._loadSound('uiClick', 'ui.mp3', 1);
        const clickTwo = manager._loadSound('uiClick', 'ui.mp3', 1);
        const barkOne = manager._loadDogBark('jep');
        const barkTwo = manager._loadDogBark('jep');

        expect(clickOne).toBe(clickTwo);
        expect(barkOne).toBe(barkTwo);
        expect(manager._loadBuffer).toHaveBeenCalledTimes(2);
        buffer.resolve(null);
        await Promise.all([clickOne, clickTwo, barkOne, barkTwo]);
        expect(manager._soundLoads.size).toBe(0);
    });

    it('lets only the newest asynchronous music transition start', async () => {
        const first = deferred();
        const second = deferred();
        const firstTrack = { isPlaying: false, play: vi.fn(async () => true), stop: vi.fn() };
        const secondTrack = { isPlaying: false, play: vi.fn(async () => true), stop: vi.fn() };
        const manager = Object.assign(Object.create(AudioManager.prototype), {
            _musicTransitionToken: 0,
            music: { gameplay1: null, gameplay2: null },
            currentMusic: null,
            loadMusic: vi.fn((key) => key === 'gameplay1' ? first.promise : second.promise),
            ensureAudioContext: vi.fn(async () => true),
        });

        const stale = manager._playMusicKey('gameplay1');
        const current = manager._playMusicKey('gameplay2');
        second.resolve(secondTrack);
        await current;
        first.resolve(firstTrack);
        await stale;

        expect(secondTrack.play).toHaveBeenCalledTimes(1);
        expect(firstTrack.play).not.toHaveBeenCalled();
        expect(manager.currentMusic).toBe(secondTrack);
    });

    it('installs one activation owner and removes every gesture listener on first use', async () => {
        const add = vi.spyOn(document, 'addEventListener');
        const remove = vi.spyOn(document, 'removeEventListener');
        const manager = Object.assign(Object.create(AudioManager.prototype), {
            _activationInstalled: false,
            audioContextActivated: false,
            listener: { context: { state: 'running' } },
        });

        manager.setupAudioContextActivation();
        manager.setupAudioContextActivation();
        document.dispatchEvent(new MouseEvent('click'));

        expect(add.mock.calls.filter(([name]) => ['click', 'keydown', 'touchstart'].includes(name))).toHaveLength(3);
        expect(remove.mock.calls.filter(([name]) => ['click', 'keydown', 'touchstart'].includes(name))).toHaveLength(3);
        expect(manager.audioContextActivated).toBe(true);
        add.mockRestore();
        remove.mockRestore();
    });
});
