// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Shared utilities index
 */
export {
    getPlayerIdentity,
    savePlayerIdentity,
    generatePersistentId,
    submitGameScore
} from './playerIdentity.js';

export {
    getDefaultSettings,
    loadSettings,
    saveSettings,
    applySettingsToGame
} from './settings.js';
