// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Cycle 58 P8: the shared display-name editor (NameField) over useRenameField.
 *
 * This is the load-bearing logic behind all three naming touchpoints (Settings,
 * the post-score completion offer, and the entrance pre-play field). The test
 * mounts the dark-theme NameField, mocks NetworkManager.renamePlayer + the
 * i18n echo, and proves the contract from the cycle plan: setting a name pushes
 * it through the auth-gated rename path AND updates the local identity (flipping
 * nameType from 'auto' to 'custom' so the post-score offer stops showing).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));

const renamePlayer = vi.fn(async (name: string) => ({
    success: true,
    displayName: name,
    fullName: `${name}#0007`,
    discriminator: '0007',
}));

vi.mock('../../js/GameBridge.js', () => ({
    getNetworkManager: () => ({ renamePlayer }),
    emitGameEvent: () => {},
}));

import { NameField } from '../../js/components/shared/NameField';

function storedIdentity() {
    return JSON.parse(localStorage.getItem('playerIdentity') || 'null');
}

beforeEach(() => {
    renamePlayer.mockClear();
    localStorage.setItem(
        'playerIdentity',
        JSON.stringify({ persistentId: 'p1', displayName: 'Shepherd', nameType: 'auto' }),
    );
});
afterEach(() => {
    cleanup();
    localStorage.clear();
});

describe('NameField (Cycle 58 P8)', () => {
    it('renders the input and Save control', () => {
        render(<NameField />);
        expect(screen.getByPlaceholderText('identity.enterName')).toBeTruthy();
        expect(screen.getByText('identity.confirmSelection')).toBeTruthy();
    });

    it('saving a name routes through renamePlayer and updates the local identity', async () => {
        const onSaved = vi.fn();
        render(<NameField onSaved={onSaved} />);
        const input = screen.getByPlaceholderText('identity.enterName') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Maverick' } });
        fireEvent.click(screen.getByText('identity.confirmSelection'));

        await waitFor(() => expect(renamePlayer).toHaveBeenCalledWith('Maverick'));
        await waitFor(() => expect(screen.getByText('identity.nameUpdated')).toBeTruthy());

        const id = storedIdentity();
        expect(id.displayName).toBe('Maverick');
        expect(id.fullName).toBe('Maverick#0007');
        // The auto -> custom flip is what hides the post-score offer afterwards.
        expect(id.nameType).toBe('custom');
        expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty name client-side without calling the server', async () => {
        render(<NameField />);
        const input = screen.getByPlaceholderText('identity.enterName') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.click(screen.getByText('identity.confirmSelection'));

        await waitFor(() => expect(screen.getByText('identity.errorEmpty')).toBeTruthy());
        expect(renamePlayer).not.toHaveBeenCalled();
        // Identity untouched: still auto-named.
        expect(storedIdentity().nameType).toBe('auto');
    });
});
