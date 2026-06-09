// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * AchievementsPanel Component - [P3-ACHIEVE-UI].
 *
 * The menu list view over the achievements registry: every definition with
 * its locked/unlocked state, localized name + description (via the
 * definitions' nameKey/descKey), and the unlock date for earned ones.
 * Reached from the entrance corner nav (where Settings and the leaderboard
 * already live); styled on the SettingsPanel model (Panel + PanelTitle,
 * scrollable body, full-width back button).
 *
 * Read-only: it consumes `ACHIEVEMENTS` + `getUnlocked()` and renders. The
 * unlock map is read once per mount, so reopening the panel after a round
 * shows fresh state without any subscription plumbing.
 */
import { createElement, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button } from '../ui/Button.js';
import { ACHIEVEMENTS, getUnlocked } from '../../achievements/index.js';

/** Format an ISO unlock date for display; falls back to the raw string. */
function formatUnlockDate(iso, language) {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleDateString(language || undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return iso;
    }
}

// One achievement row: status mark, name + description, unlock state.
function AchievementRow({ def, unlockedAt, t, language, isCompact }) {
    const unlocked = Boolean(unlockedAt);
    return createElement('div', {
        'data-achievement-id': def.id,
        style: {
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: isCompact ? '0.6rem 0' : '0.75rem 0',
            borderBottom: '1px solid rgba(247,241,230,0.08)',
            opacity: unlocked ? 1 : 0.55
        }
    }, [
        // Status mark: a meadow-green check for unlocked, a hollow ring for locked.
        createElement('div', {
            key: 'mark',
            'aria-hidden': 'true',
            style: {
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                flexShrink: 0,
                marginTop: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: unlocked ? 'rgba(94, 158, 110, 0.25)' : 'transparent',
                border: unlocked ? '1px solid #5e9e6e' : '1px solid rgba(247,241,230,0.25)',
                color: '#7dbf8e',
                fontSize: '0.8rem',
                fontWeight: 700,
                lineHeight: 1
            }
        }, unlocked ? '✓' : ''),
        createElement('div', { key: 'body', style: { flex: 1, minWidth: 0 } }, [
            createElement('div', {
                key: 'name',
                style: {
                    color: '#f7f1e6',
                    fontSize: isCompact ? '0.85rem' : '0.9rem',
                    fontWeight: 600
                }
            }, t(def.nameKey)),
            createElement('div', {
                key: 'desc',
                style: {
                    color: 'rgba(247,241,230,0.55)',
                    fontSize: '0.75rem',
                    marginTop: '2px',
                    lineHeight: 1.35
                }
            }, t(def.descKey)),
            createElement('div', {
                key: 'state',
                style: {
                    marginTop: '4px',
                    fontSize: '0.7rem',
                    color: unlocked ? '#7dbf8e' : 'rgba(247,241,230,0.4)',
                    textTransform: unlocked ? 'none' : 'uppercase',
                    letterSpacing: unlocked ? 'normal' : '0.05em'
                }
            }, unlocked
                ? t('achievements.ui.unlockedOn', { date: formatUnlockDate(unlockedAt, language) })
                : t('achievements.ui.locked'))
        ])
    ]);
}

export function AchievementsPanel({ onBack }) {
    const { t, i18n } = useTranslation();
    const { isCompact } = useResponsive();
    // Read once per mount: the panel opens from the menu, so a fresh open
    // after a round always reflects the latest persisted unlocks.
    const unlocked = useMemo(() => getUnlocked(), []);
    const unlockedCount = ACHIEVEMENTS.filter((def) => unlocked[def.id]).length;

    return createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%'
        }
    },
        createElement(Panel, {
            size: 'lg',
            maxWidth: '32rem',
            style: {
                animation: 'slideUp 0.5s ease-out',
                maxHeight: isCompact ? 'calc(85vh - env(safe-area-inset-bottom, 0px))' : '80vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }
        }, [
            // Header: title + unlocked count.
            createElement('div', {
                key: 'header',
                style: {
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginBottom: '1rem',
                    flexShrink: 0
                }
            }, [
                createElement(PanelTitle, {
                    key: 'title',
                    style: { marginBottom: 0 }
                }, t('achievements.ui.panelTitle')),
                createElement('div', {
                    key: 'summary',
                    style: {
                        color: 'rgba(247,241,230,0.6)',
                        fontSize: '0.8rem',
                        whiteSpace: 'nowrap',
                        marginLeft: '1rem'
                    }
                }, t('achievements.ui.summary', { unlocked: unlockedCount, total: ACHIEVEMENTS.length }))
            ]),

            // The list (scrollable).
            createElement('div', {
                key: 'content',
                style: {
                    flex: 1,
                    overflowY: 'auto',
                    minHeight: 0,
                    paddingRight: '0.5rem',
                    WebkitOverflowScrolling: 'touch'
                }
            }, ACHIEVEMENTS.map((def) =>
                createElement(AchievementRow, {
                    key: def.id,
                    def,
                    unlockedAt: unlocked[def.id] || null,
                    t,
                    language: i18n?.language,
                    isCompact
                })
            )),

            // Footer: back to the entrance.
            createElement('div', {
                key: 'footer',
                style: {
                    marginTop: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid rgba(247,241,230,0.1)',
                    flexShrink: 0
                }
            }, createElement(Button, {
                variant: 'primary',
                fullWidth: true,
                onClick: onBack
            }, t('common.backToMenu')))
        ])
    );
}
