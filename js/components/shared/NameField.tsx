// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 58 P8: shared dark-theme display-name editor.
 *
 * The leaderboard-name input + Save button + status line, over the shared
 * useRenameField logic (auth-gated rename, localStorage sync, nameType flip).
 * Used on the dark surfaces — the Settings panel (showLabel + showCurrent
 * reproduce the Cycle 57 P5 layout) and the completion-screen post-score offer
 * (compact). The pastoral entrance renders its own light-theme editor over the
 * same hook.
 */
import { useTranslation } from 'react-i18next';
import { type CSSProperties } from 'react';
import { Button } from '../ui/Button.js';
import { useRenameField } from './useRenameField';

interface NameFieldProps {
    /** Show the uppercase "Display name" label (Settings). */
    showLabel?: boolean;
    /** Show the current name#discriminator line (Settings). */
    showCurrent?: boolean;
    /** i18n key for the Save button (default identity.confirmSelection). */
    saveLabelKey?: string;
    /** i18n key for the input placeholder (default identity.enterName). */
    placeholderKey?: string;
    /** Called with the updated identity after a successful save. */
    onSaved?: (identity: any) => void;
    /** Wrapper style override. */
    style?: CSSProperties;
}

const labelStyle: CSSProperties = {
    color: 'rgba(255,255,255,0.7)',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
};

export function NameField({
    showLabel = false,
    showCurrent = false,
    saveLabelKey = 'identity.confirmSelection',
    placeholderKey = 'identity.enterName',
    onSaved,
    style,
}: NameFieldProps) {
    const { t } = useTranslation();
    const { draft, setDraft, status, save, current } = useRenameField({ onSaved });
    const saving = status === 'saving';

    return (
        <div style={{ marginTop: '1.25rem', ...style }}>
            {showLabel && <div style={labelStyle}>{t('identity.customName')}</div>}
            {showCurrent && current && (
                <div style={{ color: 'white', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    {current}
                </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                    type="text"
                    maxLength={20}
                    value={draft}
                    placeholder={t(placeholderKey)}
                    onChange={(e) => setDraft(e.target.value)}
                    onFocus={() => { try { (window as any).isTypingInInput = true; } catch { /* ignore */ } }}
                    onBlur={() => { try { (window as any).isTypingInInput = false; } catch { /* ignore */ } }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !saving) save(); }}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'rgba(0,0,0,0.3)',
                        color: 'white',
                        fontSize: '0.9rem',
                        outline: 'none',
                    }}
                />
                <Button variant="primary" size="sm" disabled={saving} onClick={save}>
                    {t(saveLabelKey)}
                </Button>
            </div>
            {status && typeof status === 'object' && status.error && (
                <div style={{ color: '#ff8a8a', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                    {t(status.error)}
                </div>
            )}
            {status === 'saved' && (
                <div style={{ color: '#86e0a3', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                    {t('identity.nameUpdated')}
                </div>
            )}
        </div>
    );
}
