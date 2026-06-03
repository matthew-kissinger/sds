// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Cycle 48 P1: render smoke harness for the converted HUD readout leaves
 * (GameTimer, SheepCounter, CompactStaminaBar, ObjectiveBanner,
 * CameraModeIndicator, CorralCompass, PracticeHint, HudLayout). Each mounts in
 * jsdom and renders its expected DOM without throwing. Token var() / color-mix()
 * strings don't resolve in jsdom, but they must not crash render.
 *
 * react-i18next has no instance in tests, so useTranslation is mocked to echo
 * keys. GameBridge is mocked via a hoisted mutable handle so the objective +
 * compass paths can be exercised with synthetic state.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import * as THREE from 'three';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));

const bridge = vi.hoisted(() => ({
    gameState: null as Record<string, unknown> | null,
    sceneManager: null as Record<string, unknown> | null,
    frameHandler: null as null | (() => void),
}));

vi.mock('../../js/GameBridge.js', () => ({
    getGameState: () => bridge.gameState,
    getSceneManager: () => bridge.sceneManager,
    subscribeGameEvent: (name: string, cb: () => void) => {
        if (name === 'frame') bridge.frameHandler = cb;
        return () => {
            bridge.frameHandler = null;
        };
    },
}));

import { GameTimer } from '../../js/components/GameHUD/GameTimer';
import { SheepCounter } from '../../js/components/GameHUD/SheepCounter';
import { CompactStaminaBar } from '../../js/components/GameHUD/CompactStaminaBar';
import { ObjectiveBanner } from '../../js/components/GameHUD/ObjectiveBanner';
import { CameraModeIndicator } from '../../js/components/GameHUD/CameraModeIndicator';
import { CorralCompass } from '../../js/components/GameHUD/CorralCompass';
import { PracticeHint } from '../../js/components/GameHUD/PracticeHint';
import { HudLayout } from '../../js/components/GameHUD/HudLayout';

afterEach(() => {
    cleanup();
    bridge.gameState = null;
    bridge.sceneManager = null;
    bridge.frameHandler = null;
});

describe('GameTimer (smoke)', () => {
    it('renders an untimed elapsed clock', () => {
        render(<GameTimer gameTime={75} timeLimit={0} />);
        expect(screen.getByText('01:15')).toBeTruthy();
    });

    it('renders a countdown with the time-remaining label', () => {
        render(<GameTimer gameTime={10} timeLimit={120} />);
        expect(screen.getByText('01:50')).toBeTruthy();
        expect(screen.getByText('hud.timeRemaining')).toBeTruthy();
    });
});

describe('SheepCounter (smoke)', () => {
    it('renders progress, percent, and a pause button', () => {
        const onPause = vi.fn();
        render(<SheepCounter sheepCount={50} totalSheep={200} stamina={80} onPause={onPause} />);
        expect(screen.getByText('50 / 200')).toBeTruthy();
        expect(screen.getByText('25% hud.complete')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Pause game' })).toBeTruthy();
    });

    it('omits the pause button when no handler is given', () => {
        render(<SheepCounter sheepCount={1} totalSheep={2} stamina={10} />);
        expect(screen.queryByRole('button')).toBeNull();
    });
});

describe('CompactStaminaBar (smoke)', () => {
    it('renders the Stamina label and percent across the gradient bands', () => {
        for (const s of [100, 50, 20, 0]) {
            render(<CompactStaminaBar stamina={s} />);
            expect(screen.getByText('Stamina')).toBeTruthy();
            expect(screen.getByText(`${Math.round(s)}%`)).toBeTruthy();
            cleanup();
        }
    });
});

describe('ObjectiveBanner (smoke)', () => {
    it('returns null when there is no objective', () => {
        bridge.gameState = { objective: null };
        const { container } = render(<ObjectiveBanner />);
        expect(container.firstChild).toBeNull();
    });

    it('renders the roundup headline and gather progress', () => {
        bridge.gameState = {
            objective: { stage: 'roundup', sheepInZone: 3, requiredSheep: 10, holdTimer: 0, holdRequired: 5 },
        };
        render(<ObjectiveBanner />);
        expect(screen.getByText('Gather 10 sheep into the ring')).toBeTruthy();
        expect(screen.getByText('3 / 10 in the ring')).toBeTruthy();
    });
});

describe('CameraModeIndicator (smoke)', () => {
    it('renders the mode label and the keyboard hint on desktop', () => {
        render(<CameraModeIndicator mode="follow" platform="desktop" />);
        expect(screen.getByText('Follow')).toBeTruthy();
        expect(screen.getByText('C')).toBeTruthy();
    });

    it('shows Tap on mobile', () => {
        render(<CameraModeIndicator mode="classic" platform="mobile" />);
        expect(screen.getByText('Tap')).toBeTruthy();
    });
});

describe('CorralCompass (smoke)', () => {
    it('returns null without game state', () => {
        const { container } = render(<CorralCompass />);
        expect(container.firstChild).toBeNull();
    });

    it('renders a distance arrow when the corral is off-screen', () => {
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
        camera.position.set(0, 5, 0);
        camera.updateMatrixWorld();
        bridge.sceneManager = { getCamera: () => camera };
        bridge.gameState = {
            sheepdog: { position: { x: 0, z: 0 } },
            corral: { center: { x: 500, z: 500 } },
        };
        render(<CorralCompass />);
        // Distance label is `${distance}m` (off-screen target -> arrow shows).
        expect(screen.getByText(/^\d+m$/)).toBeTruthy();
    });
});

describe('PracticeHint (smoke)', () => {
    it('renders the hint text when active', () => {
        render(<PracticeHint active={true} />);
        expect(screen.getByText('practice.hint')).toBeTruthy();
    });

    it('renders nothing when inactive', () => {
        const { container } = render(<PracticeHint active={false} />);
        expect(container.firstChild).toBeNull();
    });
});

describe('HudLayout (smoke)', () => {
    it('renders only the populated slots', () => {
        render(
            <HudLayout
                topLeft={<div key="tl">TL</div>}
                bottomSafe={<div key="bs">BS</div>}
            />,
        );
        expect(screen.getByText('TL')).toBeTruthy();
        expect(screen.getByText('BS')).toBeTruthy();
    });

    it('renders nothing when every slot is empty', () => {
        const { container } = render(<HudLayout />);
        expect(container.firstChild).toBeNull();
    });
});
