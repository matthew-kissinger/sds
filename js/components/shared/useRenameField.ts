// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 58 P8: shared display-name rename logic.
 *
 * The single source of truth for "the player sets/changes their leaderboard
 * name", used by all three naming touchpoints — the Settings panel, the
 * post-score offer on the completion screen, and the pre-play affordance on the
 * entrance. The three render with different palettes (dark Settings/completion,
 * pastoral entrance), so only the LOGIC is shared here; each surface owns its
 * own markup. The logic is exactly what Cycle 57 P5 shipped in SettingsPanel:
 * validate, push through the auth-gated NetworkManager.renamePlayer (the worker
 * derives persistent_id from the token, never the body), mirror the result to
 * localStorage, and flip nameType to 'custom'.
 *
 * `status.error` carries an i18n KEY (identity.*) so the rendering surface
 * translates it in its own theme. Returns raw state; no JSX, no styling.
 */
import { useState, useCallback } from 'react';
import { getPlayerIdentity, savePlayerIdentity } from './playerIdentity.js';
import { getNetworkManager } from '../../GameBridge.js';

export type RenameStatus = null | 'saving' | 'saved' | { error: string };

export interface RenameField {
    /** The current input value. */
    draft: string;
    setDraft: (v: string) => void;
    /** null idle, 'saving', 'saved', or { error: <i18n key> }. */
    status: RenameStatus;
    /** Validate + persist the draft name. No-op while already saving. */
    save: () => Promise<void>;
    /** The stored identity (re-read after a successful save). */
    identity: ReturnType<typeof getPlayerIdentity>;
    /** Display string for the current name (fullName, else displayName). */
    current: string;
    /** Whether the current identity is still auto-named (never set by the player). */
    isAutoNamed: boolean;
}

export function useRenameField(opts: { onSaved?: (identity: any) => void } = {}): RenameField {
    const { onSaved } = opts;
    const [identity, setIdentity] = useState(() => getPlayerIdentity());
    const [draft, setDraft] = useState(() => getPlayerIdentity()?.displayName || '');
    const [status, setStatus] = useState<RenameStatus>(null);

    const setDraftAndClear = useCallback((v: string) => {
        setDraft(v);
        setStatus((s) => (s ? null : s));
    }, []);

    const save = useCallback(async () => {
        const trimmed = (draft || '').trim();
        if (trimmed.length === 0) { setStatus({ error: 'identity.errorEmpty' }); return; }
        if (trimmed.length > 20) { setStatus({ error: 'identity.errorTooLong' }); return; }
        const nm = getNetworkManager();
        if (!nm || typeof nm.renamePlayer !== 'function') { setStatus({ error: 'identity.errorFailed' }); return; }
        setStatus('saving');
        try {
            const res = await nm.renamePlayer(trimmed);
            const base = getPlayerIdentity() || {};
            const next = {
                ...base,
                displayName: res.displayName || trimmed,
                fullName: res.fullName || base.fullName,
                discriminator: res.discriminator || base.discriminator,
                nameType: 'custom',
                isRegistered: true,
            };
            savePlayerIdentity(next);
            setIdentity(next);
            setDraft(next.displayName);
            setStatus('saved');
            onSaved?.(next);
        } catch (e: any) {
            const code = e && e.message;
            const key = code === 'name_too_long' ? 'identity.errorTooLong'
                : code === 'name_empty' ? 'identity.errorEmpty'
                : 'identity.errorFailed';
            setStatus({ error: key });
        }
    }, [draft, onSaved]);

    return {
        draft,
        setDraft: setDraftAndClear,
        status,
        save,
        identity,
        current: (identity?.fullName || identity?.displayName || '') as string,
        isAutoNamed: (identity?.nameType ?? 'auto') === 'auto',
    };
}
