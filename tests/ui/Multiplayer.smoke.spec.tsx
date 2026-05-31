/** @vitest-environment jsdom */
/**
 * Cycle 48 P3: render smoke harness for the converted Multiplayer leaves
 * (MultiplayerOptions, RoomJoining, PublicLobbyList, MultiplayerScoreboard,
 * GlobalLeaderboard). Each mounts in jsdom and renders its expected DOM without
 * throwing. Token var() / color-mix() strings don't resolve in jsdom, but they
 * must not crash render.
 *
 * react-i18next has no instance in tests, so useTranslation is mocked to echo
 * keys. getNetworkManager is mocked to null: PublicLobbyList and
 * GlobalLeaderboard then take their no-network path (error state) but still
 * render their chrome. The shared/scenes registry is real (pure JS, no DOM) —
 * GlobalLeaderboard reads listScenes()/getSceneById() against it, matching the
 * existing leaderboard-modes.spec contract.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));

vi.mock('../../js/GameBridge.js', () => ({
    getNetworkManager: () => null,
}));

import { MultiplayerOptions } from '../../js/components/Multiplayer/MultiplayerOptions';
import { RoomJoining } from '../../js/components/Multiplayer/RoomJoining';
import { PublicLobbyList } from '../../js/components/Multiplayer/PublicLobbyList';
import { MultiplayerScoreboard } from '../../js/components/Multiplayer/MultiplayerScoreboard';
import { GlobalLeaderboard } from '../../js/components/Multiplayer/GlobalLeaderboard';

afterEach(() => {
    cleanup();
});

describe('MultiplayerOptions (smoke)', () => {
    it('renders the title, the four option tiles, and the back button', () => {
        render(<MultiplayerOptions onBack={vi.fn()} onSelectOption={vi.fn()} />);
        expect(screen.getByText('multiplayer.title')).toBeTruthy();
        expect(screen.getByText('multiplayer.publicLobbies')).toBeTruthy();
        expect(screen.getByText('multiplayer.createRoom')).toBeTruthy();
        expect(screen.getByText('common.back')).toBeTruthy();
    });
});

describe('RoomJoining (smoke)', () => {
    it('renders the join title and the room-code input', () => {
        render(<RoomJoining onBack={vi.fn()} onJoin={vi.fn()} />);
        expect(screen.getByText('multiplayer.joinRoom')).toBeTruthy();
        expect(screen.getByPlaceholderText('MULTIPLAYER.ROOMCODE')).toBeTruthy();
    });
});

describe('PublicLobbyList (smoke)', () => {
    it('renders the panel chrome on the no-network path', async () => {
        render(<PublicLobbyList onBack={vi.fn()} onJoinRoom={vi.fn()} />);
        // Cycle 50: title now wired through t('multiplayer.publicLobbies'); the
        // mocked useTranslation echoes the key, matching the MultiplayerOptions
        // assertion above. The 'Back' BackButton label stays hardcoded.
        expect(await screen.findByText('multiplayer.publicLobbies')).toBeTruthy();
        expect(screen.getByText('Back')).toBeTruthy();
    });
});

describe('MultiplayerScoreboard (smoke)', () => {
    it('renders the cooperative team-progress board with the stamina bar', () => {
        render(
            <MultiplayerScoreboard
                players={[{ id: 'p1', name: 'Shep' }]}
                scores={{ p1: 0 }}
                myPlayerId="p1"
                gameMode="cooperative"
                sheepCount={12}
                totalSheep={200}
                stamina={50}
            />
        );
        expect(screen.getByText('Team Progress')).toBeTruthy();
        expect(screen.getByText('Sheep Collected Together')).toBeTruthy();
        expect(screen.getByText('Stamina')).toBeTruthy();
    });
});

describe('GlobalLeaderboard (smoke)', () => {
    it('renders the leaderboard title and scene picker on the no-network path', async () => {
        render(<GlobalLeaderboard onBack={vi.fn()} playerIdentity={{ fullName: 'Shep#0001' }} />);
        expect(await screen.findByText('leaderboard.title')).toBeTruthy();
        expect(screen.getByText('Scene')).toBeTruthy();
    });
});
